import { useMemo, type ReactNode } from "react"
import { Widget } from "../../../../shared/components/Widget/Widget"
import { Chart } from "../../../../shared/components/Chart/Chart"
import {
  computeCategoryStats,
  categoryBiasColor,
  formatSignedPct,
  formatAbsPct,
  CATEGORY_SHORT,
  type CategoryStat,
} from "./estimationMetrics"
import { useEstimationData } from "./useEstimationData"

// Round a magnitude up to a clean step so the symmetric axis reads tidily.
const NICE = [5, 10, 15, 20, 30, 50, 75, 100]
function niceMag(v: number): number {
  const abs = Math.abs(v)
  return NICE.find((m) => m >= abs) ?? Math.ceil(abs / 50) * 50
}

// Footer note explaining the Field / Labor / Subs split, shown only on those
// bars since they're the mutually-exclusive populations a viewer might confuse.
// Field fuses labor + subs for jobs that budget for both; single-discipline jobs land
// under Labor or Subs alone, so each job is counted exactly once.
function splitNote(s: CategoryStat): string | null {
  switch (s.key) {
    case "production":
      return "Field combines labor and subs on jobs that budget for both, since a PM can trade one for the other."
    case "labor":
      return "Includes only jobs with a labor budget but no subs. Jobs that budget for both appear under Field instead."
    case "sub":
      return "Includes only jobs with a sub budget but no labor. Jobs that budget for both appear under Field instead."
    default:
      return null
  }
}

// Plain-language explainer shown on hover of each category's legend item, e.g.
// "MISC spending ran −74% under budget, with the average variance being ±90.8%."
function legendHelp(s: CategoryStat): ReactNode {
  const name = CATEGORY_SHORT[s.key]
  if (s.bias == null || s.accuracy == null) {
    return `No ${name} budget on these jobs to measure against.`
  }
  const avg = `±${formatAbsPct(s.accuracy)}`
  const net = Math.round(s.bias)
  if (net === 0) {
    return (
      <>
        {name} spending landed on budget, with the average variance being <strong>{avg}</strong>.
      </>
    )
  }
  const dir = net > 0 ? "over" : "under"
  const signed = `${net > 0 ? "+" : "−"}${Math.abs(net)}%`
  return (
    <>
      {name} spending ran <strong>{signed}</strong> {dir} budget, with the average variance being{" "}
      <strong>{avg}</strong>.
    </>
  )
}

// Per-category estimating bias: how far over (+) or under (−) budget each
// category runs on average. Labor and Subs are fused into "Production" for jobs
// that carry BOTH (a PM trades one for the other), while a single-discipline job
// shows under standalone Labor or Subs — so up to five bars appear. Only
// categories with at least one budgeted job in scope are rendered.
export function EstimationCategoryWidget() {
  const { jobs, isLoading, disconnected } = useEstimationData()

  // Only categories with at least one budgeted job in scope are shown — so the
  // single-discipline Labor/Subs bars appear only when such jobs exist.
  const stats = useMemo(
    () => computeCategoryStats(jobs).filter((s) => s.jobCount > 0 && s.bias != null),
    [jobs]
  )

  const chart = useMemo(() => {
    if (stats.length === 0) return null
    const bars = stats.map((s) => ({
      label: CATEGORY_SHORT[s.key],
      value: s.bias ?? 0,
    }))
    const peak = Math.max(5, ...bars.map((b) => Math.abs(b.value)))
    const bound = niceMag(peak)
    return { bars, minValue: -bound, maxValue: bound }
  }, [stats])

  // indexValue (short label) → stat, so the bar tooltip can look up its sentence.
  const byLabel = useMemo(
    () => new Map(stats.map((s) => [CATEGORY_SHORT[s.key], s])),
    [stats]
  )

  const title = "Avg. Over / Under by Category"
  const noData = !isLoading && !disconnected && !chart

  return (
    <Widget
      title={title}
      className="estp-chart-widget estp-category-widget"
      loading={isLoading}
      disconnected={disconnected}
      noData={noData}
    >
      {chart && (
        <Chart
          config={{
            type: "bar",
            data: chart.bars,
            yFormat: formatSignedPct,
            colorBy: categoryBiasColor,
            minValue: chart.minValue,
            maxValue: chart.maxValue,
            emphasizeZero: true,
            oppositeAxisLabels: true,
            barTooltip: (indexValue) => {
              const s = byLabel.get(indexValue)
              if (!s) return null
              return (
                <div className="estp-bar-tooltip">
                  <div className="estp-bar-tooltip-lead">
                    {s.key === "production" ? "Field Spending (Labor + Subs)" : CATEGORY_SHORT[s.key]}
                  </div>
                  <div>{legendHelp(s)}</div>
                  {splitNote(s) && (
                    <div className="estp-tooltip-note estp-tooltip-note--footer estp-bar-tooltip-split">
                      {splitNote(s)}
                    </div>
                  )}
                </div>
              )
            },
          }}
        />
      )}
    </Widget>
  )
}
