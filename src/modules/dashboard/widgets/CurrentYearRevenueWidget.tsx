import { StatWidget } from "../../../shared/components/StatWidget/StatWidget"
import { useWidgetData, usePageYear } from "../../../shared/context/PageContext"

// Derived from annualRevenueTrend so no extra backend query is needed: pick the
// revenue row whose year matches the selected dashboard year.
export function CurrentYearRevenueWidget() {
  const year = usePageYear()
  const { data, isLoading } = useWidgetData<{
    annualRevenueTrend: { year: number; revenue: number }[] | null
  }>(["annualRevenueTrend"])

  const value = Array.isArray(data?.annualRevenueTrend)
    ? data.annualRevenueTrend.find((d) => d.year === year)?.revenue ?? null
    : null

  return <StatWidget title={`${year} Revenue`} value={value} loading={isLoading} />
}
