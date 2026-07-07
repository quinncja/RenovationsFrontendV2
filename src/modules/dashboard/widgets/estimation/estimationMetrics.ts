// Estimation Performance — pure analytics over the backend `estimationPerformance`
// payload. The backend returns one row per eligible job with its REVISED
// (post-change-order) budget and POSTED actual cost split by the four cost
// categories; every metric the section renders (variance %, accuracy, bias,
// on-budget rate, the Labor+Sub → "Production" combine, supervisor/size
// segmentation, worst-estimated jobs) is derived here so the widgets stay thin
// and the policy is testable. The section is a COMPLETED-job retrospective; the
// "Incl. WIP" toggle has no effect on it.
//
// Conventions (from the design brainstorm):
//   • Variance sign = actual − budget. POSITIVE = over budget = BAD (red).
//   • Baseline = revised budget (measures execution vs the budget the PM worked
//     to, not the original bid).
//   • Labor and Subcontractor are SUBSTITUTES (a PM trades one for the other),
//     so they're combined into "Production" for the pass/fail line; the split is
//     kept only as a diagnostic.
//   • "Accuracy" = average ABSOLUTE variance % (how close, regardless of
//     direction). "Bias" = average SIGNED variance % (systematic over/under).
//   • On-budget rate = share of jobs landing within ±tolerance %.

export interface CategoryAmounts {
  budget: number
  actual: number
}

export interface EstimationJob {
  id: string
  name: string
  client: string | null
  supervisor: string | null
  supervisorId: number | null
  /** True once the job is closed (actrec.status > 4). */
  completed: boolean
  /** Year of the job's last posted-cost period (its inferred completion). */
  completionYear: number | null
  /** 1–12 of the last posted-cost period, or null if none. */
  completionMonth: number | null
  material: CategoryAmounts
  labor: CategoryAmounts
  sub: CategoryAmounts
  wtpm: CategoryAmounts
}

export interface EstimationPayload {
  year: number
  toleranceBand: number
  jobs: EstimationJob[]
}

// The scored categories. Labor and Subcontractor are SUBSTITUTES, so a job that
// carries BOTH (budget or cost on each) is judged on their fused "Production"
// total. A single-discipline job — labor only, or subs only — is judged on that
// discipline alone rather than being diluted into Production. So the chart can
// surface up to five categories. `key` doubles as a stable id / chart index.
export type CategoryKey = "production" | "labor" | "sub" | "material" | "misc"

// Render order (Production first, then the single-discipline splits, then the
// always-separate categories).
export const CATEGORY_KEYS: CategoryKey[] = ["production", "labor", "sub", "material", "misc"]

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  production: "Field (Labor + Subs)",
  labor: "Labor only",
  sub: "Subcontractors only",
  material: "Material",
  misc: "WTPM",
}

// Short labels for tight spaces (chart axes, mobile).
export const CATEGORY_SHORT: Record<CategoryKey, string> = {
  production: "Field",
  labor: "Labor",
  sub: "Subs",
  material: "Material",
  misc: "WTPM",
}

/** True when a job carries any labor activity (budget or posted cost). */
function hasLabor(job: EstimationJob): boolean {
  return job.labor.budget > 0 || job.labor.actual > 0
}

/** True when a job carries any subcontractor activity (budget or posted cost). */
function hasSub(job: EstimationJob): boolean {
  return job.sub.budget > 0 || job.sub.actual > 0
}

/**
 * Which labor/sub bucket a job falls into: "production" when it has both,
 * "labor" / "sub" when it has only one, "none" when it has neither.
 */
function laborSubBucket(job: EstimationJob): "production" | "labor" | "sub" | "none" {
  const labor = hasLabor(job)
  const sub = hasSub(job)
  if (labor && sub) return "production"
  if (labor) return "labor"
  if (sub) return "sub"
  return "none"
}

/**
 * A job's amounts for a scored category. Labor/Sub route to exactly one of
 * Production / Labor / Sub per the bucket above — the other two return zero so
 * the job is excluded from their averages (variancePct null-guards on budget).
 */
