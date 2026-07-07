import { useMemo, type ReactNode } from "react"
import { StatWidget } from "../../../../shared/components/StatWidget/StatWidget"
import { formatMoney } from "../../../../shared/utils/format"
import {
  computeScorecard,
  formatSignedPct,
  formatAbsPct,
  biasColor,
  type Scorecard,
} from "./estimationMetrics"
import { useEstimationData } from "./useEstimationData"

const ACCURACY_LABEL = "Avg Variance"
const BIAS_LABEL = "Avg Over/Under"

// Theme-aware good/bad colors for the tooltip's bolded delta (mirrors the pill).
const BETTER_COLOR = "light-dark(#15803d, #5ee08a)"
const WORSE_COLOR = "light-dark(#c0392b, #f8857a)"

// Stat title with a hover tooltip styled like the Bias by Category tooltips: a
// bold lead line (the metric name) then a plain-language sentence that explains
// the metric using the card's real number, bolded for emphasis.
function StatTitle({ label, lead, body }: { label: string; lead: string; body: ReactNode }): ReactNode {
  return (
    <>
      {label}
      <span className="estp-tooltip" role="tooltip">
        <span className="estp-bar-tooltip-lead">{lead}</span>
        <span>{body}</span>
      </span>
    </>
  )
}

// Which direction is an improvement for a metric, so the badge can color a move
// green (better) or red (worse): on-budget rate wants to rise, average variance
// wants to fall, and over/under (bias) wants to shrink toward zero either way.
type BetterWhen = "higher" | "lower" | "zero"

interface YoYInfo {
  /** The soft-tinted pill node (rendered in the card's caption slot), or null
   *  when there's no current value to grade. */
  badge: ReactNode
  /** A plain-language sentence describing the year-over-year change, appended to
   *  the metric's hover tooltip. Null when there's no current value. */
  note: ReactNode
}

// Single source of truth for the year-over-year comparison: builds BOTH the pill
// shown on the card and the explanatory sentence shown in the tooltip, so they
// can never disagree. Compares this year's COMPLETED-job figure to last year's
// (the section is a completed-job retrospective — see useEstimationData). The
// triangle follows the raw direction of the change; the tint/word reflects
// whether that change is good for the metric.
function buildYoY(
  curr: number | null,
  prev: number | null,
  betterWhen: BetterWhen,
  prevYearLabel: string,
  fmt: (v: number) => string,
  words: { better: string; worse: string }
): YoYInfo {
  if (curr == null) return { badge: null, note: null }
  if (prev == null) {
    return {
      badge: (
        <span className="estp-yoy">
          <span className="estp-yoy-pill estp-yoy-pill--none">No {prevYearLabel} data</span>
        </span>
      ),
      note: (
        <div className="estp-tooltip-yoy">
          No {prevYearLabel} completed jobs to compare against.
        </div>
      ),
    }
  }

  const delta = curr - prev
  const flat = Math.abs(delta) < 0.05
  const improved =
    betterWhen === "higher"
      ? delta > 0
      : betterWhen === "lower"
        ? delta < 0
        : Math.abs(curr) < Math.abs(prev)
  const tone = flat ? "flat" : improved ? "better" : "worse"
  // Diagonal arrows match the dashboard's house trend glyph (see Chart.tsx YoY
  // growth), rather than the bare up/down triangles this card used to draw.
  const arrow = delta > 0 ? "↗" : "↘"
  const color = flat ? undefined : improved ? BETTER_COLOR : WORSE_COLOR

  const badge = (
    <span className="estp-yoy">
      <span className={`estp-yoy-pill estp-yoy-pill--${tone}`}>
        {!flat && <span className="estp-yoy-tri">{arrow}</span>}
        {flat ? "No change" : `${Math.abs(delta).toFixed(1)} pts`}
      </span>
    </span>
  )

  const note = flat ? (
    <div className="estp-tooltip-yoy">
      Unchanged from {prevYearLabel} ({fmt(prev)}).
    </div>
  ) : (
    <div className="estp-tooltip-yoy">
      <strong style={{ color }}>{Math.abs(delta).toFixed(1)} pts</strong>{" "}
      {improved ? words.better : words.worse} than {prevYearLabel} ({fmt(prev)}).
    </div>
  )

  return { badge, note }
}

