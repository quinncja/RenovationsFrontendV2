import { useState } from "react"
import { Link } from "react-router-dom"
import { ChevronDown } from "lucide-react"
import { EmployeeAvatar } from "../../../shared/components/EmployeeAvatar/EmployeeAvatar"
import { formatMoney, formatRelativeTime } from "../../../shared/utils/format"
import useIsMobile from "../../../shared/hooks/useIsMobile"
import { useJobcostNav } from "../../jobcost/useJobcostNav"
import { SortTh, type SortDir } from "./SortTh"
import type { PmWorkload, WorkloadJob } from "./workload"

// Workload lens — "who can take the next job". One row per PM: how much open
// work they hold (remaining budget, not job count), how much of it is in its
// early / mid / closing stretch, what's dormant, and the attention drains
// (low-margin watchlist, missing contracts). Rows expand into an airy
// sub-table of the PM's open jobs; the deep work lives on /employees/:id and
// /jobcost/:recnum.

type SortKey = "name" | "open" | "units" | "remaining"

// Open phases split by progress stretch, widths by count. One hue at three
// strengths so it reads as a progression (and survives color blindness);
// "closing" is the strongest — the share about to free the PM up.
function CompositionBar({ pm }: { pm: PmWorkload }) {
  if (pm.openCount === 0) return null
  const seg = (n: number) => `${(n / pm.openCount) * 100}%`
  return (
    <div
      className="ewl-mix"
      title={`${pm.buckets.early} early · ${pm.buckets.mid} mid · ${pm.buckets.closing} closing`}
    >
      {pm.buckets.early > 0 && <span className="ewl-mix-early" style={{ width: seg(pm.buckets.early) }} />}
      {pm.buckets.mid > 0 && <span className="ewl-mix-mid" style={{ width: seg(pm.buckets.mid) }} />}
      {pm.buckets.closing > 0 && <span className="ewl-mix-closing" style={{ width: seg(pm.buckets.closing) }} />}
    </div>
  )
}

function RiskBadges({ pm }: { pm: PmWorkload }) {
  const badges: Array<{ key: string; className: string; label: string; title: string }> = []
  if (pm.watchlistCount > 0)
    badges.push({
      key: "watch",
      className: "ewl-badge--danger",
      label: `${pm.watchlistCount} low margin`,
      title: `${pm.watchlistCount} open ${pm.watchlistCount === 1 ? "phase" : "phases"} under 17% margin`,
    })
  if (pm.missingContractCount > 0)
    badges.push({
      key: "contract",
      className: "ewl-badge--warn",
      label: `${pm.missingContractCount} no contract`,
      title: `${pm.missingContractCount} open ${pm.missingContractCount === 1 ? "phase" : "phases"} without a contract amount`,
    })
  if (badges.length === 0) return <span className="ewl-badge ewl-badge--clear">Clear</span>
  return (
    <span className="ewl-badges">
      {badges.map((b) => (
        <span key={b.key} className={`ewl-badge ${b.className}`} title={b.title}>
          {b.label}
        </span>
      ))}
    </span>
  )
}

function estFinishLabel(job: WorkloadJob): string | null {
  if (!job.active) return null
  if (job.estMonthsLeft === null) return null
  const months = Math.round(job.estMonthsLeft)
  // Beyond a year the remaining/burn ratio is noise, not a forecast.
  if (months > 12) return "12+ mo"
  if (months < 1) return "<1 mo"
  return `≈${months} mo`
}

// ── Expanded sub-table: the PM's open jobs ───────────────────────────────────

