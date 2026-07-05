# Bake the companion agent into the VM templates

Installs the Payload companion agent (`agent/`, ADR-0035) into the Windows and
Linux golden templates, plus the Chocolatey prerequisite on Windows. Do this
inside a bootable edit-VM cloned from the template, then re-convert to template —
same pattern as `rebuild-template.md`. **Editing a template only affects future
clones; recycle the warm pool afterward** (see the last section).

Template VMIDs are in `src/config/vm-types.ts` (source of truth) — currently
Windows `67006`, Linux `67007`. Verify on the host before touching anything.

## 0. Build the binaries (on your dev machine)

```bash
cd agent
cargo build --release                                             # Linux
cargo xwin build --release --target x86_64-pc-windows-msvc        # Windows
```

Artifacts:
- Linux: `agent/target/release/payload-agent`
- Windows: `agent/target/x86_64-pc-windows-msvc/release/payload-agent.exe`

## 1. Linux template

Clone the template to an edit VM, boot it, then (over RDP/SSH as `shipwrights`,
`sudo` as needed):

1. Copy `payload-agent` to `/usr/local/bin/payload-agent`, `chmod 755`.
2. Autostart it via **XDG autostart** — this is what xrdp+XFCE reliably honors.
   (Measured: the agent starts within ~1s of `xfdesktop` this way, so there's no
   need for an earlier hook. `~/.xsessionrc` is NOT sourced by xrdp's session on
   this image — don't use it; it silently never runs.)
   ```bash
   mkdir -p ~/.config/autostart
   cat > ~/.config/autostart/payload-agent.desktop <<'EOF'
   [Desktop Entry]
   Type=Application
   Name=Payload Agent
   Exec=/usr/local/bin/payload-agent
   X-GNOME-Autostart-enabled=true
   NoDisplay=true
   EOF
   ```
3. Pre-create the spool (the app also does this per-session, but this avoids a
   first-boot race):
   ```bash
   mkdir -p ~/.payload/spool && chown -R shipwrights:shipwrights ~/.payload
   ```
4. Ensure a notification daemon is present so install/progress notifications
   show — XFCE ships `xfce4-notifyd`; confirm `notify-send test` pops a bubble.
5. (Recommended) Set a **default backdrop** so a fresh session shows a wallpaper
   instead of black until the agent swaps in the reviewer's: point the XFCE
   `last-image` at a baked-in default image, e.g. drop one at
   `/usr/local/share/payload/default-wallpaper.jpg` and set it as the desktop
   background in XFCE settings before sealing.
6. Log out/in once to confirm the agent starts (check `~/.payload/agent.log`).
7. Shut down, re-convert to template.

## 2. Windows template

Clone → boot → (as `shipwrights`, an admin):

1. **Chocolatey** (prereq for installs):
   ```powershell
   Set-ExecutionPolicy Bypass -Scope Process -Force
   iex ((New-Object Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
   ```
   Confirm `choco --version` works in a fresh shell (PATH updated).
2. Copy `payload-agent.exe` to `C:\ProgramData\payload\payload-agent.exe`
   (ProgramData avoids the `Program Files` UAC prompt and co-locates it with the
   spool + log):
   ```powershell
   New-Item -ItemType Directory -Force -Path 'C:\ProgramData\payload\spool'
   Copy-Item payload-agent.exe 'C:\ProgramData\payload\payload-agent.exe'
   ```
3. Autostart via an **ONLOGON scheduled task**, NOT the Startup folder (the
   Startup folder imposes Windows' ~10s startup delay). Run this from an
   **elevated** PowerShell, and make sure `/tr` points at the **exact path where
   you copied the exe in step 2** — a mismatch makes the task fire but find
   nothing:
   ```powershell
   schtasks /create /tn "payload-agent" /tr "C:\ProgramData\payload\payload-agent.exe" /sc ONLOGON /ru shipwrights /it /f
   ```
   (`/it` = interactive token so it runs in the desktop session; no `/rp`.)
   Verify: `schtasks /query /tn payload-agent /v /fo list`.
   **Do NOT test with `schtasks /run`** — an ONLOGON task no-ops on manual run;
   log off/on to trigger it.

   *Fallback if the task misbehaves* — Startup-folder shortcut + disable the
   delay (proven mechanism, no 10s wait):
   ```powershell
   $s="$env:ProgramData\Microsoft\Windows\Start Menu\Programs\Startup"
   $w=New-Object -ComObject WScript.Shell; $l=$w.CreateShortcut("$s\payload-agent.lnk")
   $l.TargetPath='C:\ProgramData\payload\payload-agent.exe'; $l.Save()
   reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Serialize" /v StartupDelayInMSec /t REG_DWORD /d 0 /f
   ```
4. Log off/on once; confirm **no console window** appears and
   `C:\ProgramData\payload\agent.log` is written. Install notifications use
   `msg.exe` (built in).
5. (Recommended) Set a **default desktop wallpaper** in the template so a fresh
   session isn't black before the agent runs.
6. Shut down, re-convert to template.

## 3. Recycle the warm pool

Existing `payload-warm-*` VMs were cloned from the **old** template and lack the
agent. After re-converting, force the reconciler to rebuild the pool from the new
template — destroy the current warm VMs (they have no owner):

```bash
# on the Proxmox host — list ownerless pool VMs
qm list | grep payload-warm
# destroy each (the reconciler refills from the new template)
qm stop <vmid>; qm destroy <vmid> --purge
```

Or let them age out at `WARM_MAX_AGE_MS` (default 2h). New clones will have the
agent + Chocolatey.

## Verify (on an ownerless warm VM — dev == prod)

Save a wallpaper / packages / a startup script in the app, launch a VM of that
type, connect, and watch: wallpaper repaints in-session with no terminal flash;
`choco`/`apt` packages appear; the script runs. Result files land in the spool
(`*.result.json`) and events land in `vm_session_events`.
