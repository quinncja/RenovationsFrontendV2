import { StatWidget } from "../../../shared/components/StatWidget/StatWidget"
import { useWidgetData, usePeriodLabel } from "../../../shared/context/PageContext"

export function YearRevenueWidget() {
  const label = usePeriodLabel()
  const { data, isLoading } = useWidgetData<{ yearRevenue: number | null }>(["yearRevenue"])

  return (
    <StatWidget
      title={`${label} Revenue`}
      value={data?.yearRevenue ?? null}
      loading={isLoading}
    />
  )
}
