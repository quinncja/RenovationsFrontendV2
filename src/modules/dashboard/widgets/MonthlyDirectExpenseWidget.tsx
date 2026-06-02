import { MonthlyYearComparisonWidget } from "./MonthlyYearComparisonWidget"

// Total direct expense per month, current vs previous year. Direct =
// 5005% (WTPM) + 5200% (subcontractors) + 5400% (labor) + 5500% (material)
// per the same account-pattern convention used by getAnnualDirectExpenses
// and getMarginPerformance.
export function MonthlyDirectExpenseWidget() {
  return (
    <MonthlyYearComparisonWidget
      title="Total Direct Expense by Month"
      queryName="monthlyDirectExpenseComparison"
      valueKey="expense"
      viewHref="/dashboard/breakdown/direct-expense"
    />
  )
}
