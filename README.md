# CoachForge Research Command Center

Static **HTML + CSS + Vanilla JS** dashboard for running Human + AI coaching research loops and weekly execution reviews.

## What this app is
CoachForge is a local-first “Research Ops” command center for:
- Translating elite sports culture into business-ready weekly performance loops.
- Tracking standards, signals, prompts, experiments, and links in one place.
- Running the flow: **Standards -> Signals -> Dashboard -> Weekly Review**.
- Supporting the AI loop: **Capture -> Detect Patterns -> Nudge -> Review -> Adjust**.

## Key features
- Neo-90s NFL-inspired dark/light UI with a sticky top bar and sticky left sidebar.
- Sidebar collapse/expand with icon-only collapsed mode.
- Fully local data persistence via `localStorage`.
- Corruption recovery path with automatic reseed and warning banner.
- Project Overview editor with draggable goals.
- Reading Library with:
  - Inline edit + full modal edit
  - Add by URL with metadata autofill (best-effort)
  - Search/filter/sort/key-only controls
  - Expandable notes rows
  - Drag-and-drop reordering
- Weekly Plan cards for weeks 5–11 with milestones, progress bars, and single-active-week enforcement.
- Prompt Log with inline + modal editing, related sources, copy prompt, filters, and drag reorder.
- Experiment Log with expandable cards, notes, image URL thumbnails/fallback, filters, and drag reorder.
- Links section with add/edit/delete.
- Reusable modal system, confirm dialog, and toast notifications.

## Persistence
App state is stored under:
- `retroCoachResearchDashboard.v1` (main dashboard state)
- `coachForgeThemeMode.v1` (theme preference: `system|dark|light`)

Data is loaded from storage if valid. Seed/demo data is only used when storage is empty or invalid.

## File structure
- `index.html` - app shell and static layout containers
- `styles.css` - full theme and component styling
- `app.js` - state, rendering, events, persistence, modal/forms, drag-and-drop

## Run locally
No build step required.

1. Clone this repo.
2. Open `index.html` directly in a browser.

Tip: use a modern Chromium/Safari/Firefox browser for best drag-and-drop behavior.

## Interaction shortcuts
- Inline tables: click a cell to edit, `Enter` to save, `Esc` to cancel, blur to save.
- Modals: `Esc` closes, overlay click closes, focus is trapped inside dialog.
- Drag reorder: use the `::` drag grips in Goals, Reading, Prompts, and Experiments.

## Notes
- URL metadata autofill depends on `fetch()` and may be blocked by CORS on some sites.
- All data remains local to the browser profile unless you export/copy manually.
