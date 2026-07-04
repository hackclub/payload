"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Clock, ArrowLeft, AlertTriangle, Terminal, Maximize2, Minimize2, Menu, X, ClipboardPaste } from "lucide-react";
import Link from "next/link";

type SessionClientProps = {
  sessionId: number;
  initialState: string;
  vmTypeName: string;
  vmIcon: string | null;
  // null while a session is queued/warming (TTL clock starts at claim, ADR-0033).
  expiresAt: string | null;
  terminationReason?: string;
};

// Status labels for hover tooltips
const STATE_LABELS: Record<string, string> = {
  pending: "Starting...",
  provisioning: "Provisioning...",
  ready: "Ready",
  active: "Running",
  terminating: "Terminating...",
  terminated: "Ended",
  errored: "Error",
};

export default function SessionClient({
  sessionId,
  initialState,
  vmTypeName,
  vmIcon,
  expiresAt,
  terminationReason,
}: SessionClientProps) {
  const [state, setState] = useState(initialState);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState("");
  const [isUiVisible, setIsUiVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showDestroyConfirm, setShowDestroyConfirm] = useState(false);
  const [pasteFlash, setPasteFlash] = useState<"idle" | "ok" | "fail">("idle");
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const showDestroyConfirmRef = useRef(showDestroyConfirm);
  showDestroyConfirmRef.current = showDestroyConfirm;

  // -------------------------------------------------------------------
  // Firefox "Paste" menu suppression.
  //
  // Guacamole 1.6's webapp calls navigator.clipboard.readText() from a
  // capture-phase window "focus" listener (indexController.js →
  // clipboardService.resyncClipboard) to sync the host clipboard into the
  // VM. Firefox has no persistent clipboard-read permission: readText()
  // while the window holds transient user activation pops a native
  // one-item "Paste" context menu that the user must click to allow the
  // read. A click inside the iframe grants its window ~5s of transient
  // activation, so the repro was: click in the VM, then click the floating
  // island → focus bounces parent→iframe → Guacamole resyncs → readText()
  // → "Paste" menu at the cursor, swallowing the next click.
  //
  // Fix: replace readText inside the (same-origin) iframe with a stub that
  // rejects, which Guacamole treats as "clipboard unavailable" and ignores
  // (verified against guacamole-client 1.6.0 clipboardService.js — the
  // readText branch returns early, so the execCommand('paste') fallback
  // does NOT run). Nothing is lost: host→VM paste is driven from the
  // parent by sendClipboardToVm(), and VM→host copy uses writeText(),
  // which is untouched.
  //
  // The patch is (re-)applied idempotently from focusIframe(), i.e.
  // synchronously BEFORE focus is handed to the iframe and Guacamole's
  // focus listener can run — NOT just once on iframe load. Load-only
  // patching proved fragile: any inner navigation creates a fresh window
  // whose native clipboard object is unpatched, and dev HMR swaps the
  // component without ever re-firing the iframe's load event.
  const clipboardNeedsNeuteringRef = useRef(false);
  const ensureIframeClipboardNeutered = useCallback(() => {
    if (!clipboardNeedsNeuteringRef.current) return;
    try {
      const clip = iframeRef.current?.contentWindow?.navigator.clipboard;
      if (!clip) return;
      const current = clip.readText as { payloadNeutered?: boolean } | undefined;
      if (current?.payloadNeutered) return; // this inner window is already patched
      const stub = Object.assign(
        () =>
          Promise.reject(
            new DOMException("Clipboard read disabled by host page", "NotAllowedError"),
          ),
        { payloadNeutered: true },
      );
      clip.readText = stub;
      console.debug("[payload] neutered Guacamole clipboard readText (no silent clipboard-read permission in this browser)");
    } catch {
      // can't reach into the iframe — leave native behavior
    }
  }, []);

  // Detect once whether this browser has a real clipboard-read permission
  // model. Chromium: permissions.query resolves and reads are silently
  // granted (or use a normal one-time permission dialog) — leave
  // Guacamole's focus-time clipboard sync alone there. Firefox (and
  // Safari) throw a TypeError because "clipboard-read" is not in their
  // PermissionName enum — verified against Firefox 150 — and pop the
  // per-call "Paste" menu instead, so there we neuter reads in the iframe.
  useEffect(() => {
    (async () => {
      try {
        await navigator.permissions.query({ name: "clipboard-read" as PermissionName });
      } catch {
        clipboardNeedsNeuteringRef.current = true;
        ensureIframeClipboardNeutered();
      }
    })();
  }, [ensureIframeClipboardNeutered]);

  // Focus the iframe so keystrokes reach the embedded Guacamole client.
  // Without this, clicks on the parent page (floating UI buttons, etc.)
  // steal keyboard focus and the remote VM stops receiving keys.
  //
  // IMPORTANT: never call this synchronously while a mouse button is being
  // pressed inside the iframe (esp. right-click). Re-focusing the
  // contentWindow mid-mousedown breaks Guacamole's event capture: the
  // matching mouseup is lost (so the VM thinks the button is still held)
  // and the browser's native context menu leaks through because Guacamole's
  // `contextmenu` preventDefault never runs.
  const focusIframe = useCallback(() => {
    if (showDestroyConfirmRef.current) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    // Guacamole reads the clipboard the moment its window gains focus —
    // make sure that read is neutered BEFORE handing focus over.
    ensureIframeClipboardNeutered();
    // Avoid redundant focus() calls — they're not free and can interrupt
    // event delivery inside the iframe.
    if (document.activeElement === iframe) return;
    iframe.focus();
    try {
      iframe.contentWindow?.focus();
    } catch {
      // cross-origin (shouldn't happen for same-origin /guac, but be safe)
    }
  }, [ensureIframeClipboardNeutered]);

  // Send the host clipboard into the VM as a single paste action.
  //
  // Why this exists: Guacamole 1.6 calls navigator.clipboard.readText() on
  // its own paste/focus handlers. Firefox 125+ requires per-call user
  // permission for clipboard reads (Chrome lets you grant it once via the
  // Permissions API), so in Firefox a Ctrl+V — and any iframe focus event —
  // pops the "Paste" authorization context menu. By driving the read from a
  // direct button click here we get one user gesture, one prompt-free read,
  // and one synthesized paste event delivered to the iframe.
  const sendClipboardToVm = useCallback(async () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        setPasteFlash("fail");
        setTimeout(() => setPasteFlash("idle"), 1200);
        return;
      }
      // Same-origin /guac/* iframe — we can reach into it. Dispatch a real
      // ClipboardEvent so Guacamole's existing paste listener picks it up
      // and forwards via the tunnel's "clipboard" instruction.
      const win = iframe.contentWindow;
      const doc = iframe.contentDocument;
      if (!win || !doc) {
        setPasteFlash("fail");
        setTimeout(() => setPasteFlash("idle"), 1200);
        return;
      }
      const dt = new (win as unknown as { DataTransfer: typeof DataTransfer }).DataTransfer();
      dt.setData("text/plain", text);
      const evt = new (win as unknown as { ClipboardEvent: typeof ClipboardEvent }).ClipboardEvent("paste", {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      });
      const target = (doc.activeElement as HTMLElement | null) ?? doc.body;
      target.dispatchEvent(evt);
      // Refocus the iframe so the user can immediately keep typing/clicking.
      focusIframe();
      setPasteFlash("ok");
      setTimeout(() => setPasteFlash("idle"), 900);
    } catch {
      // Either the user denied the Firefox prompt or the browser blocked the
      // read for some other reason. Surface visually; don't throw.
      setPasteFlash("fail");
      setTimeout(() => setPasteFlash("idle"), 1200);
    }
  }, [focusIframe]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // SSE listener
  useEffect(() => {
    const eventSource = new EventSource(`/api/sessions/${sessionId}/events`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.state) {
          setState(data.state);
        }
        if (data.type === "terminated" || data.type === "errored" || data.state === "terminated" || data.state === "errored") {
          eventSource.close();
        }
      } catch {
        // keepalive or malformed, ignore
      }
    };

    eventSource.onerror = () => {
      // Do NOT call close() here — the browser auto-reconnects on transient errors.
      // Terminal states (terminated/errored) are handled in onmessage above.
      // If the server intentionally closed the stream, onmessage already called close().
    };

    return () => {
      eventSource.close();
    };
  }, [sessionId]);

  // Iframe token fetch - triggered by SSE state changes
  const iframeFetchedRef = useRef(false);

  useEffect(() => {
    if ((state === "ready" || state === "active") && !iframeFetchedRef.current) {
      iframeFetchedRef.current = true;
      fetch(`/api/sessions/${sessionId}/guac-token`, { method: "POST" })
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data?.iframeUrl) setIframeUrl(data.iframeUrl);
        })
        .catch(() => {});
    }
  }, [state, sessionId]);

  // Heartbeat
  useEffect(() => {
    if (state !== "ready" && state !== "active") {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      return;
    }

    const sendHeartbeat = async () => {
      try {
        await fetch(`/api/sessions/${sessionId}/heartbeat`, { method: "POST" });
      } catch {
        // network error, try again
      }
    };

    sendHeartbeat();
    heartbeatRef.current = setInterval(sendHeartbeat, 30_000);

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [state, sessionId]);

  // Re-focus the iframe whenever the window/tab regains focus or visibility.
  //
  // NOTE: this deliberately also fires for *intra-page* focus bounces — in
  // Firefox, clicking the floating island while the iframe holds focus
  // fires a window "focus" event on the parent, and this handler
  // immediately hands focus back to the iframe. That is load-bearing:
  // Guacamole preventDefault()s mousedown over its display, which blocks
  // the browser's native focus-on-click, so clicking back into the iframe
  // does NOT focus it. Without this eager refocus, keyboard focus gets
  // stranded on the parent after any island interaction (keystrokes stop
  // reaching the VM, and space/enter can re-trigger the last island
  // button). The refocus used to pop Firefox's clipboard "Paste" menu via
  // Guacamole's focus-time clipboard sync; that is now neutered at the
  // source by disableIframeClipboardRead(), so the bounce is harmless.
  useEffect(() => {
    if (!iframeUrl) return;
    const onWindowFocus = () => focusIframe();
    const onVisibility = () => {
      if (document.visibilityState === "visible") focusIframe();
    };
    window.addEventListener("focus", onWindowFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [iframeUrl, focusIframe]);

  // Forward parent-document mouseup/blur into the iframe so Guacamole always
  // sees the matching button release.
  //
  // The bug this fixes: press a mouse button while the cursor is inside the
  // iframe, drag out of the iframe (e.g. up to the floating island), and
  // release. Guacamole captured the mousedown but never sees a mouseup —
  // mouseup events inside the parent document do *not* cross into the
  // iframe's contentDocument, so Guacamole leaves the button held in the VM.
  // The visible symptoms are: the parent document starts a text selection
  // from wherever the cursor first re-entered (e.g. the island label
  // "selecting all the text"), and the VM behaves as if a button is stuck
  // down (often perceived as "right click is being held").
  //
  // Synthesizing a mouseup inside the iframe's document is enough — same
  // origin /guac/* lets us reach in, and Guacamole's mouseup listener is
  // installed at the document/window level so a bubbling event reaches it.
  // We also do this on window blur because alt-tabbing mid-drag has the
  // same shape.
  useEffect(() => {
    if (!iframeUrl) return;
    const releaseInIframe = (button: number) => {
      const doc = iframeRef.current?.contentDocument;
      const win = iframeRef.current?.contentWindow;
      if (!doc || !win) return;
      const evt = new (win as unknown as { MouseEvent: typeof MouseEvent }).MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        button,
        buttons: 0,
        view: win as unknown as Window,
      });
      (doc.activeElement as HTMLElement | null)?.dispatchEvent(evt);
      doc.dispatchEvent(evt);
    };
    const onWindowMouseUp = (e: MouseEvent) => {
      releaseInIframe(e.button);
      // Firefox can leak a "stuck button" state across the iframe
      // boundary: a mousedown inside the iframe followed by a mouseup
      // outside it may leave the parent document with an active text
      // selection that select-none alone doesn't prevent.  Clear it on
      // every mouseup so the UI never shows a ghost selection.
      const sel = window.getSelection();
      if (sel) sel.removeAllRanges();
    };
    const onWindowBlur = () => {
      // Release every button on blur — we don't know which (if any) Guacamole
      // is still holding, and a no-op release is harmless.
      releaseInIframe(0);
      releaseInIframe(1);
      releaseInIframe(2);
    };
    window.addEventListener("mouseup", onWindowMouseUp);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("mouseup", onWindowMouseUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [iframeUrl]);

  useEffect(() => {
    if (!showDestroyConfirm) focusIframe();
  }, [showDestroyConfirm, focusIframe]);

  // Countdown timer
  useEffect(() => {
    const update = () => {
      if (!expiresAt) {
        // Queued/warming: no TTL yet.
        setTimeRemaining("—");
        return;
      }
      const ms = new Date(expiresAt).getTime() - Date.now();
      if (ms <= 0) {
        setTimeRemaining("Expired");
        return;
      }
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1000);
      setTimeRemaining(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const getStatusColor = (s: string) => {
    switch (s) {
      case "ready":
      case "active":
        return "bg-hc-green";
      case "pending":
      case "provisioning":
        return "bg-hc-yellow";
      case "terminating":
        return "bg-hc-orange";
      case "errored":
        return "bg-hc-red";
      default:
        return "bg-hc-muted";
    }
  };

  const isPending = ["pending", "provisioning"].includes(state);
  const isEnded = ["terminated", "errored"].includes(state);
  const isActive = ["ready", "active"].includes(state);

  if (isEnded) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div className="bg-hc-dark border border-hc-darkless rounded-hc p-10 max-w-md w-full shadow-lg text-center">
          <AlertTriangle className="w-12 h-12 text-hc-red mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-hc-snow mb-2">Session Ended</h2>
          <p className="text-hc-muted mb-2">
            {state === "errored"
              ? "This session encountered an error and could not continue."
              : terminationReason
                ? `This session was ended: ${terminationReason}`
                : "This session has ended."}
          </p>
          <Link href="/" className="inline-block mt-6 bg-hc-darkless hover:bg-hc-slate text-hc-smoke border border-hc-slate/30 font-bold py-2.5 px-6 rounded transition-colors">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      data-session-viewer
      className="fixed inset-0 z-50 flex bg-black select-none animate-in fade-in duration-300"
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={(e) => { if (e.button !== 0) e.preventDefault(); }}
      onDragStart={(e) => e.preventDefault()}
    >
      {/* Top-left toggle button.
          stopPropagation + preventDefault on mousedown keep the click from
          bubbling into any iframe focus dance, which in Firefox 125+ would
          trigger Guacamole's clipboard-read sync and pop the native
          "Paste" authorization context menu. */}
      <button
        onMouseDown={(e) => { e.stopPropagation(); if (e.button !== 0) e.preventDefault(); }}
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          setIsUiVisible(!isUiVisible);
        }}
        className={`absolute top-3 left-3 z-60  hover:bg-black/60 p-1.5 rounded-md  hover:text-white/90 transition-all duration-300 backdrop-blur-sm ${isUiVisible ? 'opacity-100 bg-black/60 text-white/90' : 'opacity-30 hover:opacity-100 bg-black/20 text-white/30'}`}
        title={isUiVisible ? "Hide UI" : "Show UI"}
      >
        {isUiVisible ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
      </button>

      {/* Floating Island UI.
          We deliberately do NOT auto-refocus the iframe on every click here.
          Refocusing the iframe causes Guacamole 1.6 to issue a clipboard
          read against the host clipboard, which in Firefox triggers the
          per-call "Paste" authorization context menu. Each button below
          handles its own focus restore where needed. */}
      <div
        // select-none: defensive — if Guacamole ever does leave a button held
        // (e.g. browser dropped a mouseup before our window-level forwarder
        // could fire), the parent doc would otherwise start a text selection
        // from this overlay the moment the cursor enters it. Killing
        // user-select on the island keeps the visible UX clean even in that
        // race.
        className={`absolute left-1/2 -translate-x-1/2 z-50 transition-all duration-500 ease-in-out flex flex-col items-center top-4 select-none ${isUiVisible ? 'translate-y-0 opacity-100 visible' : '-translate-y-24 opacity-0 invisible'}`}
      >
        <div className={`flex items-center gap-4 bg-hc-dark/80 backdrop-blur-md border border-hc-darkless/50 shadow-2xl rounded-full px-4 py-2`}>
          <Link href="/" className="text-hc-muted hover:text-hc-smoke rounded-full transition-colors p-1" title="Back to Dashboard">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          
          <div className="w-px h-5 bg-hc-darkless/50"></div>

          <div className="flex items-center gap-2">
            {vmIcon ? <img src={vmIcon} alt={vmTypeName} className="w-4 h-4 object-contain opacity-80" /> : <Terminal className="w-4 h-4 text-hc-muted" />}
            <span className="font-bold text-sm text-hc-smoke">{vmTypeName}</span>
            <span className={`w-2 h-2 rounded-full ml-1 ${getStatusColor(state)}`} title={STATE_LABELS[state] || state}></span>
          </div>

          <div className="flex items-center gap-1.5 text-sm font-mono tracking-tight text-hc-muted ml-2">
            <Clock className="w-3.5 h-3.5 opacity-50" />
            <span className={timeRemaining === "Expired" ? "text-hc-red" : ""}>{timeRemaining}</span>
          </div>

          <div className="w-px h-5 bg-hc-darkless/50 ml-2"></div>

          <button
            onClick={sendClipboardToVm}
            className={`transition-colors p-1 ${
              pasteFlash === "ok"
                ? "text-hc-green"
                : pasteFlash === "fail"
                  ? "text-hc-red"
                  : "text-hc-muted hover:text-hc-smoke"
            }`}
            title={
              pasteFlash === "ok"
                ? "Pasted into VM"
                : pasteFlash === "fail"
                  ? "Paste failed (clipboard empty or denied)"
                  : "Paste clipboard into VM"
            }
          >
            <ClipboardPaste className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => {});
              } else {
                document.exitFullscreen().catch(() => {});
              }
            }}
            className="text-hc-muted hover:text-hc-smoke transition-colors p-1"
            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            onClick={() => setShowDestroyConfirm(true)}
            className="bg-transparent hover:bg-hc-red/10 text-hc-muted hover:text-hc-red transition-colors px-3 py-1 rounded-full text-xs font-bold ml-1"
          >
            Destroy
          </button>
        </div>
      </div>

      {/* Destroy Confirmation Modal */}
      {showDestroyConfirm && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setShowDestroyConfirm(false)}
          />
          <div className="bg-hc-dark/80 backdrop-blur-xl border border-hc-darkless rounded-hc p-6 max-w-sm w-full shadow-2xl relative z-10 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-hc-red mb-4">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-xl font-bold">Destroy Session?</h3>
            </div>
            <p className="text-hc-smoke mb-6">
              All data in this VM will be <span className="text-hc-red font-bold underline">permanently deleted</span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDestroyConfirm(false)}
                className="flex-1 bg-hc-darkless hover:bg-hc-slate text-hc-smoke font-bold py-2 px-4 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowDestroyConfirm(false);
                  await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
                  const terminatedPromise = new Promise<void>((resolve) => {
                    const es = new EventSource(`/api/sessions/${sessionId}/events`);
                    es.onmessage = (evt) => {
                      try {
                        const d = JSON.parse(evt.data);
                        if (d.state === "terminated" || d.type === "terminated") {
                          es.close();
                          resolve();
                        }
                      } catch {}
                    };
                    es.onerror = () => {
                      es.close();
                      setTimeout(resolve, 2000);
                    };
                  });
                  await terminatedPromise;
                  window.location.href = "/";
                }}
                className="flex-1 bg-hc-red hover:bg-[#d82a41] text-white font-bold py-2 px-4 rounded transition-colors"
              >
                Bye Bye VM
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content area (iframe) */}
      <div
        className="relative flex-1 bg-black overflow-hidden flex items-center justify-center"
        // Refocus the iframe when the user clicks back into the iframe area
        // (e.g. after interacting with the floating UI). We deliberately:
        //   * only react to the primary (left) button — refocusing during a
        //     right- or middle-click mousedown breaks Guacamole's event
        //     capture and causes the browser's native context menu to leak
        //     through and the right-button to appear "stuck" in the VM.
        //   * defer to mouseup (after the click is over) so we never shift
        //     focus mid-click.
        //   * skip if the iframe is already focused (focusIframe handles
        //     that, but cheap to short-circuit here too).
        onMouseUp={(e) => {
          if (e.button !== 0) return;
          focusIframe();
        }}
      >
        {isActive && iframeUrl ? (
          <iframe
            ref={iframeRef}
            src={iframeUrl}
            className="w-full h-full border-0"
            allow="clipboard-read; clipboard-write; fullscreen"
            title="Remote Desktop"
            onLoad={focusIframe}
          />
        ) : isPending ? (
          <div className="flex flex-col items-center gap-5 animate-in fade-in duration-700">
            <div className="relative w-10 h-10">
              <div className="absolute inset-0 border-[3px] border-hc-red/20 rounded-full"></div>
              <div className="absolute inset-0 border-[3px] border-hc-red border-t-transparent rounded-full animate-spin"></div>
            </div>
            <div className="text-center space-y-1.5">
              <p className="text-lg font-bold text-hc-snow tracking-tight">
                Setting up your VM
              </p>
              <p className="text-sm text-hc-muted">
                This should only take a few moments.
              </p>
            </div>
          </div>
        ) : state === "terminating" ? (
          <div className="flex flex-col items-center gap-5 animate-in fade-in duration-500">
            <div className="relative w-10 h-10">
              <div className="absolute inset-0 border-[3px] border-hc-red/20 rounded-full"></div>
              <div className="absolute inset-0 border-[3px] border-hc-red border-t-transparent rounded-full animate-spin"></div>
            </div>
            <p className="text-base font-medium text-hc-muted">Closing VM...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-5 animate-in fade-in duration-500">
            <div className="relative w-10 h-10">
              <div className="absolute inset-0 border-[3px] border-hc-red/20 rounded-full"></div>
              <div className="absolute inset-0 border-[3px] border-hc-red border-t-transparent rounded-full animate-spin"></div>
            </div>
            <p className="text-base font-medium text-hc-muted">Initializing connection...</p>
          </div>
        )}
      </div>
    </div>
  );
}