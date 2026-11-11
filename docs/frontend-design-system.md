# Laundry ERP — Frontend Design Constitution

**Status:** Mandatory for every frontend feature.

## Design principles

1. Use the existing dashboard as the visual baseline.
2. Maintain one consistent blue-and-white light theme across all screens.
3. All pages must use the shared `AppShell`, `Sidebar`, `Topbar` and `PageHeader`.
4. All colors, typography, spacing, borders and radii must come from centralized design tokens.
5. Use reusable UI components. Do not create duplicate buttons, cards, inputs, tables or dialogs.
6. Design for non-technical laundry shop employees. Use simple English, clear labels and obvious actions.
7. Keep forms short, workflows straightforward and primary actions prominent.
8. Support desktop, tablet and mobile screen sizes.
9. Provide consistent loading, empty, error, offline, pending-sync and conflict states.
10. New features must inherit the existing theme automatically. Do not introduce a new design style without explicit approval.

## Technology

- React + TypeScript + Vite
- Tailwind CSS with centralized theme tokens
- Reusable accessible UI components
- Cloudflare Workers Static Assets for hosting
- Cloudflare Worker APIs for backend operations
- IndexedDB for offline-first order operations

## Feature development rule

Before implementing a new screen:

1. Reuse the existing layout and components.
2. Check whether a missing component belongs in the shared UI library.
3. Follow the dashboard's colors, spacing, typography and interaction patterns.
4. Validate responsive behavior and accessibility.
5. Do not modify global theme tokens without approval.

**The dashboard is the reference design. All future screens must look like they belong to the same application.**