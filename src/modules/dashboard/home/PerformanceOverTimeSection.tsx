import { useAuth } from "../../../core/auth/AuthProvider"
import useMarginColorsEnabled from "../../../shared/hooks/useMarginColorsEnabled"
import { MotionList, MotionItem } from "../../../shared/components/MotionList/MotionList"
import { SkelText } from "../../../shared/components/SkelText"
import { formatMoneyFull, marginTextColor } from "../../../shared/utils/format"
import { EmployeePeriodAndYearSummary } from "../widgets/EmployeePeriodAndYearSummary"
import { MarginWidget } from "../widgets/MarginWidget"
import { EmployeePerformanceWidget } from "../widgets/EmployeePerformanceWidget"
import { PerformanceCharts } from "./PerformanceCharts"
import type { Breakdown, ProjectRow } from "./breakdownRows"

function AllTimeFigure({
  label,
  value,
  loading,
  color,
}: {
  label: string
  value: string
  loading: boolean
  color?: string
}) {
  return (
    <div className="home-alltime-figure">
      <span className="home-alltime-label caption1">{label}</span>
      <span className="home-alltime-value title3 emphasized" style={color ? { color } : undefined}>
        {loading ? <SkelText ch={7} /> : value}
      </span>
    </div>
  )
}

/**
 * Section 2 of the PM/GM home: the period/year snapshot, an All Time
 * grand-totals strip (fed by the same all-time breakdown fetch the Open
 * Projects card uses), and the trend charts — the four per-employee charts
 * for PMs, the company-wide margin + employee performance pair for the GM.
 */
export function PerformanceOverTimeSection({
  monthly,
  yearly,
  isLoading,
  year,
  gmHome,
  allTimeTotals,
  allTimeRows,
  allTimeLoading,
}: {
  monthly: Breakdown["stats"]["monthly"] | undefined
  yearly: Breakdown["stats"]["yearly"] | undefined
  isLoading: boolean
  year: number
  gmHome?: boolean
  allTimeTotals: Breakdown["stats"]["totals"] | null
  allTimeRows: ProjectRow[]
  allTimeLoading: boolean
}) {
  const marginColorsOn = useMarginColorsEnabled()
  // Managers never see contract figures — the GM/admin-only Under Contract
  // figure is additionally gated on gmHome below, but keep the rule explicit.
  const { claims } = useAuth()
  const isManager = claims["role"] === "manager"

  const delivered = allTimeRows.filter((p) => p.status === 5 || p.status === 6).length
  const underContract = allTimeRows
    .filter((p) => p.status === 4)
    .reduce((sum, p) => sum + p.contract, 0)
  const allTimeMargin = allTimeTotals?.margin ?? null

  return (
    <MotionList className="widget-grid widget-grid-2 dashboard-home-grid">
      <MotionItem className="col-span-full">
        <EmployeePeriodAndYearSummary monthly={monthly} yearly={yearly} loading={isLoading} />
      </MotionItem>

      <MotionItem className="col-span-full">
        <div className="home-alltime-strip">
          <span className="home-alltime-title headline">All Time</span>
          <div className="home-alltime-figures">
            <AllTimeFigure
              label="Work Completed"
              value={formatMoneyFull(allTimeTotals?.totalIncome ?? 0)}
              loading={allTimeLoading}
            />
            <AllTimeFigure
              label="Margin"
              value={allTimeMargin != null ? `${allTimeMargin.toFixed(1)}%` : "—"}
              loading={allTimeLoading}
              color={
                marginColorsOn && allTimeMargin != null ? marginTextColor(allTimeMargin) : undefined
              }
            />
            <AllTimeFigure
              label="Projects Delivered"
              value={String(delivered)}
              loading={allTimeLoading}
            />
            {gmHome && !isManager && (
              <AllTimeFigure
                label="Under Contract"
                value={formatMoneyFull(underContract)}
                loading={allTimeLoading}
              />
            )}
          </div>
        </div>
      </MotionItem>

      {gmHome ? (
        <>
          <MotionItem>
            <MarginWidget />
          </MotionItem>
          <MotionItem>
            <EmployeePerformanceWidget />
          </MotionItem>
        </>
      ) : (
        <PerformanceCharts monthly={monthly} yearly={yearly} year={year} isLoading={isLoading} />
      )}
    </MotionList>
  )
}
