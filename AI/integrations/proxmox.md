# Proxmox Integration

## Auth

Use Proxmox API tokens, not username/password tickets. Tokens do not expire, do
not need CSRF, and can be permission-scoped.

Create on Proxmox:

```bash
pveum user add payload@pve
pveum aclmod / -user payload@pve -role PVEVMAdmin
pveum user token add payload@pve api --privsep=0
# returns: payload@pve!api=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

HTTP header:

```http
Authorization: PVEAPIToken=payload@pve!api=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

## Env vars

```bash
PROXMOX_HOST=pve.lan
PROXMOX_PORT=8006
PROXMOX_TOKEN_ID=payload@pve!api
PROXMOX_TOKEN_SECRET=...
PROXMOX_VERIFY_TLS=true
PROXMOX_TLS_CA_FILE=/etc/payload/pve-ca.pem
PROXMOX_DEFAULT_NODE=pve
PROXMOX_SSH_USER=root
PROXMOX_SSH_PASSWORD=...
# optional if SSH target differs from API host:
PROXMOX_SSH_HOST=pve.lan
PROXMOX_SSH_PORT=22
```

Set `PROXMOX_VERIFY_TLS=false` only for local development with a self-signed
certificate.

`PROXMOX_TOKEN_ID` must be the full token id from Proxmox, not just the token
name. If the UI shows token name `payload` for user `root@pam`, the env value is
`root@pam!payload`.

Do not use the SSH prompt host name as the token realm. For example,
`root@nullskulls:~#` means SSH user `root` on host `nullskulls`, but the Proxmox
API user is still usually `root@pam`. A token named `payload` for that user is
`root@pam!payload`, not `root@nullskulls!payload`.

## Endpoints Payload uses

Base: `https://{host}:{port}/api2/json`

| Action | Method + path |
|--------|---------------|
| Get next free vmid | `GET /cluster/nextid` |
| Clone template | `POST /nodes/{node}/qemu/{template_vmid}/clone` |
| Task status | `GET /nodes/{node}/tasks/{upid}/status` |
| Start | `POST /nodes/{node}/qemu/{vmid}/status/start` |
| Stop | `POST /nodes/{node}/qemu/{vmid}/status/stop` |
| Status snapshot | `GET /nodes/{node}/qemu/{vmid}/status/current` |
| VM config / MAC address | `GET /nodes/{node}/qemu/{vmid}/config` |
| Delete | `DELETE /nodes/{node}/qemu/{vmid}?purge=1` |

## Clone payload

```json
{
  "newid": 12345,
  "name": "payload-42",
  "full": 0,
  "target": "pve"
}
```

Response: `{"data": "UPID:pve:0000ABCD:..."}`. Poll
`/nodes/{node}/tasks/{upid}/status` until stopped.

## Getting the IP

Milestone 2 assumes the Debian XFCE template does **not** have cloud-init or
qemu-guest-agent installed. Payload cannot rely on cloud-init regeneration or
`/agent/network-get-interfaces`.

The current smoke-test flow is:

1. Clone the template.
2. Read `net0` from `GET /nodes/{node}/qemu/{vmid}/config`.
3. Parse the generated MAC address.
4. SSH to the Proxmox host and poll `ip -4 neigh show`.
5. Return the first non-loopback IPv4 whose `lladdr` matches that MAC.

This requires SSH access from the app/worker environment to the Proxmox host.
Password SSH is supported with `sshpass` and `PROXMOX_SSH_PASSWORD`; key-based
SSH is supported with `PROXMOX_SSH_KEY_PATH`. If this is unreliable in
production, prefer adding a tiny network-side IP lookup service or reading DHCP
leases from the actual DHCP authority.

## Per-VM credential injection

| OS | Mechanism |
|----|-----------|
| Linux | Debian XFCE + xrdp template has fixed `shipwrights` / `shipwrights` credentials for RDP |
| Windows | cloudbase-init writes RDP password; or autounattend.xml |
| Android-x86 | First-boot script reads cloud-init from cdrom |
| macOS | LaunchDaemon reads cloud-init, resets screen-sharing password |

Milestone 2 does not inject per-session credentials because cloud-init is not
available on the template. Treat the fixed credential as a temporary
operator-controlled template detail; rotate it before enabling untrusted users.

## TypeScript client sketch

```ts
type ProxmoxClientOptions = {
  baseUrl: string;
  tokenId: string;
  tokenSecret: string;
};

export class ProxmoxClient {
  constructor(private readonly options: ProxmoxClientOptions) {}

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.options.baseUrl}/api2/json${path}`, {
      ...init,
      headers: {
        authorization: `PVEAPIToken=${this.options.tokenId}=${this.options.tokenSecret}`,
        "content-type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`Proxmox ${response.status} ${path}`);
    }

    return (await response.json()) as T;
  }

  async clone(node: string, templateVmid: number, newVmid: number, name: string) {
    return this.request<{ data: string }>(`/nodes/${node}/qemu/${templateVmid}/clone`, {
      method: "POST",
      body: JSON.stringify({ newid: newVmid, name, full: 0, target: node }),
    });
  }
}
```

The implementation lives in `src/lib/proxmox`. Add a small retry wrapper around
idempotent calls and task polling. Do not retry non-idempotent calls unless the
operation can be safely detected afterward.

## Operational notes

- **Nextid races:** `nextid` can return the same value under concurrent clones.
  Treat it as a hint and tolerate "VMID already exists" by retrying with a new
  ID.
- **Linked clones:** require template disk storage that supports linked clones.
- **No cloud-init in milestone 2:** VM clones use the template defaults.
- **TLS:** production should trust Proxmox CA instead of disabling TLS checks.
