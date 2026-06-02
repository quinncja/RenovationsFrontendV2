import { useMemo } from "react"
import { Widget } from "../../../shared/components/Widget/Widget"
import { Chart } from "../../../shared/components/Chart/Chart"
import { useWidgetData } from "../../../shared/context/PageContext"
import { PRE_2018_REVENUE } from "../config/historicalRevenue"

export function AnnualRevenueWidget() {
  const { data, isLoading } = useWidgetData<{
    annualRevenueTrend: { year: number; revenue: number }[] | null
  }>(["annualRevenueTrend"])

  const series = useMemo(() => {
    const raw = data?.annualRevenueTrend
    if (!Array.isArray(raw)) return null
    // The query appends a year-0 row holding the grand total — exclude it so the
    // trend only plots real years. Prepend the hardcoded pre-2018 years (which
    // the backend doesn't cover) and sort chronologically.
    const dbYears = raw.filter((d) => d.year > 0)
    if (dbYears.length === 0) return null
    const years = [...PRE_2018_REVENUE, ...dbYears].sort((a, b) => a.year - b.year)
    return [{
      id: "Revenue",
      data: years.map((d) => ({ x: String(d.year), y: d.revenue })),
    }]
  }, [data?.annualRevenueTrend])

  // "You are here" pulse on the current calendar year's data point. The
  // chart shows years as x-values (`String(year)`), so the seriesId +
  // xValue match the way series is keyed above. If the current year
  // isn't in the dataset yet (start-of-year / lag), the pulse layer
  // silently no-ops.
  const currentYear = new Date().getFullYear()
  const pulsePoint = useMemo(
    () => ({ seriesId: "Revenue", xValue: String(currentYear) }),
    [currentYear]
  )

  return (
    <Widget title="Annual Revenue Trend" loading={isLoading} noData={!series}>
      {series && (
        <Chart config={{ type: "line", series, enableArea: true, pulsePoint }} />
      )}
    </Widget>
  )
}
