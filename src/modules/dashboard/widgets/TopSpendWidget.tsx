import { useNavigate } from "react-router-dom"
import { Widget } from "../../../shared/components/Widget/Widget"
import { Chart } from "../../../shared/components/Chart/Chart"
import { useWidgetData } from "../../../shared/context/PageContext"
import type { SpendItem } from "../../../shared/components/Chart/chart.types"

interface TopSpendWidgetProps {
  title: string
  description?: string
  queryKey: string
  /** Query key whose scalar result is shown in the donut center */
  totalQueryKey: string
  /** Base path for the list page, e.g. "/clients" */
  listPath: string
  /** Base path for detail pages, e.g. "/clients" → "/clients/:id" */
  detailPath: string
  previewCount?: number
  colors?: string[]
  centerLabel?: string
  chartSize?: "sm" | "md" | "lg"
}

export function TopSpendWidget({
  title,
  description,
  queryKey,
  totalQueryKey,
  listPath,
  detailPath,
  previewCount = 5,
  colors,
  centerLabel,
  chartSize,
}: TopSpendWidgetProps) {
  const navigate = useNavigate()
  const { data, isLoading } = useWidgetData<Record<string, SpendItem[] | number | null>>(
    [queryKey, totalQueryKey]
  )
  const items: SpendItem[] = (data?.[queryKey] as SpendItem[]) ?? []
  const centerTotal = data?.[totalQueryKey] as number | null | undefined
  const noData = !isLoading && items.length === 0

  return (
    <Widget
      title={title}
      description={description}
      loading={isLoading}
      noData={noData}
      expandable
      onExpand={() => navigate(listPath)}
    >
      <Chart
        config={{
          type: "pie-with-list",
          items,
          previewCount,
          colors,
          centerLabel,
          centerTotal,
          chartSize,
          showPercent: true,
          onItemClick: (id) => navigate(`${detailPath}/${id}`),
        }}
      />
    </Widget>
  )
}
