# Projection Board — Handoff

Complete state of the `/projections` feature as of **2026-08-22**. Written so a fresh agent (or human) can continue without any prior conversation context. The original pre-build plan is `PROJECTION_BOARD_PLAN.md`; this document supersedes it.

## What this feature is

The **Master Projection Sheet 082026.xlsx** (in `~/Documents/RD/`) rebuilt as a living, admin-facing page: an Excel-like editable grid of unit projections per project, with per-cell edit tracking, restorable versions, and a monthly P&L summary. Data lives in MongoDB so future queries (home-page widgets etc.) can read it directly.

- Route: `/projections`, nav item "Projections" directly beneath Job Costing.
- Access: **executive tier only** — `admin`, `executive`, `owner`, `tech` (owner/tech collapse to executive in `RequireRole`; the backend gates the raw claims). Managers/GMs never see it.
- One sheet per calendar **year** (year selector in the header; current year + next always offered).

## Deploy state (IMPORTANT)

| Piece | Where | State |
|---|---|---|
| Backend `@projections` | RenovationsBackend `main` (`9a395b3d`) | **PUSHED → live on the Pi** (git-pull every 2 min; push = deploy) |
| 2026 seed | runs at boot inside `index.js` | Should have run on first boot after deploy — **not yet verified in prod** |
| Frontend | branch `projection-board` (3 commits: `139d7dc`, `19b7e87`, `70118a7`) | Pushed, **NOT merged to main** |

Deploy order matters: backend is already live, so merging the frontend branch is all that's left to ship. Backend commits go straight to main (no branches — repo policy); frontend uses feature branches.

## Data model (the core design decision)

Rows store **inputs only**. Every formula column and the entire summary block are **computed in code, never stored** — that's what keeps the data queryable without formula parsing:

- Inputs per row: `address`, `client`, `name`, `units`, `avgUnitPrice`, `pctWin` (0–1), `grossMargin` (0–1), `months[12]` (units scheduled Jan–Dec), `sortOrder`, `rowId` (uuid).
- Computed per row: `total = units×price`, `cogs = 1−margin`, `grossRevenue = total×pctWin`, `grossProfit = grossRevenue×margin`, `unitsScheduled = Σmonths`, `unitsRemaining = units−scheduled`.
- Computed summary: units/revenue/COGS by month, flat `overheadMonthly` (sheet-level field, seeded $150k), `net = revenue−COGS−overhead`, cumulative net, plus grand totals and blended margin.
- The calc lives in **two mirrored files** — `RenovationsBackend/@projections/services/projectionCalc.js` and `frontend/src/modules/projections/calc.ts`. **A formula change must be made in both.** (The frontend copy exists so optimistic edits recompute everything instantly.)
- The source sheet had several broken cell references (e.g. `=D12-Z28`); the code computes correctly and intentionally does not reproduce them.

## Backend — `RenovationsBackend/@projections/`

- `schema/projection.schema.js` — three models:
  - `ProjectionSheet` `{ year (unique), overheadMonthly, rows[], revision, updatedAt, updatedBy }`
  - `ProjectionEdit` — append-only cell audit log `{ sheetId, rowId, field, oldValue, newValue, rowLabel, user, at, revision }`. `rowLabel` is denormalized so history stays readable after a row is deleted. Field values: input names, `month:0`–`month:11`, `overheadMonthly`, `row:add`, `row:delete`, `snapshot:restore`.
  - `ProjectionSnapshot` — full-sheet copies; `auto:true` + `autoDay` (Chicago YYYY-MM-DD) for the one-per-day automatic snapshot taken **before** the day's first mutation; manual ones have labels. Restorable.
- `services/projections.service.js` — all logic. Notable: `revision` optimistic concurrency (mismatch → 409); `seedIfNeeded()` seeds 2026 from `seed/master-projection-2026.json` (43 rows) — **sheet existence is the marker**, it never overwrites.
- `routes/projections.routes.js` — all under `authenticateToken` + local `requireExecutiveTier`:
  - `GET /projections/sheet?year=` → `{ sheet (incl. summary), years }`
  - `PATCH /projections/rows` `{ year, revision, edits:[{rowId, field, value}] }` (rowId `null` + field `overheadMonthly` for the sheet-level figure; ≤200 edits/batch; no-op edits dropped from audit)
  - `POST /projections/rows`, `DELETE /projections/rows/:rowId` (both need `{ year, revision }`)
  - `GET /projections/history?year=&limit=`, `GET/POST /projections/snapshots`, `GET /projections/snapshots/:id`, `POST /projections/snapshots/:id/restore`
