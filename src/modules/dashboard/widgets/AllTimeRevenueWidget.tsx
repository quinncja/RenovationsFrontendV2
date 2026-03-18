import { StatWidget } from "../../../shared/components/StatWidget/StatWidget"
import { useWidgetData } from "../../../shared/context/PageContext"

export function AllTimeRevenueWidget() {
  const { data, isLoading } = useWidgetData<{ allTimeRevenue: number | null }>(["allTimeRevenue"])

  return (
    <StatWidget
      title="All-Time Revenue"
      value={data?.allTimeRevenue ?? null}
      loading={isLoading}
    />
  )
}
