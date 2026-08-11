import type { ReactNode } from "react"
import { useAuth } from "../../../core/auth/AuthProvider"
import useMarginColorsEnabled from "../../../shared/hooks/useMarginColorsEnabled"
import { SkelText } from "../../../shared/components/SkelText"
import { formatMoneyFull, marginTextColor } from "../../../shared/utils/format"
import { ReportWidget } from "../widgets/reports/ReportWidget"
import type { ProjectRow } from "./breakdownRows"
import { WATCHLIST_MARGIN_THRESHOLD } from "./breakdownRows"

export type HomeModalKind = "watchlist" | "open" | "closed"

// Clickable KPI tile for the home's centered stat row. Primary cards (the two
// that steer a PM's day) are larger with a bigger figure; the secondary card
// reads quieter. Every card carries one supporting metric under the figure so
// the number has context without a click.
function HomeStatCard({
  label,
  value,
  sub,
  loading,
  warn,
  secondary,
  onClick,
}: {
  label: string
  value: number
  sub: ReactNode
  loading?: boolean
  warn?: boolean
  secondary?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`home-stat-card${warn ? " home-stat-card--warn" : ""}${secondary ? " home-stat-card--secondary" : ""}`}
      onClick={onClick}
      disabled={loading}
    >
      <span className="widget-title headline">{label}</span>
      {loading ? (
        <span className="stat-widget-skeleton" />
      ) : (
        <span className="home-stat-card-value title1 emphasized">{value}</span>
      )}
      <span className="home-stat-sub caption1">{loading ? <SkelText ch={12} /> : sub}</span>
    </button>
  )
}

/**
 * The three drill-down stat cards, centered, with visual hierarchy: Watchlist
 * and Open Projects are the primary pair, Closed Projects the quieter third.
 * On the GM home the Reports pill cluster joins the row as a fourth card.
 */
export function StatCardRow({
  watchlistProjects,
  openProjects,
  closedProjects,
  isLoading,
  allTimeLoading,
  year,
  gmHome,
  onOpenModal,
}: {
  watchlistProjects: ProjectRow[]
  openProjects: ProjectRow[]
  closedProjects: ProjectRow[]
  isLoading: boolean
  allTimeLoading: boolean
  year: number
  gmHome?: boolean
  onOpenModal: (kind: HomeModalKind) => void
}) {
  const marginColorsOn = useMarginColorsEnabled()
  // Managers never see contract figures (same rule as the projects tables) —
  // their Open card totals budgets instead.
  const { claims } = useAuth()
  const isManager = claims["role"] === "manager"

  // Watchlist: the single worst margin is the number a PM acts on first.
  const worstMargin = watchlistProjects.reduce<number | null>(
    (worst, p) => (p.margin != null && (worst == null || p.margin < worst) ? p.margin : worst),
    null
  )

  const openTotal = openProjects.reduce(
    (sum, p) => sum + (isManager ? p.budget : p.contract),
    0
  )

  // Closed: realized margin across the year's completed set.
  const closedContract = closedProjects.reduce((sum, p) => sum + p.contract, 0)
  const closedCost = closedProjects.reduce((sum, p) => sum + p.totalCost, 0)
  const closedMargin = closedContract > 0 ? ((closedContract - closedCost) / closedContract) * 100 : null

  return (
    <div className="home-stat-row">
      <HomeStatCard
        label="Low-Margin Watchlist"
        value={watchlistProjects.length}
        warn={watchlistProjects.length > 0}
        loading={isLoading}
        sub={
          watchlistProjects.length > 0 && worstMargin != null ? (
            <>
              Lowest margin{" "}
              <span className="home-stat-sub-warn emphasized">{worstMargin.toFixed(1)}%</span>
            </>
          ) : (
            <>All projects above {WATCHLIST_MARGIN_THRESHOLD}%</>
          )
        }
        onClick={() => onOpenModal("watchlist")}
      />
      <HomeStatCard
        label="Open Projects"
        value={openProjects.length}
        loading={allTimeLoading}
        sub={
          openProjects.length > 0 ? (
            <>
              {isManager ? "Total budget " : "Under contract "}
              <span className="emphasized">{formatMoneyFull(openTotal)}</span>
            </>
          ) : (
            <>No projects currently open</>
          )
        }
        onClick={() => onOpenModal("open")}
      />
      <HomeStatCard
        label="Closed Projects"
        value={closedProjects.length}
        loading={isLoading}
        secondary
        sub={
          closedMargin != null ? (
            <>
              Realized margin{" "}
              <span
                className="emphasized"
                style={marginColorsOn ? { color: marginTextColor(closedMargin) } : undefined}
              >
                {closedMargin.toFixed(1)}%
              </span>
            </>
          ) : (
            <>None completed in {year}</>
          )
        }
        onClick={() => onOpenModal("closed")}
      />
      {/* GM home: the data-validation reports as a pill cluster inside a
          fourth card, so the strip belongs to the stat-card family. */}
      {gmHome && (
        <div className="gm-reports-card">
          <span className="widget-title headline">Reports</span>
          <div className="gm-reports-cluster">
            <ReportWidget reportId="reconciliation" compact />
            <ReportWidget reportId="dataQuality" compact />
            <ReportWidget reportId="missingContracts" compact />
            <ReportWidget reportId="openProjectsNoBudget" compact />
            <ReportWidget reportId="missingUnitCounts" compact />
            <ReportWidget reportId="missingOneOffNames" compact />
          </div>
        </div>
      )}
    </div>
  )
}