function OpenJobsPanel({ pm }: { pm: PmWorkload }) {
  const { goToJobcost } = useJobcostNav()

  return (
    <div className="ewl-subpanel">
      <div className="ewl-subscroll">
        <table className="ewl-subtable">
          {/* Fixed layout: the columns hold these shares at any viewport
              width, so wide screens spread the data instead of dumping all
              the slack into the name column. */}
          <colgroup>
            <col style={{ width: "34%" }} />
            <col style={{ width: "17%" }} />
            <col style={{ width: "21%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "14%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Project</th>
              <th>Last activity</th>
              <th>Progress</th>
              <th className="ewl-num">Remaining</th>
              <th className="ewl-num">Est. finish</th>
            </tr>
          </thead>
          <tbody>
            {pm.jobs.map((job) => (
              <tr key={job.recnum} onClick={() => goToJobcost(job.recnum)}>
                <td>
                  <div className="ewl-sub-primary">
                    <span className="ewl-sub-name">{job.name}</span>
                    {job.watchlist && <span className="ewl-badge ewl-badge--danger">Low margin</span>}
                    {job.missingContract && <span className="ewl-badge ewl-badge--warn">No contract</span>}
                  </div>
                  <div className="ewl-sub-secondary">{job.clientName ?? `#${job.recnum}`}</div>
                </td>
                <td className="ewl-quiet">
                  {job.lastActivity ? formatRelativeTime(job.lastActivity) : "—"}
                  {!job.active && <span className="ewl-badge ewl-badge--muted">Dormant</span>}
                </td>
                <td>
                  {job.pct === 0 ? (
                    <span className="ewl-quiet">Not started</span>
                  ) : (
                    <div className="ewl-progress-cell" title={`${Math.round(job.pct * 100)}% of budget spent`}>
                      <span className="ewl-progress-track">
                        <span
                          className={`ewl-progress-fill ewl-mix-${job.bucket}`}
                          style={{ width: `${job.pct * 100}%` }}
                        />
                      </span>
                      <span className="ewl-quiet ewl-progress-pct">{Math.round(job.pct * 100)}%</span>
                    </div>
                  )}
                </td>
                <td className="ewl-num ewl-sub-strong">{formatMoney(job.remaining)}</td>
                <td className="ewl-num ewl-quiet">{estFinishLabel(job) ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ewl-subfoot">
        <Link className="ewl-profile-link" to={`/employees/${pm.pmId}`}>
          View full profile →
        </Link>
      </div>
    </div>
  )
}

// ── The lens ─────────────────────────────────────────────────────────────────

export function WorkloadTable({
  pms,
  expandedId,
  onToggleRow,
}: {
  pms: PmWorkload[]
  expandedId: number | null
  onToggleRow: (id: number) => void
}) {
  const isMobile = useIsMobile()
  const [sortKey, setSortKey] = useState<SortKey>("remaining")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(key === "name" ? "asc" : "desc")
    }
  }

  const sorted = [...pms].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1
    if (sortKey === "name") return a.pmName.localeCompare(b.pmName) * dir
    if (sortKey === "open") return (a.openCount - b.openCount) * dir
    if (sortKey === "units") return (a.units - b.units) * dir
    return (a.remaining - b.remaining) * dir
  })

  const columnCount = isMobile ? 5 : 6

  return (
    <table className="spend-rank-table spend-rank-table--airy ewl-table">
      <thead>
        <tr>
          <SortTh col="name" label="Employee" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <SortTh col="open" label="Open" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          {!isMobile && (
            <SortTh col="units" label="Units" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          )}
          <SortTh col="remaining" label="Remaining" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <th className="spend-rank-table-value ewl-th-static">Progress</th>
          <th className="spend-rank-table-value ewl-th-static">Risk</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((pm) => {
          const expanded = expandedId === pm.pmId
          return [
            <tr
              key={pm.pmId}
              className={`spend-rank-table-row ewl-row${expanded ? " ewl-row--open" : ""}`}
              onClick={() => onToggleRow(pm.pmId)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && onToggleRow(pm.pmId)}
              aria-expanded={expanded}
            >
              <td className="spend-rank-table-name body-text">
                <div className="emp-perf-name-cell">
                  <EmployeeAvatar firstName={pm.firstName} lastName={pm.lastName} />
                  <span
                    className="emp-perf-name body-text emphasized"
                    style={pm.pmId === 0 ? { fontStyle: "italic" } : undefined}
                  >
                    {pm.pmName}
                  </span>
                  <ChevronDown size={13} className={`ewl-chevron${expanded ? " ewl-chevron--open" : ""}`} />
                </div>
              </td>
              <td className="spend-rank-table-value body-text emphasized">
                {pm.openCount}
                {pm.dormantCount > 0 && (
                  <span className="ewl-dormant caption1"> · {pm.dormantCount} dormant</span>
                )}
              </td>
              {!isMobile && (
                <td className="spend-rank-table-value body-text emphasized">{pm.units || "—"}</td>
              )}
              <td className="spend-rank-table-value body-text emphasized">{formatMoney(pm.remaining)}</td>
              <td className="spend-rank-table-value">
                <CompositionBar pm={pm} />
              </td>
              <td className="spend-rank-table-value">
                <RiskBadges pm={pm} />
              </td>
            </tr>,
            expanded ? (
              <tr key={`${pm.pmId}-jobs`} className="ewl-expand-row">
                <td colSpan={columnCount}>
                  <OpenJobsPanel pm={pm} />
                </td>
              </tr>
            ) : null,
          ]
        })}
      </tbody>
    </table>
  )
}