export function jobCategory(job: EstimationJob, key: CategoryKey): CategoryAmounts {
  const zero = { budget: 0, actual: 0 }
  switch (key) {
    case "production":
      return laborSubBucket(job) === "production"
        ? {
            budget: job.labor.budget + job.sub.budget,
            actual: job.labor.actual + job.sub.actual,
          }
        : zero
    case "labor":
      return laborSubBucket(job) === "labor" ? job.labor : zero
    case "sub":
      return laborSubBucket(job) === "sub" ? job.sub : zero
    case "material":
      return job.material
    case "misc":
      return job.wtpm
  }
}

/** A job's total revised budget across all categories. */
export function jobBudgetTotal(job: EstimationJob): number {
  return job.material.budget + job.labor.budget + job.sub.budget + job.wtpm.budget
}

/** A job's total posted actual across all categories. */
export function jobActualTotal(job: EstimationJob): number {
  return job.material.actual + job.labor.actual + job.sub.actual + job.wtpm.actual
}

/**
 * Signed variance % for a budget/actual pair: (actual − budget) / budget × 100.
 * Positive = over budget. Null when there's no budget to measure against (a
 * job/category with zero budget has no estimate to grade).
 */
export function variancePct(amounts: CategoryAmounts): number | null {
  if (amounts.budget <= 0) return null
  return ((amounts.actual - amounts.budget) / amounts.budget) * 100
}

/** A job's overall (all-category) signed variance %, or null if budget-less. */
export function jobVariancePct(job: EstimationJob): number | null {
  return variancePct({ budget: jobBudgetTotal(job), actual: jobActualTotal(job) })
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((s, v) => s + v, 0) / values.length
}

// Median — the "typical" value, robust to a few large jobs that would skew a
// mean. Used for the dollar context so it tracks the equal-weight percentages.
function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

// ─── Headline scorecard ────────────────────────────────────────────────────

export interface Scorecard {
  /** Average |variance %| across jobs — lower is more accurate. */
  accuracy: number | null
  /** Average signed variance % — near zero is well-calibrated; +over / −under. */
  bias: number | null
  /** Share (0–100) of jobs within ±tolerance of budget. */
  onBudgetRate: number | null
  /** Count of jobs with a measurable budget that fed these figures. */
  jobCount: number
  /** TYPICAL (median) signed dollar variance (actual − budget) — the $ behind
   *  `bias`. Median, not mean, so a few large jobs don't blow it past what the
   *  equal-weight `bias` % implies for an ordinary job. */
  typicalDollarBias: number | null
  /** TYPICAL (median) absolute dollar miss |actual − budget| — the $ behind
   *  `accuracy`, robust to big-job skew for the same reason. */
  typicalDollarMiss: number | null
  /** Net total dollar variance across all measured jobs (Σ actual − budget) —
   *  the aggregate over (+) / under (−) budget. The headline business number. */
  totalDollarVariance: number | null
}

export function computeScorecard(jobs: EstimationJob[], toleranceBand: number): Scorecard {
  // Same population as the percentages — jobs with a measurable budget — so the
  // dollar and percent figures describe the same set of jobs.
  const measured = jobs
    .map((j) => {
      const pct = jobVariancePct(j)
      if (pct == null) return null
      return { pct, dollars: jobActualTotal(j) - jobBudgetTotal(j) }
    })
    .filter((m): m is { pct: number; dollars: number } => m != null)

  const variances = measured.map((m) => m.pct)
  const dollars = measured.map((m) => m.dollars)
  const onBudget = variances.filter((v) => Math.abs(v) <= toleranceBand).length

  return {
    accuracy: mean(variances.map(Math.abs)),
    bias: mean(variances),
    onBudgetRate: variances.length > 0 ? (onBudget / variances.length) * 100 : null,
    jobCount: variances.length,
    typicalDollarBias: median(dollars),
    typicalDollarMiss: median(dollars.map(Math.abs)),
    totalDollarVariance: dollars.length > 0 ? dollars.reduce((s, d) => s + d, 0) : null,
  }
}

// ─── Category breakdown ────────────────────────────────────────────────────

export interface CategoryStat {
  key: CategoryKey
  label: string
  /** Average signed variance % for this category (+over / −under). */
  bias: number | null
  /** Average |variance %| for this category. */
  accuracy: number | null
  /** Jobs with a measurable budget in this category. */
  jobCount: number
  /** Total budget / actual dollars (for the tooltip and MISC share). */
  budget: number
  actual: number
}

