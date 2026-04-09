import type { ComponentType } from "react"
import type { WidgetId } from "../types/dashboardLayout"
import { YearRevenueWidget } from "../widgets/YearRevenueWidget"
import { AllTimeRevenueWidget } from "../widgets/AllTimeRevenueWidget"
import { AnnualRevenueWidget } from "../widgets/AnnualRevenueWidget"
import { GrossRevenueWidget } from "../widgets/GrossRevenueWidget"
import { SpendingByMonthWidget } from "../widgets/SpendingByMonthWidget"
import { NetRevenueWidget } from "../widgets/NetRevenueWidget"
import { TopClientsWidget } from "../widgets/TopClientsWidget"
import { TopSuppliersWidget } from "../widgets/TopSuppliersWidget"
import { TopSubcontractorsWidget } from "../widgets/TopSubcontractorsWidget"

export type WidgetVisualType = "stat" | "line" | "pie"

export interface WidgetRegistryEntry {
  id: WidgetId
  component: ComponentType
  label: string
  visualType: WidgetVisualType
  defaultColSpan: 1 | 2
}

export const WIDGET_REGISTRY: Record<WidgetId, WidgetRegistryEntry> = {
  yearRevenue: {
    id: "yearRevenue",
    component: YearRevenueWidget,
    label: "Year Revenue",
    visualType: "stat",
    defaultColSpan: 1,
  },
  allTimeRevenue: {
    id: "allTimeRevenue",
    component: AllTimeRevenueWidget,
    label: "All-Time Revenue",
    visualType: "stat",
    defaultColSpan: 1,
  },
  annualRevenue: {
    id: "annualRevenue",
    component: AnnualRevenueWidget,
    label: "Annual Revenue History",
    visualType: "line",
    defaultColSpan: 2,
  },
  grossRevenue: {
    id: "grossRevenue",
    component: GrossRevenueWidget,
    label: "Gross Revenue by Month",
    visualType: "line",
    defaultColSpan: 1,
  },
  spendingByMonth: {
    id: "spendingByMonth",
    component: SpendingByMonthWidget,
    label: "Spending by Month",
    visualType: "line",
    defaultColSpan: 1,
  },
  netRevenue: {
    id: "netRevenue",
    component: NetRevenueWidget,
    label: "Net Revenue by Month",
    visualType: "line",
    defaultColSpan: 1,
  },
  topClients: {
    id: "topClients",
    component: TopClientsWidget,
    label: "Top Clients",
    visualType: "pie",
    defaultColSpan: 2,
  },
  topSuppliers: {
    id: "topSuppliers",
    component: TopSuppliersWidget,
    label: "Top Suppliers",
    visualType: "pie",
    defaultColSpan: 1,
  },
  topSubcontractors: {
    id: "topSubcontractors",
    component: TopSubcontractorsWidget,
    label: "Top Subcontractors",
    visualType: "pie",
    defaultColSpan: 1,
  },
}
