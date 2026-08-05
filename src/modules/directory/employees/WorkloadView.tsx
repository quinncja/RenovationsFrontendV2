import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Search, ChevronDown } from "lucide-react"
import { useWidgetData } from "../../../shared/context/PageContext"
import { MotionItem } from "../../../shared/components/MotionList/MotionList"
import { Widget } from "../../../shared/components/Widget/Widget"
import { EmployeeAvatar } from "../../../shared/components/EmployeeAvatar/EmployeeAvatar"
import { formatMoney, formatDate } from "../../../shared/utils/format"
import useIsMobile from "../../../shared/hooks/useIsMobile"
import { useJobcostNav } from "../../jobcost/useJobcostNav"
import { SortTh, type SortDir } from "./SortTh"
import {
  deriveWorkload,
  SPARK_MONTHS,
  type EmployeeWorkloadPayload,
  type PmWorkload,
  type WorkloadJob,
} from "./workload"

// Workload view — "who can take the next job". One row per PM: how much open
// work they hold (remaining budget, not job count), how much of it is in its
// early / mid / closing stretch, what's dormant, and the attention drains
// (low-margin watchlist, missing contracts, overdue AR). Rows expand into the
// PM's job lanes; the deep work lives on /employees/:id and /jobcost/:recnum.

type SortKey = "name" | "open" | "units" | "remaining"

// ── Tiny inline visuals ──────────────────────────────────────────────────────

