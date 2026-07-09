import type { ReportMetricKey, ReportSummary } from "./reportTypes"
import { SECTIONS, ZERO_SUMMARY, visibleMetrics, metricsFor } from "./metricDefs"
import { MetricTile, MetricTileFace } from "./MetricTile"

/**
 * The report's headline grid, split into its two logs — Job Activity and
 * Billing & Cash — each with its own little section title. Every tile drills
 * into its category's item list. PM-scoped reports drop the AR metrics, so a
 * section renders only when it has tiles.
 */
export function MetricGrid({
  summary,
  onOpen,
}: {
  summary: ReportSummary
  onOpen: (key: ReportMetricKey) => void
}) {
  const metrics = visibleMetrics(summary)
  const sections = SECTIONS.map((s) => ({
    ...s,
    tiles: metrics.filter((m) => m.section === s.key),
  })).filter((s) => s.tiles.length > 0)

  // A four-tile section (PM Job Activity) needs a wider column cap than the
  // three-up default so its tiles keep the three-up per-tile width instead of
  // being squeezed — same intent as the recap modal's --wide variant.
  const wide = sections.some((s) => s.tiles.length >= 4)

  return (
    <div className={`rpt-sections${wide ? " rpt-sections--wide" : ""}`}>
      {sections.map((section) => (
        <div key={section.key} className="rpt-section">
          {/* Section titles only earn their place when there's more than one
              section to tell apart — PM reports have just Job Activity, so the
              header is redundant noise and is dropped. */}
          {sections.length > 1 && <span className="rpt-section-title">{section.title}</span>}
          <div className={`rpt-grid rpt-grid--cols-${section.tiles.length}`}>
            {section.tiles.map((m) => (
              <MetricTile key={m.key} metric={m} summary={summary} onOpen={onOpen} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Loading placeholder that mirrors MetricGrid's real layout — titled sections of
 * three tiles — so the recap doesn't reflow when data lands. The section titles
 * are static constants, so they render as their real labels. Each tile renders
 * the real MetricTileFace (from the zero summary) to fix its exact height, hidden
 * behind the shared dashboard shimmer overlay (.rpt-tile--skeleton). PM-scoped
 * reports show only the Job Activity section, matching load.
 */
export function MetricGridSkeleton({ pmScoped = false }: { pmScoped?: boolean }) {
  const metrics = metricsFor(pmScoped)
  const sections = SECTIONS.map((s) => ({
    ...s,
    tiles: metrics.filter((m) => m.section === s.key),
  })).filter((s) => s.tiles.length > 0)

  // Match MetricGrid: a four-tile section widens the column so the skeleton
  // doesn't reflow when the real four-up grid lands.
  const wide = sections.some((s) => s.tiles.length >= 4)

  return (
    <div className={`rpt-sections${wide ? " rpt-sections--wide" : ""}`} aria-hidden="true">
      {sections.map((section) => (
        <div key={section.key} className="rpt-section">
          {sections.length > 1 && <span className="rpt-section-title">{section.title}</span>}
          <div className={`rpt-grid rpt-grid--cols-${section.tiles.length}`}>
            {section.tiles.map((m) => (
              <div key={m.key} className="rpt-tile rpt-tile--skeleton">
                <MetricTileFace metric={m} summary={ZERO_SUMMARY} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
