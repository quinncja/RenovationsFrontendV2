import { useMemo } from "react"
import Page from "../../shared/components/Page"
import { PageDataProvider, useWidgetData } from "../../shared/context/PageContext"
import { PAGE_QUERIES } from "../../shared/config/pageQueries"
import { YearSelector } from "../../shared/components/YearSelector/YearSelector"
import { Widget } from "../../shared/components/Widget/Widget"
import useLocalStorage from "../../shared/hooks/useLocalStorage"
import { ResponsiveSankey } from "@nivo/sankey"
import { useDarkMode } from "../../shared/hooks/useDarkMode"
import { formatMoneyFull } from "../../shared/utils/format"

interface SankeyNode {
  id: string
  color?: string
}

interface SankeyLink {
  source: string
  target: string
  value: number
}

interface SankeyData {
  nodes: SankeyNode[]
  links: SankeyLink[]
}

const NODE_COLORS: Record<string, string> = {
  "construction-income": "#22c55e",
  "expenses": "#ef4444",
  "direct-expenses": "#f97316",
  "overhead": "#8b5cf6",
  "profit": "#22c55e",
  "material": "#f59e0b",
  "labor": "#eab308",
  "subcontractors": "#c27c3e",
  "wtpm": "#84cc16",
}

export default function CashFlowPage() {
  const [year, setYear] = useLocalStorage("cashFlowYear", new Date().getFullYear())

  return (
    <PageDataProvider module="cashflow" queries={PAGE_QUERIES.cashflow} params={{ year }}>
      <CashFlowContent year={year} onYearChange={setYear} />
    </PageDataProvider>
  )
}

function CashFlowContent({ year, onYearChange }: { year: number; onYearChange: (y: number) => void }) {
  const dark = useDarkMode()
  const { data, isLoading } = useWidgetData<{ cashflow: SankeyData | null }>(["cashflow"])

  const sankeyData = useMemo(() => {
    const raw = data?.cashflow
    if (!raw || !raw.nodes || !raw.links) return null
    return {
      nodes: raw.nodes.map(n => ({
        ...n,
        color: NODE_COLORS[n.id] || (dark ? "#6b7280" : "#9ca3af"),
      })),
      links: raw.links.filter(l => l.value > 0),
    }
  }, [data?.cashflow, dark])

  return (
    <Page title="Cash Flow" actions={<YearSelector value={year} onChange={onYearChange} />}>
      <Widget title={`${year} Cash Flow`} loading={isLoading} noData={!sankeyData}>
        {sankeyData && (
          <div style={{ height: "85vh" }}>
            <ResponsiveSankey
              data={sankeyData}
              margin={{ top: 20, right: 160, bottom: 20, left: 20 }}
              align="justify"
              colors={node => (node as unknown as { color: string }).color || "#6b7280"}
              nodeOpacity={1}
              nodeThickness={18}
              nodeInnerPadding={3}
              nodeSpacing={24}
              nodeBorderWidth={0}
              linkOpacity={0.3}
              linkHoverOpacity={0.6}
              linkContract={3}
              enableLinkGradient
              labelPosition="outside"
              labelOrientation="horizontal"
              labelPadding={16}
              labelTextColor={dark ? "#e8e0d8" : "#19375a"}
              nodeTooltip={({ node }) => (
                <div style={{
                  background: dark ? "#262220" : "#fff",
                  border: `1px solid ${dark ? "rgba(200,180,160,0.2)" : "rgba(0,0,0,0.1)"}`,
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontSize: "0.8125rem",
                }}>
                  <strong>{node.label}</strong>: {formatMoneyFull(node.value)}
                </div>
              )}
              theme={{
                text: {
                  fill: dark ? "#9a8e82" : "#6b7a8d",
                  fontSize: 11,
                  fontFamily: "Figtree, sans-serif",
                },
                tooltip: { container: { zIndex: 9999 } },
              }}
            />
          </div>
        )}
      </Widget>
    </Page>
  )
}
