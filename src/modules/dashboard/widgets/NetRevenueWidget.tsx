import { Widget } from "../../../shared/components/Widget/Widget"
import { Chart } from "../../../shared/components/Chart/Chart"
import { useWidgetData, usePageYear } from "../../../shared/context/PageContext"
import { shortMonth } from "../../../shared/utils/format"

interface MonthlyRevenuePoint {
  month: number
  revenue: number
}

const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

function buildMonthSeries(points: MonthlyRevenuePoint[]) {
  return ALL_MONTHS.map((m) => {
    const found = points.find((p) => p.month === m)
    return { x: shortMonth(m), y: found?.revenue ?? 0 }
  })
}

export function NetRevenueWidget() {
  const currentYear = usePageYear()
  const prevYear = currentYear - 1

  const { data, isLoading } = useWidgetData<{
    netRevenueByMonth: MonthlyRevenuePoint[]
    netRevenueByMonthPrevYear: MonthlyRevenuePoint[]
  }>(["netRevenueByMonth", "netRevenueByMonthPrevYear"])

  const currentPoints = data?.netRevenueByMonth ?? []
  const prevPoints = data?.netRevenueByMonthPrevYear ?? []
  const noData = !isLoading && currentPoints.length === 0 && prevPoints.length === 0

  return (
    <Widget title="Net Revenue by Month" loading={isLoading} noData={noData}>
      <Chart
        config={{
          type: "line",
          series: [
            { id: String(prevYear), color: "#94a3b8", data: buildMonthSeries(prevPoints) },
            { id: String(currentYear), color: "#1f78c5", data: buildMonthSeries(currentPoints) },
          ],
          enableArea: false,
          legend: true,
        }}
      />
    </Widget>
  )
}
