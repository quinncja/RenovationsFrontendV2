import { StatWidget } from "../../../shared/components/StatWidget/StatWidget"
import { useWidgetData } from "../../../shared/context/PageContext"
import { PRE_2018_REVENUE_TOTAL } from "../config/historicalRevenue"

// annualRevenueTrend includes a year-0 row holding the grand total across all
// years — use it directly (summing the real years would double-count it). The
// backend only covers 2018+, so add the hardcoded pre-2018 revenue.
export function AllTimeRevenueWidget() {
  const { data, isLoading } = useWidgetData<{
    annualRevenueTrend: { year: number; revenue: number }[] | null
  }>(["annualRevenueTrend"])

  let value: number | null = null
  if (Array.isArray(data?.annualRevenueTrend)) {
    const totalRow = data.annualRevenueTrend.find((d) => d.year === 0)
    const dbTotal = totalRow
      ? totalRow.revenue
      : data.annualRevenueTrend.reduce((sum, d) => sum + (d.revenue ?? 0), 0)
    value = dbTotal + PRE_2018_REVENUE_TOTAL
  }

  return <StatWidget title="All-Time Revenue" value={value} loading={isLoading} />
}