export function computeCategoryStats(jobs: EstimationJob[]): CategoryStat[] {
  return CATEGORY_KEYS.map((key) => {
    const amounts = jobs.map((j) => jobCategory(j, key))
    const variances = amounts
      .map(variancePct)
      .filter((v): v is number => v != null)
    return {
      key,
      label: CATEGORY_LABELS[key],
      bias: mean(variances),
      accuracy: mean(variances.map(Math.abs)),
      jobCount: variances.length,
      budget: amounts.reduce((s, a) => s + a.budget, 0),
      actual: amounts.reduce((s, a) => s + a.actual, 0),
    }
  })
}

/** MISC's share (0–100) of total budgeted dollars — a scoping-discipline smell. */
export function miscBudgetShare(jobs: EstimationJob[]): number | null {
  const total = jobs.reduce((s, j) => s + jobBudgetTotal(j), 0)
  if (total <= 0) return null
  const misc = jobs.reduce((s, j) => s + j.wtpm.budget, 0)
  return (misc / total) * 100
}

// ─── Segmentation (supervisor / size band) ──────────────────────────────────

export interface SegmentStat {
  key: string
  label: string
  bias: number | null
  accuracy: number | null
  onBudgetRate: number | null
  jobCount: number
}

function summarizeSegment(key: string, label: string, jobs: EstimationJob[], tolerance: number): SegmentStat {
  const variances = jobs.map(jobVariancePct).filter((v): v is number => v != null)
  const onBudget = variances.filter((v) => Math.abs(v) <= tolerance).length
  return {
    key,
    label,
    bias: mean(variances),
    accuracy: mean(variances.map(Math.abs)),
    onBudgetRate: variances.length > 0 ? (onBudget / variances.length) * 100 : null,
    jobCount: variances.length,
  }
}

/** Group eligible jobs by supervisor, summarizing each. Sorted by job count. */
export function computeBySupervisor(jobs: EstimationJob[], tolerance: number): SegmentStat[] {
  const groups = new Map<string, EstimationJob[]>()
  for (const job of jobs) {
    const label = job.supervisor || "Unassigned"
    const arr = groups.get(label)
    if (arr) arr.push(job)
    else groups.set(label, [job])
  }
  return [...groups.entries()]
    .map(([label, list]) => summarizeSegment(label, label, list, tolerance))
    .filter((s) => s.jobCount > 0)
    .sort((a, b) => b.jobCount - a.jobCount)
}

// Size bands by total revised budget. Construction jobs span a wide range, so a
// few coarse buckets read better than a continuous axis.
const SIZE_BANDS: Array<{ key: string; label: string; min: number; max: number }> = [
  { key: "xs", label: "Under $25K", min: 0, max: 25_000 },
  { key: "sm", label: "$25K–100K", min: 25_000, max: 100_000 },
  { key: "md", label: "$100K–250K", min: 100_000, max: 250_000 },
  { key: "lg", label: "$250K–500K", min: 250_000, max: 500_000 },
  { key: "xl", label: "$500K+", min: 500_000, max: Infinity },
]

/** Group eligible jobs into budget size bands, summarizing each. Band order. */
export function computeBySizeBand(jobs: EstimationJob[], tolerance: number): SegmentStat[] {
  return SIZE_BANDS.map((band) => {
    const list = jobs.filter((j) => {
      const total = jobBudgetTotal(j)
      return total >= band.min && total < band.max
    })
    return summarizeSegment(band.key, band.label, list, tolerance)
  }).filter((s) => s.jobCount > 0)
}

// ─── Worst-estimated jobs ───────────────────────────────────────────────────

export interface VarianceDriver {
  key: CategoryKey
  label: string
  /** Signed variance % for this category, or null when it carried no budget (a
   *  purely unbudgeted spend — a scope miss with no estimate to grade). */
  variancePct: number | null
  /** Signed dollar delta (actual − budget); its magnitude is what ranks the
   *  driver, so a small-but-wildly-off line never outranks the line that
   *  actually moved the total. */
  dollarDelta: number
}