- Wired in `index.js`: module import, route mount, and `await projectionsModule.seedIfNeeded()` **before** `setupRoutes` (so a first GET can't race an empty sheet into existence). Alias `@projections` added to `package.json` `_moduleAliases`.

## Frontend — `frontend/src/modules/projections/`

- `ProjectionsPage.tsx` — page shell: stat strip (4 `StatWidget`s), grid, `MonthlySummary` (P&L table + overhead pill input), skeleton, conflict/error banners, header control bar (year select + History in one parchment container).
- `ProjectionGrid.tsx` — the editable table. `EditableCell` shows formatted value at rest / raw while focused (percents edit as "22" not "0.22"), commits on blur, Escape reverts, Enter/↑/↓ travel the column via `data-row`/`data-col` focus lookup. Delete via hover trash + `ConfirmModal`. New-row entrance: `motion.tr` fade + clearing copper wash, smooth scroll to bottom, autofocus Address (`useReducedMotion` respected).
- `useProjectionBoard.ts` — the data engine. Optimistic apply → pending map → 750ms debounce flush → adopt server sheet **replaying still-pending edits on top**. 409 → `conflict` + reload. Structural ops (add/delete/restore) flush pending first. `lastAddedRowId` drives the grid animation. Flushes on `pagehide`/unmount. `adoptServerSheet` updates `sheetRef.current` synchronously so `addRow` can diff for the new id.
- `BoardHistoryDrawer.tsx` — right drawer, two tabs (Changes / Versions), save-version input, restore with confirm. Uses its own `relTime()` because shared `formatRelativeTime` strips timezones (a Sage wall-clock workaround) and would skew real-UTC Mongo timestamps by 5–6h.
- `api.ts`, `types.ts`, `calc.ts`. API functions use `apiGet`/`apiRequest` — these were **newly exported** from `shared/api/mutationApi.ts` (and `"PATCH"` added to its method union).
- Wiring: `navItems.projections` (icon `Table2`) in `executiveNav` in `core/auth/roles.ts`; lazy route in `core/components/Router.tsx` with `RequireRole allowed={["executive","admin"]}`.

## Styling — `pj-*` section at the end of `App.css`

Design language: dashboard's "refined simplicity / copper restraint" (copper ONLY on the focused cell + primary actions). Key decisions already litigated with the user:

- Three grid zones (Project / Economics / Schedule) separated by **two vertical hairlines** (`.pj-zone-start` on Units and Jan cells), NOT background washes. Computed columns are plain secondary ink.
- Totals row = the page's statement moment: warm parchment/ink gradient (same recipe as `.jc-command-bar`, `--pj-s1/s2` defined on `.pj-grid`), sticky bottom.
- Thin light-gray scrollbars (`scrollbar-width: thin` + `scrollbar-color`); the grid's bottom 9px are painted with the totals gradient so the horizontal scrollbar sits visually inside the golden bar.
- Active cell: soft translucent copper halo, 200ms ease in/out.
- Monthly Summary styled as a P&L: Units/Cumulative recede, Net bold between rules, sticky right Total column.
- Header control bar `.pj-control-bar`: jc-surface container holding the year well + divider + History button.

### CSS gotcha that already bit once
`.pj-table td { padding: 0 }` (specificity 0,1,1) silently beat `.pj-computed` (0,1,0) and stripped computed-cell padding — Gross Profit ran into the schedule rule. Fix pattern: qualify as `.pj-table td.pj-computed`. **Any new per-cell class needs the same qualification.**

Another: sticky `colSpan` header cells cover scrolled columns — the "Project" group th spans only the sticky Address column (colSpan 1 + empty filler th), never all three.

## Conventions this feature follows (don't regress)

- `framer-motion` imports (NOT `motion/react` — repo predates the rename).
- No em dashes in UI copy; no y-travel hovers; one focal animation at a time (`rd-ui-motion-copy-rules` memory).
- Skeletons mirror the loaded layout; `SkelText`/`skel-line` ride real type classes.
- Visual verification: static harness at `frontend/.scratch/pj-harness.html` (gitignored) linked to `src/App.css`, screenshotted with playwright chromium + **webkit** (user runs Safari) via the npx cache at `~/.npm/_npx/705bc6b22212b352/node_modules`. Regenerate it after markup changes — its HTML is hand-mirrored from the components.
- Local frontend cannot hit prod with dev-bypass (401s); real Firebase login required for live testing.

## Remaining work

1. **Verify seed in prod**: `GET /projections/sheet?year=2026` with a real admin token should return 43 rows (or check Pi logs for `Projection board: seeded 2026 sheet (43 rows)`).
2. **Merge `projection-board` → main** to ship the page (backend already live).
3. Real-login e2e in prod: edit cells, watch history/versions, restore, conflict path (two tabs), add/delete row.
4. Mobile pass — the page has only a basic ≤768px fallback (stat strip 2-col, grid scrolls); no `useIsMobile` treatment yet.
5. Future (user-stated intent): home-page widgets reading projection data — build as backend queries over `ProjectionSheet` + `projectionCalc` (that's why nothing derived is stored).
6. Housekeeping: `ProjectionEdit` has no TTL (grows forever — fine for now, revisit); snapshot list capped at 100 with no pruning.
