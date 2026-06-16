import { StatWidget } from "../../../shared/components/StatWidget/StatWidget"
import { useWidgetData } from "../../../shared/context/PageContext"
import useIncludeOverUnder from "../../../shared/hooks/useIncludeOverUnder"
import { PRE_2018_REVENUE_TOTAL } from "../config/historicalRevenue"

interface OpenMonth {
  openMonthIncome?: number
  openMonthOverUnder?: number
}

// annualRevenueTrend includes a year-0 row holding the grand total across all
// years — use it directly (summing the real years would double-count it). The
// backend only covers 2018+, so add the hardcoded pre-2018 revenue.
//
// The grand total is capped at the most-recently-closed period, so the open
// month isn't in it. We always add the open month's confirmed billings (to
// match the Year Summary), plus its over/under WIP when the toggle is on.
export function AllTimeRevenueWidget() {
  const [includeOverUnder] = useIncludeOverUnder()
  const { data, isLoading } = useWidgetData<{
    annualRevenueTrend: { year: number; revenue: number }[] | null
    openMonthFinances: OpenMonth | null
  }>(["annualRevenueTrend", "openMonthFinances"])

  let value: number | null = null
  if (Array.isArray(data?.annualRevenueTrend)) {
    const totalRow = data.annualRevenueTrend.find((d) => d.year === 0)
    const dbTotal = totalRow
      ? totalRow.revenue
      : data.annualRevenueTrend.reduce((sum, d) => sum + (d.revenue ?? 0), 0)
    const open = data.openMonthFinances
    const openContribution = open
      ? (open.openMonthIncome ?? 0) + (includeOverUnder ? open.openMonthOverUnder ?? 0 : 0)
      : 0
    value = dbTotal + PRE_2018_REVENUE_TOTAL + openContribution
  }

  return (
    <StatWidget
      title={includeOverUnder ? "All-Time Revenue + Work Completed" : "All-Time Revenue"}
      value={value}
      loading={isLoading}
    />
  )
}
