import { SkelText } from "../SkelText"
import useIsMobile from "../../hooks/useIsMobile"

// Content-mirroring loading stand-ins for the Chart components, for use with
// Widget's `skeleton` prop. Each renders the REAL chart-layout classes
// (.pie-with-list, .chart-container, .spend-list …) so the skeleton and the
// loaded chart share one geometry source — width/height tuning on those
// classes applies to both states and the card can't change size when data
// lands.

// Varied name widths so the ghost list reads as content, not stripes.
const PIE_ROW_CH = [11, 8, 13, 7, 10]

/** Mirrors Chart's "pie-with-list": donut on the left (desktop only, same as
 *  the loaded chart), ranked list on the right. Match `chartSize` and
 *  `rows`/`showPercent` to the loaded config so the footprint is identical. */
export function PieWithListSkeleton({
  chartSize = "sm",
  rows = 5,
  showPercent = false,
}: {
  chartSize?: "sm" | "md" | "lg"
  rows?: number
  showPercent?: boolean
}) {
  const isMobile = useIsMobile()
  return (
    <div className="pie-with-list" aria-hidden="true">
      {!isMobile && (
        <div className={`pie-with-list-chart pie-with-list-chart--${chartSize}`}>
          <div className="skel-donut" />
        </div>
      )}
      <ol className="spend-list">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="spend-list-item">
            <span className="spend-list-dot" style={{ background: "var(--border-color)" }} />
            <span className="spend-list-name body-text">
              <SkelText ch={PIE_ROW_CH[i % PIE_ROW_CH.length]} />
            </span>
            {showPercent && (
              <span className="spend-list-percent body-text">
                <SkelText ch={4} />
              </span>
            )}
            <span className="spend-list-value body-text emphasized">
              <SkelText ch={7} />
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Mirrors the plot area of Chart's line/bar types: one shimmer filling the
 *  same .chart-container the loaded plot renders into, so per-widget height
 *  overrides on that class size both states. */
export function ChartAreaSkeleton() {
  return (
    <div className="chart-container chart-container--skel" aria-hidden="true">
      <div className="skel-fill" />
    </div>
  )
}
