import type { DashboardLayout } from "../types/dashboardLayout"

export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = {
  version: 1,
  columns: 2,
  widgets: [
    { id: "yearRevenue", colSpan: 1 },
    { id: "allTimeRevenue", colSpan: 1 },
    { id: "annualRevenue", colSpan: 2 },
    { id: "grossRevenue", colSpan: 1 },
    { id: "spendingByMonth", colSpan: 1 },
    { id: "netRevenue", colSpan: 1 },
    { id: "topClients", colSpan: 2 },
    { id: "topSuppliers", colSpan: 1 },
    { id: "topSubcontractors", colSpan: 1 },
  ],
}
