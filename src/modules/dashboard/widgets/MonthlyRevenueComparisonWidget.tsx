import { MonthlyYearComparisonWidget } from "./MonthlyYearComparisonWidget"

// Gross revenue per month, current vs previous year. Widget id is kept as
// `monthlyRevenueComparison` for saved-layout continuity even though the
// title now matches the new "Gross Revenue by Month" naming.
export function MonthlyRevenueComparisonWidget() {
  return (
    <MonthlyYearComparisonWidget
      title="Gross Revenue by Month"
      queryName="monthlyRevenueComparison"
      valueKey="revenue"
      viewHref="/dashboard/breakdown/revenue"
      overUnderApplies
    />
  )
}
