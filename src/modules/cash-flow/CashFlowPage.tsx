import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
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

/* ---- Tooltip ----
   nivo places its tooltip inside the chart container, which the canvas
   scales and translates, so it lands off-cursor and zoomed. We use the
   nodeTooltip / linkTooltip slots purely as hover sensors and render our
   own fixed-position tooltip at the real cursor through a portal. */

type Hover =
  | { kind: "node"; id: string; label: string; color: string; value: number }
  | { kind: "link"; source: string; target: string; color: string; value: number; sourceTotal: number }

let setHoverRef: ((h: Hover | null) => void) | null = null

function NodeSensor({ node }: { node: { id: string; label: string; color: string; value: number } }) {
  useEffect(() => {
    setHoverRef?.({ kind: "node", id: node.id, label: node.label, color: node.color, value: node.value })
    return () => setHoverRef?.(null)
  }, [node])
  return null
}
function LinkSensor({ link }: { link: { value: number; source: { label: string; color: string; value: number }; target: { label: string } } }) {
  useEffect(() => {
    setHoverRef?.({ kind: "link", source: link.source.label, target: link.target.label, color: link.source.color, value: link.value, sourceTotal: link.source.value })
    return () => setHoverRef?.(null)
  }, [link])
  return null
}

function CashFlowTooltip({ hover, income }: { hover: Hover; income: number }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
    const onMove = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY })
    window.addEventListener("mousemove", onMove)
    return () => window.removeEventListener("mousemove", onMove)
  }, [])
  if (!pos) return null
  const pct = (v: number, of: number) => (of > 0 ? `${((v / of) * 100).toFixed(1)}%` : "")
  // Flip to the left of the cursor near the right edge.
  const flip = pos.x > window.innerWidth - 260
  return createPortal(
    <div className="cf-tip" style={{ left: pos.x, top: pos.y, transform: flip ? "translate(calc(-100% - 14px), 14px)" : "translate(14px, 14px)" }}>
      <div className="chart-line-tooltip">
        {hover.kind === "node" ? (
          <>
            <div className="chart-line-tooltip-header">
              <span className="chart-tooltip-dot" style={{ background: hover.color }} />
              {hover.label}
            </div>
            <div className="chart-line-tooltip-row">
              <span className="chart-line-tooltip-label">Amount</span>
              <span className="chart-line-tooltip-value">{formatMoneyFull(hover.value)}</span>
            </div>
            {hover.id !== "construction-income" && (
              <div className="chart-line-tooltip-row">
                <span className="chart-line-tooltip-label">Share of income</span>
                <span className="chart-line-tooltip-value">{pct(hover.value, income)}</span>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="chart-line-tooltip-header">
              <span className="chart-tooltip-dot" style={{ background: hover.color }} />
              {hover.source} → {hover.target}
            </div>
            <div className="chart-line-tooltip-row">
              <span className="chart-line-tooltip-label">Amount</span>
              <span className="chart-line-tooltip-value">{formatMoneyFull(hover.value)}</span>
            </div>
            <div className="chart-line-tooltip-row">
              <span className="chart-line-tooltip-label">Of {hover.source}</span>
              <span className="chart-line-tooltip-value">{pct(hover.value, hover.sourceTotal)}</span>
            </div>
            <div className="chart-line-tooltip-row">
              <span className="chart-line-tooltip-label">Share of income</span>
              <span className="chart-line-tooltip-value">{pct(hover.value, income)}</span>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

const CHART_W = 1400
const PAD = 16
/** Rows of overhead accounts set the height: the chart grows so no node collapses to a hairline. */
const ROW_H = 44
/** Default aspect close to the viewport's so Fit fills the screen instead of leaving air above and below. */
const MIN_H = Math.round(CHART_W * 0.62)

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

  const [hover, setHover] = useState<Hover | null>(null)
  useEffect(() => { setHoverRef = setHover; return () => { setHoverRef = null } }, [])
  const income = useMemo(
    () => sankeyData?.links.filter(l => l.source === "construction-income").reduce((s, l) => s + l.value, 0) ?? 0,
    [sankeyData],
  )

  const leafCount = sankeyData ? sankeyData.nodes.filter(n => !sankeyData.links.some(l => l.source === n.id)).length : 0
  const chartH = Math.max(MIN_H, leafCount * ROW_H + PAD * 2)
  const worldW = CHART_W + PAD * 2
  const worldH = chartH + PAD * 2

  const { controls, canvas } = useProcessCanvas({
    worldW,
    worldH,
    // Fit hugs the chart box itself, not the padded world.
    bounds: { x0: PAD, y0: PAD, x1: PAD + CHART_W, y1: PAD + chartH },
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
              margin={{ top: 44, right: 150, bottom: 12, left: 140 }}
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
              nodeTooltip={NodeSensor as never}
              linkTooltip={LinkSensor as never}
              theme={{
                text: { fill: dark ? "#9a8e82" : "#6b7a8d", fontSize: 12, fontFamily: "Figtree, sans-serif" },
                // Sensors render nothing; hide nivo's own container entirely.
                tooltip: { container: { display: "none" } },
              }}
            />
          </div>
        ),
        overlay,
      )}
      {hover && <CashFlowTooltip hover={hover} income={income} />}
    </Page>
  )
}
