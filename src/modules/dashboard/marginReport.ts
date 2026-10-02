// Margin Report has two bases: annual/monthly book figures use selected-year
// invoices and posted costs (plus optional WIP); client/property groups use
// projectJobs, the full-job contract and committed + spent from job-cost detail.
// The year selects eligible project jobs without truncating their financials.

import { oneoffFromRecnum } from "../jobcost/jobcostShared"

export interface MarginReportRow {
  memberRecnums?: string[]
  recnum: string
  jobName: string
  status: number
  closed: boolean
  unitCount: number
  contract: number
  revenue: number
  cost: number
  overUnder: number
  completionYear: number | null
  completionMonth: number | null
  pmId: number | null
  pmName: string | null
  clientId: number | null
  clientName: string | null
  parent: string | null
  oneoff: number | null
  oofnme: string | null
}

export interface MarginMonthSlice {
  recnum: string
  /** 1–12, or 13 for year-end adjustments. */
  month: number
  revenue: number
  cost: number
}

export interface MarginReportPayload {
  year: number
  jobs: MarginReportRow[]
  /** Full-job contract and committed + spent for the year-eligible jobs. */
  projectJobs?: MarginReportRow[]
  /** Per job, per posting month — the Monthly Margin table's rows. */
  monthly: MarginMonthSlice[]
  /** Company book totals for the year (no job attribution). */
  totals: { revenue: number; cost: number }
}

export type JobKind = "phase" | "oneoff"

export interface MarginJob {
  memberRecnums?: string[]
  basis?: "book" | "project"
  recnum: string
  name: string
  closed: boolean
  kind: JobKind
  /** Property key: actr_u.parent for phase work; the one-off's own name otherwise. */
  property: string
  /** True when `property` is a real Sage parent (routable to /jobcost/property). */
  hasParent: boolean
  units: number
  contract: number
  /** Annual book revenue, or full contract when basis is project. */
  revenue: number
  /** Cost-to-cost over/under folded into `revenue` (0 when off / closed). */
  wip: number
  cost: number
  grossProfit: number
  /** Percent (0–100 scale), or null when revenue is 0. */
  margin: number | null
  completionMonth: number | null
  pmId: number | null
  pmName: string | null
  clientId: number | null
  clientName: string
}

export type Scope = "all" | "closed"

export const SCOPE_OPTIONS = [
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
] as const

export function scopeLabel(scope: Scope): string {
  return scope === "closed" ? "Closed" : "All"
}

export function normalizeJob(r: MarginReportRow, includeWip: boolean): MarginJob {
  const kind: JobKind = r.oneoff != null ? (r.oneoff === 1 ? "oneoff" : "phase") : oneoffFromRecnum(r.recnum) ? "oneoff" : "phase"
  const contract = r.contract || 0
  const cost = r.cost || 0
  const wip = includeWip && !r.closed ? r.overUnder || 0 : 0
  const revenue = (r.revenue || 0) + wip
  const grossProfit = revenue - cost
  const parent = r.parent?.trim() || null
  const displayName = kind === "oneoff" ? r.oofnme?.trim() || r.jobName : r.jobName
  return {
    memberRecnums: r.memberRecnums ?? [r.recnum],
    recnum: r.recnum,
    name: displayName,
    closed: r.closed,
    kind,
    property: kind === "phase" && parent ? parent : parent ?? displayName,
    hasParent: kind === "phase" && parent != null,
    units: r.unitCount || 0,
    contract,
    revenue,
    wip,
    cost,
    grossProfit,
    margin: revenue !== 0 ? (grossProfit / Math.abs(revenue)) * 100 : null,
    completionMonth: r.completionMonth,
    pmId: r.pmId,
    pmName: r.pmName,
    clientId: r.clientId,
    clientName: r.clientName?.trim() || "No client",
  }
}

/** Project detail basis: no annual truncation or WIP adjustment. */
export function normalizeProjectJob(r: MarginReportRow): MarginJob {
  const job = normalizeJob({ ...r, revenue: r.contract, overUnder: 0 }, false)
  return { ...job, basis: "project", margin: job.contract > 0 ? job.grossProfit / job.contract * 100 : null }
}

export function inScope(job: MarginJob, scope: Scope): boolean {
  return scope === "all" ? true : job.closed
}

export interface MarginTotals {
  jobs: number
  units: number
  contract: number
  revenue: number
  wip: number
  cost: number
  grossProfit: number
  /** Revenue-weighted margin %, null with no revenue. */
  margin: number | null
}

export function totalsOf(jobs: MarginJob[]): MarginTotals {
  let units = 0
  let contract = 0
  let revenue = 0
  let wip = 0
  let cost = 0
  for (const j of jobs) {
    units += j.units
    contract += j.contract
    revenue += j.revenue
    wip += j.wip
    cost += j.cost
  }
  const totals = withMargin({ jobs: jobs.length, units, contract, revenue, wip, cost })
  if (jobs.length > 0 && jobs.every(j => j.basis === "project") && contract <= 0) totals.margin = null
  return totals
}

/** Finish a totals record from its parts (also used for the tie-out row). */
export function withMargin(t: Omit<MarginTotals, "grossProfit" | "margin">): MarginTotals {
  const grossProfit = t.revenue - t.cost
  return { ...t, grossProfit, margin: t.revenue !== 0 ? (grossProfit / Math.abs(t.revenue)) * 100 : null }
}

