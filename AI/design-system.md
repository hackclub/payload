# Design System

Payload uses Tailwind CSS v4, FlyonUI, Lucide React, and the Hack Club brand
palette. The UI is designed specifically around a clean, developer-focused "dark mode" aesthetic to evoke a hacker terminal environment while remaining highly usable.

## Brand palette

From <https://hackclub.com/brand/>.

| Token | Hex | Use |
|-------|-----|-----|
| hc-red | #ec3750 | Primary action, brand mark |
| hc-orange | #ff8c37 | Secondary accent, warning |
| hc-yellow | #f1c40f | Time remaining warning |
| hc-green | #33d6a6 | Success, VM ready, Active Ping |
| hc-cyan | #5bc0de | Info, new launches |
| hc-blue | #338eda | Links, terminal prompt accents |
| hc-purple | #a633d6 | Decorative only |
| hc-darker | #121217 | Main page background |
| hc-dark | #17171d | Surface background (cards, nav) |
| hc-darkless | #252429 | Borders, subtle interactive states |
| hc-black | #1f2d3d | Deep contrast zones (VM wrapper) |
| hc-steel | #273444 | Unused in dark mode |
| hc-slate | #3c4858 | Interactive text bounds |
| hc-muted | #8492a6 | Subtext, disabled buttons |
| hc-smoke | #e0e6ed | High-contrast subtext |
| hc-snow | #f9fafc | Headings, emphasized text |

## Tailwind / Layout

The project natively imports `flyonui` but mainly anchors directly on Tailwind utility classes scoped to the `hc-*` color definitions. The `globals.css` forces `#121217` root background.
Panels use rounded corners (`rounded-hc`), thin borders (`border-hc-darkless`), and interactive elements include clean dropdown shadows and transform pushes without cartoonish block depth.

All layout structure is built natively via standard Flexbox/Grid on mobile-first breakpoints.
