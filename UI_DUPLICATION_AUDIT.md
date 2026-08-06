# UI Duplication Audit

Comprehensive audit of duplicated visual components across the frontend, done to
identify consolidation targets before further dashboard development. Scope: tables,
buttons, cards, modals, pills/badges, selectors/dropdowns, skeletons, form inputs,
toggles, and tooltips.

**Root cause**: the app has **one monolithic global stylesheet** (`src/App.css`,
~17,200 lines, no CSS modules). Every page/module invented its own prefixed class
family (`jc-`, `co-`, `ohr-`, `usr-`, `estp-`, `ewl-`, `pb-`, `rpt-`, `settings-`)
instead of reaching for a shared primitive. `src/shared/components/` does contain
some genuinely good shared components (`Widget`, `DetailModal`, `YearSelector`,
`SortableHeader`, `SkelText`/`ChartSkeletons`, `OverUnderToggle`, `Coachmark`) —
but adoption is inconsistent, so duplicate one-offs exist alongside working shared
versions.

Last generated: 2026-08-06.

---

## 1. Tables — ~28 render sites, 5 distinct implementations

Every literal `<table>` (40 instances / ~25 files) resolves to one of two base
classes, plus two standalone one-offs and one feature built twice.

| Pattern | Base CSS class | Consumers | Shared component? |
|---|---|---|---|
| Job-costing / rank table | `.spend-rank-table` (App.css ~3544) | Jobcost main + property tables, `CostBreakdownTable.tsx` (jobcost spending-breakdown), `ChangeOrdersPage`, Clients/Vendors/Subcontractors list + detail pages, `ProgressBillingsPage`, `PropertyDetailPage`, `JobcostDetailPage` | Partial — `shared/components/SpendRankTable/SpendRankTable.tsx` exists, generic, but only **1** call site uses it; ~10 others hand-roll the same markup |
| Generic widget table | `.data-table` (App.css ~11613) | `EmployeePerformanceWidget` (dashboard home), `Invoices`, `ChangeOrderModal`'s line-items table, `WorkloadView`, `EmployeesPage`, `EmployeeDetailPage`, `OverheadReportPage`, `UpcomingBillingsPage`, `BankingWidget`, `OverdueWidget`, `ProgressBillingsWidget` (x2 — two different table styles in one file), `ReportWidget`, `JobcostDetailPage`, `DrillDownModal`, `MonthlyDetailTable` | Sort header only (`SortableHeader.tsx`, properly shared, used by ~half of consumers) |
| Sticky-header estimation table | `.estp-table` | `EstimationWorstJobsWidget` only | No — bespoke, near-duplicate of `.data-table` (same idiom, just adds `position:sticky` on `th`) |
| Cost-breakdown category→line-item table | `.jc-cost-breakdown` / `jc-cost-table` | **Built twice**: `jobcost/components/CostBreakdownTable.tsx` and `shared/components/JobDetailPanel/JobDetailPanel.tsx` — same feature, two independent implementations | No |
| Sort-header button (`SortTh`) | n/a (JSX) | **Re-implemented locally 6 times**: `ChangeOrdersPage`, `ClientsPage`, `VendorsPage`, `SubcontractorsPage`, `Jobcost.tsx`, `ProgressBillingsPage`. A 7th real shared module (`directory/employees/SortTh.tsx`) is used by 2 files (`EmployeesPage`, `WorkloadView`) | No — textbook copy-paste |

