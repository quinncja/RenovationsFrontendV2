// Derivations for the Employees page Workload view. The backend's
// `employeeWorkload` payload is deliberately raw — open phases with the
// standard grid financials, per-job posted costs by accounting month, and
// per-job last-entry dates — and everything "who can take the next job"
// needs is computed here, so the SQL stays simple and the rules (dormancy,
// buckets, burn rate) live in one testable place.

export interface WorkloadPhase {
  recnum: string
  name: string | null
  jobnme: string | null
  status: number
  unitCount: number | string | null
  startDate: string | null
  totalContract: number
  pmId: number | null
  pmName: string | null
  clientName: string | null
  /** Sage actr_u.parent — the shared-address property grouping key. */
  parent?: string | null
  /** actr_u.oneoff — 1 marks a non-phase (one-off) project. */
  oneoff?: number | null
  /** actr_u.oofnme — the one-off's given display name (newer one-offs only). */
  oofnme?: string | null
  /** Posted + committed (the grid's combined figure). */
  totalCost: number
  totalCommitted: number
  budget: number
  /** Contract-basis margin %, same formula the watchlist uses. */
  margin: number
}

export interface WorkloadActivityRow {
  jobnum: number
  postyr: number
  actprd: number
  cost: number
}

export type ActivityKind = "cost" | "po" | "subcontract" | "changeOrder"

export interface WorkloadLastActivityRow {
  jobnum: number
  /** Most recent insdte/entdte across cost lines, POs, subcontracts, COs. */
  lastActivity: string
  /** What that most recent entry was (older payloads may lack these). */
  kind?: ActivityKind
  description?: string | null
  amount?: number | string | null
  vendorName?: string | null
  /** Change orders only: 1 when approved. */
  approved?: number | null
  /** Cost lines only: how many lines (and their total) share the winner's day. */
  sameDayCount?: number | string | null
  sameDayTotal?: number | string | null
}

export interface ActivityDetail {
  kind: ActivityKind
  description: string | null
  amount: number | null
  vendorName: string | null
  approved: boolean
  sameDayCount: number
  sameDayTotal: number
}

export interface WorkloadMonthlyRow {
  sprvsr: number | null
  postyr: number
  actprd: number
  cost: number
}

export interface EmployeeWorkloadPayload {
  phases: WorkloadPhase[]
  activity: WorkloadActivityRow[]
  lastActivity: WorkloadLastActivityRow[]
  /** Unused by the view since the AR pill was cut; still in the payload. */
  arOverdue: unknown[]
  monthly: WorkloadMonthlyRow[]
  openPeriod: { postyr: number; actprd: number } | null
  /** Server's Chicago "today" — the dormancy window's reference point. */
  asOf: string
}

export type ProgressBucket = "early" | "mid" | "closing"

export interface WorkloadJob {
  recnum: string
  name: string
  clientName: string | null
  /** Property (parent address) the job belongs to, null when unassigned. */
  property: string | null
  startDate: string | null
  contract: number
  budget: number
  cost: number
  remaining: number
  /** 0–1, cost ÷ budget (clamped). */
  pct: number
  bucket: ProgressBucket
  /** Anything entered against the job — cost lines, POs, subcontracts,
   *  change orders — within the dormancy window (see DORMANT_AFTER_DAYS). */
  active: boolean
  /** No costs (posted or committed) against the job yet — it hasn't started,
   *  so it can't be dormant. Counted separately from active/dormant. */
  upcoming: boolean
  /** Most recent entry date of any kind, null if nothing ever posted. */
  lastActivity: string | null
  /** What that entry was, for the table's hover; null on older payloads. */
  lastActivityDetail: ActivityDetail | null
  /** remaining ÷ recent monthly burn; null when dormant or burn is ~0. */
  estMonthsLeft: number | null
  watchlist: boolean
  missingContract: boolean
  units: number
}

