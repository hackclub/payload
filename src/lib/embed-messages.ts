// state "gone": no usable cookie, fiona has to reopen the window
export type EmbedMessage = {
  sessionId: number;
  state: string;
  expiresAt: string | null;
};

export function postToFiona(origins: string[], message: EmbedMessage) {
  if (window.parent === window) return;
  // postMessage drops it for every origin but the one actually framing us
  for (const origin of origins) {
    window.parent.postMessage({ source: "payload", type: "vm", ...message }, origin);
  }
}

export function fromFiona(event: MessageEvent, origins: string[]): { type: string } | null {
  if (event.source !== window.parent || !origins.includes(event.origin)) return null;
  const data: unknown = event.data;
  if (typeof data !== "object" || data === null || !("source" in data) || data.source !== "fiona") return null;
  return "type" in data && typeof data.type === "string" ? { type: data.type } : null;
}
