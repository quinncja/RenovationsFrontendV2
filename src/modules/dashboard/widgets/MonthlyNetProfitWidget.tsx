import { MonthlyYearComparisonWidget } from "./MonthlyYearComparisonWidget"

// Net profit per month, current vs previous year. Backend computes
// revenue − direct − overhead per (month, year) in a single GL pass; the
// `profit` column may be negative for unprofitable months — the chart axis
// auto-extends below zero.
export function MonthlyNetProfitWidget() {
  return (
    <MonthlyYearComparisonWidget
      title="Net Profit by Month"
      queryName="monthlyNetProfitComparison"
      valueKey="profit"
      overUnderApplies
    />
  )
}
