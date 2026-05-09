# Proxmox Integration

## Auth

Use **API tokens**, not username/password tickets. Tokens don't expire,
don't need CSRF, can be permission-scoped.

Create on Proxmox:

```bash
pveum user add payload@pve
pveum aclmod / -user payload@pve -role PVEVMAdmin
pveum user token add payload@pve api --privsep=0
# → returns: payload@pve!api=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

HTTP header:
```
Authorization: PVEAPIToken=payload@pve!api=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

## Env vars

```bash
PROXMOX_HOST=pve.lan           # or public IP
PROXMOX_PORT=8006
PROXMOX_TOKEN_ID=payload@pve!api
PROXMOX_TOKEN_SECRET=…
PROXMOX_VERIFY_TLS=true       # set false only if using PVE self-signed cert
PROXMOX_TLS_CA_FILE=/etc/payload/pve-ca.pem
PROXMOX_DEFAULT_NODE=pve
```

## Endpoints we use

Base: `https://{host}:{port}/api2/json`

| Action | Method + path |
|--------|---------------|
| Get next free vmid | `GET /cluster/nextid` |
| Clone template | `POST /nodes/{node}/qemu/{template_vmid}/clone` |
| Task status (poll) | `GET /nodes/{node}/tasks/{upid}/status` |
| Set per-VM config | `POST /nodes/{node}/qemu/{vmid}/config` |
| Start | `POST /nodes/{node}/qemu/{vmid}/status/start` |
| Stop (force) | `POST /nodes/{node}/qemu/{vmid}/status/stop` |
| Status snapshot | `GET /nodes/{node}/qemu/{vmid}/status/current` |
| Guest network interfaces | `GET /nodes/{node}/qemu/{vmid}/agent/network-get-interfaces` |
| Delete | `DELETE /nodes/{node}/qemu/{vmid}?purge=1` |

### Clone payload

```json
POST /nodes/pve/qemu/9001/clone
{
  "newid": 12345,
  "name": "payload-42",
  "full": 0,         // linked clone (fast)
  "target": "pve"
}
```

Response: `{"data": "UPID:pve:0000ABCD:..."}` — poll `/tasks/{upid}/status`.

### Getting the IP

After `start`, poll:

```
GET /nodes/pve/qemu/12345/agent/network-get-interfaces
→ { data: { result: [
    { name: "eth0", ip-addresses: [
        { ip-address-type: "ipv4", ip-address: "10.0.0.42" }
    ]}
]}}
```

Return first non-loopback IPv4. Timeout 120s; on timeout mark session `errored`.

Requires `qemu-guest-agent` installed and `agent: 1` in VM config.

## Per-VM credential injection

| OS | Mechanism |
|----|-----------|
| Linux | cloud-init `cipassword` + first-boot script sets VNC password |
| Windows | cloudbase-init writes RDP password; or autounattend.xml |
| Android-x86 | First-boot script reads cloud-init from cdrom |
| macOS | LaunchDaemon reads cloud-init, resets screen-sharing password |

Setting cloud-init via API:

```bash
POST /nodes/pve/qemu/12345/config
{ "ciuser": "reviewer", "cipassword": "<random>", "ipconfig0": "ip=dhcp" }
POST /nodes/pve/qemu/12345/cloudinit  # regenerate drive before start
```

See [vm-templates.md](../vm-templates.md) for per-OS prep checklist.

## Ruby client sketch

```ruby
class Proxmox::Client
  def initialize
    @conn = Faraday.new(url: "https://#{ENV['PROXMOX_HOST']}:#{ENV['PROXMOX_PORT']}") do |f|
      f.request :json
      f.request :retry, max: 3, interval: 0.5, backoff_factor: 2
      f.response :json
      f.headers["Authorization"] =
        "PVEAPIToken=#{ENV['PROXMOX_TOKEN_ID']}=#{ENV['PROXMOX_TOKEN_SECRET']}"
    end
  end

  def clone(node:, template_vmid:, new_vmid:, name:)
    @conn.post("/api2/json/nodes/#{node}/qemu/#{template_vmid}/clone",
               { newid: new_vmid, name: name, full: 0 }).body.dig("data")
  end

  def wait_for_task(node:, upid:, timeout: 60)
    deadline = Time.now + timeout
    loop do
      data = @conn.get("/api2/json/nodes/#{node}/tasks/#{upid}/status").body["data"]
      return data if data["status"] == "stopped"
      raise "task timeout" if Time.now > deadline
      sleep 0.5
    end
  end

  def guest_ip(node:, vmid:, timeout: 120)
    deadline = Time.now + timeout
    loop do
      resp = @conn.get("/api2/json/nodes/#{node}/qemu/#{vmid}/agent/network-get-interfaces")
      ifaces = resp.body.dig("data", "result") || []
      ipv4 = ifaces.flat_map { |i| (i["ip-addresses"] || []) }
                   .find { |a| a["ip-address-type"] == "ipv4" && !a["ip-address"].start_with?("127.") }
      return ipv4["ip-address"] if ipv4
      raise "guest-agent timeout" if Time.now > deadline
      sleep 2
    rescue Faraday::Error
      raise "guest-agent timeout" if Time.now > deadline
      sleep 2
    end
  end
end
```

## Operational notes

- **Nextid races**: under concurrent clones, nextid can return same id twice.
  Use as hint, but tolerate "vmid already exists" and retry.
- **Linked clones**: require template disk on storage that supports qcow2.
- **Cloud-init regeneration**: must re-run after every config change before start.
