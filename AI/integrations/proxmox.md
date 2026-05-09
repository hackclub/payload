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
```

Set `PROXMOX_VERIFY_TLS=false` only for local development with a self-signed
certificate.

## Endpoints Payload uses

Base: `https://{host}:{port}/api2/json`

| Action | Method + path |
|--------|---------------|
| Get next free vmid | `GET /cluster/nextid` |
| Clone template | `POST /nodes/{node}/qemu/{template_vmid}/clone` |
| Task status | `GET /nodes/{node}/tasks/{upid}/status` |
| Set per-VM config | `POST /nodes/{node}/qemu/{vmid}/config` |
| Regenerate cloud-init | `POST /nodes/{node}/qemu/{vmid}/cloudinit` |
| Start | `POST /nodes/{node}/qemu/{vmid}/status/start` |
| Stop | `POST /nodes/{node}/qemu/{vmid}/status/stop` |
| Status snapshot | `GET /nodes/{node}/qemu/{vmid}/status/current` |
| Guest network interfaces | `GET /nodes/{node}/qemu/{vmid}/agent/network-get-interfaces` |
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

After start, poll:

```http
GET /nodes/pve/qemu/12345/agent/network-get-interfaces
```

Expected shape:

```json
{
  "data": {
    "result": [
      {
        "name": "eth0",
        "ip-addresses": [
          { "ip-address-type": "ipv4", "ip-address": "10.0.0.42" }
        ]
      }
    ]
  }
}
```

Return the first non-loopback IPv4. Timeout after 120 seconds and mark the
session `errored`.

Requires `qemu-guest-agent` installed and `agent: 1` in VM config.

## Per-VM credential injection

| OS | Mechanism |
|----|-----------|
| Linux | cloud-init `cipassword` + first-boot script sets VNC password |
| Windows | cloudbase-init writes RDP password; or autounattend.xml |
| Android-x86 | First-boot script reads cloud-init from cdrom |
| macOS | LaunchDaemon reads cloud-init, resets screen-sharing password |

Linux config flow:

```http
POST /nodes/pve/qemu/12345/config
Content-Type: application/json

{
  "ciuser": "reviewer",
  "cipassword": "<random>",
  "ipconfig0": "ip=dhcp"
}
```

Then:

```http
POST /nodes/pve/qemu/12345/cloudinit
```

See [vm-templates.md](../vm-templates.md) for per-OS prep checklist.

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

Add a small retry wrapper around idempotent calls and task polling. Do not retry
non-idempotent calls unless the operation can be safely detected afterward.

## Operational notes

- **Nextid races:** `nextid` can return the same value under concurrent clones.
  Treat it as a hint and tolerate "VMID already exists" by retrying with a new
  ID.
- **Linked clones:** require template disk storage that supports linked clones.
- **Cloud-init regeneration:** re-run after config changes before starting.
- **TLS:** production should trust Proxmox CA instead of disabling TLS checks.
