# CoachForge Research Command Center

CoachForge is being refactored from a local-only vanilla JS dashboard into an AHA stack app using Astro, htmx, and Alpine.js.

## Current state
- The new app shell lives in `src/` and uses Astro server rendering with HTML partial updates.
- Shared dashboard schema, seeding, hydration, and persistence live in `src/lib/dashboard-state.js`.
- Section and modal rendering live in `src/lib/dashboard-render.js`.
- htmx mutation routes live in `src/pages/api/dashboard.ts`.
- Legacy import lives in `src/pages/api/import-legacy.ts`.
- The main Astro page lives in `src/pages/index.astro`.
- Existing root files (`index.html`, `app.js`, `styles.css`) are still present as the legacy implementation and data reference.

## Data preservation
The original browser data key is still:
- `retroCoachResearchDashboard.v1`

Theme preference key:
- `coachForgeThemeMode.v1`

The Astro app preserves the same dashboard shape and supports a legacy import path:
- Same-origin auto import from existing `localStorage` when possible.
- Manual backup import from the new app via the `Import Backup` button.

## Important limitation
This machine is currently extremely low on disk space. During the migration, Astro build verification was blocked because a required dependency (`shiki`) could not be restored after cleanup without hitting `ENOSPC`. Some older root files also intermittently time out on read because of the filesystem state.

That means the source refactor is present in the repo, but the app has not been fully reverified end to end on this machine yet.

## Run after freeing disk space
1. Free additional disk space.
2. Run `npm install`.
3. Run `npm run dev`.
4. Open the Astro app in the browser and import legacy data if the auto-import path does not trigger.

## File layout
- `src/pages/index.astro` - Astro page shell
- `src/pages/api/dashboard.ts` - htmx mutation endpoint
- `src/pages/api/import-legacy.ts` - legacy import endpoint
- `src/pages/fragments/modal.ts` - modal fragment endpoint
- `src/lib/dashboard-state.js` - schema, seed data, persistence
- `src/lib/dashboard-render.js` - server-rendered sections and modals
- `src/scripts/app.js` - thin client behavior
- `src/styles/global.css` - migrated styling

## Legacy app
If you still need to inspect the original local-only implementation, the previous static files remain at the repo root.
