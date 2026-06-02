import type { ComponentType } from "react"
import type { WidgetId } from "../types/dashboardLayout"

/** Props every dashboard widget may receive. Widgets that don't need them ignore them. */
export interface DashboardWidgetProps {
  /** The widget's current grid span (1 = half width, 2 = full width). */
  colSpan?: 1 | 2
}
import { AnnualRevenueWidget } from "../widgets/AnnualRevenueWidget"
import { CumulativeRevenueGrowthWidget } from "../widgets/CumulativeRevenueGrowthWidget"
import { CurrentYearRevenueWidget } from "../widgets/CurrentYearRevenueWidget"
import { AllTimeRevenueWidget } from "../widgets/AllTimeRevenueWidget"
import { MonthlyRevenueComparisonWidget } from "../widgets/MonthlyRevenueComparisonWidget"
import { MonthlyDirectExpenseWidget } from "../widgets/MonthlyDirectExpenseWidget"
import { MonthlyOverheadWidget } from "../widgets/MonthlyOverheadWidget"
import { MonthlyNetProfitWidget } from "../widgets/MonthlyNetProfitWidget"
import { MarginWidget } from "../widgets/MarginWidget"
import { PeriodAndYearSummaryWidget } from "../widgets/PeriodAndYearSummaryWidget"
import {
  ClientInsightsWidget,
  SubcontractorInsightsWidget,
  VendorInsightsWidget,
} from "../widgets/InsightWidgets"
import { EmployeePerformanceWidget } from "../widgets/EmployeePerformanceWidget"
import {
  ReconciliationWidget,
  DataQualityWidget,
  MissingContractsWidget,
} from "../widgets/reports/ReportWidget"
import { BankingWidget } from "../widgets/banking/BankingWidget"
import { BillingsWidget } from "../widgets/billings/BillingsWidget"

// Drives the placeholder illustration shown in edit mode.
export type WidgetVisualType = "stat" | "line" | "pie" | "bar" | "table" | "summary"

export interface WidgetRegistryEntry {
  id: WidgetId
  component: ComponentType<DashboardWidgetProps>
  label: string
  visualType: WidgetVisualType
  defaultColSpan: 1 | 2
}

export const WIDGET_REGISTRY: Record<WidgetId, WidgetRegistryEntry> = {
  // ── Reports ──────────────────────────────────────────────────────────
  reconciliation: {
    id: "reconciliation",
    component: ReconciliationWidget,
    label: "Reconciliation Report",
    visualType: "stat",
    defaultColSpan: 1,
  },
  dataQuality: {
    id: "dataQuality",
    component: DataQualityWidget,
    label: "Data Quality Report",
    visualType: "stat",
    defaultColSpan: 1,
  },
  missingContracts: {
    id: "missingContracts",
    component: MissingContractsWidget,
    label: "Missing Contracts Report",
    visualType: "stat",
    defaultColSpan: 1,
  },
  // ── Business Development ─────────────────────────────────────────────
  currentYearRevenue: {
    id: "currentYearRevenue",
    component: CurrentYearRevenueWidget,
    label: "Current Year Revenue",
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
    label: "Annual Revenue Trend",
    visualType: "line",
    defaultColSpan: 2,
  },
  cumulativeRevenueGrowth: {
    id: "cumulativeRevenueGrowth",
    component: CumulativeRevenueGrowthWidget,
    label: "Cumulative Revenue Growth",
    visualType: "line",
    defaultColSpan: 2,
  },
  // ── Business Performance ─────────────────────────────────────────────
  periodAndYearSummary: {
    id: "periodAndYearSummary",
    component: PeriodAndYearSummaryWidget,
    label: "Period & Year Summary",
    visualType: "summary",
    defaultColSpan: 2,
  },
  margin: {
    id: "margin",
    component: MarginWidget,
    label: "Margin",
    visualType: "bar",
    defaultColSpan: 1,
  },
  employeePerformance: {
    id: "employeePerformance",
    component: EmployeePerformanceWidget,
    label: "Employee Performance",
    visualType: "table",
    defaultColSpan: 1,
  },
  // ── Financial Trends ─────────────────────────────────────────────────
  monthlyRevenueComparison: {
    id: "monthlyRevenueComparison",
    component: MonthlyRevenueComparisonWidget,
    label: "Gross Revenue by Month",
    visualType: "line",
    defaultColSpan: 1,
  },
  monthlyOverhead: {
    id: "monthlyOverhead",
    component: MonthlyOverheadWidget,
    label: "Overhead Expense by Month",
    visualType: "line",
    defaultColSpan: 1,
  },
  monthlyNetProfit: {
    id: "monthlyNetProfit",
    component: MonthlyNetProfitWidget,
    label: "Net Profit by Month",
    visualType: "line",
    defaultColSpan: 1,
  },
  monthlyDirectExpense: {
    id: "monthlyDirectExpense",
    component: MonthlyDirectExpenseWidget,
    label: "Total Direct Expense by Month",
    visualType: "line",
    defaultColSpan: 1,
  },
  // ── Business Financials ──────────────────────────────────────────────
  banking: {
    id: "banking",
    component: BankingWidget,
    label: "Cash & Line of Credit",
    visualType: "stat",
    defaultColSpan: 2,
  },
  billings: {
    id: "billings",
    component: BillingsWidget,
    label: "Overdue & Upcoming Billings",
    visualType: "bar",
    // Full width — Overdue (1/3) beside the forecast chart (2/3).
    defaultColSpan: 2,
  },
  // ── Business Relations ───────────────────────────────────────────────
  clientInsights: {
    id: "clientInsights",
    component: ClientInsightsWidget,
    label: "Top Clients by Revenue",
    visualType: "pie",
    defaultColSpan: 2,
  },
  subcontractorInsights: {
    id: "subcontractorInsights",
    component: SubcontractorInsightsWidget,
    label: "Top Subcontractors by Spend",
    visualType: "pie",
    defaultColSpan: 1,
  },
  vendorInsights: {
    id: "vendorInsights",
    component: VendorInsightsWidget,
    label: "Top Material Suppliers by Spend",
    visualType: "pie",
    defaultColSpan: 1,
  },
}
