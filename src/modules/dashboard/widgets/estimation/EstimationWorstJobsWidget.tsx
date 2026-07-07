import { useMemo } from "react"
import { Widget } from "../../../../shared/components/Widget/Widget"
import { useJobcostNav } from "../../../jobcost/useJobcostNav"
import { formatMoney } from "../../../../shared/utils/format"
import {
  computeWorstJobs,
  varianceColor,
  formatSignedPct,
  driverDirection,
  type VarianceDriver,
} from "./estimationMetrics"
import { useEstimationData } from "./useEstimationData"

const TOP_N = 8

// The variance-driver pill: the single budget line that moved a job furthest
// from its estimate, with that line's own signed variance % (or "no budget"
// when the spend was entirely unbudgeted). Colored by the line's over/under
// direction so the worst overruns read red at a glance.
function DriverPill({ driver, tolerance }: { driver: VarianceDriver | null; tolerance: number }) {
  if (!driver) return <span className="estp-driver-empty">—</span>
  const dir = driverDirection(driver, tolerance)
  return (
    <span className={`estp-driver-pill estp-driver-pill--${dir}`}>
      <span className="estp-driver-cat">{driver.label}</span>
      <span className="estp-driver-val">
        {driver.variancePct != null ? formatSignedPct(driver.variancePct) : "no budget"}
      </span>
    </span>
  )
}

// The completed jobs whose final cost landed furthest from their revised budget
// — the biggest estimating misses, biggest first. Each row drills into Job
// Costing so a PM can see exactly where the estimate broke down. Completed-only
// like the rest of the section (see useEstimationData).
export function EstimationWorstJobsWidget() {
  const { jobs, tolerance, isLoading, disconnected } = useEstimationData()
  const { goToJobcost } = useJobcostNav()

  const worst = useMemo(() => computeWorstJobs(jobs, TOP_N), [jobs])
  const noData = !isLoading && !disconnected && worst.length === 0

  return (
    <Widget
      title="Biggest Budget Variance"
      className="estp-worst-widget"
      loading={isLoading}
      disconnected={disconnected}
      noData={noData}
    >
      {worst.length > 0 && (
        <div className="estp-table-wrap">
          <table className="estp-table">
            <thead>
              <tr>
                <th>Job</th>
                <th className="estp-num">Budget</th>
                <th className="estp-num">Actual</th>
                <th className="estp-num">Variance</th>
                <th className="estp-driver-head">Driven by</th>
              </tr>
            </thead>
            <tbody>
              {worst.map((j) => (
                <tr
                  key={j.id}
                  className="estp-table-row-clickable"
                  role="button"
                  tabIndex={0}
                  title="Open job costing"
                  onClick={() => goToJobcost(j.id)}
                  onKeyDown={(e) => e.key === "Enter" && goToJobcost(j.id)}
                >
                  <td>
                    <span className="estp-job-name">{j.name}</span>
                    <span className="estp-job-sub">{j.supervisor ?? "Unassigned"}</span>
                  </td>
                  <td className="estp-num">{formatMoney(j.budget)}</td>
                  <td className="estp-num">{formatMoney(j.actual)}</td>
                  <td
                    className="estp-num estp-emph"
                    style={{ color: varianceColor(j.variancePct, tolerance) }}
                  >
                    {formatSignedPct(j.variancePct)}
                  </td>
                  <td className="estp-driver-cell">
                    <DriverPill driver={j.driver} tolerance={tolerance} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Widget>
  )
}
