# Runbook: Switch the Linux VM Template from KRDP to xrdp

The original Debian KDE template ships with **KRDP** (KDE Plasma 6's built-in
RDP server). KRDP is a fine choice for a logged-in user clicking "share my
desktop" but a poor choice for ephemeral VMs because:

1. It only listens while a user is logged into Plasma. Fresh VM clones boot
   to SDDM with no logged-in user, so port 3389 is closed.
2. Its credentials live in a separate Plasma user store, decoupled from the
   Linux user, which complicates per-session credential injection later.
3. Its FreeRDP 3.x server has known NLA/CredSSP interop issues with
   Guacamole's bundled FreeRDP client across the 2.x/3.x boundary.

xrdp solves all three: it's a system service, uses Linux PAM for auth, and is
the protocol Guacamole's `guacd` is tested against most.

This runbook converts an existing KRDP-based template into an xrdp-based one.

---

## 0. Prereqs

- The template VM (e.g. VMID 105) is **stopped**, or you're working in a
  test clone you can throw away.
- You can SSH or open the Proxmox console as a sudo-capable user
  (`shipwrights`).
- The VM has internet access for `apt`.

---

## 1. Boot the template, log in, get a shell

```bash
ssh shipwrights@<template-ip>
# password: shipwrights
```

If the template normally has no SSH, use the Proxmox web console.

---

## 2. Remove KRDP

KDE Plasma 6 ships KRDP as a user-session service. Disable and uninstall:

```bash
# stop any running krdpserver in this user session
systemctl --user stop plasma-krdpserver-server.service 2>/dev/null
systemctl --user disable plasma-krdpserver-server.service 2>/dev/null
pkill -u "$USER" krdpserver 2>/dev/null

# uninstall the package so a future Plasma update doesn't bring it back
sudo apt -y purge krdp plasma-krdp-server 2>/dev/null
sudo apt -y autoremove

# verify nothing is on 3389 anymore
ss -tlnp | grep 3389 || echo "3389 is free ✓"
```

If `apt purge` says "package not found", that's fine — your install path
might be slightly different; the important thing is `ss -tlnp | grep 3389`
returns nothing.

---

## 3. Install and enable xrdp

```bash
sudo apt update
sudo apt -y install xrdp

# xrdp uses a TLS cert that lives at /etc/ssl/private/ssl-cert-snakeoil.key
# the cert is owned by root:ssl-cert; xrdp's user needs to be in that group:
sudo adduser xrdp ssl-cert

sudo systemctl enable --now xrdp
sudo systemctl status xrdp --no-pager | head -10
ss -tlnp | grep 3389
```

You should see `xrdp` listening on `:3389` (and `xrdp-sesman` on `:3350`).

---

## 4. Tell xrdp how to start Plasma

When a user connects via xrdp, xrdp launches `~/.xsession` (or, fallback,
`/etc/xrdp/startwm.sh`). On a Plasma 6 system, you want it to start
`startplasma-x11` — **not** Wayland. xrdp speaks X11 only.

Run as the **`shipwrights`** user (not root):

```bash
cat > ~/.xsession <<'EOF'
#!/bin/sh
export DESKTOP_SESSION=plasma
export XDG_CURRENT_DESKTOP=KDE
exec startplasma-x11
EOF
chmod +x ~/.xsession
```

If `which startplasma-x11` returns nothing, install the X11 startup script:

```bash
sudo apt -y install plasma-workspace-x11
```

(That metapackage on Debian 12 brings in the X11-flavored Plasma launcher
without uninstalling Wayland.)

---

## 5. Avoid the "double session" gotcha

On Debian 12 KDE, if a user is **already logged in at the SDDM console** and
then logs in again over xrdp, xrdp gets a black screen because Plasma
refuses to start a second session for the same user.

For an ephemeral-VM template this isn't an issue — fresh clones boot to
SDDM with **nobody logged in**, and xrdp is the first session. But to make
debugging predictable, disable SDDM auto-login if you previously enabled it
for KRDP:

```bash
sudo grep -E '^(User|Session)=' /etc/sddm.conf 2>/dev/null
# if you see User=shipwrights, comment it out:
sudo sed -i 's/^User=/#User=/; s/^Session=/#Session=/' /etc/sddm.conf
```

---

## 6. Allow xrdp through PolicyKit (silences the "Authentication required" popup)

Plasma over xrdp will pop a PolicyKit auth dialog the first time something
touches NetworkManager or color-management. For an ephemeral reviewer VM
that's noise. Suppress it:

```bash
sudo tee /etc/polkit-1/rules.d/49-xrdp-allow-colord.rules >/dev/null <<'EOF'
polkit.addRule(function(action, subject) {
  if ((action.id == "org.freedesktop.color-manager.create-device" ||
       action.id == "org.freedesktop.color-manager.create-profile" ||
       action.id == "org.freedesktop.color-manager.delete-device" ||
       action.id == "org.freedesktop.color-manager.delete-profile" ||
       action.id == "org.freedesktop.color-manager.modify-device" ||
       action.id == "org.freedesktop.color-manager.modify-profile") &&
      subject.isInGroup("ssl-cert")) {
    return polkit.Result.YES;
  }
});
EOF
```

---

## 7. Test directly with Remmina or xfreerdp

From your laptop (over the SSH tunnel you already set up):

```bash
ssh -L 3389:10.10.10.195:3389 root@65.108.205.36
# in another terminal:
xfreerdp /v:localhost /u:shipwrights /p:shipwrights /sec:tls /cert:ignore /dynamic-resolution
```

You should land in KDE Plasma. If you see a blank/black screen for >10s,
read `/var/log/xrdp.log` and `/var/log/xrdp-sesman.log` — they'll exist
now that xrdp is installed.

---

## 8. Test through Guacamole

```bash
GUAC_TEST_VM_IP=10.10.10.195 \
GUAC_TEST_RDP_SECURITY=tls \
pnpm payload guac:test-connection
```

`security=tls` is right for xrdp. xrdp does **not** speak NLA by default;
trying `nla` will fail.

If you want to lock the connection to a specific Plasma color depth and
session size, add these to the Guacamole connection params later:

```
color-depth=24
width=1920
height=1080
resize-method=display-update
```

(The test script doesn't set width/height; Guacamole will negotiate from
the iframe size.)

---

## 9. Convert the running VM back into a template

Once Step 8 works and you're happy with the desktop:

```bash
# inside the VM, clean up cloud-init / machine-id so clones get unique IDs
sudo cloud-init clean --logs 2>/dev/null
sudo truncate -s 0 /etc/machine-id
sudo rm -f /var/lib/dbus/machine-id
sudo ln -sf /etc/machine-id /var/lib/dbus/machine-id
sudo apt clean
sudo journalctl --vacuum-time=1s
history -c

sudo poweroff
```

Then on the Proxmox host:

```bash
qm template <vmid>
```

Future `qm clone` (or our `pnpm payload proxmox:test-clone`) will produce
fresh ephemeral VMs that boot straight into a working xrdp.

---

## Summary of what changed

| | Before (KRDP) | After (xrdp) |
|---|---|---|
| Service type | Per-user (Plasma session) | System service |
| Listens on fresh boot? | No (needs SDDM autologin + login) | Yes |
| Auth source | Plasma's KRDP user store | Linux PAM (uses `/etc/passwd`) |
| Guacamole `security=` | `nla` (interop-fragile) | `tls` |
| Credentials | `shipwrights` (Linux) + separate KRDP password | `shipwrights` / `shipwrights` (Linux only) |
| Logs | journald (`krdpserver`) | `/var/log/xrdp.log`, `/var/log/xrdp-sesman.log` |
