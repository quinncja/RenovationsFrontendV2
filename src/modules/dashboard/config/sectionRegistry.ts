import type { SectionId, WidgetId } from "../types/dashboardLayout"

// Section titles + ordering live here (not in the persisted layout doc) so a
// rename ships without a migration and doesn't trip the dirty-check.

export interface SectionRegistryEntry {
  id: SectionId
  title: string
  /** Grid columns for this section's home layout (default 2). */
  columns?: number
}

export const SECTION_REGISTRY: Record<SectionId, SectionRegistryEntry> = {
  reports: { id: "reports", title: "Reports", columns: 3 },
  businessDevelopment: { id: "businessDevelopment", title: "Business Development" },
  businessPerformance: { id: "businessPerformance", title: "Business Performance" },
  financialTrends: { id: "financialTrends", title: "Financial Trends" },
  businessFinancials: { id: "businessFinancials", title: "Business Financials" },
  businessRelations: { id: "businessRelations", title: "Business Relations" },
}

/** Default top-to-bottom order of sections on the home page. */
export const SECTION_ORDER: SectionId[] = [
  "reports",
  "businessDevelopment",
  "businessPerformance",
  "financialTrends",
  "businessFinancials",
  "businessRelations",
]

/**
 * The canonical home section for every widget — the single source of truth that
 * guarantees each widget belongs to exactly one section. Drives both
 * defaultLayout and reconcileLayout (bucketing + appending missing widgets).
 * Within a section, widget order below is the default render order.
 */
export const WIDGET_HOME_SECTION: Record<WidgetId, SectionId> = {
  // Reports
  reconciliation: "reports",
  dataQuality: "reports",
  missingContracts: "reports",
  // Business Development
  currentYearRevenue: "businessDevelopment",
  allTimeRevenue: "businessDevelopment",
  annualRevenue: "businessDevelopment",
  cumulativeRevenueGrowth: "businessDevelopment",
  // Business Performance
  periodAndYearSummary: "businessPerformance",
  margin: "businessPerformance",
  employeePerformance: "businessPerformance",
  // Financial Trends
  monthlyRevenueComparison: "financialTrends",
  monthlyOverhead: "financialTrends",
  monthlyNetProfit: "financialTrends",
  monthlyDirectExpense: "financialTrends",
  // Business Financials
  banking: "businessFinancials",
  billings: "businessFinancials",
  // Business Relations
  clientInsights: "businessRelations",
  subcontractorInsights: "businessRelations",
  vendorInsights: "businessRelations",
}

/**
 * Default within-section ordering of widgets. The order of keys in
 * WIDGET_HOME_SECTION is not guaranteed to be the desired display order across
 * sections, so this array fixes the per-widget default order explicitly. Used
 * by defaultLayout and as the "append missing widgets" order in reconcile.
 */
export const WIDGET_DEFAULT_ORDER: WidgetId[] = [
  // Reports
  "reconciliation",
  "dataQuality",
  "missingContracts",
  // Business Development
  "currentYearRevenue",
  "allTimeRevenue",
  "annualRevenue",
  "cumulativeRevenueGrowth",
  // Business Performance
  "periodAndYearSummary",
  "margin",
  "employeePerformance",
  // Financial Trends
  "monthlyRevenueComparison",
  "monthlyOverhead",
  "monthlyNetProfit",
  "monthlyDirectExpense",
  // Business Financials
  "banking",
  "billings",
  // Business Relations
  "clientInsights",
  "subcontractorInsights",
  "vendorInsights",
]
