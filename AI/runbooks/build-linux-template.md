# Runbook: Build the Linux VM Template from Scratch (Debian 12 + XFCE + xrdp)

This is the canonical, copy-paste guide to build the Linux ephemeral-VM
template from a fresh Debian 12 install. The result is a Proxmox template
that, when cloned, boots into a working RDP-accessible XFCE desktop in under
a minute, ready for Guacamole.

If you're converting an **existing** KDE/KRDP template, use
[template-switch-to-xrdp.md](./template-switch-to-xrdp.md) instead — this
guide assumes a brand-new VM.

---

## Why XFCE (not KDE)

For ephemeral review VMs:

- **Boots in ~5 seconds** vs. ~25 seconds for Plasma 6.
- **~250 MB idle RAM** vs. ~900 MB for Plasma 6 — matters at 10 concurrent VMs.
- **xrdp's reference desktop** — every xrdp tutorial assumes XFCE; the
  xrdp+Plasma combo is a known pain point (`startplasma-x11` missing,
  Wayland fighting Xorg, blank-screen-after-login, etc.).
- **Same protocol surface for the reviewer** — they see a desktop with a
  terminal, file manager, text editor, and a web browser. That's the job.

Decided: Linux template = Debian 12 + XFCE + xrdp.

---

## 0. Prereqs

- A Proxmox host you can SSH into as `root`.
- The Debian 12 netinst ISO available on Proxmox storage. If not:

  ```bash
  # on the Proxmox host
  cd /var/lib/vz/template/iso
  curl -fsSLO "https://cdimage.debian.org/cdimage/release/current/amd64/iso-cd/debian-12.7.0-amd64-netinst.iso"
  ```

- A spare VMID for the template. We'll use **9100** in this guide so it
  doesn't collide with cloned ephemeral VMs (which use whatever
  `cluster/nextid` returns) or your Guacamole LXC (CTID 9000).

---

## 1. Create the VM in Proxmox

From the Proxmox host shell:

```bash
qm create 9100 \
  --name debian-xfce-template \
  --ostype l26 \
  --cores 2 --sockets 1 \
  --memory 2048 \
  --net0 virtio,bridge=vmbr0,firewall=0 \
  --scsihw virtio-scsi-single \
  --scsi0 local-lvm:32 \
  --ide2 local:iso/debian-12.7.0-amd64-netinst.iso,media=cdrom \
  --boot order=ide2 \
  --vga std \
  --agent enabled=0
```

Notes:

- 2 CPU, 2 GB RAM, 32 GB disk is comfortable for a desktop session. Bump
  RAM to 4 GB if reviewers need to run a Vite dev server + Chromium.
