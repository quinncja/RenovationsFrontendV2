import { Widget } from "../../../shared/components/Widget/Widget"
import { Chart } from "../../../shared/components/Chart/Chart"
import { useWidgetData, usePageYear } from "../../../shared/context/PageContext"
import { buildMonthSeries } from "../../../shared/utils/chart"

interface MonthlyRevenuePoint {
  month: number
  revenue: number
}

export function GrossRevenueWidget() {
  const currentYear = usePageYear()
  const prevYear = currentYear - 1

  const { data, isLoading } = useWidgetData<{
    grossRevenueByMonth: MonthlyRevenuePoint[]
    grossRevenueByMonthPrevYear: MonthlyRevenuePoint[]
  }>(["grossRevenueByMonth", "grossRevenueByMonthPrevYear"])

  const currentPoints = data?.grossRevenueByMonth ?? []
  const prevPoints = data?.grossRevenueByMonthPrevYear ?? []
  const noData = !isLoading && currentPoints.length === 0 && prevPoints.length === 0

  return (
    <Widget title="Gross Revenue by Month" loading={isLoading} noData={noData}>
      <Chart
        config={{
          type: "line",
          series: [
            { id: String(prevYear), color: "#94a3b8", data: buildMonthSeries(prevPoints, "revenue") },
            { id: String(currentYear), color: "#1f78c5", data: buildMonthSeries(currentPoints, "revenue") },
          ],
          enableArea: false,
          legend: true,
        }}
      />
    </Widget>
  )
}
