# payload-agent

The in-session **companion agent** for Payload (ADR-0035). A small Rust binary
baked into the Windows and Linux VM templates. It runs as the logged-in reviewer
inside their desktop session and drains a local spool directory of user-session
customization tasks (wallpaper, in-session scripts) that Payload drops in via the
Proxmox guest agent. No networking — the spool dir is the entire transport.

See `AI/customization.md` for the protocol and `AI/runbooks/bake-companion-agent.md`
for how to bake it into a template.

## Layout

- `src/main.rs` — entry: resolve the fixed per-OS spool path, poll loop.
- `src/protocol.rs` — the on-disk task/result contract (mirrors `src/lib/guest/spool.ts`).
- `src/spool.rs` — scan the spool, run pending tasks, write results, self-clean.
- `src/tasks.rs` — per-OS handlers (wallpaper, run-script).
- `src/log.rs` — append-only log next to the spool (`agent.log`).

Spool paths (must match `src/lib/guest/spool.ts`):
`C:\ProgramData\payload\spool` (Windows), `~/.payload/spool` (Linux).

## Build

Linux (native):

```bash
cargo build --release
# → target/release/payload-agent
```

Windows (cross-compile from Linux; GUI-subsystem, no console window):

```bash
cargo install --locked cargo-xwin      # one-time
rustup target add x86_64-pc-windows-msvc
cargo xwin build --release --target x86_64-pc-windows-msvc
# → target/x86_64-pc-windows-msvc/release/payload-agent.exe
```

`target/` and the binaries are gitignored; only source is committed. Bake the
compiled binaries into templates out-of-band.

## Autostart (baked into templates)

- **Windows** — a shortcut to the exe in the `shipwrights` Startup folder
  (`shell:startup`), so it launches in-session at logon.
- **Linux** — `~/.config/autostart/payload-agent.desktop` for `shipwrights`, so
  it starts with the XFCE session (has DISPLAY/DBUS).