// ── Margin bands (distribution strip) ─────────────────────────────────────
export interface MarginBand {
  key: string
  label: string
  /** Inclusive lower bound, exclusive upper (percent). */
  min: number
  max: number
}

export const MARGIN_BANDS: MarginBand[] = [
  { key: "loss", label: "Loss", min: -Infinity, max: 0 },
  { key: "b0", label: "0–10%", min: 0, max: 10 },
  { key: "b10", label: "10–20%", min: 10, max: 20 },
  { key: "b20", label: "20–30%", min: 20, max: 30 },
  { key: "b30", label: "30–40%", min: 30, max: 40 },
  { key: "b40", label: "40%+", min: 40, max: Infinity },
]

export function bandOf(margin: number | null): MarginBand | null {
  if (margin == null) return null
  return MARGIN_BANDS.find((b) => margin >= b.min && margin < b.max) ?? null
}

// ── Group rollups (client / property) ─────────────────────────────────────
export interface MarginGroup extends MarginTotals {
  key: string
  name: string
  id: number | null
  /** Property groups: routable when at least one member is a real phase parent. */
  routable: boolean
  members: MarginJob[]
  /** Share of the scoped gross profit this group carries (signed). */
  share: number
}

function finishGroups(map: Map<string, { name: string; id: number | null; routable: boolean; members: MarginJob[] }>): MarginGroup[] {
  const groups = [...map.entries()].map(([key, g]) => ({ key, ...g, ...totalsOf(g.members), share: 0 }))
  const gpTotal = groups.reduce((s, g) => s + Math.abs(g.grossProfit), 0)
  for (const g of groups) g.share = gpTotal > 0 ? (g.grossProfit / gpTotal) * 100 : 0
  return groups
}

export function groupByClient(jobs: MarginJob[]): MarginGroup[] {
  const map = new Map<string, { name: string; id: number | null; routable: boolean; members: MarginJob[] }>()
  for (const j of jobs) {
    const key = j.clientId != null ? String(j.clientId) : `name:${j.clientName}`
    const g = map.get(key) ?? { name: j.clientName, id: j.clientId, routable: j.clientId != null, members: [] }
    g.members.push(j)
    map.set(key, g)
  }
  return finishGroups(map)
}

export function groupByProperty(jobs: MarginJob[]): MarginGroup[] {
  const map = new Map<string, { name: string; id: number | null; routable: boolean; members: MarginJob[] }>()
  for (const j of jobs) {
    const g = map.get(j.property) ?? { name: j.property, id: null, routable: false, members: [] }
    g.members.push(j)
    if (j.hasParent) g.routable = true
    map.set(j.property, g)
  }
  return finishGroups(map)
}

// ── Monthly rows (posting month) ──────────────────────────────────────────
// One row per posting month, newest first. The HEADER figures are the GL
// margin chart's own rows (marginPerformance: revenue / total_expenses per
// month, plus the company over/under on the open month when WIP is folded
// in) — identical to the bar by construction. The members are each job's
// allocated share of that month, and `residual` is what the jobs don't
// account for (postings with no linked job, plus the WIP), shown as a final
// "Not on a job" line so the list always sums to the header.
export interface MarginBookMonth {
  month: number
  revenue: number
  cost: number
}

export interface MarginMonthRow extends MarginTotals {
  /** 1–12, or 13 for year-end adjustments. */
  key: number
  label: string
  members: MarginJob[]
  residual: { revenue: number; cost: number }
}

export function buildMonthRows(
  jobs: MarginJob[],
  slices: MarginMonthSlice[],
  book: MarginBookMonth[],
  openMonth: number | null,
  openMonthOverUnder: number,
  monthLabel: (m: number) => string
): MarginMonthRow[] {
  const byRecnum = new Map(jobs.map((j) => [j.recnum, j]))
  const byMonth = new Map<number, MarginJob[]>()
  for (const sl of slices) {
    const job = byRecnum.get(sl.recnum)
    if (!job) continue
    if (sl.revenue === 0 && sl.cost === 0) continue
    const grossProfit = sl.revenue - sl.cost
    const list = byMonth.get(sl.month) ?? []
    list.push({
      ...job,
      revenue: sl.revenue,
      wip: 0,
      cost: sl.cost,
      grossProfit,
      margin: sl.revenue !== 0 ? (grossProfit / Math.abs(sl.revenue)) * 100 : null,
    })
    byMonth.set(sl.month, list)
  }
  const bookByMonth = new Map(book.map((b) => [b.month, b]))
  const months = [...new Set([...bookByMonth.keys(), ...byMonth.keys()])].sort((a, b) => b - a)
  return months.map((m) => {
    const members = byMonth.get(m) ?? []
    const bk = bookByMonth.get(m) ?? { month: m, revenue: 0, cost: 0 }
    const wip = openMonth != null && m === openMonth ? openMonthOverUnder : 0
    const revenue = bk.revenue + wip
    const cost = bk.cost
    const attributed = totalsOf(members)
    return {
      key: m,
      label: m === 13 ? "Year-end adjustments" : monthLabel(m),
      members,
      residual: { revenue: revenue - attributed.revenue, cost: cost - attributed.cost },
      ...withMargin({
        jobs: members.length,
        units: attributed.units,
        contract: attributed.contract,
        revenue,
        wip,
        cost,
      }),
    }
  })
}
