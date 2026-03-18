import { StatWidget } from "../../../shared/components/StatWidget/StatWidget"
import { useWidgetData, usePageYear } from "../../../shared/context/PageContext"

export function YearRevenueWidget() {
  const year = usePageYear()
  const { data, isLoading } = useWidgetData<{ yearRevenue: number | null }>(["yearRevenue"])

  return (
    <StatWidget
      title={`${year} Revenue`}
      value={data?.yearRevenue ?? null}
      loading={isLoading}
    />
  )
}
