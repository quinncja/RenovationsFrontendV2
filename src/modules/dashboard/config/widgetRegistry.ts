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
  OpenProjectsNoBudgetWidget,
} from "../widgets/reports/ReportWidget"
import { BankingOverdueWidget } from "../widgets/banking/BankingOverdueWidget"
import { UpcomingBillingsWidget } from "../widgets/billings/UpcomingBillingsWidget"
import { ProgressBillingsWidget } from "../widgets/ProgressBillingsWidget"
import {
  RecentActivityWidget,
  RecentBillingWidget,
} from "../widgets/recent/RecentChangesWidgets"
import { EstimationScorecardWidget } from "../widgets/estimation/EstimationScorecardWidget"
import { EstimationCategoryWidget } from "../widgets/estimation/EstimationCategoryWidget"
import { EstimationWorstJobsWidget } from "../widgets/estimation/EstimationWorstJobsWidget"

// Drives the placeholder illustration shown in edit mode. The last three are
// bespoke shapes for the Business Financials widgets so their edit-mode
// skeletons read like the real widgets (a card pair, a diverging forecast, a
// net-stat + table) rather than a generic stat/bar.
export type WidgetVisualType =
  | "stat"
  | "line"
  | "pie"
  | "bar"
  | "table"
  | "summary"
  | "bankingPair"
  | "forecast"
  | "progressBillings"

export interface WidgetRegistryEntry {
  id: WidgetId
  component: ComponentType<DashboardWidgetProps>
  label: string
  visualType: WidgetVisualType
  defaultColSpan: 1 | 2
}

export const WIDGET_REGISTRY: Record<WidgetId, WidgetRegistryEntry> = {
  // ── Recent Changes ───────────────────────────────────────────────────
  recentActivity: {
    id: "recentActivity",
    component: RecentActivityWidget,
    label: "Project Activity",
    visualType: "table",
    defaultColSpan: 1,
  },
  recentBilling: {
    id: "recentBilling",
    component: RecentBillingWidget,
    label: "Billing & Payments",
    visualType: "table",
    defaultColSpan: 1,
  },
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
  openProjectsNoBudget: {
    id: "openProjectsNoBudget",
    component: OpenProjectsNoBudgetWidget,
    label: "Missing Budgets Report",
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
    component: BankingOverdueWidget,
    label: "Banking & Overdue",
    visualType: "bankingPair",
    // Half width — shares the first row with Upcoming Billings.
    defaultColSpan: 1,
  },
  billings: {
    id: "billings",
    component: UpcomingBillingsWidget,
    label: "Upcoming Billings",
    visualType: "forecast",
    // Half width — shares the first row with Banking & Overdue.
    defaultColSpan: 1,
  },
  progressBillings: {
    id: "progressBillings",
    component: ProgressBillingsWidget,
    label: "Progress Billings",
    visualType: "progressBillings",
    // Full width — its own second row (stat column beside the project table).
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
  // ── Estimation Performance ───────────────────────────────────────────
  estimationScorecard: {
    id: "estimationScorecard",
    component: EstimationScorecardWidget,
    label: "Estimation Scorecard",
    visualType: "stat",
    defaultColSpan: 2,
  },
  estimationCategory: {
    id: "estimationCategory",
    component: EstimationCategoryWidget,
    label: "Bias by Category",
    visualType: "bar",
    defaultColSpan: 2,
  },
  estimationWorstJobs: {
    id: "estimationWorstJobs",
    component: EstimationWorstJobsWidget,
    label: "Biggest Budget Variance",
    visualType: "table",
    defaultColSpan: 2,
  },
}