/**
 * The single category that drove a job's miss most — the one whose actual
 * landed furthest (in DOLLARS) from its budget. Uses the SAME category model as
 * the over/under averages (`jobCategory`/`CATEGORY_KEYS`): Labor and Subs fuse
 * into "Field" when a job carries both, and split out only on single-discipline
 * jobs — so the pill names exactly the bucket the section grades. Ranked by
 * |actual − budget| rather than variance % so a tiny line that doubled (e.g. a
 * $500 WTPM) can't masquerade as the culprit on a job that ran six figures over
 * on field labor. Null only when no category moved (a perfectly-estimated job).
 */
export function worstVarianceDriver(job: EstimationJob): VarianceDriver | null {
  let best: VarianceDriver | null = null
  for (const key of CATEGORY_KEYS) {
    const amounts = jobCategory(job, key)
    // jobCategory zeroes the labor/sub buckets that don't apply to this job, so
    // those return a 0 delta and never win — only the applicable bucket counts.
    const dollarDelta = amounts.actual - amounts.budget
    if (best == null || Math.abs(dollarDelta) > Math.abs(best.dollarDelta)) {
      best = { key, label: CATEGORY_SHORT[key], variancePct: variancePct(amounts), dollarDelta }
    }
  }
  return best && best.dollarDelta !== 0 ? best : null
}

/** Over / under / within-tolerance for a driver — drives its pill color. Falls
 *  back to the dollar direction when the line had no budget to compute a %. */
export function driverDirection(
  driver: VarianceDriver,
  tolerance = 5,
): "over" | "under" | "within" {
  const pct = driver.variancePct
  if (pct == null) return driver.dollarDelta > 0 ? "over" : driver.dollarDelta < 0 ? "under" : "within"
  if (pct > tolerance) return "over"
  if (pct < -tolerance) return "under"
  return "within"
}

export interface WorstJob {
  id: string
  name: string
  supervisor: string | null
  completed: boolean
  budget: number
  actual: number
  variancePct: number
  /** The cost line that drove this job's miss most (null if none moved). */
  driver: VarianceDriver | null
}

/** The N jobs with the largest |variance %|, biggest miss first. */
export function computeWorstJobs(jobs: EstimationJob[], limit: number): WorstJob[] {
  return jobs
    .map((job) => {
      const v = jobVariancePct(job)
      if (v == null) return null
      return {
        id: job.id,
        name: job.name,
        supervisor: job.supervisor,
        completed: job.completed,
        budget: jobBudgetTotal(job),
        actual: jobActualTotal(job),
        variancePct: v,
        driver: worstVarianceDriver(job),
      }
    })
    .filter((j): j is WorstJob => j != null)
    .sort((a, b) => Math.abs(b.variancePct) - Math.abs(a.variancePct))
    .slice(0, limit)
}

// ─── Formatting helpers ─────────────────────────────────────────────────────

// formatPercent in shared/utils treats |v| <= 1 as a ratio (×100), which would
// mangle a true 0.5% variance into 50%. These signed/unsigned variants always
// treat the input as a whole percentage and keep one decimal.

/** Signed percentage, e.g. +3.2% / −1.0%. Used for bias / variance. */
export function formatSignedPct(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : ""
  return `${sign}${Math.abs(value).toFixed(1)}%`
}

/** Unsigned percentage, e.g. 3.2%. Used for accuracy / on-budget rate. */
export function formatAbsPct(value: number): string {
  return `${value.toFixed(1)}%`
}

// Variance coloring (over budget = bad). Greens for under/on budget, reds for
// over. Mirrors the dashboard's existing good/bad palette.
export function varianceColor(variancePctValue: number, tolerance = 5): string {
  if (variancePctValue > tolerance) return "#ef4444" // over budget — red
  if (variancePctValue < -tolerance) return "#22c55e" // under budget — green
  return "#eab308" // within tolerance — neutral amber
}

// Bias coloring: a near-zero bias is GOOD regardless of sign (well-calibrated);
// large magnitude either way is a correctable blind spot, with over-budget the
// worse failure. Reuse varianceColor — over → red, under → green, on → amber.
export const biasColor = varianceColor

// Category bias coloring (Bias by Category widget): under budget is always good
// (green); over budget is amber up to 15%, then red beyond — over-runs are only
// a real problem once they're sizable.
export function categoryBiasColor(biasPctValue: number): string {
  if (biasPctValue < 0) return "#22c55e" // under budget — green
  if (biasPctValue <= 15) return "#eab308" // 0–15% over — amber
  return "#ef4444" // >15% over — red
}