**Immediate-merge candidates (highest value, lowest risk):**
1. **`SortTh`** — 6 copies of the same ~15-line component → import the existing `directory/employees/SortTh.tsx`, or unify with `SortableHeader.tsx` (two competing "shared" sort-header idioms currently coexist).
2. **`billings-invoice-table`** — same invoice-row shape rebuilt in 6 places (`OverheadReportPage` x2, `BankingWidget`, `OverdueWidget`, `ProgressBillingsWidget`, `DrillDownModal`, `JobcostDetailPage`).
3. **Cost-breakdown category table** — `JobDetailPanel.tsx` duplicates `CostBreakdownTable.tsx` as a separate implementation of the same feature; delete one.
4. **Clients/Vendors/Subcontractors list tables** — structurally identical (#, name, count, value) → route through `SpendRankTable.tsx`, which was clearly built for this.
5. **`.estp-table`** — fold into `.data-table` by adding a sticky-header modifier instead of a whole separate class tree.

**Recommendation:** build one generic `<DataTable>` (rank/list variant + detail/invoice variant), column-def driven, standardized on `SortableHeader`, with an optional expandable-row render-prop for the cost-breakdown/open-jobs cases. Migrate starting with `SortTh` and `billings-invoice-table`.

---

## 2. Buttons — 20+ class families, 12 distinct hover mechanics, no shared `<Button>`

No `<Button>` primitive exists in `src/shared/components` at all — only page-specific
components (`MobileFilterButton`, `DailyReportButton`). All styling is ad hoc classes
in `App.css`.

**User-flagged inconsistency confirmed and root-caused:**
- Dashboard home (year selector / "Incl. WIP" pill / gear+clock icon buttons): the "shared gray hover" is actually **3 unrelated class families** (`.year-selector`, `.over-under-toggle`, `.btn-icon`+`.rpt-btn`) hand-tuned to look similar — hover mechanics differ (background-fill vs border-color shift vs both).
- Upcoming-billings (`<- Dashboard`, `Export Report`): both use `.jc-export-btn` (App.css ~5517) — a class **borrowed from the Job Cost module**, hover = border+text turn near-black, no background fill at all. Genuinely different mechanic from the home page. Also reused in `MonthlyBreakdownPage`, `OverheadReportPage`, `ProgressBillingsPage`, `PropertyDetailPage`, `JobcostDetailPage`.
- Org chart "Expand all"/"Collapse all": `.button.toggle-button` — confirmed **zero hover/focus/disabled styling**. Bonus bug: the sibling `.org-group-header` two lines away in the same file *does* have full interaction states — an internal inconsistency, not just page-vs-page.

**Full duplication groups found:**

| Group | Pattern | Examples |
|---|---|---|
| 1 | Gray-hover pills (3 unrelated impls) | `.year-selector`, `.over-under-toggle`, `.btn-icon`/`.rpt-btn` |
| 2 | Black-outline hover | `.jc-export-btn` (6 files) |
| 3 | No hover at all | `.button`/`.toggle-button` (org chart) — **30 files use `className="button..."`, systemic risk** |
| 4 | Copper solid primary | `.idle-overlay-btn`, `.period-selector-btn--active`, `.reset-to-default-btn` |
| 5 | Segmented control (4 independent copies) | `.jc-seg-btn`, `.ohr-seg-btn`, `.settings-seg-btn`, `.estp-segmented-btn` — same widget, built 4x |
| 6 | Colored status/filter pills, hardcoded hex | `.jc-filter-btn` (+ `inv-filter-*`), `.usr-assign-btn` (5 role variants), `.co-th-btn` |
| 7 | Icon-only "quiet surface" | `.jc-pin-btn`/`.jc-view-tile` (jobcost-only, most complete state set — not reused by dashboard's icon buttons) |
| 8 | Link-styled text buttons | `.widget-link-btn`, `.jc-job-name-link`, `.clickable-row` (no `role="button"`, mouse-only) |
| 9 | div/span acting as button | `CollapsibleSection` (correctly a11y-patched), `Users.tsx` card (missing focus ring), `Navbar.tsx` logo (**no role/tabIndex/keydown at all — real a11y gap**) |

**Worst offenders:** Job Cost module (its own private button design system: export, filter, pin, segmented, link styles all independently defined), Org Chart (internally inconsistent), Users page (5 hardcoded-hex role buttons), segmented-control sprawl (4 copies — single clearest "build once" target).

**Recommendation:** build `<Button>` / `<IconButton>` / `<Pill>` / `<SegmentedControl>` primitives with variant props (primary/secondary/ghost/danger, tone colors via CSS vars not hardcoded hex) and proper hover/focus-visible/disabled states baked in once. Fix `Navbar.tsx` logo and `.clickable-row` a11y gaps as part of the same pass.

---

## 3. Cards & Modals — good shared foundation, two real duplicates, one live bug

Unlike tables/buttons, this area already has solid shared primitives that are mostly
adopted correctly.

**Cards:**
- `.card` (App.css:940) + `Widget` component (`shared/components/Widget/Widget.tsx`) is the de-facto standard and is correctly reused by nearly every dashboard widget. `StatWidget` correctly extends `.card` rather than reinventing it. This is the reference pattern.
- **`.employee-stat-card`** (`EmployeeDetailPage.tsx`) restates `.card`'s shadow/border formula with a different radius (16 vs 12) instead of extending it — low-risk fold-in.
- **`jc-project-card` duplicated (not shared)** between `Jobcost.tsx` (source) and `EmployeesPage.tsx` (`EmployeeCard`, plus a second copy in its skeleton loader). Same CSS classes, but two independently-maintained React components with hand-copied entrance-animation math (should use the existing `MotionList`/`MotionItem` primitive instead of inlining matching stagger values). **Highest-value card fix.**
- **`.feedback-card`** is the one card with **no box-shadow at all**, violating the "card shadows everywhere" quality bar.

**Modals:**
- `DetailModal`/`DetailModalContent` (`shared/components/DetailModal/`) + `useModalLayer` hook is a real, well-built shared shell (portal + `AnimatePresence` + identical entrance transform), correctly used by `InvoiceDetailModal` and `ItemDetailModal`.
- ~15 other modals (drill-downs, settings, change-order wizard, treemap, user activity, etc.) hand-roll the same portal/backdrop/positioner boilerplate independently rather than sharing a `<Modal>` shell — but they copy it faithfully enough that they're visually consistent. `DrillDownModal.tsx` already looks like a reusable generic wrapper that 6+ of the `reports-modal`-classed drill-downs could route through instead of re-declaring the shell.
- **Live bug found**: `FeedbackPage.tsx`'s modal is the one true outlier — no `createPortal`, no `useModalLayer`, no framer-motion, and it defines a **second, legacy `.modal-overlay` CSS rule** (App.css:12216) that — because both rules target the same selector and the legacy one is declared later in the cascade — **silently overrides `z-index`/`backdrop-filter` for every modal in the app** (200→100, blur 2px→4px). Every other modal only survives correctly because `useModalLayer` sets z-index via inline style, which outranks the class rule. **This should be fixed regardless of the broader consolidation** — delete the dead legacy block once `FeedbackPage` is migrated to the shared shell.

**Recommendation:** fold `.employee-stat-card` into `.card` tokens, extract a shared `ExpandableProjectCard` for the Jobcost/Employees duplication, fix the Feedback modal + delete dead CSS, and evaluate routing the `reports-modal` family through `DrillDownModal`.

---

## 4. Pills/Badges, Selectors, Skeletons, Form Inputs, Toggles, Tooltips

**Pills/Badges** — no shared `Badge`/`Pill` component exists. Status-pill markup (small rounded, per-variant color) is reimplemented in **at least 12 separate class families**: `.status-badge`, `.jc-status-badge` (a *second* encoding of the same "job status" concept as `.status-badge`, used in sibling files), `.invoice-status-badge`, `.ewl-badge`, `.org-cat-pill`, `.usr-column-badge`, `.bank-pill`, `.inv-type-badge`, `.estp-yoy-pill`, `.pb-dir-pill`, `.jc-kind-chip`, `.report-pill`, plus several single-use ones. **Recommendation:** one `<Badge tone="...">` + a per-domain `statusToTone()` mapper.

**Selectors/Dropdowns** — `YearSelector` is a genuine success story, reused in ~18 files. `PeriodSelector` is also shared, but bypassed by a third ad hoc `<select className="year-selector period-select">` pattern in two summary widgets. The Job Cost command-bar "chevron select" (`jc-cb-select-wrap`) is copy-pasted (not imported) into `EmployeesPage.tsx`, reaching across module boundaries into Jobcost's own CSS namespace. Three independent bespoke dropdown-menus exist with no shared `Menu`/`Popover` primitive (`TemplatePicker`, role-assignment menu in `UserActivityModal`, project combobox in `ChangeOrderModal`).

**Skeletons** — the documented `SkelText`/`ChartSkeletons` + `Widget`'s `skeleton` prop system is real but only adopted in a minority of files. At least **4 parallel skeleton systems** coexist: `SkelText`, the generic `.widget-skeleton` fallback, `MetricGrid`'s own `.rpt-tile--skeleton`, and `CostBreakdownTable`'s own `.skel-line`/`.jc-skel-num`. **The "single-tree loading states" convention noted in project memory is not consistently applied in practice** — worth correcting that assumption going forward.

**Form Inputs** — no shared `TextInput`/`SearchField`. At least 4 distinct search-input stylings (`.co-search-input`, `.jc-cb-search-input`, `.invoices-search input`, `ChangeOrderModal`'s own). Auth forms (`LoginPage` vs `SignupPage`) don't even match each other.

**Toggles** — `OverUnderToggle` + `useIncludeOverUnder` ("Incl. WIP" pill) is a clean, well-encapsulated single implementation — the right model to copy. But the "segmented control with animated sliding thumb" pattern is hand-rolled ~6 times (`Jobcost`, `PropertyDetailPage`, `ReportsPage`/`MiniCalendarPopover`, `OverheadReportPage`, `SettingsModal`, `EmployeesPage`), and its shared spring constant (`SEG_SPRING`) is **copy-pasted verbatim in 4 files** even though `Jobcost.tsx` already `export`s its copy — nobody imports it.

**Tooltips/Coachmarks** — `Coachmark` is a solid shared onboarding component, correctly reused by `JobcostIntro` and `AdminOnboarding`. But `DailyReportCoach` reimplements its backdrop/easing independently, and `NavSectionHint`/`NavReportsHint` are **near-duplicates that a code comment admits should be the same component** but aren't. No shared generic hover-`<Tooltip>` exists at all — `.nav-tooltip`, `.chart-tooltip`, `.treemap-tooltip`, `.map-tooltip`, `.estp-tooltip` are all independent.

---

## Priority-ranked consolidation roadmap

1. **Fix the Feedback modal CSS bug** — trivial, currently silently degrading every modal's z-index/blur app-wide. (§3)
2. **`SortTh` (6 copies) + segmented-control `SEG_SPRING` (4 copies)** — mechanical, zero behavior change, highest duplication-count-per-line-of-fix ratio. (§1, §4)
3. **Build `<Button>`/`<IconButton>`/`<Pill>`/`<SegmentedControl>`** — highest visible-inconsistency payoff (this is what the user noticed first), fixes the org-chart no-hover bug and the Navbar/`.clickable-row` a11y gaps along the way. (§2)
4. **Build `<DataTable>`** (rank + detail variants) and migrate `billings-invoice-table` (6 copies) and the cost-breakdown table duplication first. (§1)
5. **Extract `ExpandableProjectCard`** for Jobcost/Employees, fold `.employee-stat-card` into `.card`. (§3)
6. **Build `<Badge>` + tone mapper**, replacing ~12 status-pill class families. (§4)
7. **Build `<TextInput>`/`<SearchField>`**, unify `NavSectionHint`/`NavReportsHint`, push remaining pages onto `SkelText`/`ChartSkeletons`. (§4)

Suggested sequencing: do 1–2 first (cheap, safe), then 3–4 (biggest visible payoff,
matches what prompted this audit), then 5–7 as a second pass.
