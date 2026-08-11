import type { CSSProperties, ReactNode } from "react"
import useMarginColorsEnabled from "../../../shared/hooks/useMarginColorsEnabled"
import { SkelText } from "../../../shared/components/SkelText"
import { marginTextColor } from "../../../shared/utils/format"
import type { ProjectRow } from "./breakdownRows"
import { WATCHLIST_MARGIN_THRESHOLD } from "./breakdownRows"

export type HomeModalKind = "watchlist" | "open" | "closed"

// One segment of the home's fused stat band: big figure beside a label, with
// an optional supporting-metric sub-line when there's more to say ("2.1%
// Closed margin in 2026, 64 closed properties"). The hover wash is the
// drill-down affordance — no extra chrome.
function HomeStatSeg({
  label,
  value,
  sub,
  loading,
  warn,
  quiet,
  onClick,
  valueStyle,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  loading?: boolean
  valueStyle?: CSSProperties
  /** Red figure — something on this segment needs the PM's attention. */
  warn?: boolean
  /** Muted figure — a zero that is good news shouldn't draw the eye. */
  quiet?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="home-stat-seg"
      onClick={onClick}
      disabled={loading}
    >
      {loading ? (
        <span className="stat-widget-skeleton home-stat-seg-skel" />
      ) : (
        <span
          className={`home-stat-seg-value${warn ? " home-stat-seg-value--warn" : ""}${quiet ? " home-stat-seg-value--quiet" : ""}`}
          style={valueStyle}
        >
          {value}
        </span>
      )}
      <span className="home-stat-seg-text">
        <span className="home-stat-seg-label title3 emphasized">{label}</span>
        {sub !== undefined && (
          <span className="home-stat-seg-sub callout">
            {loading ? <SkelText ch={16} /> : sub}
          </span>
        )}
      </span>
    </button>
  )
}

/**
 * The home's portfolio stat band: one full-width fused card with three
 * drill-down segments, reading left to right as the PM thinks about their
 * book — what I'm running (Open), which of those need me (Need Attention),
 * and how the finished work landed (Closed). Shares the section's design
 * language (full-width card, hairline dividers) rather than free-floating
 * tiles of unequal size.
 */
export function StatCardRow({
  watchlistProjects,
  openProjects,
  closedProjects,
  isLoading,
  allTimeLoading,
  year,
  onOpenModal,
}: {
  watchlistProjects: ProjectRow[]
  openProjects: ProjectRow[]
  closedProjects: ProjectRow[]
  isLoading: boolean
  allTimeLoading: boolean
  year: number
  onOpenModal: (kind: HomeModalKind) => void
}) {
  const marginColorsOn = useMarginColorsEnabled()

  // Watchlist: naming the worst project makes the segment actionable at a
  // glance — the PM knows where to look before clicking anything.
  const worstProject = watchlistProjects.reduce<ProjectRow | null>(
    (worst, p) =>
      p.margin != null && (worst?.margin == null || p.margin < worst.margin) ? p : worst,
    null
  )

  // Closed: realized margin across the year's completed set.
  const closedContract = closedProjects.reduce((sum, p) => sum + p.contract, 0)
  const closedCost = closedProjects.reduce((sum, p) => sum + p.totalCost, 0)
  const closedMargin = closedContract > 0 ? ((closedContract - closedCost) / closedContract) * 100 : null

  return (
    <div className="home-stat-band">
      <HomeStatSeg
        label="Open projects"
        value={openProjects.length}
        loading={allTimeLoading}
        onClick={() => onOpenModal("open")}
      />
      <HomeStatSeg
        label="Need attention"
        value={watchlistProjects.length}
        warn={watchlistProjects.length > 0}
        quiet={watchlistProjects.length === 0}
        loading={isLoading}
        sub={
          worstProject != null && worstProject.margin != null ? (
            <>
              {worstProject.name} at{" "}
              <span className="home-stat-seg-sub-warn">
                {worstProject.margin.toFixed(1)}%
              </span>
            </>
          ) : (
            <>All projects above {WATCHLIST_MARGIN_THRESHOLD}%</>
          )
        }
        onClick={() => onOpenModal("watchlist")}
      />
      <HomeStatSeg
        label={`Closed margin in ${year}`}
        value={closedMargin != null ? `${closedMargin.toFixed(1)}%` : "—"}
        valueStyle={
          marginColorsOn && closedMargin != null
            ? { color: marginTextColor(closedMargin) }
            : undefined
        }
        loading={isLoading}
        sub={
          closedProjects.length > 0 ? (
            <>
              {closedProjects.length} closed{" "}
              {closedProjects.length === 1 ? "property" : "properties"}
            </>
          ) : (
            <>None completed in {year}</>
          )
        }
        onClick={() => onOpenModal("closed")}
      />
    </div>
  )
}
