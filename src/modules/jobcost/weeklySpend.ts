// Weekly bucketing for the Job Cost detail page's "Budget Burn-Up" and "Cost vs
// Billed" charts. The backend (getJobDailySpend) returns one row per calendar
// day a cost was entered (jobcst.insdte); a renovation job typically spans ~a
// month, so weeks are the readable resolution. We bucket days into Monday-
// anchored calendar weeks, fill any gaps so lines stay continuous, and carry
// running cumulatives.

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

export interface DailySpend {
  /** YYYY-MM-DD (CONVERT style 23 from SQL) — or any Date-parseable string. */
  day: string
  spending: number
}

export interface WeekBucket {
  /** YYYY-MM-DD of the week's Monday — a stable key. */
  weekStart: string
  /** Short axis label, e.g. "Jun 2". */
  label: string
  /** Spend entered during this week. */
  spending: number
  /** Running total through this week (for the burn-up). */
  cumulative: number
}

// Parse a date string into a LOCAL date. Handles the SQL YYYY-MM-DD form
// directly (a bare `new Date("2026-06-02")` parses as UTC and can slip a day),
// and falls back to the Date parser for other shapes (e.g. invoice ISO stamps).
function parseLocalDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

// Local midnight of the Monday on or before `d`.
function mondayOf(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const offset = (date.getDay() + 6) % 7 // Sun=0 -> 6, Mon=1 -> 0, …
  date.setDate(date.getDate() - offset)
  return date
}

function isoDay(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mm}-${dd}`
}

function weekLabel(d: Date): string {
  return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`
}

// Sum dated amounts into Monday-week buckets, keyed by the Monday's epoch ms.
function bucketByWeek(daily: DailySpend[]): Map<number, number> {
  const byWeek = new Map<number, number>()
  for (const row of daily) {
    if (!row?.day) continue
    const date = parseLocalDate(row.day)
    if (!date) continue
    const key = mondayOf(date).getTime()
    byWeek.set(key, (byWeek.get(key) ?? 0) + (Number(row.spending) || 0))
  }
  return byWeek
}

/**
 * Roll daily spend rows into Monday-anchored weekly buckets, with no gaps
 * between the first and last active week and a running cumulative total.
 * Returns [] when there's nothing to chart.
 */
export function computeWeeklySpend(daily: DailySpend[]): WeekBucket[] {
  const byWeek = bucketByWeek(daily)
  if (byWeek.size === 0) return []

  const keys = [...byWeek.keys()]
  const first = Math.min(...keys)
  const last = Math.max(...keys)

  const out: WeekBucket[] = []
  let cumulative = 0
  // Step a week at a time via setDate (DST-safe) so empty weeks are filled.
  const cursor = new Date(first)
  while (cursor.getTime() <= last) {
    const spending = byWeek.get(cursor.getTime()) ?? 0
    cumulative += spending
    out.push({ weekStart: isoDay(cursor), label: weekLabel(cursor), spending, cumulative })
    cursor.setDate(cursor.getDate() + 7)
  }
  return out
}

export interface CostVsBilledPoint {
  label: string
  /** Cumulative cost through this week. */
  cost: number
  /** Cumulative billed (invoiced) through this week. */
  billed: number
}

/**
 * Two cumulative weekly series — cost vs billed — aligned to a SINGLE week axis
 * spanning the union of both streams' activity (so a job that bills before or
 * after its costs still lines up). Each series carries forward through empty
 * weeks. Returns [] when neither stream has data.
 */
export function computeCostVsBilled(
  costDaily: DailySpend[],
  billedDaily: DailySpend[],
): CostVsBilledPoint[] {
  const costWk = bucketByWeek(costDaily)
  const billWk = bucketByWeek(billedDaily)
  const keys = [...costWk.keys(), ...billWk.keys()]
  if (keys.length === 0) return []

  const first = Math.min(...keys)
  const last = Math.max(...keys)

  const out: CostVsBilledPoint[] = []
  let cost = 0
  let billed = 0
  const cursor = new Date(first)
  while (cursor.getTime() <= last) {
    cost += costWk.get(cursor.getTime()) ?? 0
    billed += billWk.get(cursor.getTime()) ?? 0
    out.push({ label: weekLabel(cursor), cost, billed })
    cursor.setDate(cursor.getDate() + 7)
  }
  return out
}

/**
 * Thin a list of axis labels down to at most `max`, anchored from the END so
 * the most recent week always keeps its label. Returns undefined (show all)
 * when already within budget.
 */
export function thinLabels(labels: string[], max: number): string[] | undefined {
  if (labels.length <= max) return undefined
  const stride = Math.ceil(labels.length / max)
  return labels.filter((_, i) => (labels.length - 1 - i) % stride === 0)
}
