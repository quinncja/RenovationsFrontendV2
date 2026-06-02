import type { DashboardLayout, SectionLayout, WidgetId } from "../types/dashboardLayout"
import { SECTION_ORDER, WIDGET_DEFAULT_ORDER, WIDGET_HOME_SECTION } from "./sectionRegistry"
import { WIDGET_REGISTRY } from "./widgetRegistry"

// Default sectioned home layout (v2). Derived from the section registry so it
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

  return { version: 2, columns: 2, sections }
}

export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = buildDefaultLayout()
