// Derivations for the Employees page Workload view. The backend's
// `employeeWorkload` payload is deliberately raw — open phases with the
// standard grid financials, per-job posted costs by accounting month, per-PM
// AR-overdue and monthly-throughput rows — and everything "who can take the
// next job" needs is computed here, so the SQL stays simple and the rules
// (dormancy, buckets, burn rate) live in one testable place.

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

export interface WorkloadArOverdueRow {
  sprvsr: number | null
  overdueBalance: number
  overdueInvoices: number
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
  arOverdue: WorkloadArOverdueRow[]
  monthly: WorkloadMonthlyRow[]
  openPeriod: { postyr: number; actprd: number }
}

export type ProgressBucket = "early" | "mid" | "closing"

export interface WorkloadJob {
  recnum: string
  name: string
  clientName: string | null
  startDate: string | null
  contract: number
  budget: number
  cost: number
  remaining: number
  /** 0–1, cost ÷ budget (clamped). */
  pct: number
  bucket: ProgressBucket
  /** Posted costs in the open period or the one before. */
  active: boolean
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
  units: number
  remaining: number
  contract: number
  buckets: Record<ProgressBucket, number>
  watchlistCount: number
  missingContractCount: number
  arOverdueBalance: number
  arOverdueInvoices: number
  /** Trailing SPARK_MONTHS accounting months of posted cost, oldest → newest. */
  spark: number[]
}

export interface WorkloadTotals {
  openCount: number
  activeCount: number
  dormantCount: number
  remaining: number
  watchlistCount: number
  missingContractCount: number
  unassignedCount: number
  unassignedRemaining: number
}

export const SPARK_MONTHS = 7

// Accounting months as a single comparable index (periods are calendar
// months, so postyr/actprd → a linear month counter).
function monthIdx(postyr: number, actprd: number): number {
  return postyr * 12 + (actprd - 1)
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

export function deriveWorkload(payload: EmployeeWorkloadPayload): {
  pms: PmWorkload[]
  totals: WorkloadTotals
} {
  const openIdx = monthIdx(payload.openPeriod.postyr, payload.openPeriod.actprd)

  // Per-job activity: last posted month + recent burn (mean posted cost over
  // the three months ending at the open period — the "current pace").
  const lastIdxByJob = new Map<number, number>()
  const recentCostByJob = new Map<number, number>()
  for (const row of payload.activity) {
    const idx = monthIdx(row.postyr, row.actprd)
    const prev = lastIdxByJob.get(row.jobnum)
    if (prev === undefined || idx > prev) lastIdxByJob.set(row.jobnum, idx)
    if (idx >= openIdx - 2 && idx <= openIdx) {
      recentCostByJob.set(row.jobnum, (recentCostByJob.get(row.jobnum) ?? 0) + row.cost)
    }
  }

  const byPm = new Map<number, PmWorkload>()

  const pmFor = (phase: WorkloadPhase): PmWorkload => {
    const pmId = phase.pmId ?? 0
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
        units: 0,
        remaining: 0,
        contract: 0,
        buckets: { early: 0, mid: 0, closing: 0 },
        watchlistCount: 0,
        missingContractCount: 0,
        arOverdueBalance: 0,
        arOverdueInvoices: 0,
        spark: new Array<number>(SPARK_MONTHS).fill(0),
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
    const lastIdx = lastIdxByJob.get(jobnum)
    const active = lastIdx !== undefined && lastIdx >= openIdx - 1
    const burn = (recentCostByJob.get(jobnum) ?? 0) / 3

    const job: WorkloadJob = {
      recnum: phase.recnum,
      name: (phase.name || phase.jobnme || phase.recnum).trim(),
      clientName: phase.clientName,
      startDate: phase.startDate,
      contract: phase.totalContract ?? 0,
      budget,
      cost,
      remaining,
      pct,
      bucket: pct < 1 / 3 ? "early" : pct < 0.8 ? "mid" : "closing",
      active,
      estMonthsLeft: active && burn > 0 && remaining > 0 ? remaining / burn : null,
      watchlist: (phase.totalContract ?? 0) > 0 && (phase.margin ?? 0) < 17,
      missingContract: !phase.totalContract || phase.totalContract <= 0,
      units: Number(phase.unitCount) || 0,
    }

    const pm = pmFor(phase)
    pm.jobs.push(job)
    pm.openCount += 1
    if (job.active) pm.activeCount += 1
    else pm.dormantCount += 1
    pm.units += job.units
    pm.remaining += job.remaining
    pm.contract += job.contract
    pm.buckets[job.bucket] += 1
    if (job.watchlist) pm.watchlistCount += 1
    if (job.missingContract) pm.missingContractCount += 1
  }

  for (const row of payload.arOverdue) {
    const pm = byPm.get(row.sprvsr ?? 0)
    if (pm) {
      pm.arOverdueBalance = row.overdueBalance
      pm.arOverdueInvoices = row.overdueInvoices
    }
  }

  for (const row of payload.monthly) {
    const pm = byPm.get(row.sprvsr ?? 0)
    if (!pm) continue
    const offset = monthIdx(row.postyr, row.actprd) - (openIdx - (SPARK_MONTHS - 1))
    if (offset >= 0 && offset < SPARK_MONTHS) pm.spark[offset] += row.cost
  }

  const pms = [...byPm.values()]
  for (const pm of pms) pm.jobs.sort((a, b) => b.remaining - a.remaining)
  pms.sort((a, b) => b.remaining - a.remaining)

  const totals: WorkloadTotals = {
    openCount: 0,
    activeCount: 0,
    dormantCount: 0,
    remaining: 0,
    watchlistCount: 0,
    missingContractCount: 0,
    unassignedCount: 0,
    unassignedRemaining: 0,
  }
  for (const pm of pms) {
    totals.openCount += pm.openCount
    totals.activeCount += pm.activeCount
    totals.dormantCount += pm.dormantCount
    totals.remaining += pm.remaining
    totals.watchlistCount += pm.watchlistCount
    totals.missingContractCount += pm.missingContractCount
    if (pm.pmId === 0) {
      totals.unassignedCount = pm.openCount
      totals.unassignedRemaining = pm.remaining
    }
  }

  return { pms, totals }
}