// Trailing months of posted cost as a plain polyline. Fixed viewBox — the
// shape is the message (ramping up vs. winding down), not the values.
function Sparkline({ values }: { values: number[] }) {
  const w = 84
  const h = 22
  const pad = 2
  const max = Math.max(...values, 1)
  const step = (w - pad * 2) / (SPARK_MONTHS - 1)
  const points = values
    .map((v, i) => `${pad + i * step},${h - pad - (v / max) * (h - pad * 2)}`)
    .join(" ")
  const [lastX, lastY] = points.split(" ").pop()!.split(",")
  return (
    <svg className="ewl-spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden>
      <polyline points={points} fill="none" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r={2} />
    </svg>
  )
}

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
  if (pm.arOverdueBalance > 0)
    badges.push({
      key: "ar",
      className: "ewl-badge--danger",
      label: `${formatMoney(pm.arOverdueBalance)} AR`,
      title: `${pm.arOverdueInvoices} overdue ${pm.arOverdueInvoices === 1 ? "invoice" : "invoices"} (past due date + 30)`,
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
  if (months > 24) return "24+ mo left"
  if (months < 1) return "<1 mo left"
  return `≈${months} mo left`
}

// ── Expanded job lanes ───────────────────────────────────────────────────────

function JobLanes({ pm }: { pm: PmWorkload }) {
  const { goToJobcost } = useJobcostNav()
  const maxSize = Math.max(...pm.jobs.map((j) => j.contract || j.budget), 1)

  return (
    <div className="ewl-lanes">
      {pm.jobs.map((job) => {
        const size = job.contract || job.budget
        const laneWidth = Math.max(size / maxSize, 0.18) * 100
        const est = estFinishLabel(job)
        return (
          <div key={job.recnum} className="ewl-lane">
            <div className="ewl-lane-head">
              <button className="ewl-lane-name" onClick={() => goToJobcost(job.recnum)}>
                {job.name}
              </button>
              {job.clientName && <span className="ewl-lane-client">{job.clientName}</span>}
              {!job.active && <span className="ewl-badge ewl-badge--muted">Dormant</span>}
              {job.watchlist && <span className="ewl-badge ewl-badge--danger">Low margin</span>}
              {job.missingContract && <span className="ewl-badge ewl-badge--warn">No contract</span>}
            </div>
            <div className="ewl-lane-body">
              {/* The size percentage lives inside a fixed track area so a
                  full-width (largest) job can never crowd out the meta text. */}
              <div className="ewl-lane-bar-area">
                <div
                  className={`ewl-lane-bar${job.active ? "" : " ewl-lane-bar--dormant"}`}
                  style={{ width: `${laneWidth}%` }}
                  title={`${Math.round(job.pct * 100)}% of budget spent`}
                >
                  <span className={`ewl-lane-fill ewl-lane-fill--${job.bucket}`} style={{ width: `${job.pct * 100}%` }} />
                </div>
              </div>
              <span className="ewl-lane-meta caption1 text-secondary">
                {job.startDate ? `Started ${formatDate(job.startDate)}` : "No start date"}
                {" · "}
                {formatMoney(job.remaining)} remaining
                {est ? ` · ${est}` : ""}
              </span>
            </div>
          </div>
        )
      })}
      <div className="ewl-lanes-foot">
        <Link className="ewl-profile-link" to={`/employees/${pm.pmId}`}>
          View full profile →
        </Link>
      </div>
    </div>
  )
}

// ── Summary cards ────────────────────────────────────────────────────────────

function StatTile({ label, value, sub, warn, loading }: {
  label: string
  value: string
  sub?: string
  warn?: boolean
  loading: boolean
}) {
  return (
    <div className={`ewl-stat${warn ? " ewl-stat--warn" : ""}`}>
      <span className="widget-title headline">{label}</span>
      {loading ? (
        <span className="stat-widget-skeleton" />
      ) : (
        <>
          <span className="ewl-stat-value title1 emphasized">{value}</span>
          {sub && <span className="caption1 text-secondary">{sub}</span>}
        </>
      )}
    </div>
  )
}

// ── The view ─────────────────────────────────────────────────────────────────

export function WorkloadView() {
  const isMobile = useIsMobile()
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("remaining")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [openPm, setOpenPm] = useState<number | null>(null)

  const { data, isLoading } = useWidgetData<{ employeeWorkload: EmployeeWorkloadPayload | null }>([
    "employeeWorkload",
  ])
  const derived = useMemo(
    () => (data?.employeeWorkload ? deriveWorkload(data.employeeWorkload) : null),
    [data],
  )

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(key === "name" ? "asc" : "desc")
    }
  }

  const rows = useMemo(() => {
    if (!derived) return []
    const q = search.toLowerCase()
    const filtered = q ? derived.pms.filter((pm) => pm.pmName.toLowerCase().includes(q)) : derived.pms
    return [...filtered].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1
      if (sortKey === "name") return a.pmName.localeCompare(b.pmName) * dir
      if (sortKey === "open") return (a.openCount - b.openCount) * dir
      if (sortKey === "units") return (a.units - b.units) * dir
      return (a.remaining - b.remaining) * dir
    })
  }, [derived, search, sortKey, sortDir])

  const totals = derived?.totals
  const columnCount = isMobile ? 5 : 7

  return (
    <>
      <MotionItem>
        <div className="ewl-stat-row">
        <StatTile
          label="Open Phases"
          value={String(totals?.openCount ?? 0)}
          sub={totals ? `${totals.activeCount} active · ${totals.dormantCount} dormant` : undefined}
          loading={isLoading}
        />
        <StatTile
          label="Remaining Backlog"
          value={formatMoney(totals?.remaining ?? 0)}
          sub="Budget left to spend on open phases"
          loading={isLoading}
        />
        <StatTile
          label="Unassigned Backlog"
          value={formatMoney(totals?.unassignedRemaining ?? 0)}
          sub={totals ? `${totals.unassignedCount} ${totals.unassignedCount === 1 ? "phase" : "phases"} with no PM` : undefined}
          warn={(totals?.unassignedRemaining ?? 0) > 0}
          loading={isLoading}
        />
        <StatTile
          label="Watchlist"
          value={String(totals?.watchlistCount ?? 0)}
          sub="Open phases under 17% margin"
          warn={(totals?.watchlistCount ?? 0) > 0}
            loading={isLoading}
          />
        </div>
      </MotionItem>

      <MotionItem>
        <Widget loading={isLoading} noData={!isLoading && (!derived || derived.pms.length === 0)} className="co-widget">
        <div className="co-widget-toolbar">
          <div className="co-search-wrapper">
            <Search size={13} className="co-search-icon" />
            <input
              className="co-search-input"
              type="text"
              placeholder="Search employees..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="ewl-legend caption1 text-secondary">
            <span className="ewl-legend-swatch ewl-mix-early" /> Early
            <span className="ewl-legend-swatch ewl-mix-mid" /> Mid
            <span className="ewl-legend-swatch ewl-mix-closing" /> Closing
          </span>
        </div>

        {rows.length === 0 && search ? (
          <div className="co-no-results body-text text-secondary">No employees match "{search}"</div>
        ) : (
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
                {!isMobile && <th className="spend-rank-table-value ewl-th-static">Trend</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((pm) => {
                const expanded = openPm === pm.pmId
                return [
                  <tr
                    key={pm.pmId}
                    className={`spend-rank-table-row ewl-row${expanded ? " ewl-row--open" : ""}`}
                    onClick={() => setOpenPm(expanded ? null : pm.pmId)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && setOpenPm(expanded ? null : pm.pmId)}
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
                    {!isMobile && (
                      <td className="spend-rank-table-value">
                        <Sparkline values={pm.spark} />
                      </td>
                    )}
                  </tr>,
                  expanded ? (
                    <tr key={`${pm.pmId}-lanes`} className="ewl-expand-row">
                      <td colSpan={columnCount}>
                        <JobLanes pm={pm} />
                      </td>
                    </tr>
                  ) : null,
                ]
              })}
            </tbody>
          </table>
        )}
        </Widget>
      </MotionItem>
    </>
  )
}
