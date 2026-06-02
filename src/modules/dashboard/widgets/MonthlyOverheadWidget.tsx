import { MonthlyYearComparisonWidget } from "./MonthlyYearComparisonWidget"

// Overhead expense per month, current vs previous year. Overhead = every
// 6xxx GL account (matches getOverheadExpenses' `a.recnum LIKE '6%'`).
export function MonthlyOverheadWidget() {
  return (
    <MonthlyYearComparisonWidget
      title="Overhead Expense by Month"
      queryName="monthlyOverheadComparison"
      valueKey="overhead"
      viewHref="/dashboard/breakdown/overhead"
    />
  )
}
