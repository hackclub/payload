# Design System

Payload uses **Tailwind CSS v4** + **FlyonUI** + **Hack Club brand palette**.
Goal: feel like a Hack Club product (warm, bold, slightly playful), not enterprise SaaS.

## Brand palette

From <https://hackclub.com/brand/>

| Token | Hex | Use |
|-------|-----|-----|
| hc-red | #ec3750 | Primary action, brand mark |
| hc-orange | #ff8c37 | Secondary accent, warning |
| hc-yellow | #f1c40f | Highlights, "time remaining" warning |
| hc-green | #33d6a6 | Success, "VM ready" |
| hc-cyan | #5bc0de | Info |
| hc-blue | #338eda | Links, secondary action |
| hc-purple | #a633d6 | Decorative only |
| hc-darker | #121217 | Page background (dark mode) |
| hc-dark | #17171d | Card background (dark mode) |
| hc-darkless | #252429 | Borders (dark mode) |
| hc-black | #1f2d3d | Body text (light mode) |
| hc-steel | #273444 | Headings (light mode) |
| hc-slate | #3c4858 | Subtext |
| hc-muted | #8492a6 | Placeholder, disabled |
| hc-smoke | #e0e6ed | Borders (light mode) |
| hc-snow | #f9fafc | Page background (light mode) |

### Tailwind config

```js
// tailwind.config.js
import flyonui from "flyonui/plugin";

export default {
  content: ["./app/**/*.{erb,html,rb,js}", "./node_modules/flyonui/dist/js/*.js"],
  theme: {
    extend: {
      colors: {
        hc: {
          red: "#ec3750", orange: "#ff8c37", yellow: "#f1c40f",
          green: "#33d6a6", cyan: "#5bc0de", blue: "#338eda",
          purple: "#a633d6",
          darker: "#121217", dark: "#17171d", darkless: "#252429",
          black: "#1f2d3d", steel: "#273444", slate: "#3c4858",
          muted: "#8492a6", smoke: "#e0e6ed", snow: "#f9fafc"
        }
      },
      fontFamily: {
        sans: ['"Phantom Sans"', "system-ui"],
        mono: ['"JetBrains Mono"', "ui-monospace"]
      },
      borderRadius: { "hc": "12px" }
    }
  },
  plugins: [
    flyonui({
      themes: [{
        payload: {
          primary: "#ec3750",
          "primary-content": "#ffffff",
          secondary: "#338eda",
          accent: "#33d6a6",
          neutral: "#17171d",
          "base-100": "#121217",
          "base-200": "#17171d",
          "base-300": "#252429",
          "base-content": "#f9fafc",
          info: "#5bc0de", success: "#33d6a6",
          warning: "#ff8c37", error: "#ec3750"
        }
      }]
    })
  ]
}
```

Apply theme: `<html data-theme="payload">`

Default to **dark mode** (matches Hack Club site, nicer for long sessions).

## Typography

- Headings & body: **Phantom Sans**. Self-host via `app/assets/fonts/`. Fallback: system-ui.
- Code / VM IDs: **JetBrains Mono**.

## FlyonUI components

| Component | Where |
|-----------|-------|
| `btn` | Spawn/Destroy buttons |
| `card` | VM type picker tiles, dashboard session cards |
| `modal` | Destroy confirmation |
| `toast` | "Session ready", "1 minute remaining" |
| `progress` | Provisioning splash |
| `badge` | Session state pill |
| `tooltip` | Time-remaining hover |
| `dropdown` | User menu (top right) |
| `alert` | Allowlist denial, error states |

## Layout

- **Top bar**: Hack Club flag/logo (left), "Payload" wordmark, user avatar + name + sign-out (right).
- **Dashboard** (`/`):
  - Active sessions strip (0–2 cards, "Open" + "Destroy" buttons).
  - VM type picker grid (4 cards, icon + name + description, "Spawn" button).
- **Session view** (`/sessions/:id`):
  - Slim top bar: VM name, state badge, countdown, Destroy button.
  - Full-bleed `<iframe>` filling viewport.
- **Sign-in**: centered card, "Sign in with Hack Club" red button.
- **Denied**: card explaining logged-in but not on allowlist, with Slack channel link.

## Iconography

- Use **Lucide** icons (MIT licensed, available via `lucide-rails` or inlined SVGs).
- VM type icons: simple monochrome glyphs, tinted per OS:
  - Windows → cyan
  - Linux → orange
  - Android → green
  - macOS → muted slate

## Tone of voice

- Friendly, direct, second person.
- "Spawn", not "Provision". "Destroy", not "Terminate" (user-facing copy).
- Errors explain what to do next.

Examples:
> "Your Linux VM is ready! It'll self-destruct at 14:32 (in 6h) or after 30 min idle."
> "You already have 2 active VMs. Destroy one before spawning a new one."
