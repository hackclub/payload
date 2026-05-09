# Domain Model

## Tables

### users

The authenticated principal. One row per Hack Club account that has ever logged in.

| column | type | notes |
|--------|------|-------|
| id | bigint pk | |
| slack_id | string, unique, not null | from OIDC claim, e.g. `U0123ABC` |
| oidc_sub | string, unique, not null | the `sub` claim, e.g. `ident!abc123` |
| email | string | from `email` claim |
| name | string | from `name` claim |
| avatar_url | string | derived from cachet |
| last_login_at | timestamp | |
| created_at / updated_at | timestamp | |

### reviewer_allowlist_entries

The set of slack_ids permitted to use Payload. Seeded from `config/reviewers.yml`.

| column | type | notes |
|--------|------|-------|
| id | bigint pk | |
| slack_id | string, unique, not null | |
| note | string | optional, e.g. "Arcade reviewer 2026" |
| added_by | string | who added this entry |
| created_at / updated_at | timestamp | |

Authorization rule: User may use Payload iff a `ReviewerAllowlistEntry` exists
with the same slack_id. Enforced in a base controller `before_action`.

### vm_types

Reference data, seeded from YAML. One row per supported OS template.

| column | type | notes |
|--------|------|-------|
| id | bigint pk | |
| slug | string, unique | `windows`, `linux`, `android`, `macos` |
| display_name | string | "Windows 11", "Ubuntu 24.04", etc. |
| proxmox_template_vmid | integer | the source template's vmid |
| proxmox_node | string | which Proxmox node hosts the template |
| protocol | string | `vnc` or `rdp` |
| default_port | integer | 5900 (vnc) or 3389 (rdp) |
| enabled | boolean | hide from picker without deleting |
| description | text | shown in picker UI |

### vm_sessions

The core resource: one row per ephemeral VM.

| column | type | notes |
|--------|------|-------|
| id | bigint pk | |
| user_id | bigint fk | who owns it |
| vm_type_id | bigint fk | |
| state | string | enum, see below |
| proxmox_vmid | integer | nil until cloned |
| proxmox_node | string | |
| vm_ip | inet | nil until guest-agent reports it |
| vm_credential | string | per-VM VNC/RDP password, encrypted at rest |
| guacamole_connection_id | string | from Guacamole REST |
| guacamole_username | string | one-shot Guacamole user |
| expires_at | timestamp | `created_at + 6h` (hard cap) |
| last_heartbeat_at | timestamp | updated by browser heartbeat |
| terminated_at | timestamp | nil while alive |
| termination_reason | string | enum: `idle`, `ttl`, `user`, `error`, `admin` |
| created_at / updated_at | timestamp | |

#### state enum

```
pending      → row created, before Proxmox clone returns
provisioning → clone in progress, polling for IP
ready       → IP known, Guacamole registered, reviewer may connect
active      → browser sent ≥1 heartbeat
terminating → reaper triggered, destroying VM + Guacamole connection
terminated  → cleanup complete; row kept for audit
errored     → provisioning or termination failed; needs operator
```

#### Indexes

- `(user_id, state)` for "how many active VMs does this user have?"
- `(state, expires_at)` for TTL reaper query
- `(state, last_heartbeat_at)` for idle reaper query

### vm_session_events

Append-only audit log per session.

| column | type | notes |
|--------|------|-------|
| id | bigint pk | |
| vm_session_id | bigint fk | |
| kind | string | `created`, `clone_started`, `ip_acquired`, `guacamole_registered`, `heartbeat`, `terminated`, `error` |
| payload | jsonb | structured details |
| created_at | timestamp | |

## Rails models (sketch)

```ruby
class User < ApplicationRecord
  has_many :vm_sessions, dependent: :restrict_with_exception

  def reviewer?
    ReviewerAllowlistEntry.exists?(slack_id: slack_id)
  end

  def active_session_count
    vm_sessions.where(state: %w[pending provisioning ready active]).count
  end
end

class VmType < ApplicationRecord
  has_many :vm_sessions
end

class VmSession < ApplicationRecord
  belongs_to :user
  belongs_to :vm_type
  has_many :events, class_name: "VmSessionEvent", dependent: :destroy

  enum :state, {
    pending: "pending", provisioning: "provisioning", ready: "ready",
    active: "active", terminating: "terminating", terminated: "terminated",
    errored: "errored"
  }

  encrypts :vm_credential
  scope :alive, -> { where(state: %w[pending provisioning ready active]) }
end

class ReviewerAllowlistEntry < ApplicationRecord
end
```

## Seed data

- `db/seeds/vm_types.yml` — the four VM types.
- `config/reviewers.yml` — the Slack ID allowlist. Loaded on `db:seed` and
  on every deploy via `after_initialize` that diffs YAML against DB.
