import { MonthlyYearComparisonWidget } from "./MonthlyYearComparisonWidget"

// Cumulative revenue per month, current year vs previous year. The
// `cumulativeRevenueGrowth` query returns a running `revenue` total per month
// (column `cumulative_revenue AS revenue`), so reusing the metric-by-month
// comparison building block plots it as two rising lines with the "open month"
// marker, matching the old frontend's Cumulative Revenue Growth widget.
export function CumulativeRevenueGrowthWidget() {
  return (
    <MonthlyYearComparisonWidget
      title="Cumulative Revenue Growth"
      queryName="cumulativeRevenueGrowth"
      valueKey="revenue"
      includeOpenPeriod
      overUnderApplies
    />
  )
}
