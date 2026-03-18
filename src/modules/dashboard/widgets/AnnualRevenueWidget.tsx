import { Widget } from "../../../shared/components/Widget/Widget"
import { Chart } from "../../../shared/components/Chart/Chart"
import { useWidgetData } from "../../../shared/context/PageContext"

interface AnnualRevenuePoint {
  year: number
  revenue: number
}

export function AnnualRevenueWidget() {
  const { data, isLoading } = useWidgetData<{
    annualRevenueTrend: AnnualRevenuePoint[]
  }>(["annualRevenueTrend"])

  const points = data?.annualRevenueTrend ?? []
  const noData = !isLoading && points.length === 0

  return (
    <Widget title="Annual Revenue History" loading={isLoading} noData={noData}>
      <Chart
        config={{
          type: "line",
          series: [
            {
              id: "Revenue",
              data: points.map((p) => ({ x: p.year, y: p.revenue })),
            },
          ],
          enableArea: true,
        }}
      />
    </Widget>
  )
}
