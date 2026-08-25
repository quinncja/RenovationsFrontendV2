# Projection Board — Plan

**Branch:** `projection-board` (frontend). Backend work goes straight to main per deploy policy (push = deploy on the Pi); backend deploys first.

## What we're building

A new admin-only page that works, for all intents and purposes, like an Excel sheet: the Master Projection Sheet (082026). Editable grid, per-cell edit tracking, version history with restore. Data lives in MongoDB on the backend so future queries (home-page widgets, etc.) can read it.

Nav: new item directly beneath **Job Costing**. Route: `/projections`.

## Source sheet structure (Master Projection Sheet 082026.xlsx)

One sheet, two zones:

**Project rows (the editable grid):**

| Column | Type | Notes |
|---|---|---|
| Address | text | user input |
| Client | text | user input |
| Name | text | user input |
| Units | number | user input |
| Avg Unit Price | currency | user input |
| Total | computed | `Units × Avg Unit Price` |
| % Win | percent | user input (0–1) |
| Gross Margin | percent | user input (0–1) |
| COGS | computed | `1 − Gross Margin` |
| Gross Revenue | computed | `Total × % Win` |
| Gross Profit | computed | `Gross Revenue × Gross Margin` |
| Jan … Dec | number ×12 | monthly unit counts, user input |
| TOTAL | computed | `sum(Jan..Dec)` |
| Remaining | computed | `Units − TOTAL` (the sheet's AA column; several rows had broken refs — we compute correctly) |

**Summary zone (derived, read-only, rendered below the grid):**
- Totals row: units, total value, monthly unit sums
- Revenue by month: `Σ units[m] × avgUnitPrice` per row
- COGS by month: `Σ units[m] × avgUnitPrice × cogs` per row
- Overhead: flat monthly figure (sheet uses $150,000/mo) — editable setting
- Net by month: revenue − COGS − overhead
- Cumulative net running across the year

All computed columns/summary math is done in code (single shared calc module), not stored as user formulas. This is what makes the data queryable for widgets.

## Architecture

### Backend (`@projections` module, mounted like `@changeOrders`)
- Mongoose schemas:
  - `ProjectionSheet` — { name, year, overheadMonthly, rows: [rowId, address, client, name, units, avgUnitPrice, pctWin, grossMargin, months[12], sortOrder], updatedAt, updatedBy, revision }
  - `ProjectionEdit` — append-only cell-level audit log: { sheetId, rowId, field, oldValue, newValue, user { uid, email, name }, at, revision }
  - `ProjectionSnapshot` — full-sheet copies: { sheetId, label, takenBy, at, auto: bool, rows[...] } — auto-snapshot daily-on-first-edit + manual "Save version"; restore = copy back + audit entry
- Routes (admin-gated via existing auth middleware + role check):
  - `GET /projections/sheet` (current sheet + summary), `PATCH /projections/rows` (batched cell edits with optimistic-concurrency `revision`), `POST /projections/rows` / `DELETE`, `GET /projections/history`, `GET/POST /projections/snapshots`, `POST /projections/snapshots/:id/restore`
- Derived summary computed server-side too (shared shape) so widget queries can reuse it via the query-dispatch map later.
- One-time seed script: import the xlsx rows (run on the Pi post-deploy, marker-guarded like the employeeId boot task).

### Frontend (`src/modules/projections`)
- Custom grid (no ag-grid dependency): table with keyboard nav (arrows/tab/enter), click-to-edit cells, type-aware editors (text/number/currency/percent), computed cells styled as read-only, totals + summary block beneath.
- Edits: optimistic local update + debounced batched PATCH; conflict (stale revision) → refetch + toast.
- History drawer: recent cell edits (who/when/what, old → new); Versions menu: snapshot list, view/restore.
- Styling: existing card/table system (`jc-*` patterns, App.css), copper reserved for active/selected cell + primary action; skeletons mirror layout per skeleton system.
- Nav/roles: new `navItems.projections` under `jobcost` in the admin nav only; route guard by role.

## Decisions (answered 2026-08-22)
1. **Grid model:** structured columns; computed columns auto-calculate in code, read-only.
2. **Access:** executive tier — admin + owner + tech + executive.
3. **Sheets:** one per year, year selector; 2026 seeded now.
4. **Seed:** yes, from Master Projection Sheet 082026.xlsx (43 project rows + $150k/mo overhead) via marker-guarded script on the Pi.

## Deploy order
1. Backend module + schemas → push main (deploys via Pi pull), verify endpoints.
2. Run seed script on Pi.
3. Frontend branch → PR → main.