// Tooltip bodies — each explains its metric with the live number bolded so the
// reader sees what the figure means in context, then appends the year-over-year
// sentence (yoyNote) so the card's pill is spelled out on hover.
function biasBody(score: Scorecard, tolerance: number, yoyNote: ReactNode): ReactNode {
  if (score.bias == null) return "No completed jobs with a budget to measure yet."
  const net = score.bias
  const note = (
    <div className="estp-tooltip-note estp-tooltip-note--footer">
      The closer to 0 the more calibrated the estimate.
    </div>
  )
  if (Math.abs(net) < 0.05) {
    return (
      <>
        <div>
          On average, jobs finished{" "}
          <strong style={{ color: biasColor(net, tolerance) }}>right on budget</strong>.
        </div>
        {yoyNote}
        {note}
      </>
    )
  }
  const dir = net > 0 ? "over" : "under"
  const dollars = score.typicalDollarBias
  return (
    <>
      <div>
        On average, jobs finished{" "}
        <strong style={{ color: biasColor(net, tolerance) }}>{formatSignedPct(net)}</strong> {dir}{" "}
        budget
        {dollars != null && Math.abs(dollars) >= 1 && (
          <>
            {" "}
            — the typical job ran about <strong>{formatMoney(Math.abs(dollars))}</strong>{" "}
            {dollars > 0 ? "over" : "under"}
          </>
        )}
        .
      </div>
      {yoyNote}
      {note}
    </>
  )
}

function varianceBody(score: Scorecard, yoyNote: ReactNode): ReactNode {
  if (score.accuracy == null) return "No completed jobs with a budget to measure yet."
  return (
    <>
      <div>
        On average, jobs missed their budget by about{" "}
        <strong>±{formatAbsPct(score.accuracy)}</strong>
        {score.typicalDollarMiss != null && score.typicalDollarMiss >= 1 && (
          <>
            {" "}
            — about <strong>{formatMoney(score.typicalDollarMiss)}</strong> on the typical job
          </>
        )}
        .
      </div>
      {yoyNote}
      <div className="estp-tooltip-note estp-tooltip-note--footer">
        The lower the number the more accurate the estimate.
      </div>
    </>
  )
}

function onBudgetBody(score: Scorecard, tolerance: number, yoyNote: ReactNode): ReactNode {
  if (score.onBudgetRate == null) return "No completed jobs with a budget to measure yet."
  return (
    <>
      <div>
        <strong>{formatAbsPct(score.onBudgetRate)}</strong> of the {score.jobCount} measured job
        {score.jobCount === 1 ? "" : "s"} finished within <strong>±{tolerance}%</strong> of budget.
      </div>
      {yoyNote}
    </>
  )
}

// Headline scorecard for the Estimation Performance section: the three numbers
// that tell leadership, at a glance, whether estimating is good. Avg Over/Under
// (which way misses lean) and Avg Variance (how big misses are) are deliberately
// paired — they diagnose different problems: small variance + near-zero
// over/under = tight and unbiased; a large over/under = systematically wrong
// (fix the template); large variance = imprecise (tighten the process).
//
// Rendered as bare StatWidget cards (like the Business Development revenue
// tiles) rather than a wrapped Widget, so the row stays content-height and
// doesn't stretch to match the full-height chart widgets below it.
export function EstimationScorecardWidget() {
  const { jobs, prevJobs, tolerance, year, isLoading } = useEstimationData()

  // Completed jobs only (the section ignores the WIP toggle); the YoY badge
  // grades this year's completed work against last year's.
  const score = useMemo(() => computeScorecard(jobs, tolerance), [jobs, tolerance])
  const prevScore = useMemo(
    () => computeScorecard(prevJobs, tolerance),
    [prevJobs, tolerance]
  )

  const prevYearLabel = String(year - 1)

  const biasYoY = buildYoY(score.bias, prevScore.bias, "zero", prevYearLabel, formatSignedPct, {
    better: "closer to budget",
    worse: "further from budget",
  })
  const varianceYoY = buildYoY(
    score.accuracy,
    prevScore.accuracy,
    "lower",
    prevYearLabel,
    (v) => `±${formatAbsPct(v)}`,
    { better: "tighter", worse: "wider" }
  )
  const onBudgetYoY = buildYoY(
    score.onBudgetRate,
    prevScore.onBudgetRate,
    "higher",
    prevYearLabel,
    formatAbsPct,
    { better: "more jobs on budget", worse: "fewer jobs on budget" }
  )

  return (
    <div className="estp-scorecard-grid">
      <StatWidget
        title={
          <StatTitle
            label={BIAS_LABEL}
            lead={BIAS_LABEL}
            body={biasBody(score, tolerance, biasYoY.note)}
          />
        }
        value={score.bias}
        format={formatSignedPct}
        valueColor={score.bias != null ? biasColor(score.bias, tolerance) : undefined}
        caption={biasYoY.badge}
        loading={isLoading}
      />
      <StatWidget
        title={<StatTitle label={ACCURACY_LABEL} lead={ACCURACY_LABEL} body={varianceBody(score, varianceYoY.note)} />}
        value={score.accuracy}
        format={(v) => `±${formatAbsPct(v)}`}
        caption={varianceYoY.badge}
        loading={isLoading}
      />
      <StatWidget
        title={<StatTitle label="On Budget" lead="On Budget" body={onBudgetBody(score, tolerance, onBudgetYoY.note)} />}
        value={score.onBudgetRate}
        format={formatAbsPct}
        caption={onBudgetYoY.badge}
        loading={isLoading}
      />
    </div>
  )
}
