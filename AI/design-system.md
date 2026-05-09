# Design System

Payload uses Tailwind CSS v4, FlyonUI, Lucide React, and the Hack Club brand
palette. The UI should feel warm and direct without becoming a marketing page.
The first screen after login is the actual VM dashboard.

## Brand palette

From <https://hackclub.com/brand/>.

| Token | Hex | Use |
|-------|-----|-----|
| hc-red | #ec3750 | Primary action, brand mark |
| hc-orange | #ff8c37 | Secondary accent, warning |
| hc-yellow | #f1c40f | Time remaining warning |
| hc-green | #33d6a6 | Success, VM ready |
| hc-cyan | #5bc0de | Info |
| hc-blue | #338eda | Links, secondary action |
| hc-purple | #a633d6 | Decorative only |
| hc-darker | #121217 | Page background |
| hc-dark | #17171d | Surface background |
| hc-darkless | #252429 | Borders |
| hc-black | #1f2d3d | Body text in light contexts |
| hc-steel | #273444 | Headings in light contexts |
| hc-slate | #3c4858 | Subtext |
| hc-muted | #8492a6 | Placeholder, disabled |
| hc-smoke | #e0e6ed | Light border |
| hc-snow | #f9fafc | Light background |

## Tailwind / FlyonUI config

```ts
// tailwind.config.ts
import flyonui from "flyonui/plugin";
import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./node_modules/flyonui/dist/js/*.js",
  ],
  theme: {
    extend: {
      colors: {
        hc: {
          red: "#ec3750",
          orange: "#ff8c37",
          yellow: "#f1c40f",
          green: "#33d6a6",
          cyan: "#5bc0de",
          blue: "#338eda",
          purple: "#a633d6",
          darker: "#121217",
          dark: "#17171d",
          darkless: "#252429",
          black: "#1f2d3d",
          steel: "#273444",
          slate: "#3c4858",
          muted: "#8492a6",
          smoke: "#e0e6ed",
          snow: "#f9fafc",
        },
      },
      fontFamily: {
        sans: ['"Phantom Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      borderRadius: {
        hc: "8px",
      },
    },
  },
  plugins: [
    flyonui({
      themes: [
        {
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
            info: "#5bc0de",
            success: "#33d6a6",
            warning: "#ff8c37",
            error: "#ec3750",
          },
        },
      ],
    }),
  ],
} satisfies Config;
```

Apply theme on the root layout:

```tsx
<html lang="en" data-theme="payload">
```

Default to dark mode because long remote-desktop sessions feel better with a
quiet surrounding UI.

## Typography

- Headings and body: Phantom Sans, self-hosted via `src/app/fonts/`.
- Code, VM IDs, and technical metadata: JetBrains Mono.
- Do not scale font sizes with viewport width. Keep letter spacing at `0`.

## Components

| Need | FlyonUI / React component |
|------|---------------------------|
| Spawn / Destroy | `btn` with Lucide icon |
| VM picker | `card`, one per VM type |
| Active sessions | compact cards or table rows |
| Destroy confirmation | `modal` |
| Session ready / timeout warnings | `toast` |
| Provisioning | `progress` plus concise status text |
| Session state | `badge` |
| User menu | `dropdown` |
| Errors / denied access | `alert` |

Use icons in tool buttons where the command is familiar. Use text buttons only
for clear, high-stakes actions like "Spawn Linux" and "Destroy VM".

## Layout

### Top bar

- Hack Club flag/logo on the left.
- "Payload" wordmark.
- User avatar, name, and sign-out menu on the right.

### Dashboard (`/`)

- Active sessions section with up to 2 rows/cards.
- VM type picker grid. In v1, only Linux is enabled; disabled future types can
  appear as muted "Coming later" options only if that helps communicate roadmap.
- No marketing hero. This is a tool.

### Session view (`/sessions/:id`)

- Slim top bar with VM name, state badge, countdown, and destroy button.
- Full-bleed iframe filling the remaining viewport.
- Provisioning and error states occupy the same viewport footprint to avoid
  layout shifts.

### Sign-in

- Centered sign-in surface.
- Red "Sign in with Hack Club" button.

### Denied

- Explain that the account is valid but the Slack ID is not allowlisted.
- Show the detected Slack ID if available so the reviewer can ask an admin for
  the exact entry.

## Tone of voice

- Friendly, direct, second person.
- User-facing copy says "Spawn" and "Destroy".
- Internal code can say "provision" and "terminate".

Examples:

> Your Linux VM is ready. It will self-destruct at 14:32 or after 30 minutes idle.

> You already have 2 active VMs. Destroy one before spawning another.