- `agent enabled=0` because we're not installing qemu-guest-agent; IP
  discovery uses the Proxmox neighbor table per [proxmox.md](../integrations/proxmox.md#L83-L100).
- `firewall=0` so the Proxmox firewall doesn't sit in front of every clone.
- `local-lvm` is Proxmox's default; substitute your storage name if different.

Start it:

```bash
qm start 9100
```

Open the noVNC console from the Proxmox web UI. You should see the Debian
installer.

---

## 2. Install Debian 12 (minimal)

In the installer:

| Step | Choice |
|------|--------|
| Language | English (or whatever) |
| Locale | United States |
| Keyboard | American English |
| Hostname | `payload-template` |
| Domain | leave blank |
| Root password | set anything; we'll disable root SSH later |
| Full name of new user | `Shipwrights` |
| Username | `shipwrights` |
| Password | `shipwrights` |
| Disk partitioning | Guided — use entire disk → All files in one partition |
| Software selection | **uncheck everything**, including "Debian desktop environment" and "GNOME". Leave only **standard system utilities** and **SSH server** |

Why uncheck the DE: we install XFCE manually below to avoid pulling in
GNOME's dependency surface.

Let it finish, then reboot. After reboot, eject the ISO:

```bash
# on Proxmox host
qm set 9100 --ide2 none
```

---

## 3. Get a shell on the VM

From your laptop or Proxmox host:

```bash
ssh shipwrights@<vm-ip>
# password: shipwrights
```

If you don't know the VM IP, find it from the Proxmox host:

```bash
qm guest cmd 9100 network-get-interfaces 2>/dev/null    # only works if guest-agent is on
# otherwise:
ip -4 neigh show | grep "$(qm config 9100 | awk -F'=' '/net0:/{for(i=1;i<=NF;i++)if($i~/^[0-9a-f]{2}:/){print $i;exit}}')"
```

Or just look at `ip a` in the noVNC console.

---

## 4. Install XFCE + xrdp + the basics

```bash
sudo apt update
sudo apt -y full-upgrade

# XFCE desktop (xfce4-goodies adds Thunar archive plugin, screenshot tool,
# terminal emulator, etc.) — about 350 MB
sudo apt -y install --no-install-recommends \
  xfce4 xfce4-goodies \
  dbus-x11 \
  xorg \
  xrdp

# Reviewer essentials (optional but expected)
sudo apt -y install \
  firefox-esr \
  git curl wget \
  build-essential \
  vim nano \
  htop \
  ca-certificates \
  unzip
```

Why `--no-install-recommends` for XFCE: skips a few hundred MB of unwanted
extras (printing, scanning, accessibility). XFCE itself is fully usable
without them.

---

## 5. Configure xrdp

Two things to set up: the TLS cert group, and the per-user session command.

### 5a. TLS cert group

xrdp uses `/etc/ssl/private/ssl-cert-snakeoil.key`, which is mode 640
`root:ssl-cert`. Add xrdp to that group so it can read the key:

```bash
sudo adduser xrdp ssl-cert
```

### 5b. Tell xrdp to start XFCE per user

xrdp invokes `~/.xsession` if it exists, otherwise falls back to
`/etc/xrdp/startwm.sh`. We set the **per-user** version so it's explicit
and copy-pasteable:

```bash
cat > ~/.xsession <<'EOF'
#!/bin/sh
exec startxfce4
EOF
chmod +x ~/.xsession
```

Restart xrdp to pick up the group change:

```bash
sudo systemctl enable xrdp
sudo systemctl restart xrdp
sudo systemctl status xrdp --no-pager | head -8
```

You should see `Active: active (running)` and a child `xrdp-sesman`
process. Confirm port 3389 is listening:

```bash
ss -tlnp | grep 3389
```

---

## 6. Suppress PolicyKit popups inside the session

XFCE will pop a "Authentication required" dialog when it tries to manage
NetworkManager and color-management — both pointless in a review VM. Allow
the user without prompting:

```bash
sudo tee /etc/polkit-1/rules.d/49-payload-allow-shipwrights.rules >/dev/null <<'EOF'
polkit.addRule(function(action, subject) {
  if (subject.user == "shipwrights" &&
      (action.id.indexOf("org.freedesktop.color-manager.") === 0 ||
       action.id.indexOf("org.freedesktop.NetworkManager.") === 0 ||
       action.id == "org.freedesktop.packagekit.system-sources-refresh" ||
       action.id == "org.xfce.power.backlight-helper")) {
    return polkit.Result.YES;
  }
});
EOF
```

---

## 7. Test the RDP connection directly

From your laptop, with the Proxmox SSH tunnel:

```bash
# in one terminal
ssh -L 3389:<vm-ip>:3389 root@<proxmox-host-ip>

# in another terminal
xfreerdp /v:localhost /u:shipwrights /p:shipwrights /sec:tls /cert:ignore /dynamic-resolution
```

Or use Remmina (Protocol = RDP, Security = TLS, Ignore certificate = yes,
Server = `localhost:3389`).

You should land in the XFCE desktop within ~3 seconds. If you see a black
screen, paste me the output of:

```bash
cat ~/.xsession-errors | tail -50
sudo tail -50 /var/log/xrdp.log
```

---

Fix (one command + restart)

sudo apt -y install xserver-xorg-legacy
echo -e "allowed_users=anybody\nneeds_root_rights=yes" | sudo tee /etc/X11/Xwrapper.config
sudo systemctl restart xrdp


## 8. Test through Guacamole

```bash
GUAC_TEST_VM_IP=<vm-ip> \
GUAC_TEST_VM_USERNAME=shipwrights \
GUAC_TEST_VM_PASSWORD=shipwrights \
pnpm payload guac:test-connection
```

Open the printed iframe URL. You should see the same XFCE desktop in the
browser. If you do, **the entire Milestone 3 chain is verified end-to-end**:
Proxmox VM → xrdp → guacd → Guacamole webapp → reverse proxy → iframe.

---

## 9. Tighten the template before sealing it

Inside the VM, do everything you want every clone to inherit, then clean up
clone-unique state:

```bash
# disable root password SSH (keep keys if you set them; otherwise this hardens it)
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart ssh

# clear apt cache, journal, history
sudo apt clean
sudo journalctl --vacuum-time=1s
history -c

# reset machine identity so each clone gets unique IDs
sudo truncate -s 0 /etc/machine-id
sudo rm -f /var/lib/dbus/machine-id
sudo ln -sf /etc/machine-id /var/lib/dbus/machine-id

# zero free disk space (makes thin clones smaller, optional but cheap)
sudo dd if=/dev/zero of=/zero bs=1M status=progress 2>/dev/null
sudo rm -f /zero
sudo fstrim -av 2>/dev/null

sudo poweroff
```

---

## 10. Convert the VM into a Proxmox template

On the Proxmox host:

```bash
qm template 9100
```

That's it. Set this template's VMID in your `.env`:

```bash
PROXMOX_LINUX_TEMPLATE_VMID=9100
```

And re-seed if needed:

```bash
pnpm payload seed:vm-types
```

(Or update `src/config/vm-types.ts` so `proxmoxTemplateVmid` matches and
re-run the seed.)

---

## 11. Verify a fresh clone works

End-to-end smoke test from the Payload repo:

```bash
pnpm payload proxmox:test-clone
# note the VM IP it prints — the script will stop+delete the VM after,
# so capture the IP within the polling window if you want to also test
# Guacamole against it.
```

Then in another terminal, while the test VM is still running:

```bash
GUAC_TEST_VM_IP=<that ip> pnpm payload guac:test-connection
```

If the iframe shows XFCE, **Milestone 3 is complete**.

---

## Reference: what this template ships with

| | |
|---|---|
| OS | Debian 12 |
| Desktop | XFCE 4.18 |
| RDP server | xrdp on TCP 3389 |
| RDP security mode | TLS (Guacamole `security=tls`) |
| Default user | `shipwrights` / `shipwrights` (Linux PAM) |
| Auto-login | not needed (xrdp creates its own session) |
| Browser | Firefox ESR |
| Dev tools | git, curl, wget, build-essential, vim, nano, htop |
| qemu-guest-agent | **not installed** — IP discovery via Proxmox neighbor table |
| cloud-init | **not installed** — credentials are baked in (rotate before public launch) |

---

## Operator notes

- **Rotate the `shipwrights` password before letting untrusted users in.**
  Treat the current value as a placeholder; document the rotation in
  [allowlist-update.md](./allowlist-update.md) when v1 ships.
- **Swap to per-session credentials when you add cloud-init.** Until then,
  every VM clone has the same RDP password — fine for the reviewer-only
  v1, not fine if the threat model expands.
- **If you ever need to rebuild from scratch**, this runbook is the source
  of truth. Keep it current; if you change a step (e.g. add Docker to
  the template), update §4 and §11.
