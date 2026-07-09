import type { MetricDef } from "./metricDefs"
import type { ReportMetricKey, ReportSummary } from "./reportTypes"

/**
 * The single source of truth for a metric tile's face — the category pill, the
 * headline value, its label, and the optional meta line. Every activity-report
 * surface renders this exact markup (the daily-recap modal and Reports page via
 * MetricTile below; the full-screen arrival inside its own animated wrapper; the
 * loading skeleton behind its shimmer), so the tiles are identical everywhere.
 */
export function MetricTileFace({
  metric,
  summary,
}: {
  metric: MetricDef
  summary: ReportSummary
}) {
  const { value, meta, label } = metric.parts(summary)
  return (
    <>
      <span className={`rcnt-pill rcnt-pill--${metric.pillKind} rpt-tile-pill`}>{metric.pill}</span>
      <span className="rpt-tile-value">{value}</span>
      <span className="rpt-tile-label">{label ?? metric.label}</span>
      {meta && <span className="rpt-tile-meta">{meta}</span>}
    </>
  )
}

/**
 * The standalone clickable tile — used wherever no entrance choreography is
 * needed (MetricGrid, i.e. the daily-recap modal and the Reports page). The
 * arrival builds its own motion wrapper around <MetricTileFace> instead.
 */
export function MetricTile({
  metric,
  summary,
  onOpen,
}: {
  metric: MetricDef
  summary: ReportSummary
  onOpen: (key: ReportMetricKey) => void
}) {
  return (
    <button type="button" className="rpt-tile" onClick={() => onOpen(metric.key)}>
      <MetricTileFace metric={metric} summary={summary} />
    </button>
  )
}
