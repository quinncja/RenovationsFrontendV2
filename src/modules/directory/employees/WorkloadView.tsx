import { useMemo, useState } from "react"
import { formatMoney, formatRelativeTime } from "../../../shared/utils/format"
import { useJobcostNav } from "../../jobcost/useJobcostNav"
import { SortTh, type SortDir } from "../../../shared/components/SortTh"
import type { PmWorkload, WorkloadJob } from "./workload"

// Workload lens pieces — "who can take the next job". Each PM's card head
// (EmployeesPage) carries how much open work they hold (remaining budget, not
// job count), the progress mix, and the attention drains (low-margin
// watchlist, missing contracts); the card expands into the open-jobs table
// below. The deep work lives on /employees/:id and /jobcost/:recnum.

// Open phases split by progress stretch, widths by count. One hue at three
// strengths so it reads as a progression (and survives color blindness);
// "closing" is the strongest — the share about to free the PM up.
export function CompositionBar({ pm }: { pm: PmWorkload }) {
  // Buckets only cover started jobs (upcoming ones sit outside the mix), so
  // the bar divides by the bucket sum, not the open count.
  const started = pm.buckets.early + pm.buckets.mid + pm.buckets.closing
  if (started === 0) return null
  const seg = (n: number) => `${(n / started) * 100}%`
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

export function RiskBadges({ pm }: { pm: PmWorkload }) {
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

// ── Client / property mix ────────────────────────────────────────────────────

// The overview of who an employee works WITH and WHERE: each client's (or
// property's) share of the weighted total (Workload weighs by remaining
// backlog, Performance by year cost). Top three ranked, the tail folded into
// one "+N more" slice whose tooltip lists the full breakdown. Weightless sets
// (e.g. every job at $0 remaining) fall back to counting jobs so the mix
// stays meaningful.
export interface ClientShare {
  label: string
  pct: number
  title?: string
}

export function clientShares(
  rows: { client: string | null; weight: number }[],
  fallbackLabel = "No client",
): ClientShare[] {
  const fallbackToCount = rows.every((r) => r.weight <= 0)
  const totals = new Map<string, number>()
  let sum = 0
  for (const row of rows) {
    const w = fallbackToCount ? 1 : Math.max(row.weight, 0)
    if (w <= 0) continue
    const key = row.client?.trim() || fallbackLabel
    totals.set(key, (totals.get(key) ?? 0) + w)
    sum += w
  }
  if (sum <= 0) return []
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1])
  const shares: ClientShare[] = ranked.slice(0, 3).map(([label, w]) => ({ label, pct: (w / sum) * 100 }))
  const rest = ranked.slice(3)
  if (rest.length === 1) {
    // A tail of one is just the fourth client — folding it would hide a name.
    shares.push({ label: rest[0][0], pct: (rest[0][1] / sum) * 100 })
  } else if (rest.length > 1) {
    const restSum = rest.reduce((t, [, w]) => t + w, 0)
    shares.push({
      label: `+${rest.length} more`,
      pct: (restSum / sum) * 100,
      title: rest.map(([l, w]) => `${l} ${Math.round((w / sum) * 100)}%`).join(" · "),
    })
  }
  return shares
}

export function ClientMixStrip({ title = "Clients", shares }: { title?: string; shares: ClientShare[] }) {
  if (shares.length === 0) return null
  const pctLabel = (p: number) => (p < 1 ? "<1" : String(Math.round(p)))
  return (
    <div className="emp-client-mix">
      <span className="emp-client-mix-title">{title}</span>
      <span className="emp-client-mix-bar">
        {shares.map((s, i) => (
          <span key={s.label} className={`emp-cmix-${Math.min(i, 3)}`} style={{ width: `${s.pct}%` }} />
        ))}
      </span>
      <span className="emp-client-mix-legend caption1 text-secondary">
        {shares.map((s, i) => (
          <span key={s.label} className="emp-client-mix-entry" title={s.title}>
            <span className={`ewl-legend-swatch emp-cmix-${Math.min(i, 3)}`} />
            {s.label} {pctLabel(s.pct)}%
          </span>
        ))}
      </span>
    </div>
  )
}

// ── Expanded panel: the PM's open jobs ───────────────────────────────────────

type JobSortKey = "name" | "units" | "budget" | "remaining" | "progress" | "activity"