export interface PmWorkload {
  pmId: number
  pmName: string
  firstName: string
  lastName: string
  jobs: WorkloadJob[]
  openCount: number
  activeCount: number
  dormantCount: number
  upcomingCount: number
  units: number
  remaining: number
  contract: number
  budget: number
  /** Posted + committed cost across the open jobs (budget − cost = remaining, before the per-job floor). */
  cost: number
  buckets: Record<ProgressBucket, number>
  watchlistCount: number
  missingContractCount: number
  /** This PM's slice of the company's open work on a contract basis: their
   *  open jobs' contract total ÷ the same across every PM (0–1). Null when
   *  no open job anywhere carries a contract amount. */
  openShare: number | null
}

// A job is dormant when it HAS started (some cost exists) but NOTHING has
// been entered against it — no cost lines (labor included), no purchase
// orders, no subcontracts, no change orders — for this many days. 45 covers
// a monthly posting cycle plus slack, so a job that simply straddles a
// billing boundary doesn't get flagged. A job with no costs at all yet is
// "upcoming", not dormant — it hasn't started, so silence is expected.
export const DORMANT_AFTER_DAYS = 45

// Accounting months as a single comparable index (periods are calendar
// months, so postyr/actprd → a linear month counter).
function monthIdx(postyr: number, actprd: number): number {
  return postyr * 12 + (actprd - 1)
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

// One-offs read "Property - Given name" (a bare "Roof Repair" says nothing
// about where); phases keep their Sage name, which already carries the
// address. Structural param so both lenses' phase rows (Workload's payload,
// Performance's allProjectPhases) can share it.
export function oneoffDisplayName(phase: {
  recnum: string
  name: string | null
  jobnme: string | null
  parent?: string | null
  oneoff?: number | null
  oofnme?: string | null
}): string {
  const base = (phase.name || phase.jobnme || phase.recnum).trim()
  if (phase.oneoff !== 1) return base
  const given = phase.oofnme?.trim() || base
  const property = phase.parent?.trim()
  return property ? `${property} - ${given}` : given
}

export function deriveWorkload(payload: EmployeeWorkloadPayload): { pms: PmWorkload[]; totalContract: number } {
  // "Now" in accounting-month terms, for the burn window. Falls back to the
  // newest month with posted costs if the open period is ever missing — a
  // bad reference here must never zero the estimates out.
  let openIdx = payload.openPeriod
    ? monthIdx(Number(payload.openPeriod.postyr), Number(payload.openPeriod.actprd))
    : NaN
  if (!Number.isFinite(openIdx) || openIdx <= 0) {
    openIdx = (payload.monthly ?? []).reduce(
      (max, r) => Math.max(max, monthIdx(Number(r.postyr), Number(r.actprd))),
      0,
    )
  }

  // Dormancy cutoff in real dates, anchored to the server's "today".
  const cutoffMs = new Date(payload.asOf).getTime() - DORMANT_AFTER_DAYS * 24 * 60 * 60 * 1000

  // The rollup rows select raw numeric columns, and the mssql driver hands
  // BIGINT/NUMERIC back as STRINGS — while the phases arrive via FOR JSON
  // with real numbers. Coerce every join key or the Map lookups silently
  // miss and the whole board reads dormant.
  const lastActivityByJob = new Map<number, string>()
  const lastActivityDetailByJob = new Map<number, ActivityDetail>()
  for (const row of payload.lastActivity ?? []) {
    const jobnum = Number(row.jobnum)
    lastActivityByJob.set(jobnum, row.lastActivity)
    if (row.kind) {
      lastActivityDetailByJob.set(jobnum, {
        kind: row.kind,
        description: row.description?.trim() || null,
        amount: row.amount == null ? null : Number(row.amount),
        vendorName: row.vendorName?.trim() || null,
        approved: Number(row.approved) === 1,
        sameDayCount: Number(row.sameDayCount) || 0,
        sameDayTotal: Number(row.sameDayTotal) || 0,
      })
    }
  }

  // Recent burn: mean posted cost over the three months ending at the open
  // period — the "current pace" behind the finish estimate.
  const recentCostByJob = new Map<number, number>()
  for (const row of payload.activity ?? []) {
    const jobnum = Number(row.jobnum)
    const idx = monthIdx(Number(row.postyr), Number(row.actprd))
    if (idx >= openIdx - 2 && idx <= openIdx) {
      recentCostByJob.set(jobnum, (recentCostByJob.get(jobnum) ?? 0) + Number(row.cost))
    }
  }

  const byPm = new Map<number, PmWorkload>()

  const pmFor = (phase: WorkloadPhase): PmWorkload => {
    const pmId = phase.pmId == null ? 0 : Number(phase.pmId)
    let pm = byPm.get(pmId)
    if (!pm) {
      const pmName = pmId === 0 ? "Unassigned Work" : (phase.pmName ?? `Employee ${pmId}`).trim()
      const spaceAt = pmName.indexOf(" ")
      pm = {
        pmId,
        pmName,
        firstName: spaceAt === -1 ? pmName : pmName.slice(0, spaceAt),
        lastName: spaceAt === -1 ? "" : pmName.slice(spaceAt + 1),
        jobs: [],
        openCount: 0,
        activeCount: 0,
        dormantCount: 0,
        upcomingCount: 0,
        units: 0,
        remaining: 0,
        contract: 0,
        budget: 0,
        cost: 0,
        buckets: { early: 0, mid: 0, closing: 0 },
        watchlistCount: 0,
        missingContractCount: 0,
        openShare: null,
      }
      byPm.set(pmId, pm)
    }
    return pm
  }

  for (const phase of payload.phases) {
    const jobnum = parseInt(phase.recnum, 10)
    const budget = phase.budget ?? 0
    const cost = phase.totalCost ?? 0
    const pct = budget > 0 ? clamp01(cost / budget) : cost > 0 ? 1 : 0
    const remaining = Math.max(budget - cost, 0)
    const lastActivity = lastActivityByJob.get(jobnum) ?? null
    const lastActivityMs = lastActivity ? new Date(lastActivity).getTime() : NaN
    const active = Number.isFinite(lastActivityMs) && lastActivityMs >= cutoffMs
    const burn = (recentCostByJob.get(jobnum) ?? 0) / 3

    const job: WorkloadJob = {
      recnum: phase.recnum,
      // One-offs read "Property - Given name" so the work is anchored to its
      // building (oofnme when Sage has one, raw job name as the fallback);
      // phases keep their Sage name as-is.
      name: oneoffDisplayName(phase),
      clientName: phase.clientName,
      property: phase.parent?.trim() || null,
      startDate: phase.startDate,
      contract: phase.totalContract ?? 0,
      budget,
      cost,
      remaining,
      pct,
      bucket: pct < 1 / 3 ? "early" : pct < 0.8 ? "mid" : "closing",
      active,
      upcoming: cost <= 0,
      lastActivity,
      lastActivityDetail: lastActivityDetailByJob.get(jobnum) ?? null,
      estMonthsLeft: active && burn > 0 && remaining > 0 ? remaining / burn : null,
      watchlist: (phase.totalContract ?? 0) > 0 && (phase.margin ?? 0) < 17,
      missingContract: !phase.totalContract || phase.totalContract <= 0,
      units: Number(phase.unitCount) || 0,
    }

    const pm = pmFor(phase)
    pm.jobs.push(job)
    pm.openCount += 1
    if (job.upcoming) pm.upcomingCount += 1
    else if (job.active) pm.activeCount += 1
    else pm.dormantCount += 1
    pm.units += job.units
    pm.remaining += job.remaining
    pm.contract += job.contract
    pm.budget += job.budget
    pm.cost += job.cost
    // Upcoming jobs stay out of the progress buckets — they describe work
    // that has actually started.
    if (!job.upcoming) pm.buckets[job.bucket] += 1
    if (job.watchlist) pm.watchlistCount += 1
    if (job.missingContract) pm.missingContractCount += 1
  }

  const pms = [...byPm.values()]
  for (const pm of pms) pm.jobs.sort((a, b) => b.remaining - a.remaining)
  pms.sort((a, b) => b.remaining - a.remaining)

  // "How much of the open work is on this person's plate" — contract value
  // of their open jobs as a share of the whole company's open contract value
  // (Unassigned Work included, so the shares sum to 100%). Contract, not
  // remaining budget: a job stays theirs until it closes, however far along.
  const totalContract = pms.reduce((t, pm) => t + pm.contract, 0)
  for (const pm of pms) pm.openShare = totalContract > 0 ? pm.contract / totalContract : null

  return { pms, totalContract }
}
