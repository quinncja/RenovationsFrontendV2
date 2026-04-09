export type WidgetId =
  | "yearRevenue"
  | "allTimeRevenue"
  | "annualRevenue"
  | "grossRevenue"
  | "spendingByMonth"
  | "netRevenue"
  | "topClients"
  | "topSuppliers"
  | "topSubcontractors"

export interface WidgetLayoutItem {
  id: WidgetId
  colSpan: 1 | 2
  /** Columns to skip before this widget (0 = default, 1 = push to right column). Only meaningful for colSpan: 1. */
  offset?: number
}

export interface DashboardLayout {
  version: 1
  columns: 2
  widgets: WidgetLayoutItem[]
}