export function OpenJobsPanel({ pm }: { pm: PmWorkload }) {
  const { goToJobcost } = useJobcostNav()
  // Same sortable headers as the app's project tables, with the Jobcost
  // three-click cycle: natural direction → reversed → cleared (back to the
  // derivation's remaining-desc order, no active column).
  const [sort, setSort] = useState<{ key: JobSortKey | null; dir: SortDir }>({ key: null, dir: "desc" })
  function handleSort(key: JobSortKey) {
    // Text columns default asc, numeric columns default desc.
    const defaultDir: SortDir = key === "name" ? "asc" : "desc"
    setSort((s) => {
      if (s.key !== key) return { key, dir: defaultDir }
      if (s.dir === defaultDir) return { key, dir: defaultDir === "asc" ? "desc" : "asc" }
      return { key: null, dir: "desc" }
    })
  }

  const sorted = useMemo(() => {
    // Cleared sort = the derivation's order (remaining desc).
    if (sort.key == null) return pm.jobs
    const dir = sort.dir === "asc" ? 1 : -1
    return [...pm.jobs].sort((a, b) => {
      if (sort.key === "name") return a.name.localeCompare(b.name) * dir
      if (sort.key === "activity") {
        // Never-touched jobs sink to the end regardless of direction.
        const am = a.lastActivity ? new Date(a.lastActivity).getTime() : null
        const bm = b.lastActivity ? new Date(b.lastActivity).getTime() : null
        if ((am == null) !== (bm == null)) return am == null ? 1 : -1
        return ((am ?? 0) - (bm ?? 0)) * dir
      }
      if (sort.key === "progress") return (a.pct - b.pct) * dir
      if (sort.key === "units") return (a.units - b.units) * dir
      if (sort.key === "budget") return (a.budget - b.budget) * dir
      return (a.remaining - b.remaining) * dir
    })
  }, [pm.jobs, sort])

  return (
    <div className="ewl-expand-region">
      {pm.jobs.length === 0 ? (
        <p className="ewl-sub-empty body-text text-secondary">No open jobs.</p>
      ) : (
        <>
        {/* Overview before the phases: who the employee works with (clients)
           and where they work (properties), both weighted by remaining
           backlog. */}
        <div className="emp-overview">
          <ClientMixStrip
            shares={clientShares(pm.jobs.map((j) => ({ client: j.clientName, weight: j.remaining })))}
          />
          <ClientMixStrip
            title="Properties"
            shares={clientShares(
              pm.jobs.map((j) => ({ client: j.property, weight: j.remaining })),
              "No property",
            )}
          />
        </div>
        {/* The app-standard full-width data-table, exactly like every other
           nested projects table (EmployeeDetail's ProjectsTable, directory
           Jobs tables) — full width inside the card body's quiet wash that
           marks the rows as belonging to the PM above. */}
        <table className="data-table">
          <thead>
            <tr>
              <SortTh col="name" label="Project" sortKey={sort.key} sortDir={sort.dir} onSort={handleSort} />
              <SortTh col="units" label="Units" align="right" sortKey={sort.key} sortDir={sort.dir} onSort={handleSort} />
              <SortTh col="budget" label="Budget" align="right" sortKey={sort.key} sortDir={sort.dir} onSort={handleSort} />
              <SortTh col="remaining" label="Remaining" align="right" sortKey={sort.key} sortDir={sort.dir} onSort={handleSort} />
              <SortTh col="progress" label="Progress" sortKey={sort.key} sortDir={sort.dir} onSort={handleSort} />
              <SortTh col="activity" label="Last activity" sortKey={sort.key} sortDir={sort.dir} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((job) => (
              <tr
                key={job.recnum}
                className="clickable-row"
                onClick={() => goToJobcost(job.recnum)}
                tabIndex={0}
                role="button"
                onKeyDown={(e) => e.key === "Enter" && goToJobcost(job.recnum)}
              >
                <td>
                  <div className="cell-primary ewl-name-line">
                    {job.name}
                    {job.watchlist && <span className="ewl-badge ewl-badge--danger">Low margin</span>}
                    {job.missingContract && <span className="ewl-badge ewl-badge--warn">No contract</span>}
                  </div>
                  <div className="cell-secondary">#{job.recnum}</div>
                </td>
                <td style={{ textAlign: "right" }}>{job.units > 0 ? job.units : "—"}</td>
                <td style={{ textAlign: "right" }}>{formatMoney(job.budget)}</td>
                <td style={{ textAlign: "right" }}>{formatMoney(job.remaining)}</td>
                <td>
                  {job.pct === 0 ? (
                    <span className="text-secondary">Not started</span>
                  ) : (
                    <div className="ewl-progress-cell" title={`${Math.round(job.pct * 100)}% of budget spent`}>
                      <span className="ewl-progress-track">
                        <span
                          className={`ewl-progress-fill ewl-mix-${job.bucket}`}
                          style={{ width: `${job.pct * 100}%` }}
                        />
                      </span>
                      <span className="text-secondary ewl-progress-pct">{Math.round(job.pct * 100)}%</span>
                    </div>
                  )}
                </td>
                <td className="text-secondary">
                  {/* Upcoming jobs skip the dash — silence is expected, the
                      badge alone says why. */}
                  {job.lastActivity ? formatRelativeTime(job.lastActivity) : job.upcoming ? null : "—"}
                  {job.upcoming ? (
                    <span className="ewl-badge ewl-badge--muted">Upcoming</span>
                  ) : (
                    !job.active && <span className="ewl-badge ewl-badge--muted">Dormant</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </>
      )}
    </div>
  )
}
