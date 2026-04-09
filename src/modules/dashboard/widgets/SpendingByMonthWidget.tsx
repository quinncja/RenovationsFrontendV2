import { Widget } from "../../../shared/components/Widget/Widget"
import { Chart } from "../../../shared/components/Chart/Chart"
import { useWidgetData, usePageYear } from "../../../shared/context/PageContext"
import { buildMonthSeries } from "../../../shared/utils/chart"

interface MonthlySpendingPoint {
  month: number
  spending: number
}

export function SpendingByMonthWidget() {
  const currentYear = usePageYear()
  const prevYear = currentYear - 1

  const { data, isLoading } = useWidgetData<{
    spendingByMonth: MonthlySpendingPoint[]
    spendingByMonthPrevYear: MonthlySpendingPoint[]
  }>(["spendingByMonth", "spendingByMonthPrevYear"])

  const currentPoints = data?.spendingByMonth ?? []
  const prevPoints = data?.spendingByMonthPrevYear ?? []
  const noData = !isLoading && currentPoints.length === 0 && prevPoints.length === 0

  return (
    <Widget title="Spending by Month" loading={isLoading} noData={noData}>
      <Chart
        config={{
          type: "line",
          series: [
            { id: String(prevYear), color: "#94a3b8", data: buildMonthSeries(prevPoints, "spending") },
            { id: String(currentYear), color: "#e05c2a", data: buildMonthSeries(currentPoints, "spending") },
          ],
          enableArea: false,
          legend: true,
        }}
      />
    </Widget>
  )
}
