import { Widget } from "../../../shared/components/Widget/Widget"
import { Chart } from "../../../shared/components/Chart/Chart"
import { useWidgetData, usePageYear } from "../../../shared/context/PageContext"
import { shortMonth } from "../../../shared/utils/format"

interface MonthlySpendingPoint {
  month: number
  spending: number
}

const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

function buildMonthSeries(points: MonthlySpendingPoint[]) {
  return ALL_MONTHS.map((m) => {
    const found = points.find((p) => p.month === m)
    return { x: shortMonth(m), y: found?.spending ?? null }
  })
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
            { id: String(prevYear), color: "#94a3b8", data: buildMonthSeries(prevPoints) },
            { id: String(currentYear), color: "#e05c2a", data: buildMonthSeries(currentPoints) },
          ],
          enableArea: false,
          legend: true,
        }}
      />
    </Widget>
  )
}
