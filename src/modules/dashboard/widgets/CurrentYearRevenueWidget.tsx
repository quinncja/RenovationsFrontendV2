import { StatWidget } from "../../../shared/components/StatWidget/StatWidget"
import { useWidgetData, usePageYear } from "../../../shared/context/PageContext"
import useIncludeOverUnder from "../../../shared/hooks/useIncludeOverUnder"

interface OpenMonth {
  openMonthYear?: number
  openMonthIncome?: number
  openMonthOverUnder?: number
}

// Derived from annualRevenueTrend so no extra backend query is needed: pick the
// revenue row whose year matches the selected dashboard year.
//
// annualRevenueTrend is capped at the most-recently-closed period, so it omits
// the open month. To stay consistent with the Year Summary (which already
// includes the open month's confirmed billings), we always fold the open
// month's income in for the open year; when the over/under toggle is on we add
// its WIP on top.
export function CurrentYearRevenueWidget() {
  const year = usePageYear()
  const [includeOverUnder] = useIncludeOverUnder()
  const { data, isLoading } = useWidgetData<{
    annualRevenueTrend: { year: number; revenue: number }[] | null
    openMonthFinances: OpenMonth | null
  }>(["annualRevenueTrend", "openMonthFinances"])

  let value: number | null = null
  if (Array.isArray(data?.annualRevenueTrend)) {
    value = data.annualRevenueTrend.find((d) => d.year === year)?.revenue ?? null
    const open = data.openMonthFinances
    if (open?.openMonthYear === year) {
      const wip = includeOverUnder ? open.openMonthOverUnder ?? 0 : 0
      value = (value ?? 0) + (open.openMonthIncome ?? 0) + wip
    }
  }

  return <StatWidget title={`${year} Revenue`} value={value} loading={isLoading} />
}
