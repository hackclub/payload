# VM Customization

How per-reviewer customization (wallpaper, program installs, startup scripts) is
applied to the ephemeral VMs a reviewer launches. Canonical decision: **ADR-0035**
(supersedes ADR-0034's apply mechanics). Runtime facts about the guest agent live
in the `guest-agent-exec-context` memory.

## Model

Customization is stored per-reviewer on the `user` row, applied to **every** VM
they launch, **after** the session is `ready` (so it never gates connection),
by the best-effort `customize-vm` BullMQ job. Only **Windows** and **Linux** are
supported (`guestOs()` in `src/lib/guest/transfer.ts` returns null otherwise).

Two executors, chosen by the privilege a task needs:

| Task | Executor | Context | Transport |
| --- | --- | --- | --- |
| Wallpaper | **companion agent** | logged-in user session | spool dir |
| Startup script (in-session) | **companion agent** | logged-in user session | spool dir |
| Package installs | **guest agent** | SYSTEM / root | direct `guestExec` |
| Startup script (admin) | **guest agent** | SYSTEM / root | `guestFileWrite` + `guestExec` |

The guest agent runs as SYSTEM/root with **no user session** at customize time,
which is right for installs but wrong for the wallpaper (needs the live desktop).
The companion fills that gap.

## Companion agent (`agent/`)

A small Rust binary baked into the Windows and Linux templates that runs as the
logged-in reviewer and drains a local **spool directory** of user-session tasks.
Windows build is GUI-subsystem (no console window); Linux build autostarts in
XFCE with DISPLAY/DBUS. Build + bake: `agent/README.md`,
`AI/runbooks/bake-companion-agent.md`.

### Spool protocol (no networking)

Payload writes into the spool via the guest agent (SYSTEM/root — works with no
session); the companion polls it (~1s) as the user. The spool dir is the entire
transport — there is no VM→Payload channel.

- Spool: `C:\ProgramData\payload\spool` (Windows) / `~/.payload/spool` (Linux).
- `<id>.task.json` — a task (see below). Payload writes any referenced payload
  **first**, then the task file last (the companion acts the moment it sees it).
- `<payload_file>` — sibling blob (wallpaper image, script body), transferred in
  ≤45 000-byte base64 chunks and concatenated in-guest (guest agent caps
  `file-write` content at 61440 chars).
- `<id>.result.json` — `{ ok, error?, took_ms }`, written by the companion.
- The companion self-cleans: task + payload are deleted after processing. The
  Payload side grants the desktop user delete rights (Windows: `icacls … Users:M`;
  Linux: the spool dir is owned by the user, which governs deletion).

Task JSON (mirrors `agent/src/protocol.rs` and `src/lib/guest/spool.ts`):

```jsonc
{ "v": 1, "id": "wallpaper-42", "type": "wallpaper", "payload_file": "wp-42.jpg" }
{ "v": 1, "id": "script-42", "type": "run-script", "payload_file": "startup-42.sh", "interpreter": "bash" }
{ "v": 1, "id": "notify-42-install-start", "type": "notify", "title": "Installing programs", "body": "..." }
```

The `notify` task shows an in-session notification (`notify-send` on Linux,
`msg` on Windows) — used to surface progress for the SYSTEM-side install step,
which is otherwise invisible to the reviewer. On Linux the wallpaper handler
waits (bounded) for the XFCE desktop to be ready, so the agent can be launched
early in the session (`~/.xsessionrc`) without one-shot failing.

## Data model (`user`)

| Column | Meaning |
| --- | --- |
| `wallpaper_image` / `_mime` / `_updated_at` | uploaded wallpaper (bytea, downscaled to ≤1080p JPEG) |
| `install_packages_windows` / `_linux` (jsonb) | package ids/names (choco / apt) |
| `startup_script_windows` / `_linux` (text) | script body, null = none |
| `startup_script_windows_run_as_admin` / `_linux_…` (bool) | executor: admin (guest agent) vs in-session (companion) |

## Flow (`src/lib/queue/customize-vm.ts`)

Enqueued from `runBindPhase` after `ready`. Resolves the OS, then runs three
independent best-effort steps, each logging its own event and skipped on retry
once its `*_done`/`*_applied` event exists:

1. **Wallpaper** — `ensureSpool` → transfer image → drop `wallpaper` task. Fast;
   done first so it repaints promptly. Companion applies it live. Reviewers who
   haven't uploaded one get the branded Hack Club default
   (`src/lib/wallpaper/default.ts` — an SVG rasterized to 1080p JPEG, memoized),
   so every supported VM looks like Payload out of the box.
2. **Installs** — `choco install …` / `apt-get install …` as SYSTEM/root. Package
   names are validated + passed as argv. Idempotent, so retries are safe.
3. **Startup script** — admin: write to a guest temp file and exec by path;
   in-session: drop a `run-script` spool task. Body never hits a shell.

If any step failed, the job throws so BullMQ retries; completed steps are
skipped. Session state is never touched.

## Security

Reviewers are allowlisted and already have local-admin (`shipwrights`) inside an
ephemeral, cloned VM, so free-form installs and arbitrary scripts grant nothing
they couldn't do by hand. The controls that matter are injection-prevention:
package names are charset-validated and passed as argv; script/image bodies are
transferred as files and referenced by Payload-controlled paths — no user string
is ever interpolated into a guest shell command.

## Relevant code

- `agent/` — the Rust companion (protocol, spool poll, per-OS handlers).
- `src/lib/guest/transfer.ts` — `guestOs()`, chunked `writeGuestFile`.
- `src/lib/guest/spool.ts` — spool paths, `ensureSpool`, `writeSpoolPayload`, `dropTask`.
- `src/lib/wallpaper/index.ts` — upload processing + `applyWallpaper` (spool drop).
- `src/lib/wallpaper/default.ts` — Hack Club–themed default wallpaper (SVG → JPEG).
- `src/lib/installs/index.ts` — catalog validation + `installPackages`.
- `src/lib/scripts/index.ts` — `runStartupScript` (admin vs in-session).
- `src/config/installable-apps.ts` — curated quick-pick catalog.
- `src/app/customization/` + `src/components/{ProgramsSelector,StartupScriptEditor,WallpaperUploader}.tsx` + `src/app/api/customization/*` — UI + API.
