# CoachForge Research Command Center

This repo currently contains two implementations of CoachForge:

- The legacy static app at the repo root: [`index.html`](index.html), [`app.js`](app.js), and [`styles.css`](styles.css)
- The newer Astro/server refactor under [`src/`](src)

GitHub Pages should continue serving the legacy root static app for now.

## Current live-safe app

The GitHub Pages-compatible version is the root static app. It uses browser-side persistence and keeps all behavior client-side:

- Weekly Plan now seeds and displays a 6-week study plan for Weeks 1-6
- Reading Log now seeds the provided source entries as separate reading items
- Seed/init logic is idempotent, so refreshes do not keep duplicating seeded content
- The root app layout has been tightened so normal desktop/mobile use does not require horizontal page scrolling

Browser storage keys used by the legacy app:

- `retroCoachResearchDashboard.v1`
- `coachForgeThemeMode.v1`
- `retroCoachResearchDashboard.v1.invalidBackup`

## Repo structure

- [`index.html`](index.html) - legacy static entrypoint used by GitHub Pages
- [`app.js`](app.js) - legacy dashboard logic, seed/init flow, hash routing, modal behavior
- [`styles.css`](styles.css) - legacy static app styling
- [`src/pages/index.astro`](src/pages/index.astro) - Astro app shell
- [`src/lib/dashboard-state.js`](src/lib/dashboard-state.js) - Astro app schema and persistence
- [`src/lib/dashboard-render.js`](src/lib/dashboard-render.js) - Astro section rendering
- [`src/pages/api/dashboard.ts`](src/pages/api/dashboard.ts) - Astro mutation endpoint

## Working on the legacy static app

Open the root site directly:

1. Open [`index.html`](index.html) in a browser, or use the published GitHub Pages URL.
2. Navigate with the existing hash routes such as `#overview`, `#weekly`, and `#reading`.
3. Refresh to confirm browser-persisted data stays in place.

Notes:

- The legacy app is intentionally static and does not require a backend.
- Wide tables may scroll inside their own table area, but the page itself should stay within the viewport.
- If you want to reseed from scratch, clear the legacy localStorage keys in the browser.

## Working on the Astro app

The Astro app remains in the repo but is not the current GitHub Pages deployment target.

Typical local workflow:

1. Run `npm install`
2. Run `npm run dev`
3. Open the local Astro dev URL

Important limitation:

- The Astro app depends on a server runtime and server-side persistence, so it cannot be deployed to GitHub Pages as-is.

## Later migration path

To move the same data into the Astro/server-backed app without breaking GitHub Pages, the safe path is:

1. Keep GitHub Pages serving the root static frontend
2. Put durable persisted storage behind a separately deployed backend
3. Teach the static frontend and/or Astro app to use that shared backend
4. Only switch the live site after the backend path is stable
