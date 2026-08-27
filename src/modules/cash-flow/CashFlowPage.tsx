import { useMemo } from "react"
import Page from "../../shared/components/Page"
import { PageDataProvider, useWidgetData } from "../../shared/context/PageContext"
import { PAGE_QUERIES } from "../../shared/config/pageQueries"
import { YearSelector } from "../../shared/components/YearSelector/YearSelector"
import useLocalStorage from "../../shared/hooks/useLocalStorage"
import { Sankey } from "@nivo/sankey"
import { useDarkMode } from "../../shared/hooks/useDarkMode"
import { formatMoneyFull } from "../../shared/utils/format"
import { useProcessCanvas } from "../../shared/components/ProcessCanvas/ProcessCanvas"

/* ------------------------------------------------------------------
   Cash Flow: the nivo Sankey on the same Figma-style canvas as Project
   Process. The chart is drawn at a fixed world size and the canvas
   pans / zooms it, so the thin overhead accounts can be read up close.
   ------------------------------------------------------------------ */

interface SankeyNode { id: string; name?: string; color?: string }
interface SankeyLink { source: string; target: string; value: number }
interface SankeyData { nodes: SankeyNode[]; links: SankeyLink[] }

const NODE_COLORS: Record<string, string> = {
  "construction-income": "#22c55e",
  expenses: "#ef4444",
  "direct-expenses": "#f97316",
  overhead: "#8b5cf6",
  profit: "#22c55e",
  material: "#f59e0b",
  labor: "#eab308",
  subcontractors: "#c27c3e",
  wtpm: "#84cc16",
}

const CHART_W = 1400
const PAD = 40
/** Rows of overhead accounts set the height: the chart grows so no node collapses to a hairline. */
const ROW_H = 44
const MIN_H = 720

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
    if (!raw?.nodes?.length || !raw.links?.length) return null
    return {
      nodes: raw.nodes.map(n => ({ ...n, color: NODE_COLORS[n.id] || (dark ? "#6b7280" : "#9ca3af") })),
      links: raw.links.filter(l => l.value > 0),
    }
  }, [data?.cashflow, dark])

  const leafCount = sankeyData ? sankeyData.nodes.filter(n => !sankeyData.links.some(l => l.source === n.id)).length : 0
  const chartH = Math.max(MIN_H, leafCount * ROW_H + PAD * 2)
  const worldW = CHART_W + PAD * 2
  const worldH = chartH + PAD * 2

  const { controls, canvas } = useProcessCanvas({
    worldW,
    worldH,
    bounds: { x0: 0, y0: 0, x1: worldW, y1: worldH },
    fitKey: sankeyData,
  })

  const overlay = isLoading
    ? <div className="pp-empty">Loading {year} cash flow…</div>
    : !sankeyData ? <div className="pp-empty">No cash flow data for {year}.</div> : null

  return (
    <Page
      title="Cash Flow"
      subtitle="Where construction income went. Scroll to pan, pinch or ⌘+scroll to zoom, drag to move."
      actions={<><YearSelector value={year} onChange={onYearChange} />{controls}</>}
    >
      {canvas(
        sankeyData && (
          <div className="cf-chart" style={{ left: PAD, top: PAD, width: CHART_W, height: chartH }}>
            <h2 className="pp-title cf-chart-title">{year} Cash Flow</h2>
            <Sankey
              width={CHART_W}
              height={chartH}
              data={sankeyData}
              margin={{ top: 48, right: 200, bottom: 24, left: 170 }}
              align="center"
              sort="input"
              colors={node => (node as unknown as { color: string }).color || "#6b7280"}
              label={node => (node as unknown as { name?: string }).name ?? node.id}
              nodeOpacity={1}
              nodeThickness={18}
              nodeInnerPadding={3}
              nodeSpacing={24}
              nodeBorderWidth={0}
              linkOpacity={0.45}
              linkHoverOpacity={0.6}
              linkContract={3}
              enableLinkGradient
              labelPosition="outside"
              labelOrientation="horizontal"
              labelPadding={16}
              labelTextColor={dark ? "#e8e0d8" : "#19375a"}
              nodeTooltip={({ node }) => (
                <div className="cf-tooltip">
                  <strong>{node.label}</strong>: {formatMoneyFull(node.value)}
                </div>
              )}
              theme={{
                text: { fill: dark ? "#9a8e82" : "#6b7a8d", fontSize: 12, fontFamily: "Figtree, sans-serif" },
                tooltip: { container: { zIndex: 9999 } },
              }}
            />
          </div>
        ),
        overlay,
      )}
    </Page>
  )
}
