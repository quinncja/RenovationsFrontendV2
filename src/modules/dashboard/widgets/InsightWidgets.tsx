import { useNavigate } from "react-router-dom"
import { Widget } from "../../../shared/components/Widget/Widget"
import { Chart } from "../../../shared/components/Chart/Chart"
import { useWidgetData } from "../../../shared/context/PageContext"
import type { SpendItem } from "../../../shared/components/Chart/chart.types"
import type { DashboardWidgetProps } from "../config/widgetRegistry"
import { colorRamp, RAMP_SCHEMES } from "../../../shared/config/chartColors"

// Backend insight rows are { id, name, value }; the chart wants { id, label, value }.
interface RawInsight {
  id: string | number
  name: string
  value: number
}

interface InsightWidgetProps extends DashboardWidgetProps {
  query: string
  /** Plural entity name, e.g. "Clients" — title becomes "Top N {noun} by {metric}". */
  noun: string
  /** Metric the ranking is by, e.g. "Revenue" or "Spend". */
  metric: string
  centerLabel: string
  route: string
  scheme: keyof typeof RAMP_SCHEMES
}

// Shared body for the three "Insights" donut widgets. Shows 10 entries at full
// width / 5 at half width, and "See all" opens the matching directory page.
function InsightWidget({ query, noun, metric, centerLabel, route, scheme, colSpan }: InsightWidgetProps) {
  const navigate = useNavigate()
  const { data, isLoading } = useWidgetData<Record<string, RawInsight[] | null>>([query])
  const raw = data?.[query]
  const hasData = Array.isArray(raw) && raw.length > 0

  const isFull = colSpan === 2
  const previewCount = isFull ? 10 : 5
  const title = `Top ${previewCount} ${noun} by ${metric}`
  const items: SpendItem[] = hasData
    ? raw.map((r) => ({ id: String(r.id), label: r.name, value: r.value }))
    : []
  const { hue, drift } = RAMP_SCHEMES[scheme]
  const colors = colorRamp(hue, drift, previewCount)

  return (
    <Widget
      title={title}
      loading={isLoading}
      noData={!hasData}
      expandable
      onExpand={() => navigate(route)}
    >
      {hasData && (
        <Chart
          config={{
            type: "pie-with-list",
            items,
            previewCount,
            centerLabel,
            colors,
            chartSize: isFull ? "lg" : "md",
            // Show each item's % of total in the legend so users can read
            // relative magnitude at a glance without divide-by-eye.
            showPercent: true,
            // Clicking a legend item (or slice) opens that entity's detail page.
            onItemClick: (id) => navigate(`${route}/${id}`),
          }}
        />
      )}
    </Widget>
  )
}

export function ClientInsightsWidget({ colSpan }: DashboardWidgetProps) {
  return <InsightWidget colSpan={colSpan} query="clientInsights" noun="Clients" metric="Revenue" centerLabel="CLIENTS" route="/clients" scheme="orange" />
}

export function SubcontractorInsightsWidget({ colSpan }: DashboardWidgetProps) {
  return <InsightWidget colSpan={colSpan} query="subcontractorInsights" noun="Subcontractors" metric="Spend" centerLabel="SUBCONTRACTORS" route="/subcontractors" scheme="red" />
}

export function VendorInsightsWidget({ colSpan }: DashboardWidgetProps) {
  return <InsightWidget colSpan={colSpan} query="vendorInsights" noun="Material Suppliers" metric="Spend" centerLabel="SUPPLIERS" route="/vendors" scheme="purple" />
}
