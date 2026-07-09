import type { DashboardLayout, SectionLayout, WidgetId } from "../types/dashboardLayout"
import { SECTION_ORDER, WIDGET_DEFAULT_ORDER, WIDGET_HOME_SECTION } from "./sectionRegistry"
import { WIDGET_REGISTRY } from "./widgetRegistry"

// Current layout schema version. Bump when a change must be force-applied to
// existing saved layouts; reconcileLayout runs the matching one-time migration.
//   v3 — Business Financials reflow: Banking & Overdue full width, then Progress
//        Billings + Upcoming Billings half width on the next row.
//   v4 — New "Estimation Performance" section appended after Business Relations.
//        No forced migration: reconcileLayout auto-appends the missing section
//        (from SECTION_ORDER) and its widgets to any older saved layout.
//   v5 — New "Recent Changes" section. Migration hoisted it to the FRONT of
//        saved section orders (auto-append would park time-sensitive content
//        last for existing users).
//   v6 — Recent Changes retired (replaced by the daily report modal and the
//        /reports page). No migration body: reconcileLayout's unknown-id
//        stripping removes the section/widgets from saved docs; the version
//        bump just re-persists them clean.
export const LAYOUT_VERSION = 6

// Default sectioned home layout. Derived from the section registry so it
// can never drift from WIDGET_HOME_SECTION / WIDGET_REGISTRY:
//   • Reports             — Reconciliation, Data Quality, Missing Contracts
//   • Business Development — Current Year, All-Time, Annual Revenue Trend
//   • Business Performance — Period & Year Summary, Margin, Employee Performance
//   • Financial Trends     — Gross Revenue, Direct Expense, Overhead, Net Profit (by month)
//   • Business Financials  — Overdue, Upcoming Billings
//   • Business Relations   — Top Clients, Material Suppliers, Subcontractors
function buildDefaultLayout(): DashboardLayout {
  const sections: SectionLayout[] = SECTION_ORDER.map((sectionId) => {
    const widgets = WIDGET_DEFAULT_ORDER.filter(
      (id: WidgetId) => WIDGET_HOME_SECTION[id] === sectionId
    ).map((id) => ({ id, colSpan: WIDGET_REGISTRY[id].defaultColSpan }))
    return { id: sectionId, widgets }
  })

  return { version: LAYOUT_VERSION, columns: 2, sections }
}

export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = buildDefaultLayout()
