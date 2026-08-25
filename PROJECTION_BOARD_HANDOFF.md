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
- Active cell: ONE `ActiveCellEditor` per grid (`ActiveCellEditor.tsx`), mounted once inside `.pj-grid-scroll` and retargeted between cells with a transform glide (140ms); cells are memoized dumb anchors that call `useEditorHost().open()` on focus. No per-cell portal/AnimatePresence, no backdrop-filter, and NO Motion: Motion's `x`/`y`/`scale` are composed on the main thread each frame, so the chip animates with plain CSS transitions on `transform`/`opacity` (compositor thread; classes `pj-editor-shown` / `pj-editor-glide` / `pj-editor-instant`, `will-change: transform` on the one wrapper). `activeCell` lives in its own context (`useActiveCell`) so focus never re-renders the sheet.
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

## Live collaboration (added 2026-08-22)

Google-Sheets-style presence over one WebSocket per client at `wss://api.rddashboard.com/projections/ws?token=<idToken>&year=<year>`:

- **Backend** `@projections/services/projectionsRealtime.js` — `ws` hub (`noServer` + `server.on('upgrade')` in `index.js`; `initRealtime` exported from the module). Auth on upgrade mirrors `/users/sse`: query-param token → `verifyFirebaseToken` + `emailAllowed` + the executive-tier role set; Origin header checked against `corsOrigins` (CORS middleware never sees upgrades). **`ws` is a guarded require** — a Pi boot before `npm install` runs comes up with collab disabled and a loud log line, never a crash. Heartbeat pings every 30s (Cloudflare's 100s idle timeout) and reap dead sockets; per-connection cap of 25 msgs/sec.
- **Protocol** — client sends `focus {rowId, field}` / `blur` / `preview {rowId, field, text}` (throttled 120ms, relayed only while the sender holds that cell). Server sends `welcome {connId, revision, peers}`, `presence {peers}`, `preview`, and `sheet {sheet}` — the full serialized sheet broadcast from the service's `commit()`, which all five mutation paths funnel through.
- **Concurrency** — mutations are serialized per year via an in-process promise-chain lock in `projections.service.js` (closes the read-modify-write race on the revision check; valid because the deploy is one process). Frontend 409s are now soft: the failed batch goes back into pending (newer keystrokes win), the peer's sheet is adopted, and the flush retries; only 3 consecutive failures surface the conflict banner.
- **Frontend** `useProjectionCollab.ts` — hook + `CollabContext` (null-safe: `EditableCell` works without a provider). Reconnect with capped exponential backoff (the 2-min deploy cycle drops sockets); a held cell is re-announced on reconnect; a `welcome` revision ahead of ours triggers `board.resync()` (silent refetch). Remote sheet frames adopt via `board.adoptRemoteSheet` — revision-guarded, pending edits replayed on top.
- **UI** — peer cell: `.pj-cell-shell` wrapper, ring in the peer's `hashColor` (inline `--pj-peer`), name flag above the corner, live draft ghosted italic in place of the value (`.pj-remote-previewing`). Local focus + peer on the same cell = copper chip with the peer ring as outer halo. Header roster: initials chips deduped by uid (`PresenceRoster`). Copper stays the local user's color only. The Monthly Summary overhead pill is NOT wired for presence (bespoke input, low value).
- **Dev bypass** skips the socket entirely (no token); the page just runs solo.
- **Deploy note**: push backend first, then **`npm install` on the Pi once** (the git-pull cron does not install deps). Until then the server logs the disabled warning and everything else works.

## Undo/redo (added 2026-08-22)

Cmd+Z / Cmd+Shift+Z (Ctrl / Ctrl+Y on Windows) over the user's **own** cell edits, Google-Sheets style:

- **Where** — history lives in `useProjectionBoard`: `applyEdit` records `{edit, before, label}` on an undo stack (cap 100, redo stack cleared on new edits); `undo()`/`redo()` replay the inverse through the same `pushEdit` optimistic pipeline. Because replays travel pending→flush→commit, they land in the audit log and **broadcast to collab peers via the WS hub automatically** — no extra realtime wiring. Peers' edits are never recorded locally, so you only undo your own changes.
- **Row-gone guard** — a history entry whose row was deleted (by anyone) is skipped, popping until a valid entry is found. Structural ops (add/delete row, restore) are NOT undoable. Stacks clear on `load()` (year switch, conflict reload).
- **Keyboard** — window listener in `ProjectionsPage`. A focused board cell (`.pj-cell-input`/`.pj-overhead-input`) is blurred first so a half-typed draft commits as its own step (Cmd+Z mid-edit = discard draft). Any OTHER input/textarea (e.g. drawer's version label) keeps native text undo — the handler bails.
- **Toast** — `.pj-history-toast`: "Undid % Win for 4512 N Ashland", card-surface pill fixed bottom-center, fade-in only (no y-travel), 2.6s auto-dismiss, re-keyed per action. Labels built in `useProjectionBoard` (`FIELD_LABELS` + month/actual formatting + row address/name).

## Row order + column sort (added 2026-08-24)

Both tables (Unit Projection, Pipeline) can be rearranged by drag and sorted by column:

- **Drag to rearrange** — `RowDrag.tsx`: `RowDragTable` (dnd-kit `DndContext` + vertical `SortableContext`, PointerSensor distance 5 + KeyboardSensor) wraps each `<table>`; every `<tr>` is a `SortableRow`; the handle is `RowGrip`, a left-edge grabber inside the sticky Address cell (`.pj-row-grip`, shown on row hover; every lead cell incl. the pinned strip's Address indents `1.75rem` for it). The order is **shared sheet state**, not a viewer preference: `board.reorderRows(section, order, movedRowId)` applies the new order locally at once, then `PUT /projections/rows/order {year, revision, section, order[], movedRowId}` rewrites `sortOrder` for that section (order must be an exact permutation; revision-checked; one audit entry `row:reorder` / `pipeline:reorder` with the moved row's label and old→new position; broadcast to collab peers via `commit()`). The history drawer renders it as "Moved <row>".
- **Column sort** — `rowOrder.ts`: `useProjectionSort("grid" | "pipeline")` persisted per viewer in localStorage (`pj-sort:grid`, `pj-sort:pipeline`) with the Jobcost cycle: text columns asc → desc → clear, numeric desc → asc → clear (third click unsorts back to the sheet's drag order). Headers are the shared `SortTh` (`.pj-table th .co-th-btn` restyles it into the pj header voice; active = copper). Every column sorts, months and computed columns included (`orderRows` reads computed values via `computeRow`, ties fall back to `sortOrder`). (Changed 2026-08-24, superseding the old grip lock.) Rows drag under a sort too: `RowDragTable` registers the DISPLAYED order, so a drop persists exactly the arrangement on screen with the row where it landed as the new sheet `sortOrder`, and `reorderAndUnsort` (both tables) then calls `clearSort()` so the new order shows. `pj-row-grip-locked` now only applies to the draft row.
- **Pinned header clone** — the compact strip's label row is a DOM clone with no React handlers, so clicks on it are delegated (`pinHeaderClick`) to the matching live header button, and `useOverlayScroll` takes a second `headerKey` (`${sortKey}|${sortDir}`) so the clone is rebuilt whenever the arrows change.
- The new-row entrance moved from `motion.tr` to a CSS keyframe class (`.pj-row-new`) because dnd-kit owns the row's transform now.
- **Backend deploy owed**: `reorderRows` service/controller/route are committed-to-working-tree only (see git status); push backend first, then the frontend branch, per repo policy.

## Errors: top toast, never a reload (added 2026-08-24)

- Save/load errors and the conflict notice render as `.pj-notice-toast` (fixed top-center pill, history-toast surface recipe), not an inline banner. The old `.pj-banner` CSS is gone.
- A failed non-409 flush puts its batch **back into pending** (newer keystrokes win) and shows the toast with "N unsaved edits kept, not lost"; the finally-block auto-flush is suppressed after a failure so a down server isn't hammered. A failed structural op is remembered as a thunk in `retryRef`.
- `board.retry()` flushes staged edits / re-runs the failed op; it only calls `load()` when there is no sheet at all (initial load failure). `board.reload` still exists for the conflict path, which intentionally adopts the server's version.



1. **Verify seed in prod**: `GET /projections/sheet?year=2026` with a real admin token should return 43 rows (or check Pi logs for `Projection board: seeded 2026 sheet (43 rows)`).
2. **Merge `projection-board` → main** to ship the page (backend already live).
3. Real-login e2e in prod: edit cells, watch history/versions, restore, conflict path (two tabs), add/delete row, **drag-reorder (both tables, and with a peer watching), column sort persistence across reloads**.
4. Mobile pass — the page has only a basic ≤768px fallback (stat strip 2-col, grid scrolls); no `useIsMobile` treatment yet.
5. ~~Future (user-stated intent): home-page widgets reading projection data — build as backend queries over `ProjectionSheet` + `projectionCalc` (that's why nothing derived is stored).~~ **DONE (Aug 23)**: `revenueProjection` query in the dashboard query map (executive-tier gated, Mongo-backed, read-only — no sheet auto-create) feeds a dashed blue "Projected" overlay on the Annual Revenue Trend (prior-year actual → full-year scheduled revenue) and Cumulative Revenue Growth (full-year projected cumulative) widgets. Backend on main; frontend rides this branch. Prod e2e owed with the rest.
6. Housekeeping: `ProjectionEdit` has no TTL (grows forever — fine for now, revisit); snapshot list capped at 100 with no pruning.

## Active-cell chip (Aug 24)
- `EditorChip` (ProjectionGrid.tsx) is Motion-driven: `AnimatePresence` + `motion.span.pj-editor-surface` (opacity/scale) + `motion.input` (opacity only; text never moves). One `shown = flush && isPresent` boolean drives open, tuck (anchor crossing a sticky band), re-emerge, and exit. No CSS keyframes, no cloned "exiting" copy, no fallback timers, no `::before`.
- `usePresence` makes the exiting input inert (readOnly, tabIndex -1, pointer-events none). Portal target persists past the session so the exit plays inside the scroller.
- Tweens: in 160ms `[0.2,0,0,1]`, out 120ms `[0.4,0,1,1]`, no overshoot; `useReducedMotion` → duration 0.

## Award: pipeline → Unit Projection (added 2026-08-24)

A pipeline row becomes a real project two ways, both landing at the **bottom of the Unit Projection grid** with its months untouched (0 = fully unscheduled), highlighted with `pj-row-new`, scrolled into view, cursor in **January**:

- **Gutter arrow** — `.pj-row-award` (`ArrowUpFromLine`, copper on hover) beside the trash in the Pipeline gutter (`.pj-pipeline .pj-gutter` is 4rem to fit both). Click plays a 220ms send-off (`pj-row-leaving`: lift + fade + copper wash) and then moves the row for real. Reduced motion skips the send-off.
- **Drag up** — `RowDrag.tsx` now has ONE `DndContext` for the board (`ProjectionDnd`, mounted in `ProjectionsPage` around both tables, `onAward={board.awardRow}`). Each table is a `RowDragTable section="rows"|"pipeline"` (a `SortableContext` that registers its rowIds/onReorder/renderGhost with the provider). Pipeline rows travel as a portaled `DragOverlay` ghost (`.pj-award-ghost`: name / address / value + hint) while their slot stays as a faded placeholder (`pj-row-lifted`); grid rows still move in place (`pj-row-dragging`). The grid card is a `useDroppable` (`GRID_DROP_ID`, via `useAwardDropTarget`) and shows a dashed copper ring while a pipeline row is in hand (`pj-grid-award-target`), solid + glow when over it (`pj-grid-award-over`). Custom collision: a pipeline row hits the grid card by `pointerWithin` first, otherwise `closestCenter` restricted to its own section, so dragging near the pipeline's top never snaps to the grid's last row. Drop animation is suppressed on an award so the ghost doesn't glide back to a slot that no longer exists.

Board hook: `moveRow(rowId, to, label)` applies the move locally (leave one list, append to the other with `sortOrder = max+1`, recompute summary) and sets `landed {rowId, seq}` (the grid's landing effect keys on `seq` so undo→redo lands again), then `POST /projections/rows/:rowId/move {year, revision, to}`. `awardRow(rowId)` = `moveRow(…, "rows", label)`; history entry `kind: "move"` — undo moves it back to the pipeline (`to: "pipeline"`, audit `row:return`; months are kept so a redo restores any schedule typed meanwhile), redo awards again. Toast: "Returned X to the pipeline" / "Awarded X again".

Backend: `moveRow` in `projections.service.js` (sheet lock, revision check, idempotent if already in the target section, one audit entry `pipeline:award` / `row:return` with old/new = section names). The history drawer renders both, plus the previously-unlabelled `pipeline:add` / `pipeline:delete`.

**Deploy state:** backend `moveRow` + route are written but NOT yet pushed to main (push = deploy). Deploy backend first; the frontend award falls back to the error toast (404) until it's live. Real-login e2e of both paths (click + drag, undo/redo, collab peer receiving the move) is owed — the drag path in particular was only typechecked/built, not driven in a browser.

## Aug 24 · Excel export + day-grouped history

- `exportProjection.ts`: ONE sheet in page order (Summary KPIs → Unit Projection → Pipeline → Monthly Summary) in the dashboard report dress (exportMonthlyBreakdownXlsx.ts structure: copper 20pt title, Fiscal Year / Exported lines, section bands, bordered zebra rows, gray totals) but in the board's muted palette (off-white bands, dark text, gold as accent text only; no solid copper fills). Board cell fills carry over. Values only, no formulas. Filenames `Projection_Board_<year>_<date>` / `..._<label>_<day>`.
- Header **Export** button (current board, Sage actuals as the Actual block). Drawer **Versions** tab: per-version **Excel** button (GET `/projections/snapshots/:id`).
- Drawer **Changes** tab: entries grouped by Chicago business day (Today / Yesterday / weekday date), time + one-line sentence per edit, author shown only when a day has more than one person. Fetches up to 500 entries.
- Backend `getSnapshot` now returns `pipeline` + `actuals` (deployed to main Aug 24).
- Aug 24: palette unified across ALL exports via `src/shared/utils/xlsxTheme.ts` (breakdown/overhead, job cost report, upcoming billings now share the muted dress).
