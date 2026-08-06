import { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback, useDeferredValue, memo, type ReactNode } from "react"
import { motion, AnimatePresence, useMotionValue, useTransform, type MotionValue, type Transition } from "framer-motion"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useJobcostNav } from "./useJobcostNav"
import { Search, ArrowUp, ArrowDown, ChevronRight, ChevronDown, ExternalLink, ChartNoAxesColumn, Building2, Hammer, Pin, RotateCcw } from "lucide-react"
import Page from "../../shared/components/Page"
import { SortTh } from "../../shared/components/SortTh"
import { SegmentedControl } from "../../shared/components/SegmentedControl"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { Widget } from "../../shared/components/Widget/Widget"
import { YearSelector, MIN_YEAR } from "../../shared/components/YearSelector/YearSelector"
import { fetchPageData } from "../../shared/api/pageApi"
import { takePreloadedPageData } from "../../shared/api/pageDataCache"
import { trackProjectView } from "../../shared/analytics/analytics"
import { formatMoney, formatMoneyFull, marginTextColor } from "../../shared/utils/format"
import useIsMobile from "../../shared/hooks/useIsMobile"
import useElementWidth from "../../shared/hooks/useElementWidth"
import useMarginColorsEnabled from "../../shared/hooks/useMarginColorsEnabled"
import useLocalStorage from "../../shared/hooks/useLocalStorage"
import useSessionStorage, { hasSessionValue } from "../../shared/hooks/useSessionStorage"
import {
  cacheOpenPeriod,
  readJobcostDefaultRange,
  resolveDefaultRange,
  JOBCOST_PHASE_SESSION_KEY,
  JOBCOST_YEAR_SESSION_KEY,
} from "./defaultRange"
import { useAuth } from "../../core/auth/AuthProvider"
import { MobileFilterSheet, activeFilterCount, type FilterGroup } from "../../shared/components/MobileFilterSheet/MobileFilterSheet"
import { MobileFilterButton } from "../../shared/components/MobileFilterSheet/MobileFilterButton"
import { CostBreakdownTable, CostBreakdownSkeleton } from "./components/CostBreakdownTable"
import { oneoffFromRecnum, phaseFromRecnum } from "./jobcostShared"
import { coachTargetRef, useCoachTarget } from "../../core/onboarding/coachTargets"
import { useOnboarding } from "../../core/onboarding/OnboardingProvider"
import { SECTION_JOBCOST_REDESIGN } from "../../core/onboarding/markers"
import {
  publishJobcostTourState,
  registerJobcostTourController,
  useTourActive,
  useTourCardPos,
  type JobcostTourController,
} from "./onboarding/tourBus"
import type { BudgetBreakdown, CostItem } from "./types"

// Two views over the same fetch:
//  - "grouped" (default): jobs rolled up by their Sage `parent` custom field
//    (a shared building address) into project cards — status is the min of
//    the members' statuses, money columns are sums, and the expanded panel
//    splits members into Phases vs One-Off sub-cards.
//  - "list": one row per Sage job entry (the original table), rows expand in
//    place to metrics + Cost Breakdown.
// The fetch always requests the ALL-TIME list with a per-row `yearActive` bit
// (yearFlag param): the list view filters rows to the active year client-side
// (identical result to the old server-side filter), while the grouped view
// keeps a parent visible if ANY member was active that year but still shows
// its full all-time membership. Both toggles are therefore instant — only the
// year selector refetches.

interface ProjectPhase {
  recnum: string
  pmName: string | null
}

export interface RawProject {
  recnum: string | number
  name: string
  status: number
  totalContract: number
  originalContract?: number
  changeOrderAmount?: number
  totalCost: number
  totalCommitted?: number
  totalIncome?: number
  // Consolidated projects expose the rolled-up budget as `totalBudget`
  // (see project-utils.js consolidatePhasesIntoProjects). Individual phases
  // use plain `budget`. Accept either so the same shape works regardless of
  // consolidation.
  totalBudget?: number
  budget?: number
  // Raw (unconsolidated) phase rows carry the PM name directly; consolidated
  // projects only expose it on their nested `phases`. Accept both.
  pmName?: string | null
  phases?: ProjectPhase[]
  clientName?: string | null
  // Sage custom fields (dbo.actr_u): parent = shared-address grouping key,
  // oneoff = 1 for non-phase projects. Both null/absent when the lazily
  // created actr_u row doesn't exist yet (jobs added after the backfill).
  parent?: string | null
  oneoff?: number | null
  // actr_u.oofnme — the one-off's given display name. Only newer one-offs
  // carry it; fall back to the job name.
  oofnme?: string | null
  // Present when the fetch passes yearFlag: 1 = had posted revenue or cost in
  // the selected year. Absent (all-time fetch) = always active.
  yearActive?: number
  // Phase month derived in SQL from the recnum suffix (01–12); absent for
  // one-offs (FOR JSON PATH drops NULL columns) and on pre-phase-column
  // backends. Only sent on yearFlag fetches.
  phase?: number | null
  // CSV of accounting periods (jobcst.actprd) with posted costs, scoped to
  // the selected year (all-time when year is null). Only on yearFlag fetches;
  // absent when the job has no posted costs.
  activePeriods?: string | null
  // actrec.usrdf1 — units delivered by the phase. Sage stores it as text.
  unitCount?: number | string | null
}

export interface Job {
  recnum: string
  jobNumber: string
  name: string
  status: number
  contract: number
  originalContract: number
  changeOrderAmount: number
  totalCost: number
  totalCommitted: number
  totalIncome: number
  budget: number
  // Budget − Cost. Positive = under budget, negative = over (mirrors the
  // expanded view's Projected Variance).
  variance: number
  margin: number | null
  supervisor: string
  client: string
  parent: string
  oneoff: boolean
  // One-off display name (actr_u.oofnme), shown in place of the Sage job
  // name in the property view. Null for phases and unnamed one-offs.
  oneoffName: string | null
  yearActive: boolean
  units: number
  // Phase month (1–12); null for one-offs.
  phase: number | null
  // Periods with posted costs in the selected year — the one-off side of the
  // phase filter (a one-off has no phase of its own).
  activePeriods: number[]
}

// Lazily-fetched per-job cost detail for the expanded view.
export type JobDetail = { budget: BudgetBreakdown | null; costItems: CostItem[] }


export function normalizeProject(p: RawProject): Job {
  const contract = p.totalContract ?? 0
  const totalCost = p.totalCost ?? 0
  const budget = p.totalBudget ?? p.budget ?? 0
  const recnum = String(p.recnum)
  const parent = p.parent?.trim()
  const oneoff = p.oneoff != null ? p.oneoff === 1 : oneoffFromRecnum(recnum)
  return {
    recnum,
    jobNumber: p.phases?.[0]?.recnum ?? recnum,
    name: p.name,
    status: p.status,
    contract,
    originalContract: p.originalContract ?? 0,
    changeOrderAmount: p.changeOrderAmount ?? 0,
    totalCost,
    totalCommitted: p.totalCommitted ?? 0,
    totalIncome: p.totalIncome ?? 0,
    budget,
    variance: budget - totalCost,
    margin: contract > 0 ? ((contract - totalCost) / contract) * 100 : null,
    supervisor:
      p.pmName?.trim() ??
      p.phases?.find((ph) => ph.pmName?.trim())?.pmName?.trim() ??
      "",
    client: p.clientName?.trim() ?? "",
    // No parent yet (new job, actr_u row not created) → the job is its own
    // single-member group under its own name.
    parent: parent || p.name,
    oneoff,
    oneoffName: (oneoff && p.oofnme?.trim()) || null,
    yearActive: p.yearActive == null ? true : p.yearActive === 1,
    // One-offs (repairs, extras) aren't unit deliveries — never count them,
    // even when Sage carries a unitCount on the record.
    units: oneoff ? 0 : Number(p.unitCount) || 0,
    // FOR JSON PATH drops NULLs, so absent = null here; derive from the
    // recnum when the backend predates the phase column.
    phase: p.phase ?? (oneoff ? null : phaseFromRecnum(recnum)),
    activePeriods: p.activePeriods ? p.activePeriods.split(",").map(Number) : [],
  }
}

// A parent group — Sage jobs sharing a building address.
interface Group {
  key: string
  client: string
  // min(member status): any Current member → Current; else any Complete →
  // Complete; else all Closed → Closed (matches how the statuses escalate).
  status: number
  contract: number
  budget: number
  totalCost: number
  margin: number | null
  phases: Job[]
  oneoffs: Job[]
  yearActive: boolean
  units: number
}

function buildGroups(jobs: Job[]): Group[] {
  const byParent = new Map<string, Job[]>()
  for (const j of jobs) {
    const list = byParent.get(j.parent)
    if (list) list.push(j)
    else byParent.set(j.parent, [j])
  }
  return [...byParent.entries()].map(([key, members]) => {
    // Member lists read most-recent first. The 8-digit recnum encodes
    // creation order (YY prefix, phase month suffix), so numeric descending
    // is newest → oldest.
    members.sort((a, b) => Number(b.recnum) - Number(a.recnum))
    const contract = members.reduce((s, m) => s + m.contract, 0)
    const totalCost = members.reduce((s, m) => s + m.totalCost, 0)
    const firstClient = members.find((m) => m.client)?.client ?? ""
    const multiClient = members.some((m) => m.client && m.client !== firstClient)
    return {
      key,
      client: multiClient ? "Multiple clients" : firstClient,
      status: Math.min(...members.map((m) => m.status)),
      contract,
      budget: members.reduce((s, m) => s + m.budget, 0),
      totalCost,
      margin: contract > 0 ? ((contract - totalCost) / contract) * 100 : null,
      phases: members.filter((m) => !m.oneoff),
      oneoffs: members.filter((m) => m.oneoff),
      yearActive: members.some((m) => m.yearActive),
      units: members.reduce((s, m) => s + m.units, 0),
    }
  })
}

export type SortKey = "name" | "status" | "supervisor" | "contract" | "totalCost" | "budget" | "variance" | "margin"
export type SortDir = "asc" | "desc"

// Property-view sorting lives in the command bar (cards have no column
// headers). Volume is hidden from managers, matching the contract column.
type GroupSortKey = "name" | "client" | "volume" | "margin" | "units" | "phases" | "projects"
const GROUP_SORT_OPTIONS: { key: GroupSortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "client", label: "Client" },
  { key: "volume", label: "Volume" },
  { key: "margin", label: "Margin" },
  { key: "units", label: "Units" },
  { key: "phases", label: "Phase Count" },
  { key: "projects", label: "Project Count" },
]

const STATUS_LABELS: Record<number, string> = {
  1: "Bidding",
  2: "Refused",
  3: "Contract",
  4: "Current",
  5: "Complete",
  6: "Closed",
}

type StatusFilter = "all" | number

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All Statuses" },
  { key: 4, label: "Current" },
  { key: 5, label: "Complete" },
  { key: 6, label: "Closed" },
]

type PhaseFilter = "all" | number

const PHASE_OPTIONS: { key: PhaseFilter; label: string }[] = [
  { key: "all", label: "All Phases" },
  ...Array.from({ length: 12 }, (_, i) => ({ key: i + 1, label: `Phase ${i + 1}` })),
]

// Phase membership: phase jobs match on their own phase month (from the
// recnum suffix, first and foremost); one-offs have no phase, so they match
// when they had posted costs in that accounting period instead.
function jobMatchesPhase(j: Job, phase: number): boolean {
  return j.oneoff ? j.activePeriods.includes(phase) : j.phase === phase
}

type ViewMode = "grouped" | "list"

// Mobile sheet group mirrors the desktop dropdown (single-select).
const FILTER_GROUPS: FilterGroup[] = [
  {
    key: "status",
    label: "Status",
    options: [
      { value: "all", label: "All" },
      { value: "4", label: "Current", colorClass: "jc-filter-current" },
      { value: "5", label: "Complete", colorClass: "jc-filter-complete" },
      { value: "6", label: "Closed", colorClass: "jc-filter-closed" },
    ],
  },
  {
    key: "phase",
    label: "Phase",
    options: [
      { value: "all", label: "All" },
      ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
    ],
  },
]
const FILTER_DEFAULTS = { status: "all", phase: "all" }

// Managers also get a project-scope group in the mobile sheet, mirroring the
// desktop Mine/All seg (the command bar doesn't render on mobile — without
// this a phone is stuck with whatever scope was last picked on desktop).
const SCOPE_GROUP: FilterGroup = {
  key: "scope",
  label: "Projects",
  options: [
    { value: "mine", label: "Mine" },
    { value: "all", label: "All" },
  ],
}
const MANAGER_FILTER_DEFAULTS = { ...FILTER_DEFAULTS, scope: "mine" }

// Fit-driven column hiding for the LIST view. Fixed pixel breakpoints can't
// know the real content widths, so the layout itself is the signal instead:
// every column except Project is nowrap (PM capped with an ellipsis), Project
// is the one flexible column with a min-width floor (see .jc-name-col), and
// when the fixed columns plus that floor can't fit, the table overflows its
// wrapper. After each layout pass, any overflow hides the least-critical
// visible column (HIDE_ORDER, front first). Each hide records the container
// width it happened at, and that column only returns once the container
// outgrows that mark by RESHOW_BUFFER, so drag-resizing doesn't flap. Hidden
// data stays reachable: everything lives in the row's expanded panel, and
// Status folds into the Project cell's sub-line.
const HIDE_ORDER = ["contract", "supervisor", "status", "variance", "budget"] as const
type HideableCol = (typeof HIDE_ORDER)[number]
// How far past the hide-point the container must grow before a column may
// try to come back.
const RESHOW_BUFFER = 60


// Label/value row inside a summary card; `total` bolds it as the card's
// bottom-line figure. Shared with the detail page's Contract/Cost Summary
// cards so the two render identically. `onClick` turns the row into a
// drill-through (hover surface + trailing chevron beside the value).
export function SummaryRow({ label, value, note, total, noDivider, valueColor, valueClass, onClick }: {
  label: string
  /** Usually the formatted figure; the detail page's loading state passes a
   *  SkelText shimmer so the row keeps identical geometry while loading. */
  value: ReactNode
  /** Muted secondary figure (e.g. the variance's % form) left of the value. */
  note?: string
  total?: boolean
  /** Drop the row's bottom rule so it reads as one block with the next row
   *  (the budget-remaining + margin pair at the card's foot). */
  noDivider?: boolean
  valueColor?: string
  valueClass?: string
  onClick?: () => void
}) {
  const valueSpan = (
    <span className={`jc-summary-value${valueClass ? ` ${valueClass}` : ""}`} style={valueColor ? { color: valueColor } : undefined}>{value}</span>
  )
  // Drill-through rows carry a contained pill ("1 order ›") left of the
  // figure instead of a trailing chevron, so the $ column stays flush right
  // with the rows above and below.
  const valueCluster = (
    <span className="jc-summary-values">
      {onClick ? (
        <span className="jc-summary-link-pill">
          {note && <span>{note}</span>}
          <ChevronRight size={12} />
        </span>
      ) : (
        note && <span className="jc-summary-note">{note}</span>
      )}
      {valueSpan}
    </span>
  )
  return (
    <div
      className={`jc-summary-row${total ? " jc-summary-total" : ""}${noDivider ? " jc-summary-nodivider" : ""}${onClick ? " jc-summary-row-link" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? e => e.key === "Enter" && onClick() : undefined}
    >
      <span className="jc-summary-label">{label}</span>
      {note || onClick ? valueCluster : valueSpan}
    </div>
  )
}

function JobExpandedPanel({ job, detail, marginColorsOn }: {
  job: Job
  detail: JobDetail | "loading" | undefined
  marginColorsOn: boolean
}) {
  const projectedVariance = job.budget - job.totalCost
  const spentToDate = job.totalCost - job.totalCommitted
  const varianceClass = projectedVariance < 0 ? "jc-variance-over" : projectedVariance > 0 ? "jc-variance-under" : ""
  const marginColor = !marginColorsOn || job.margin == null ? undefined : marginTextColor(job.margin)

  return (
    <div className="jc-expand-panel">
      {/* Contract + Cost summaries */}
      <div className="jc-summary-grid">
        <div className="jc-summary-card">
          <div className="jc-summary-title subheadline text-secondary">Contract Summary</div>
          <SummaryRow label="Original Contract" value={formatMoneyFull(job.originalContract)} />
          <SummaryRow label="Change Orders" value={job.changeOrderAmount ? formatMoneyFull(job.changeOrderAmount) : "—"} />
          <div className="jc-summary-totals">
            <SummaryRow label="Revised Contract" value={formatMoneyFull(job.contract)} total />
          </div>
        </div>
        <div className="jc-summary-card">
          <div className="jc-summary-title subheadline text-secondary">Cost Summary</div>
          <SummaryRow label="Revised Budget" value={formatMoneyFull(job.budget)} />
          <SummaryRow label="Spent to Date" value={formatMoneyFull(spentToDate)} />
          <SummaryRow label="Committed (Open POs + Subs)" value={formatMoneyFull(job.totalCommitted)} />
          <SummaryRow label="Total Committed + Spent" value={formatMoneyFull(job.totalCost)} />
          <div className="jc-summary-totals">
            <SummaryRow
              label={projectedVariance < 0 ? "Budget Exceeded" : "Budget Remaining"}
              value={formatMoneyFull(Math.abs(projectedVariance))}
              valueClass={varianceClass}
              total
            />
            <SummaryRow
              label={job.status >= 5 ? "Final Margin" : "Current Margin"}
              value={job.margin == null ? "—" : `${job.margin.toFixed(1)}%`}
              total
              valueColor={marginColor}
            />
          </div>
        </div>
      </div>

      {/* Cost Breakdown (reused from the detail page) */}
      <div className="jc-expand-breakdown">
        <div className="jc-summary-title subheadline text-secondary">Cost Breakdown</div>
        {/* Full-height skeleton (4 fixed categories + Total) so the row's
            open animation travels straight to the final height — see
            CostBreakdownSkeleton. */}
        {detail === "loading" || detail === undefined ? (
          <CostBreakdownSkeleton />
        ) : (
          <CostBreakdownTable
            budget={detail.budget}
            costItems={detail.costItems}
            job={{ id: job.jobNumber, name: job.name }}
          />
        )}
      </div>
    </div>
  )
}

// One of the two floating sub-cards inside an expanded group (Phases /
// One-Off Projects). Empty kinds render grayed-out and inert; non-empty cards
// are buttons that reveal their member rows below the card pair.
function GroupKindCard({ icon, title, singular, plural, members, open, onToggle, showContract, marginColorsOn }: {
  icon: React.ReactNode
  title: string
  // Count noun: "25 Phases ›" / "2 One-Offs ›", not a bare number.
  singular: string
  plural: string
  members: Job[]
  open: boolean
  onToggle: () => void
  showContract: boolean
  marginColorsOn: boolean
}) {
  const empty = members.length === 0
  const contract = members.reduce((s, m) => s + m.contract, 0)
  const budget = members.reduce((s, m) => s + m.budget, 0)
  const totalCost = members.reduce((s, m) => s + m.totalCost, 0)
  const margin = contract > 0 ? ((contract - totalCost) / contract) * 100 : null
  const marginColor = !marginColorsOn || margin == null ? undefined : marginTextColor(margin)
  // Budget Remaining/Exceeded: POSITIVE = under budget (good); NEGATIVE = over
  // (bad) — the row shows the absolute value with the label carrying the sign.
  const budgetVariance = budget - totalCost
  const varianceClass = budgetVariance === 0 ? undefined : budgetVariance > 0 ? "jc-variance-under" : "jc-variance-over"
  // min(member status) — same escalation rule as the group badge: any Current
  // member → Current; else any Complete → Complete; else Closed.
  const status = empty ? null : Math.min(...members.map((m) => m.status))

  return (
    <button
      type="button"
      className={`jc-group-card${empty ? " jc-group-card-empty" : ""}${open ? " jc-group-card-open" : ""}`}
      onClick={empty ? undefined : onToggle}
      disabled={empty}
      aria-expanded={empty ? undefined : open}
    >
      <div className="jc-group-card-head">
        <span className="jc-group-card-title subheadline text-secondary">
          {icon}
          {title}
          {status != null && (
            <span className={`status-badge status-${status}`}>
              {STATUS_LABELS[status] ?? status}
            </span>
          )}
        </span>
        {empty ? (
          <span className="jc-group-card-none subheadline">None</span>
        ) : (
          <span className="jc-group-card-count">
            {members.length} {members.length === 1 ? singular : plural}
            <ChevronRight size={13} className={`jc-expand-chevron${open ? " open" : ""}`} />
          </span>
        )}
      </div>
      {!empty && (
        <div className="jc-group-card-body">
          {showContract && <SummaryRow label="Contract" value={formatMoneyFull(contract)} />}
          <SummaryRow label="Budget" value={formatMoneyFull(budget)} />
          <SummaryRow label="Committed + Spent" value={formatMoneyFull(totalCost)} />
          {/* Margin + Gross Profit (or Budget Remaining for managers) are the
              card's conclusions — a recessed well sets the pair apart from
              the plain money lines above. */}
          <div className="jc-summary-totals">
            {/* Contract-derived (hidden from managers). Wears the same margin
                color as the Margin row below — the pair reads as one verdict;
                negative-red stays as the fallback when margin colors are off. */}
            {showContract ? (
              <SummaryRow
                label="Gross Profit"
                value={formatMoneyFull(contract - totalCost)}
                total
                valueColor={marginColor ?? (contract - totalCost < 0 ? "#ef4444" : undefined)}
              />
            ) : (
              <SummaryRow
                label={budgetVariance < 0 ? "Budget Exceeded" : "Budget Remaining"}
                value={formatMoneyFull(Math.abs(budgetVariance))}
                total
                valueClass={varianceClass}
              />
            )}
            <SummaryRow
              label="Margin"
              value={margin == null ? "—" : `${margin.toFixed(1)}%`}
              total
              valueColor={marginColor}
            />
          </div>
        </div>
      )}
    </button>
  )
}

// Member rows revealed by the open sub-card — the same columns as the list
// view, minus the inline expand (row click / View opens the full report).
// No caption: the highlighted card above says which kind is showing.
function GroupMemberTable({ members, showContract, marginColorsOn, onOpen }: {
  members: Job[]
  showContract: boolean
  marginColorsOn: boolean
  onOpen: (job: Job) => void
}) {
  return (
    <div className="jc-expand-breakdown jc-member-table">
      <table className="spend-rank-table">
        <thead>
          <tr>
            <th className="spend-rank-table-name">Job</th>
            <th className="spend-rank-table-name">Status</th>
            <th className="spend-rank-table-name">PM</th>
            {showContract && <th className="spend-rank-table-value">Contract</th>}
            <th className="spend-rank-table-value">Budget</th>
            <th className="spend-rank-table-value">Cost</th>
            <th className="spend-rank-table-value">Margin</th>
            <th className="spend-rank-table-name jc-view-th" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {members.map((job) => (
            <tr
              key={job.recnum}
              className="spend-rank-table-row"
              onClick={() => onOpen(job)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && onOpen(job)}
            >
              <td className="spend-rank-table-name">
                {/* One-offs lead with their given name (oofnme) when Sage has
                    one; the raw job name is the fallback. */}
                <div className="body-text emphasized jc-name-text" title={job.oneoffName ?? job.name}>
                  {job.oneoffName ?? job.name}
                </div>
                <div className="cell-secondary jc-name-sub">
                  <span className="jc-name-number">#{job.jobNumber}</span>
                </div>
              </td>
              <td className="spend-rank-table-name">
                <span className={`status-badge status-${job.status}`}>
                  {STATUS_LABELS[job.status] ?? job.status}
                </span>
              </td>
              <td className="spend-rank-table-name">
                <div className="body-text text-secondary jc-pm-text" title={job.supervisor || undefined}>
                  {job.supervisor || "—"}
                </div>
              </td>
              {showContract && (
                <td className="spend-rank-table-value body-text emphasized">{formatMoneyFull(job.contract)}</td>
              )}
              <td className="spend-rank-table-value body-text emphasized">{formatMoneyFull(job.budget)}</td>
              <td className="spend-rank-table-value body-text emphasized">{formatMoneyFull(job.totalCost)}</td>
              <td
                className="spend-rank-table-value body-text emphasized"
                style={{
                  color: !marginColorsOn || job.margin == null ? undefined : marginTextColor(job.margin),
                }}
              >
                {job.margin == null ? "—" : `${job.margin.toFixed(1)}%`}
              </td>
              <td className="spend-rank-table-name jc-view-cell">
                <button
                  type="button"
                  className="jc-view-tile jc-view-tile-wide"
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpen(job)
                  }}
                  title="Open full report"
                  aria-label="Open full report"
                >
                  View <ExternalLink size={13} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// One stat in the overall strip at the top of an expanded group.
function OverviewStat({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="jc-overview-stat">
      <span className="jc-overview-label subheadline text-secondary">{label}</span>
      <span className="jc-overview-value" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </span>
    </div>
  )
}

function GroupExpandedPanel({ group, showContract, marginColorsOn, openKind, onToggleKind, onOpenJob }: {
  group: Group
  showContract: boolean
  marginColorsOn: boolean
  // At most one sub-card is open; clicking the other swaps, clicking the open
  // one closes.
  openKind: "phases" | "oneoffs" | null
  onToggleKind: (kind: "phases" | "oneoffs") => void
  onOpenJob: (job: Job) => void
}) {
  const marginColor = !marginColorsOn || group.margin == null ? undefined : marginTextColor(group.margin)
  const openMembers = openKind === "phases" ? group.phases : openKind === "oneoffs" ? group.oneoffs : []
  return (
    <div className="jc-expand-panel">
      {/* Overall property stats (the row itself only carries counts). */}
      <div className="jc-group-overview">
        {showContract && <OverviewStat label="Property Contract Volume" value={formatMoneyFull(group.contract)} />}
        <OverviewStat
          label="Property Gross Margin"
          value={group.margin == null ? "—" : `${group.margin.toFixed(1)}%`}
          valueColor={marginColor}
        />
        {/* Gross profit exposes contract - cost, so it follows the contract
            visibility rule (hidden from managers). Uncolored except when
            negative — losing money is the only state worth flagging. */}
        {showContract && (
          <OverviewStat
            label="Property Gross Profit"
            value={formatMoneyFull(group.contract - group.totalCost)}
            valueColor={group.contract - group.totalCost < 0 ? "#ef4444" : undefined}
          />
        )}
        {/* Units trail the money stats, matching the property page's hero. */}
        <OverviewStat label="Property Units" value={group.units > 0 ? String(group.units) : "—"} />
      </div>
      <div className="jc-group-card-grid">
        <GroupKindCard
          icon={<Building2 size={13} />}
          title="Rolling Phase Work"
          singular="Phase"
          plural="Phases"
          members={group.phases}
          open={openKind === "phases"}
          onToggle={() => onToggleKind("phases")}
          showContract={showContract}
          marginColorsOn={marginColorsOn}
        />
        <GroupKindCard
          icon={<Hammer size={13} />}
          title="One-Off Work"
          singular="One-Off"
          plural="One-Offs"
          members={group.oneoffs}
          open={openKind === "oneoffs"}
          onToggle={() => onToggleKind("oneoffs")}
          showContract={showContract}
          marginColorsOn={marginColorsOn}
        />
      </div>
      {/* The member list mounts through AnimatePresence so swapping between
          kinds (or closing) collapses smoothly instead of popping. marginTop
          animates from the panel's negated flex gap (-1.25rem = zero net
          space closed) to -0.5rem (the open air gap) so the gap eases in
          with the height instead of popping. The caret + table are static
          layout inside this element (App.css .jc-member-reveal); the kind
          class centers the caret under whichever card is open. */}
      <AnimatePresence initial={false} mode="wait">
        {openKind && openMembers.length > 0 && (
          <motion.div
            key={openKind}
            className={`jc-member-reveal jc-member-reveal-${openKind}`}
            initial={{ height: 0, opacity: 0, marginTop: "-1.25rem" }}
            animate={{ height: "auto", opacity: 1, marginTop: "-0.5rem" }}
            exit={{ height: 0, opacity: 0, marginTop: "-1.25rem" }}
            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
          >
            <div className="jc-tray-caret" aria-hidden="true" />
            <GroupMemberTable
              members={openMembers}
              showContract={showContract}
              marginColorsOn={marginColorsOn}
              onOpen={onOpenJob}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Animates real width (not transforms) when its child's intrinsic size
// changes, so text never scale-stretches — used by the sort-direction toggle
// whose label swaps between "A-Z" and "Low-High". Bounce stays 0: width
// overshoot would clip the label mid-flight.
function AnimatedWidth({ children }: { children: React.ReactNode }) {
  const innerRef = useRef<HTMLSpanElement>(null)
  const [width, setWidth] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = innerRef.current
    if (el) setWidth(Math.ceil(el.getBoundingClientRect().width))
  })
  return (
    <motion.span
      animate={width != null ? { width } : undefined}
      transition={{ type: "spring", bounce: 0, visualDuration: 0.3 }}
      style={{ display: "inline-block", overflow: "hidden", whiteSpace: "nowrap" }}
    >
      <span ref={innerRef} style={{ display: "inline-block" }}>{children}</span>
    </motion.span>
  )
}

// Card travel when the list order changes (pin/unpin, sort) — soft-landing
// spring so a card pinned from mid-list visibly glides to the top.
const REORDER_SPRING: Transition = { type: "spring", bounce: 0.18, visualDuration: 0.45 }

// Window for the double-click fast path to the full report. Deliberately
// tighter than the OS double-click threshold (~500ms) so a quick
// expand–collapse of a row doesn't accidentally navigate.
const QUICK_DBLCLICK_MS = 350

// Count tag on a property card's right side: "2 Phases ›" / "1 One-Off ›".
// Clicking one opens the card straight to that section (the head is a
// role=button div, not a <button>, so these can be real buttons inside it).
// Empty kinds read as quiet "No Phases" text with no affordance.
function KindChip({ icon, count, singular, plural, onOpen }: {
  icon: React.ReactNode
  count: number
  singular: string
  plural: string
  onOpen: () => void
}) {
  if (count === 0) {
    return (
      <span className="jc-kind-chip jc-kind-chip-empty">
        {icon}
        No {plural}
      </span>
    )
  }
  return (
    <button
      type="button"
      className="jc-kind-chip"
      onClick={(e) => {
        e.stopPropagation()
        onOpen()
      }}
    >
      {icon}
      {count} {count === 1 ? singular : plural}
      <ChevronRight size={12} className="jc-kind-chip-arrow" />
    </button>
  )
}

// One property (parent group) card. Scroll-linked "wave": scale/opacity ease
// up as the card enters the reading band, back down at the edges. The wave is
// driven by a shared `tick` motion value (bumped by the list on scroll AND on
// any layout resize) and reads live getBoundingClientRect positions, so cards
// re-settle correctly when a tall card above them collapses — a pure
// scroll-offset source goes stale there because no scroll event fires.
// memo: the virtualizer re-renders the list on every scroll frame; without it
// every mounted card re-renders per frame. Handlers take the group as an
// argument (no per-item closures) so props stay referentially stable.
const PropertyCard = memo(function PropertyCard({ group, open, openKind, entrance, index, tick, scrollerRef, showContract, marginColorsOn, pinned, tourAnchor, onToggle, onToggleKind, onOpenKind, onOpenJob, onTogglePin, onOpenProperty }: {
  group: Group
  open: boolean
  openKind: "phases" | "oneoffs" | null
  // Staggered blur-in on the list's first paint only — cards mounted later by
  // the virtualizer (while scrolling) must not replay it.
  entrance: boolean
  index: number
  tick: MotionValue<number>
  scrollerRef: React.RefObject<HTMLElement | null>
  showContract: boolean
  marginColorsOn: boolean
  pinned: boolean
  // The card the Job Costing tour's coachmarks point at (the open card, else
  // the first in the list) — registers its head/View/pin as coach targets.
  tourAnchor: boolean
  onToggle: (group: Group) => void
  onToggleKind: (kind: "phases" | "oneoffs") => void
  onOpenKind: (group: Group, kind: "phases" | "oneoffs") => void
  onOpenJob: (job: Job) => void
  onTogglePin: (group: Group) => void
  onOpenProperty: (group: Group) => void
}) {
  const cardRef = useRef<HTMLDivElement | null>(null)
  // Instance-safe coach-target refs (the anchor moves between card instances
  // as the open card changes; see coachTargetRef). The whole-card target is
  // what lets the tour's cutout grow live with the card's expansion.
  const cardTargetRef = useMemo(() => coachTargetRef("jc-card"), [])
  const pinTargetRef = useMemo(() => coachTargetRef("jc-card-pin"), [])
  // Timestamp of the head's last click, for the quick double-click fast path.
  const lastClickRef = useRef(0)
  // 0 = card top at the container's bottom edge, 1 = card bottom at its top
  // edge, ~0.5 = comfortably in view. Reading rects keeps it truthful under
  // any layout shift; tick.get() subscribes this transform to the bumps.
  const waveProgress = useTransform(() => {
    tick.get()
    const el = cardRef.current
    const sc = scrollerRef.current
    if (!el || !sc) return 0.5
    const r = el.getBoundingClientRect()
    const s = sc.getBoundingClientRect()
    return (s.bottom - r.top) / (s.height + r.height)
  })
  const waveScale = useTransform(waveProgress, [0, 0.08, 0.92, 1], [0.965, 1, 1, 0.965])
  const waveOpacity = useTransform(waveProgress, [0, 0.08, 0.92, 1], [0.55, 1, 1, 0.55])

  const marginColor = !marginColorsOn || group.margin == null ? undefined : marginTextColor(group.margin)

  return (
    <motion.div
      ref={cardRef}
      className="jc-card-wave"
      // Open cards opt out of the wave: a tall expanded card scaling under
      // 1 would soften its text while it's being read.
      style={{ scale: open ? 1 : waveScale, opacity: open ? 1 : waveOpacity, willChange: "transform" }}
    >
      <motion.div
        ref={tourAnchor ? cardTargetRef : undefined}
        className={`jc-project-card${open ? " jc-project-card-open" : ""}`}
        // App-standard MotionList entrance (same values as itemVariants),
        // continuing the header's stagger rhythm.
        initial={entrance ? { opacity: 0, y: 12, scale: 0.97 } : false}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, delay: 0.08 + Math.min(index, 8) * 0.08, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <div
          className="jc-project-head"
          role="button"
          tabIndex={0}
          // Double-click (within the tightened QUICK_DBLCLICK_MS window) is
          // the fast path to the full property report. The two single-click
          // toggles it fires first cancel out (open→close), so the card is
          // back in its original state if the user returns.
          onClick={(e) => {
            onToggle(group)
            if (e.timeStamp - lastClickRef.current < QUICK_DBLCLICK_MS) onOpenProperty(group)
            lastClickRef.current = e.timeStamp
          }}
          // Suppress the text selection a double-click would otherwise make.
          onMouseDown={(e) => { if (e.detail > 1) e.preventDefault() }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              onToggle(group)
            }
          }}
          aria-expanded={open}
        >
          {/* Pinned marker: copper rail on the card's left edge, growing from
              its vertical center on pin and receding on unpin. Lives in the
              head (not the card) so an expanded body doesn't stretch it. */}
          <motion.span
            className="jc-pin-rail"
            aria-hidden="true"
            initial={false}
            animate={{ scaleY: pinned ? 1 : 0, opacity: pinned ? 1 : 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          />
          <span className="jc-head-toggle">
            <ChevronRight size={15} className={`jc-expand-chevron${open ? " open" : ""}`} />
          </span>
          <span className="jc-project-title" title={group.key}>
            <span className="jc-project-name-row">
              <span className="jc-project-name">{group.key}</span>
              <span className={`status-badge status-${group.status}`}>
                {STATUS_LABELS[group.status] ?? group.status}
              </span>
            </span>
            {group.client && <span className="jc-group-client">{group.client}</span>}
          </span>
          <span className="jc-head-stats">
            {showContract && (
              <span className="jc-head-stat">
                <span className="jc-head-stat-label">Volume</span>
                <span className="jc-head-stat-value">{formatMoney(group.contract)}</span>
              </span>
            )}
            <span className="jc-head-stat">
              <span className="jc-head-stat-label">Margin</span>
              <span className="jc-head-stat-value" style={marginColor ? { color: marginColor } : undefined}>
                {group.margin == null ? "—" : `${group.margin.toFixed(1)}%`}
              </span>
            </span>
            {/* Units trail the money stats, matching the property page's hero. */}
            <span className="jc-head-stat">
              <span className="jc-head-stat-label">Units</span>
              <span className="jc-head-stat-value">{group.units > 0 ? group.units : "—"}</span>
            </span>
          </span>
          <span className="jc-project-counts">
            <KindChip
              icon={<Building2 size={12} />}
              count={group.phases.length}
              singular="Phase"
              plural="Phases"
              onOpen={() => onOpenKind(group, "phases")}
            />
            <KindChip
              icon={<Hammer size={12} />}
              count={group.oneoffs.length}
              singular="One-Off"
              plural="One-Offs"
              onOpen={() => onOpenKind(group, "oneoffs")}
            />
          </span>
          {/* Open the property's full report page — same borderless tile as
              the pin beside it, widened for its "View ↗" label. View-then-Pin
              order matches the Project list's actions cell. stopPropagation
              on click AND keydown: the head is a role=button that would
              otherwise toggle open. */}
          <button
            type="button"
            className="jc-view-tile jc-view-tile-wide"
            aria-label="Open property report"
            title="Open property report"
            onClick={(e) => {
              e.stopPropagation()
              onOpenProperty(group)
            }}
            onKeyDown={(e) => e.stopPropagation()}
          >
            View <ExternalLink size={13} />
          </button>
          {/* Neutral tile when unpinned, copper when pinned (active state).
              stopPropagation on click AND keydown — the head is a role=button
              that would otherwise toggle open. The icon pops on pin as the
              instant local feedback while the card itself travels. */}
          <button
            ref={tourAnchor ? pinTargetRef : undefined}
            type="button"
            className={`jc-pin-btn${pinned ? " jc-pin-btn-active" : ""}`}
            aria-pressed={pinned}
            aria-label={pinned ? "Unpin property" : "Pin property to top"}
            title={pinned ? "Pinned — click to unpin" : "Pin to top"}
            onClick={(e) => {
              e.stopPropagation()
              onTogglePin(group)
            }}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <motion.span
              className="jc-pin-icon"
              initial={false}
              animate={{ scale: pinned ? [1, 1.35, 1] : 1 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <Pin size={13} />
            </motion.span>
          </button>
        </div>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              className="jc-project-body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.38, ease: [0.4, 0, 0.2, 1] }}
            >
              <GroupExpandedPanel
                group={group}
                showContract={showContract}
                marginColorsOn={marginColorsOn}
                openKind={openKind}
                onToggleKind={onToggleKind}
                onOpenJob={onOpenJob}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
})

// Virtualized property list: only the cards near the viewport are mounted
// (the full portfolio is 50+ cards, each with its own motion values — mounting
// them all at once is what made the view toggle lag). Items are absolutely
// positioned by measured offset inside a spacer of the total height; card
// expand/collapse is picked up live by the virtualizer's ResizeObserver.
function PropertyList({ groups, openGroupKey, openKind, entrance, showContract, marginColorsOn, pins, onToggle, onToggleKind, onOpenKind, onOpenJob, onTogglePin, onOpenProperty }: {
  groups: Group[]
  openGroupKey: string | null
  openKind: "phases" | "oneoffs" | null
  // False when the list is re-entered via the view toggle: the blur-in
  // stagger plays once per page visit, after that the crossfade alone
  // handles the reveal (replaying it doubled the animation AND the cost).
  entrance: boolean
  showContract: boolean
  marginColorsOn: boolean
  pins: string[]
  onToggle: (group: Group) => void
  onToggleKind: (kind: "phases" | "oneoffs") => void
  onOpenKind: (group: Group, kind: "phases" | "oneoffs") => void
  onOpenJob: (job: Job) => void
  onTogglePin: (group: Group) => void
  onOpenProperty: (group: Group) => void
}) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const scrollerRef = useRef<HTMLElement | null>(null)
  const [scroller, setScroller] = useState<HTMLElement | null>(null)
  // Offset of the list's top inside the scroll container (the command bar
  // sits above it) — keeps the virtualizer's visible-range math honest.
  const [scrollMargin, setScrollMargin] = useState(0)
  const tick = useMotionValue(0)
  // Entrance stagger plays once per list mount, then later virtualizer mounts
  // (scrolling) skip it.
  const entranceRef = useRef(true)
  useEffect(() => {
    const t = setTimeout(() => {
      entranceRef.current = false
    }, 900)
    return () => clearTimeout(t)
  }, [])

  // Stable: an inline ref here would re-run these layout reads on every
  // scroll-driven re-render.
  const setListEl = useCallback((el: HTMLDivElement | null) => {
    listRef.current = el
    if (!el) return
    const sc = (el.closest(".page") as HTMLElement) ?? null
    scrollerRef.current = sc
    setScroller(sc)
    if (sc) {
      const sr = sc.getBoundingClientRect()
      const er = el.getBoundingClientRect()
      setScrollMargin(Math.max(0, Math.round(er.top - sr.top + sc.scrollTop)))
    }
  }, [])

  // One shared wave driver: scroll moves cards, but so do collapse animations
  // above them (no scroll event fires for those) — the ResizeObserver on the
  // list catches that case and re-settles every card.
  useEffect(() => {
    const sc = scroller
    const list = listRef.current
    if (!sc || !list) return
    const bump = () => tick.set(tick.get() + 1)
    sc.addEventListener("scroll", bump, { passive: true })
    const ro = new ResizeObserver(bump)
    ro.observe(list)
    ro.observe(sc)
    bump()
    return () => {
      sc.removeEventListener("scroll", bump)
      ro.disconnect()
    }
  }, [scroller, tick])

  // Deliberately no dependency array: sorting/filtering teleport cards to new
  // offsets via translateY — no scroll fires and the list's total height is
  // unchanged, so neither observer above notices. Bump per commit BEFORE paint
  // (layout effect: the corrected wave must be in the same frame the cards
  // land, or the old edge style flashes), then once more on the next frame —
  // the virtualizer's re-measure settles positions after this commit, and a
  // single sync bump left cards wearing their pre-sort wave style.
  useLayoutEffect(() => {
    tick.set(tick.get() + 1)
    const raf = requestAnimationFrame(() => tick.set(tick.get() + 1))
    return () => cancelAnimationFrame(raf)
  })

  const virtualizer = useVirtualizer({
    count: groups.length,
    getScrollElement: () => scroller,
    estimateSize: () => 88,
    overscan: 4,
    scrollMargin,
    getItemKey: (i) => groups[i].key,
  })

  // Reorders (pin/unpin, sort change) GLIDE cards to their new offsets;
  // everything else that moves an offset (a card above expanding, scroll
  // remounts) must stay an instant teleport — animating those would fight the
  // body height animation frame by frame. The tell is the item's list index:
  // record each key's index after every commit, and on the next render a
  // changed index means reorder (animate) while a changed offset alone means
  // resize (snap).
  const prevIndexRef = useRef(new Map<string, number>())
  useEffect(() => {
    const m = prevIndexRef.current
    m.clear()
    groups.forEach((g, i) => m.set(g.key, i))
  })

  // The tour's coach anchor: the open card, else the first card in the list.
  const tourAnchorKey = openGroupKey ?? groups[0]?.key ?? null

  return (
    <div ref={setListEl} className="jc-project-list" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((vi) => {
        const group = groups[vi.index]
        const isOpen = openGroupKey === group.key
        const prevIndex = prevIndexRef.current.get(group.key)
        const moved = prevIndex !== undefined && prevIndex !== vi.index
        // A long-haul traveler (a card just pinned to the top) rides above the
        // one-slot shifters it crosses on the way.
        const traveled = moved && Math.abs(prevIndex - vi.index) > 1
        return (
          <motion.div
            key={group.key}
            data-index={vi.index}
            ref={virtualizer.measureElement}
            className="jc-virtual-item"
            initial={false}
            animate={{ y: vi.start - scrollMargin }}
            transition={moved ? REORDER_SPRING : { duration: 0 }}
            // No scroll/resize fires during the glide, so the wave would hold
            // each card's pre-move edge style for the whole flight — bump the
            // shared tick per animation frame to keep it reading live rects.
            onUpdate={() => tick.set(tick.get() + 1)}
            style={{ zIndex: traveled ? 2 : moved ? 1 : undefined }}
          >
            <PropertyCard
              group={group}
              open={isOpen}
              openKind={isOpen ? openKind : null}
              entrance={entrance && entranceRef.current}
              index={vi.index}
              tick={tick}
              scrollerRef={scrollerRef}
              showContract={showContract}
              marginColorsOn={marginColorsOn}
              pinned={pins.includes(group.key)}
              tourAnchor={group.key === tourAnchorKey}
              onToggle={onToggle}
              onToggleKind={onToggleKind}
              onOpenKind={onOpenKind}
              onOpenJob={onOpenJob}
              onTogglePin={onTogglePin}
              onOpenProperty={onOpenProperty}
            />
          </motion.div>
        )
      })}
    </div>
  )
}

// One table row (plus its expanded panel) as a memoized unit. The virtualizer
// re-renders JobTable on every scroll frame; without memo every visible row
// re-rendered per frame, which is what stuttered. Handlers come from Jobcost,
// which does NOT re-render on scroll, so their identities are stable and a
// shallow compare holds.
const JobRow = memo(function JobRow({ job, isOpen, detail, index, measureRef, showContract, showBudget, showPM, showStatus, showVariance, visibleColumnCount, marginColorsOn, pinned, orderDep, traveled, onToggle, onOpen, onTogglePin }: {
  job: Job
  isOpen: boolean
  detail: JobDetail | "loading" | undefined
  index: number
  measureRef: (el: Element | null) => void
  showContract: boolean
  showBudget: boolean
  showPM: boolean
  showStatus: boolean
  showVariance: boolean
  visibleColumnCount: number
  marginColorsOn: boolean
  pinned: boolean
  // Identity of the jobs array — layoutDependency, so the FLIP glide below
  // measures ONLY when the list order/membership changes, never on
  // scroll-frame re-renders.
  orderDep: unknown
  // Moved more than one slot this commit (a row pinned to the top): it rides
  // above the one-slot shifters it crosses.
  traveled: boolean
  onToggle: (job: Job) => void
  onOpen: (job: Job) => void
  /** Absent on embedded reuses (property detail page) — hides the pin tile. */
  onTogglePin?: (job: Job) => void
}) {
  // True while a reorder glide is in flight — rows turn opaque so crossing
  // rows don't read through each other.
  const [flying, setFlying] = useState(false)
  // Timestamp of the row's last click, for the quick double-click fast path.
  const lastClickRef = useRef(0)
  return (
    <motion.tbody
      data-index={index}
      ref={measureRef}
      // Rows are table-flow (no transforms to animate like the property
      // cards), so reorders glide via framer's FLIP layout animation —
      // position only, same spring as the cards.
      layout="position"
      layoutDependency={orderDep}
      transition={REORDER_SPRING}
      onLayoutAnimationStart={() => setFlying(true)}
      onLayoutAnimationComplete={() => setFlying(false)}
      className={flying ? `jc-row-flying${traveled ? " jc-row-traveler" : ""}` : undefined}
    >
      {/* The project row is unchanged on open/close — it just takes the same
          quiet ink wash as an open property card and the chevron rotates. */}
      <tr
        className={`spend-rank-table-row${isOpen ? " jc-row-open" : ""}${pinned ? " jc-row-pinned" : ""}`}
        // Double-click (within the tightened QUICK_DBLCLICK_MS window) is the
        // fast path to the full jobcost report (the two toggle clicks before
        // it cancel out, leaving the row as it was).
        onClick={(e) => {
          onToggle(job)
          if (e.timeStamp - lastClickRef.current < QUICK_DBLCLICK_MS) onOpen(job)
          lastClickRef.current = e.timeStamp
        }}
        // Suppress the text selection a double-click would otherwise make.
        onMouseDown={(e) => { if (e.detail > 1) e.preventDefault() }}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onKeyDown={(e) => e.key === "Enter" && onToggle(job)}
      >
        <td className="jc-expand-chevron-cell">
          <ChevronRight size={14} className={`jc-expand-chevron${isOpen ? " open" : ""}`} />
        </td>
        <td className="spend-rank-table-name jc-name-col">
          <div className="body-text emphasized jc-name-text" title={job.name}>{job.name}</div>
          {/* When the Status column is dropped for width, the badge folds
              into a sub-line (mirrors the mobile list) so status stays
              visible. */}
          {!showStatus && (
            <div className="cell-secondary jc-name-sub">
              <span className={`status-badge status-${job.status}`}>
                {STATUS_LABELS[job.status] ?? job.status}
              </span>
            </div>
          )}
        </td>
        {showStatus && (
          <td className="spend-rank-table-name">
            <span className={`status-badge status-${job.status}`}>
              {STATUS_LABELS[job.status] ?? job.status}
            </span>
          </td>
        )}
        {showPM && (
          <td className="spend-rank-table-name jc-pm-col">
            <div className="body-text text-secondary jc-pm-text" title={job.supervisor || undefined}>
              {job.supervisor || "—"}
            </div>
          </td>
        )}
        {showContract && (
          <td className="spend-rank-table-value body-text emphasized">{formatMoneyFull(job.contract)}</td>
        )}
        {showBudget && (
          <td className="spend-rank-table-value body-text emphasized">{formatMoneyFull(job.budget)}</td>
        )}
        <td className="spend-rank-table-value body-text emphasized">{formatMoneyFull(job.totalCost)}</td>
        {showVariance && (
          <td
            className="spend-rank-table-value body-text emphasized"
            style={{
              color:
                !marginColorsOn || job.margin == null
                  ? undefined
                  : marginTextColor(job.margin),
            }}
          >
            {formatMoneyFull(job.variance)}
          </td>
        )}
        <td
          className="spend-rank-table-value body-text emphasized"
          style={{
            color:
              !marginColorsOn || job.margin == null
                ? undefined
                : marginTextColor(job.margin),
          }}
        >
          {job.margin == null ? "—" : `${job.margin.toFixed(1)}%`}
        </td>
        <td className="spend-rank-table-name jc-view-cell">
          <button
            type="button"
            className="jc-view-tile jc-view-tile-wide"
            onClick={(e) => {
              e.stopPropagation()
              onOpen(job)
            }}
            title="Open full report"
            aria-label="Open full report"
          >
            View <ExternalLink size={13} />
          </button>
          {/* Same pin control as the property cards: neutral tile, copper
              when pinned, icon pop on pin while the row travels to the top.
              stopPropagation on click AND keydown — the row itself is a
              role=button that would otherwise toggle open. */}
          {onTogglePin && (
            <button
              type="button"
              className={`jc-pin-btn jc-row-pin${pinned ? " jc-pin-btn-active" : ""}`}
              aria-pressed={pinned}
              aria-label={pinned ? "Unpin project" : "Pin project to top"}
              title={pinned ? "Pinned — click to unpin" : "Pin to top"}
              onClick={(e) => {
                e.stopPropagation()
                onTogglePin(job)
              }}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <motion.span
                className="jc-pin-icon"
                initial={false}
                animate={{ scale: pinned ? [1, 1.35, 1] : 1 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                <Pin size={13} />
              </motion.span>
            </button>
          )}
        </td>
      </tr>
      {/* The detail panel opens/closes as an animated reveal (same timing as
          a property card body). A <tr> can't animate height, so the motion
          div lives inside the cell and the row collapses with it; the tr
          itself stays mounted through AnimatePresence until the exit
          finishes, keeping the ink frame around the shrinking panel. */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <tr key="expand" className="jc-expand-row">
            <td colSpan={visibleColumnCount}>
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.38, ease: [0.4, 0, 0.2, 1] }}
                style={{ overflow: "hidden" }}
              >
                <JobExpandedPanel job={job} detail={detail} marginColorsOn={marginColorsOn} />
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </motion.tbody>
  )
})

// The Project (flat) view table, self-contained so the row virtualizer's
// scroll-driven re-renders stay inside it — when it lived in Jobcost, every
// scroll frame re-rendered the whole page (command bar included), and the
// inline wrapper ref re-wired the width ResizeObserver per frame.
export function JobTable({ jobs, isManager, marginColorsOn, sortKey, sortDir, onSort, openJobKey, details, pins, onToggleExpand, onOpenJob, onTogglePin }: {
  jobs: Job[]
  isManager: boolean
  marginColorsOn: boolean
  sortKey: SortKey | null
  sortDir: SortDir
  onSort: (key: SortKey) => void
  openJobKey: string | null
  details: Record<string, JobDetail | "loading">
  /** Pinning is a list-page affordance; omit both to hide the pin tiles. */
  pins?: string[]
  onToggleExpand: (job: Job) => void
  onOpenJob: (job: Job) => void
  onTogglePin?: (job: Job) => void
}) {
  // Fit-driven column visibility (see HIDE_ORDER above): `hiddenCount` is how
  // deep into the hide order we currently are.
  const [observeWrapWidth, tableWidth] = useElementWidth()
  const wrapElRef = useRef<HTMLDivElement | null>(null)
  const [scroller, setScroller] = useState<HTMLElement | null>(null)
  const [scrollMargin, setScrollMargin] = useState(0)
  const [hiddenCount, setHiddenCount] = useState(0)
  // Container width at the moment each hide happened, indexed by the hide
  // level it created — the re-show hysteresis marks.
  const hidAtWidthRef = useRef<number[]>([])

  // Stable callback ref: feeds the width observer, the overflow check, and
  // the virtualizer's scroll-element/offset resolution exactly once per
  // mount/unmount (an inline ref here re-ran all of it every render).
  const tableWrapRef = useCallback((el: HTMLDivElement | null) => {
    wrapElRef.current = el
    observeWrapWidth(el)
    if (el) {
      const sc = (el.closest(".page") as HTMLElement) ?? null
      setScroller(sc)
      if (sc) {
        const sr = sc.getBoundingClientRect()
        const er = el.getBoundingClientRect()
        setScrollMargin(Math.max(0, Math.round(er.top - sr.top + sc.scrollTop)))
      }
    }
  }, [observeWrapWidth])

  // Managers never get a Contract column, so it isn't part of their sequence.
  const hideOrder: readonly HideableCol[] = isManager
    ? HIDE_ORDER.filter((c) => c !== "contract")
    : HIDE_ORDER
  const hiddenCols = new Set<HideableCol>(hideOrder.slice(0, hiddenCount))
  const showContract = !isManager && !hiddenCols.has("contract")
  const showPM = !hiddenCols.has("supervisor")
  const showStatus = !hiddenCols.has("status")
  const showVariance = !hiddenCols.has("variance")
  const showBudget = !hiddenCols.has("budget")
  // Chevron + Project + Cost + Margin + View always render; the rest count
  // only when visible. Drives the expanded panel's colSpan.
  const visibleColumnCount =
    5 +
    (showContract ? 1 : 0) +
    (showPM ? 1 : 0) +
    (showStatus ? 1 : 0) +
    (showVariance ? 1 : 0) +
    (showBudget ? 1 : 0)

  // Re-measure only when fit inputs actually change — running this on every
  // commit forced a synchronous reflow per scroll frame (the stutter). Each
  // pass changes hiddenCount by at most one; setState from a layout effect
  // re-renders synchronously, so a cascade of hides settles before paint.
  useLayoutEffect(() => {
    const wrap = wrapElRef.current
    if (!wrap || tableWidth == null) return
    const overflow = wrap.scrollWidth - wrap.clientWidth
    if (overflow > 1 && hiddenCount < hideOrder.length) {
      hidAtWidthRef.current[hiddenCount] = tableWidth
      setHiddenCount(hiddenCount + 1)
    } else if (
      hiddenCount > 0 &&
      tableWidth > (hidAtWidthRef.current[hiddenCount - 1] ?? Number.POSITIVE_INFINITY) + RESHOW_BUFFER
    ) {
      setHiddenCount(hiddenCount - 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableWidth, hiddenCount, jobs, isManager])

  // Widest rendered content per column across the FULL dataset. Auto table
  // layout sizes columns from mounted content only, and the virtualizer
  // mounts a sliding window of rows — so as scrolling swapped rows in and
  // out, every column (and the flexible Project column with them) re-flowed.
  // An always-mounted zero-height sizer row carries these values so column
  // widths are pinned to the dataset maximum no matter which rows are live.
  const sizer = useMemo(() => {
    const longest = (vals: string[]) => vals.reduce((a, b) => (b.length > a.length ? b : a), "")
    return {
      status: longest(jobs.map((j) => STATUS_LABELS[j.status] ?? String(j.status))),
      contract: longest(jobs.map((j) => formatMoneyFull(j.contract))),
      budget: longest(jobs.map((j) => formatMoneyFull(j.budget))),
      cost: longest(jobs.map((j) => formatMoneyFull(j.totalCost))),
      variance: longest(jobs.map((j) => formatMoneyFull(j.variance))),
      margin: longest(jobs.map((j) => (j.margin == null ? "—" : `${j.margin.toFixed(1)}%`))),
    }
  }, [jobs])

  // Each item is a <tbody> holding the row plus its optional expanded panel,
  // so measurement covers the open panel too.
  const rowVirtualizer = useVirtualizer({
    count: jobs.length,
    getScrollElement: () => scroller,
    estimateSize: () => 46,
    overscan: 6,
    scrollMargin,
    getItemKey: (i) => jobs[i].recnum,
  })
  const virtualRows = rowVirtualizer.getVirtualItems()
  // Same tell as PropertyList: each key's index is recorded after every
  // commit, and a >1-slot index change on the next render marks a long-haul
  // traveler (a row pinned to the top) that should ride above the one-slot
  // shifters it crosses mid-glide.
  const prevIndexRef = useRef(new Map<string, number>())
  useEffect(() => {
    const m = prevIndexRef.current
    m.clear()
    jobs.forEach((j, i) => m.set(j.recnum, i))
  })
  // item.start includes scrollMargin; getTotalSize() excludes it. Rounded:
  // measured offsets are fractional, and fractional spacer heights make the
  // table wrapper ~1px scrollable (phantom inner scrollbar).
  const padTop = virtualRows.length ? Math.max(0, Math.round(virtualRows[0].start - scrollMargin)) : 0
  const padBottom = virtualRows.length
    ? Math.max(0, Math.round(rowVirtualizer.getTotalSize() - (virtualRows[virtualRows.length - 1].end - scrollMargin)))
    : 0

  return (
    <div className="jc-table-wrap" ref={tableWrapRef}>
      <table className="spend-rank-table">
        <thead>
          <tr>
            <th className="spend-rank-table-name jc-expand-th" aria-hidden="true" />
            <SortTh spendRank col="name" label="Project" className="jc-name-col" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            {showStatus && (
              <SortTh spendRank col="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            )}
            {showPM && (
              <SortTh spendRank col="supervisor" label="PM" className="jc-pm-col" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            )}
            {showContract && (
              <SortTh spendRank col="contract" label="Contract" align="right" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            )}
            {showBudget && (
              <SortTh spendRank col="budget" label="Budget" align="right" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            )}
            <SortTh spendRank col="totalCost" label="Cost" align="right" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            {showVariance && (
              <SortTh
                spendRank
                col="variance"
                label={showPM ? "Budget Variance" : "Variance"}
                align="right"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
            )}
            <SortTh spendRank col="margin" label="Margin" align="right" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <th className="spend-rank-table-name jc-view-th" aria-label="Actions" />
          </tr>
        </thead>
        {/* Zero-height sizer row (see `sizer` above): same cell classes as a
            real row so fonts/padding match, content hidden inside height-0
            wrappers so it adds no visual height. */}
        <tbody aria-hidden="true" className="jc-sizer-body">
          <tr>
            <td className="jc-expand-chevron-cell" />
            <td className="spend-rank-table-name jc-name-col" />
            {showStatus && (
              <td className="spend-rank-table-name">
                <div className="jc-sizer-content">
                  <span className="status-badge">{sizer.status}</span>
                </div>
              </td>
            )}
            {showPM && <td className="spend-rank-table-name jc-pm-col" />}
            {showContract && (
              <td className="spend-rank-table-value body-text emphasized">
                <div className="jc-sizer-content">{sizer.contract}</div>
              </td>
            )}
            {showBudget && (
              <td className="spend-rank-table-value body-text emphasized">
                <div className="jc-sizer-content">{sizer.budget}</div>
              </td>
            )}
            <td className="spend-rank-table-value body-text emphasized">
              <div className="jc-sizer-content">{sizer.cost}</div>
            </td>
            {showVariance && (
              <td className="spend-rank-table-value body-text emphasized">
                <div className="jc-sizer-content">{sizer.variance}</div>
              </td>
            )}
            <td className="spend-rank-table-value body-text emphasized">
              <div className="jc-sizer-content">{sizer.margin}</div>
            </td>
            <td className="spend-rank-table-name jc-view-cell" />
          </tr>
        </tbody>
        {/* Virtualized: spacer bodies stand in for off-screen rows. */}
        <tbody aria-hidden="true">
          <tr style={{ height: padTop }} />
        </tbody>
        {virtualRows.map((vi) => {
          const job = jobs[vi.index]
          const prevIndex = prevIndexRef.current.get(job.recnum)
          return (
            <JobRow
              key={job.recnum}
              job={job}
              isOpen={openJobKey === job.recnum}
              detail={details[job.recnum]}
              index={vi.index}
              orderDep={jobs}
              traveled={prevIndex !== undefined && Math.abs(prevIndex - vi.index) > 1}
              measureRef={rowVirtualizer.measureElement}
              showContract={showContract}
              showBudget={showBudget}
              showPM={showPM}
              showStatus={showStatus}
              showVariance={showVariance}
              visibleColumnCount={visibleColumnCount}
              marginColorsOn={marginColorsOn}
              pinned={pins?.includes(job.recnum) ?? false}
              onToggle={onToggleExpand}
              onOpen={onOpenJob}
              onTogglePin={onTogglePin}
            />
          )
        })}
        <tbody aria-hidden="true">
          <tr style={{ height: padBottom }} />
        </tbody>
      </table>
    </div>
  )
}

export default function Jobcost() {
  const { goToJobcost, goToProperty } = useJobcostNav()
  const marginColorsOn = useMarginColorsEnabled()
  // Visiting the board is the strongest possible acknowledgment of its
  // "new way to jobcost" nav hint — clear the milestone so the hint never
  // shows (or stops showing) once the user has found the page.
  const { seen, acknowledge } = useOnboarding()
  useEffect(() => {
    if (!seen(SECTION_JOBCOST_REDESIGN)) acknowledge(SECTION_JOBCOST_REDESIGN)
  }, [seen, acknowledge])
  // Mobile: the table collapses to a simple tap-through list — name + status
  // on the left, margin + chevron on the right, tap → full project report.
  // (Grouped view is desktop-only for now; mobile always shows the flat list.)
  const isMobile = useIsMobile()
  // Managers (PMs) default to their own projects but can flip to the whole
  // company list via a toolbar toggle; everyone else always sees all projects.
  const { claims } = useAuth()
  const isManager = claims["role"] === "manager"
  const [showAllProjects, setShowAllProjects] = useLocalStorage("jobcostShowAllProjects", false)
  // The "when" pair (year + phase) starts each session from the user's
  // default-range preference (Settings: open phase / this month / all phases)
  // and is session-scoped from there: picks survive route changes within the
  // tab, a new session starts back at the default. While the pair is untouched
  // (no session key yet), the fetch below may still snap it to the real open
  // period when the cached guess was stale.
  const [year, setYear] = useSessionStorage<number | null>(JOBCOST_YEAR_SESSION_KEY, () => resolveDefaultRange().year)
  const [phaseFilter, setPhaseFilter] = useSessionStorage<PhaseFilter>(
    JOBCOST_PHASE_SESSION_KEY,
    () => resolveDefaultRange().phase,
  )
  const [viewMode, setViewMode] = useLocalStorage<ViewMode>("jobcostViewMode", "grouped")
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  // null = unsorted (default name order); each header cycles through its
  // default direction → reversed → cleared on repeated clicks.
  const [sortKey, setSortKey] = useState<SortKey | null>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [groupSort, setGroupSort] = useState<GroupSortKey>("name")
  const [groupSortDir, setGroupSortDir] = useState<SortDir>("asc")
  // Pinned property keys (Group.key = Sage parent string), in pin order.
  // Stale keys (properties absent this year, or gone entirely) are harmless —
  // the partition below simply never matches them.
  const [pins, setPins] = useLocalStorage<string[]>("jobcostPinnedProperties", [])
  // Project-view pins, keyed by recnum (its own list — a pinned property and
  // a pinned project are different objects, so they don't share keys).
  const [projectPins, setProjectPins] = useLocalStorage<string[]>("jobcostPinnedProjects", [])
  // One-time repair: a since-fixed replay bug in useLocalStorage could
  // double-apply pin toggles and leave duplicate keys behind; a duplicate
  // skews the pin-order ranking (Map keeps the LAST index per key).
  useEffect(() => {
    setPins((prev) => {
      const uniq = [...new Set(prev)]
      return uniq.length === prev.length ? prev : uniq
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  // Single-open everywhere: at most one list row and one property card are
  // expanded at a time, and within an open property at most one sub-card
  // (phases OR one-offs).
  const [openJobKey, setOpenJobKey] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, JobDetail | "loading">>({})
  // Bumped whenever `details` is wholesale-cleared (year/scope change) so
  // in-flight loadDetail resolves from the old epoch discard themselves.
  const detailEpochRef = useRef(0)
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(null)
  const [openKind, setOpenKind] = useState<"phases" | "oneoffs" | null>(null)
  // The property cards' blur-in stagger plays once per page visit; re-entering
  // the view via the toggle relies on the crossfade alone.
  const entrancePlayedRef = useRef(false)

  const grouped = viewMode === "grouped" && !isMobile
  // Content lags the toggle by one concurrent render: the seg thumb and click
  // feedback stay instant while the heavy list/table swap renders in the
  // background instead of blocking the frame.
  const deferredViewMode = useDeferredValue(viewMode)
  const groupedContent = deferredViewMode === "grouped" && !isMobile

  // Mark the entrance as spent once the property view has shown anything —
  // including the ghost-card skeleton, which plays the blur-in stagger itself.
  // The real cards then arrive via the crossfade alone, already in place,
  // instead of re-blurring on top of it.
  useEffect(() => {
    if (groupedContent) entrancePlayedRef.current = true
  }, [groupedContent])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    // A new year reloads the list, so drop any open rows + cached detail. The
    // epoch bump makes any in-flight loadDetail resolve a no-op — without it a
    // previous-year breakdown could land after this clear and stick in the
    // cache (toggleExpand skips the refetch when an entry exists).
    detailEpochRef.current++
    setOpenJobKey(null)
    setDetails({})
    setOpenGroupKey(null)
    setOpenKind(null)
    // yearFlag: fetch the all-time list with a per-row yearActive bit instead
    // of a server-filtered year subset (see the header comment). allProjects
    // is a manager-only hint: when on, the backend drops the PM scoping and
    // returns the whole company list. Ignored for other roles.
    // Params and queries must keep this exact shape/order so a daily-arrival
    // preload's cache key matches (see pageDataCache). getOpenPeriod rides
    // along to keep the cached open period fresh for the default-range
    // preference — same round-trip, keyed alongside getPhases.
    const params = { year, yearFlag: true, allProjects: isManager ? showAllProjects : null }
    const queries = ["getPhases", "getOpenPeriod"]
    const preloaded = takePreloadedPageData("jobcost", queries, params)
    const request = preloaded
      ? // A failed preload shouldn't strand the page — fall back to a real fetch.
        preloaded.catch(() =>
          fetchPageData({ module: "jobcost", queries, params, signal: controller.signal })
        )
      : fetchPageData({ module: "jobcost", queries, params, signal: controller.signal })
    request
      .then((result) => {
        if (controller.signal.aborted) return
        const data = result.getPhases
        if (Array.isArray(data)) setJobs((data as RawProject[]).map(normalizeProject))
        setLoading(false)
        // When this visit's start was GUESSED (open-phase preference, pair
        // still untouched) and the real open period disagrees, snap to it —
        // the setters no-op when the guess was already right. A backend that
        // doesn't serve getOpenPeriod yet returns null here, and the calendar
        // guess simply stands.
        const open = cacheOpenPeriod(result.getOpenPeriod)
        if (
          open &&
          readJobcostDefaultRange() === "open-phase" &&
          !hasSessionValue(JOBCOST_YEAR_SESSION_KEY) &&
          !hasSessionValue(JOBCOST_PHASE_SESSION_KEY)
        ) {
          setYear(open.postyr)
          setPhaseFilter(open.actprd)
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") setLoading(false)
      })
    return () => controller.abort()
    // The setters are useCallback-stable — listed only to satisfy the lint.
  }, [year, isManager, showAllProjects, setYear, setPhaseFilter])

  function loadDetail(job: Job) {
    const epoch = detailEpochRef.current
    setDetails((d) => ({ ...d, [job.recnum]: "loading" }))
    fetchPageData({
      module: "jobcost",
      queries: ["getBudgetByRecnum", "getAllCostItems"],
      // Pass the active year so the inline breakdown matches the row's
      // year-filtered summary numbers (the full report via View is all-time).
      params: { recnum: Number(job.jobNumber), year },
    })
      .then((result) => {
        if (epoch !== detailEpochRef.current) return
        setDetails((d) => ({
          ...d,
          [job.recnum]: {
            budget: (result.getBudgetByRecnum as BudgetBreakdown) ?? null,
            costItems: Array.isArray(result.getAllCostItems) ? (result.getAllCostItems as CostItem[]) : [],
          },
        }))
      })
      .catch(() => {
        if (epoch !== detailEpochRef.current) return
        setDetails((d) => ({ ...d, [job.recnum]: { budget: null, costItems: [] } }))
      })
  }

  function toggleExpand(job: Job) {
    const willOpen = openJobKey !== job.recnum
    // Count an inline expand as a "widget"-source project view (distinct from a
    // full job-detail page open). Only on open, and use jobNumber so it groups
    // with page opens under the same recnum.
    if (willOpen) {
      trackProjectView(job.jobNumber, job.name, "widget")
      if (!details[job.recnum]) loadDetail(job)
    }
    setOpenJobKey(willOpen ? job.recnum : null)
  }

  // Opening a report navigates away from the board — mid-tour that would
  // otherwise silently graduate/abort the flow, so it's blocked with a nudge
  // back to finishing it instead.
  const tourActive = useTourActive()
  const tourCardEl = useCoachTarget("jc-card")
  // The coachmark card's own centerX (published by JobcostIntro) — aligning
  // to this instead of re-deriving the card's rect keeps the nudge in exact
  // horizontal lockstep with the tooltip beneath it.
  const tourCardPos = useTourCardPos()
  const [tourBlockedTip, setTourBlockedTip] = useState<{ left: number; top: number } | null>(null)
  const tourBlockedTipTimer = useRef<number | null>(null)
  useEffect(() => () => {
    if (tourBlockedTipTimer.current != null) window.clearTimeout(tourBlockedTipTimer.current)
  }, [])

  function showTourBlockedTip() {
    const r = tourCardEl?.getBoundingClientRect()
    const left = tourCardPos?.centerX ?? (r ? r.left + r.width / 2 : window.innerWidth / 2)
    const top = r ? r.top - 10 : 80
    setTourBlockedTip({ left, top })
    if (tourBlockedTipTimer.current != null) window.clearTimeout(tourBlockedTipTimer.current)
    tourBlockedTipTimer.current = window.setTimeout(() => setTourBlockedTip(null), 2200)
  }

  function openJob(job: Job) {
    if (tourActive) {
      showTourBlockedTip()
      return
    }
    goToJobcost(job.jobNumber)
  }

  function openProperty(group: Group) {
    if (tourActive) {
      showTourBlockedTip()
      return
    }
    goToProperty(group.key)
  }

  function toggleGroup(group: Group) {
    setOpenGroupKey((k) => (k === group.key ? null : group.key))
    setOpenKind(null)
  }

  function toggleKind(kind: "phases" | "oneoffs") {
    // Radio-with-off behavior: clicking the open card closes it, clicking the
    // other swaps to it.
    setOpenKind((k) => (k === kind ? null : kind))
  }

  // Head chips ("3 Phases ›") jump straight to that section of the card.
  function openWithKind(group: Group, kind: "phases" | "oneoffs") {
    setOpenGroupKey(group.key)
    setOpenKind(kind)
  }

  function handleGroupSortKey(key: GroupSortKey) {
    setGroupSort(key)
    // Text sorts read A-Z; numeric sorts lead with the biggest.
    setGroupSortDir(key === "name" || key === "client" ? "asc" : "desc")
  }

  function togglePin(group: Group) {
    setPins((prev) => (prev.includes(group.key) ? prev.filter((k) => k !== group.key) : [...prev, group.key]))
  }

  function togglePinProject(job: Job) {
    setProjectPins((prev) =>
      prev.includes(job.recnum) ? prev.filter((k) => k !== job.recnum) : [...prev, job.recnum],
    )
  }

  // ── Job Costing tour (JobcostIntro) integration ──────────────────────────
  // The tour host lives in App.tsx, outside this lazy chunk; it watches the
  // board through tourBus and drives it through a registered controller
  // (escape-hatch "Next" actions + the end-of-tour restore). The controller
  // is a one-time delegator over a latest-values ref so its calls never see
  // stale closures.
  const segTargetRef = useMemo(() => coachTargetRef("jc-view-seg"), [])
  const whenTargetRef = useMemo(() => coachTargetRef("jc-when"), [])
  const tourCtlRef = useRef<JobcostTourController | null>(null)
  useEffect(() => {
    const delegator: JobcostTourController = {
      setView: (m) => tourCtlRef.current?.setView(m),
      openFirstGroup: () => tourCtlRef.current?.openFirstGroup(),
      openKind: (k) => tourCtlRef.current?.openKind(k),
      openProperty: () => tourCtlRef.current?.openProperty(),
      togglePinFirst: () => tourCtlRef.current?.togglePinFirst(),
      restore: (b) => tourCtlRef.current?.restore(b),
    }
    registerJobcostTourController(delegator)
    return () => {
      registerJobcostTourController(null)
      publishJobcostTourState(null)
    }
  }, [])

  function handleSort(key: SortKey) {
    // Text columns default asc, numeric columns default desc.
    const defaultDir: SortDir = key === "name" || key === "supervisor" ? "asc" : "desc"
    if (sortKey !== key) {
      setSortKey(key)
      setSortDir(defaultDir)
    } else if (sortDir === defaultDir) {
      setSortDir(defaultDir === "asc" ? "desc" : "asc")
    } else {
      // Third click clears the sort back to the default order.
      setSortKey(null)
    }
  }

  // Closed marks jobs from previous years that are fully wrapped up, so it
  // can't apply to anything in the CURRENT calendar year — hide Closed rows
  // (and the filter option) only there. Previous years and All Time show
  // Closed jobs as normal.
  const thisYear = new Date().getFullYear()
  const hideClosed = year === thisYear

  function handleYearChange(y: number | null) {
    setYear(y)
    // Don't strand the user on a filter that can no longer match anything.
    if (y === thisYear && statusFilter === 6) setStatusFilter("all")
  }

  // List view rows: scope to the selected year (yearActive is always true on
  // an All Time fetch), then status + search + sort.
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    let list = jobs.filter((j) => j.yearActive && !(hideClosed && j.status === 6))
    if (statusFilter !== "all") list = list.filter((j) => j.status === statusFilter)
    if (phaseFilter !== "all") list = list.filter((j) => jobMatchesPhase(j, phaseFilter))
    if (q)
      list = list.filter(
        (j) =>
          j.name?.toLowerCase().includes(q) ||
          j.jobNumber?.toLowerCase().includes(q) ||
          j.supervisor?.toLowerCase().includes(q),
      )
    const sorted = [...list].sort((a, b) => {
      // Cleared sort = the default name order.
      if (sortKey == null) return a.name.localeCompare(b.name)
      const dir = sortDir === "asc" ? 1 : -1
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir
      if (sortKey === "supervisor") return (a.supervisor ?? "").localeCompare(b.supervisor ?? "") * dir
      if (sortKey === "status") return (a.status - b.status) * dir
      if (sortKey === "contract") return (a.contract - b.contract) * dir
      if (sortKey === "totalCost") return (a.totalCost - b.totalCost) * dir
      if (sortKey === "budget") return (a.budget - b.budget) * dir
      if (sortKey === "variance") return (a.variance - b.variance) * dir
      // margin can be null — push nulls to the end regardless of direction.
      const am = a.margin == null ? Number.NEGATIVE_INFINITY : a.margin
      const bm = b.margin == null ? Number.NEGATIVE_INFINITY : b.margin
      return (am - bm) * dir
    })
    // Same pin rule as the property view: pinned projects float to the top
    // in pin order, but only while the view sits at its defaults (no sort or
    // the equivalent explicit name-asc counts as default).
    const defaultOrder = sortKey == null || (sortKey === "name" && sortDir === "asc")
    if (!(defaultOrder && search === "" && statusFilter === "all") || projectPins.length === 0)
      return sorted
    const rank = new Map(projectPins.map((k, i) => [k, i] as const))
    const pinnedRows: Job[] = []
    const rest: Job[] = []
    for (const j of sorted) (rank.has(j.recnum) ? pinnedRows : rest).push(j)
    pinnedRows.sort((a, b) => rank.get(a.recnum)! - rank.get(b.recnum)!)
    return [...pinnedRows, ...rest]
  }, [jobs, search, statusFilter, phaseFilter, sortKey, sortDir, hideClosed, projectPins])

  // Pins only privilege ordering while the command bar sits at its defaults.
  // Any sort/search/filter dissolves them into the list as ordinary rows
  // (still marked); the Reset button returns here and floats them back up.
  // The "when" pair (year + phase) is deliberately NOT part of this: like the
  // year always was, phase now scopes WHEN you're looking at — it starts on
  // the user's preferred default, so it can't count against "default view"
  // and Reset leaves it alone.
  const isDefaultView =
    groupSort === "name" && groupSortDir === "asc" && search === "" && statusFilter === "all"
  const isListDefaultView =
    (sortKey == null || (sortKey === "name" && sortDir === "asc")) &&
    search === "" &&
    statusFilter === "all"

  function resetView() {
    setGroupSort("name")
    setGroupSortDir("asc")
    setSortKey("name")
    setSortDir("asc")
    setSearch("")
    setStatusFilter("all")
  }

  // Grouped view: a parent qualifies if ANY member was active in the selected
  // year, but its stats/counts always cover the full all-time membership.
  const filteredGroups = useMemo(() => {
    const q = search.toLowerCase()
    // Same current-year rule as the list view: a fully-closed property (every
    // member Closed) can't belong to the current calendar year.
    let list = buildGroups(jobs).filter((g) => g.yearActive && !(hideClosed && g.status === 6))
    if (statusFilter !== "all") list = list.filter((g) => g.status === statusFilter)
    // A property stays visible if ANY member would survive the list view's
    // filters for this year + phase (its card still shows the full
    // membership). The yearActive check matters: the fetch is the ALL-TIME
    // membership, so a bare phase match would keep a property alive on a
    // phase-11 job from some PAST year even though the selected year has
    // nothing in phase 11.
    if (phaseFilter !== "all")
      list = list.filter((g) =>
        [...g.phases, ...g.oneoffs].some((m) => m.yearActive && jobMatchesPhase(m, phaseFilter)),
      )
    if (q)
      list = list.filter(
        (g) =>
          g.key.toLowerCase().includes(q) ||
          g.client.toLowerCase().includes(q) ||
          [...g.phases, ...g.oneoffs].some(
            (m) =>
              m.name?.toLowerCase().includes(q) ||
              m.oneoffName?.toLowerCase().includes(q) ||
              m.jobNumber?.toLowerCase().includes(q),
          ),
      )
    const sorted = [...list].sort((a, b) => {
      const dir = groupSortDir === "asc" ? 1 : -1
      let cmp = 0
      if (groupSort === "volume") cmp = a.contract - b.contract
      else if (groupSort === "units") cmp = a.units - b.units
      else if (groupSort === "phases") cmp = a.phases.length - b.phases.length
      else if (groupSort === "projects") cmp = a.oneoffs.length - b.oneoffs.length
      else if (groupSort === "client") {
        // Clientless properties sink to the end regardless of direction.
        if (!a.client !== !b.client) return a.client ? -1 : 1
        cmp = a.client.localeCompare(b.client)
      } else if (groupSort === "margin") {
        // Null margins sink to the end regardless of direction.
        const am = a.margin == null ? Number.NEGATIVE_INFINITY : a.margin
        const bm = b.margin == null ? Number.NEGATIVE_INFINITY : b.margin
        cmp = am - bm
      } else {
        cmp = a.key.localeCompare(b.key)
      }
      // Name breaks ties so equal counts keep a stable, scannable order.
      return cmp * dir || a.key.localeCompare(b.key)
    })
    // Default view only: pinned properties float to the top in pin order
    // (drag-reorderable); everything else keeps the name sort below them.
    if (!isDefaultView || pins.length === 0) return sorted
    const rank = new Map(pins.map((k, i) => [k, i] as const))
    const pinned: Group[] = []
    const rest: Group[] = []
    for (const g of sorted) (rank.has(g.key) ? pinned : rest).push(g)
    pinned.sort((a, b) => rank.get(a.key)! - rank.get(b.key)!)
    return [...pinned, ...rest]
  }, [jobs, search, statusFilter, phaseFilter, groupSort, groupSortDir, hideClosed, pins, isDefaultView])

  // Fresh controller each render (closures see current state); the registered
  // delegator forwards into it. Restore reinstates the pre-tour view/pins and
  // collapses whatever the tour opened.
  tourCtlRef.current = {
    setView: (m) => setViewMode(m),
    openFirstGroup: () => {
      const g = filteredGroups[0]
      if (g) {
        setOpenGroupKey(g.key)
        setOpenKind(null)
      }
    },
    openKind: (k) => {
      setOpenGroupKey((key) => key ?? filteredGroups[0]?.key ?? null)
      setOpenKind(k)
    },
    openProperty: () => {
      const g = filteredGroups.find((x) => x.key === openGroupKey) ?? filteredGroups[0]
      if (g) goToProperty(g.key)
    },
    togglePinFirst: () => {
      const g = filteredGroups[0]
      if (g) togglePin(g)
    },
    restore: (b) => {
      setViewMode(b.view === "grouped" ? "grouped" : "list")
      setPins(b.pins)
      setOpenGroupKey(null)
      setOpenKind(null)
    },
  }

  // Publish the snapshot the tour advances on (shallow-eq guarded in the bus).
  useEffect(() => {
    publishJobcostTourState({
      view: grouped ? "grouped" : "list",
      loading,
      groupCount: filteredGroups.length,
      openGroupKey,
      openKind,
      pins,
    })
  })

  const resultCount = groupedContent ? filteredGroups.length : filtered.length
  const resultNoun = groupedContent
    ? resultCount === 1 ? "Property" : "Properties"
    : resultCount === 1 ? "Project" : "Projects"
  const searchPlaceholder = grouped ? "Search properties..." : "Search projects..."

  // Desktop home of the year control is the command bar (below); the shared
  // header YearSelector only renders on mobile, where the bar doesn't exist.
  const yearOptions: number[] = []
  for (let y = thisYear; y >= MIN_YEAR; y--) yearOptions.push(y)

  return (
    <Page
      title="Job Costing"
      actions={isMobile ? <YearSelector value={year} onChange={handleYearChange} allowAllTime /> : undefined}
    >
      <MotionList className="inv-page-stack">
        {/* Desktop command bar: a dark control deck, deliberately a different
            surface from the white property cards below it. Stays mounted
            across loading/view swaps so the controls never jump. */}
        {!isMobile && (
          <MotionItem>
            <div className="jc-command-bar">
              <SegmentedControl
                rootRef={segTargetRef}
                variant="jc"
                ariaLabel="View mode"
                layoutId="jcViewThumb"
                value={grouped ? "grouped" : "list"}
                options={[
                  { key: "grouped", label: "Property" },
                  { key: "list", label: "Project" },
                ]}
                onChange={(k) => setViewMode(k)}
              />
              <span className="jc-cb-divider" aria-hidden="true" />
              {isManager && (
                <SegmentedControl
                  variant="jc"
                  ariaLabel="Project scope"
                  layoutId="jcScopeThumb"
                  value={showAllProjects ? "all" : "mine"}
                  options={[
                    { key: "mine", label: "Mine" },
                    { key: "all", label: "All" },
                  ]}
                  onChange={(k) => setShowAllProjects(k === "all")}
                />
              )}
              {/* Year + phase share one joined control (same seam treatment
                  as the sort) — together they answer "when". Starts on the
                  user's default-range preference (see defaultRange.ts); also
                  a coach target for the tour's when-filter beat. */}
              <span ref={whenTargetRef} className="jc-cb-join">
                <span className="jc-cb-select-wrap">
                  <select
                    className="jc-cb-select"
                    value={year == null ? "all" : String(year)}
                    onChange={(e) => handleYearChange(e.target.value === "all" ? null : Number(e.target.value))}
                    aria-label="Select year"
                  >
                    <option value="all">All Time</option>
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={12} className="jc-cb-select-arrow" />
                </span>
                <span className="jc-cb-select-wrap">
                  <select
                    className="jc-cb-select"
                    value={String(phaseFilter)}
                    onChange={(e) => setPhaseFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
                    aria-label="Filter by phase"
                  >
                    {PHASE_OPTIONS.map((o) => (
                      <option key={String(o.key)} value={String(o.key)}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={12} className="jc-cb-select-arrow" />
                </span>
              </span>
              <span className="jc-cb-select-wrap">
                <select
                  className="jc-cb-select"
                  value={String(statusFilter)}
                  onChange={(e) => setStatusFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
                  aria-label="Filter by status"
                >
                  {STATUS_OPTIONS.filter((o) => !hideClosed || o.key !== 6).map((o) => (
                    <option key={String(o.key)} value={String(o.key)}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={12} className="jc-cb-select-arrow" />
              </span>
              {grouped && (
                /* Sort select + direction share one joined control so the
                   arrow reads as part of the sort, not a stray button. The
                   direction half says what it does in words ("A-Z" /
                   "High-Low"), not just an arrow glyph. */
                <span className="jc-cb-sort">
                  <span className="jc-cb-select-wrap">
                    <select
                      className="jc-cb-select jc-cb-sort-select"
                      value={groupSort}
                      onChange={(e) => handleGroupSortKey(e.target.value as GroupSortKey)}
                      aria-label="Sort properties"
                    >
                      {GROUP_SORT_OPTIONS.filter((o) => !isManager || o.key !== "volume").map((o) => (
                        <option key={o.key} value={o.key}>
                          Sort: {o.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={12} className="jc-cb-select-arrow" />
                  </span>
                  <button
                    type="button"
                    className="jc-cb-dir"
                    onClick={() => setGroupSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                    aria-label={groupSortDir === "asc" ? "Sorted ascending, switch to descending" : "Sorted descending, switch to ascending"}
                    title="Reverse sort order"
                  >
                    {groupSortDir === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
                    <AnimatedWidth>
                      <span className="jc-cb-dir-label">
                        {groupSort === "name" || groupSort === "client"
                          ? groupSortDir === "asc" ? "A-Z" : "Z-A"
                          : groupSortDir === "asc" ? "Low-High" : "High-Low"}
                      </span>
                    </AnimatedWidth>
                  </button>
                </span>
              )}
              <AnimatePresence initial={false}>
                {(grouped ? !isDefaultView : !isListDefaultView) && (
                  /* Back-to-default: clears sort, search, and status in one go,
                     which also floats any pinned properties/projects back to
                     the top of their view. */
                  <motion.button
                    key="jc-cb-reset"
                    type="button"
                    className="jc-cb-dir"
                    onClick={resetView}
                    title="Clear sort, search, and filters"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                  >
                    <RotateCcw size={13} />
                    <span>Reset</span>
                  </motion.button>
                )}
              </AnimatePresence>
              <div className="jc-cb-search">
                <Search size={14} className="jc-cb-search-icon" />
                <input
                  className="jc-cb-search-input"
                  type="text"
                  placeholder={searchPlaceholder}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <span className="jc-cb-count">
                <span className="jc-cb-count-num">{resultCount}</span> {resultNoun}
              </span>
            </div>
          </MotionItem>
        )}

        {isMobile ? (
          <MotionItem>
          <Widget className="co-widget">
            <div className="co-widget-toolbar">
              <div className="co-search-wrapper">
                <Search size={13} className="co-search-icon" />
                <input
                  className="co-search-input"
                  type="text"
                  placeholder="Search projects..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <MobileFilterButton
                count={activeFilterCount(
                  isManager
                    ? { status: String(statusFilter), phase: String(phaseFilter), scope: showAllProjects ? "all" : "mine" }
                    : { status: String(statusFilter), phase: String(phaseFilter) },
                  isManager ? MANAGER_FILTER_DEFAULTS : FILTER_DEFAULTS,
                )}
                onClick={() => setFilterSheetOpen(true)}
              />
              <span className="co-count subheadline text-secondary">
                {resultCount} {resultNoun}
              </span>
            </div>

            {loading ? (
              <div className="widget-skeleton" />
            ) : jobs.length === 0 ? (
              <div className="widget-no-data">
                <ChartNoAxesColumn size={24} className="widget-no-data-icon" />
                <span className="body-text">No data available</span>
              </div>
            ) : resultCount === 0 && (search || statusFilter !== "all" || phaseFilter !== "all") ? (
              <div className="co-no-results body-text text-secondary">
                {search ? `No projects match "${search}"` : "No projects match your filters"}
              </div>
            ) : (
              <ul className="jc-mobile-list">
                {filtered.map((job) => (
                  <li key={job.recnum}>
                    <button
                      type="button"
                      className="jc-mobile-row"
                      onClick={() => goToJobcost(job.jobNumber)}
                      title="Open full report"
                    >
                      <span className="jc-mobile-main">
                        <span className="body-text emphasized jc-mobile-name">{job.name}</span>
                        <span className="jc-mobile-sub">
                          <span className={`status-badge status-${job.status}`}>
                            {STATUS_LABELS[job.status] ?? job.status}
                          </span>
                          {job.supervisor && <span className="jc-mobile-pm">{job.supervisor}</span>}
                        </span>
                      </span>
                      <span className="jc-mobile-right">
                        <span
                          className="jc-mobile-margin"
                          style={{
                            color:
                              !marginColorsOn || job.margin == null
                                ? undefined
                                : marginTextColor(job.margin),
                          }}
                        >
                          {job.margin == null ? "—" : `${job.margin.toFixed(1)}%`}
                        </span>
                        <ChevronRight size={16} className="jc-mobile-chevron" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Widget>
          </MotionItem>
        ) : (
          /* View switches crossfade (mode="wait": ~150ms out, then in) — the
             heavy mount of the incoming view lands behind the fade instead of
             popping mid-frame, which is what read as lag. NOTE: no
             initial={false} here — that flag propagates "skip initial
             animations" to every descendant, which froze the ghost cards'
             blur-in on page load while the command bar staggered in. */
          <AnimatePresence mode="wait">
          <motion.div
            /* The property view keeps one key across loading → loaded so the
               ghost cards resolve in place (inner stack below) instead of
               exiting through this crossfade first. The "when" pair rides the
               key so a year or phase change fades the old content out and the
               new content (or the ghosts, for a year refetch) in, instead of
               teleporting rows mid-frame. */
            key={
              groupedContent
                ? `property|${year}|${phaseFilter}`
                : loading
                  ? "loading"
                  : `project|${year}|${phaseFilter}`
            }
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
          {groupedContent ? (
            /* Ghost list and real content share one grid cell: when data lands
               the ghosts dissolve while the real cards fade in underneath the
               same geometry — one quiet in-place swap, not out-then-in. */
            <div className="jc-swap-stack">
              {/* No initial={false} here — same trap as the outer presence:
                 it propagates skip-initial to the ghosts and kills their
                 blur-in stagger on page load. */}
              <AnimatePresence>
              {loading && (
              /* Ghost property cards: same surface, same heights, same blur-in
                 stagger as the real list, so the load resolves as a quiet
                 crossfade into content that's already where it belongs. */
              <motion.div
                key="ghosts"
                className="jc-skeleton-list"
                aria-hidden="true"
                style={{ pointerEvents: "none" }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                {Array.from({ length: 6 }, (_, i) => (
                  <motion.div
                    key={i}
                    className="jc-project-card"
                    // App-standard MotionList entrance (same values as
                    // itemVariants), continuing the header's stagger rhythm.
                    initial={{ opacity: 0, y: 12, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.3, delay: 0.08 + i * 0.08, ease: [0.25, 0.46, 0.45, 0.94] }}
                  >
                    {/* Real head structure with shimmer stand-ins in each slot,
                        so ghost and loaded cards share exact geometry. */}
                    <div className="jc-project-head jc-skeleton-head">
                      <span className="jc-head-toggle">
                        <span className="skel-line" style={{ width: "0.875rem", height: "0.875rem", borderRadius: 4 }} />
                      </span>
                      <span className="jc-project-title">
                        <span className="jc-project-name-row">
                          <span className="skel-line" style={{ width: i % 2 ? "10rem" : "8rem", height: "1.3125rem" }} />
                          <span className="skel-line" style={{ width: "3.5rem", height: "1.25rem", borderRadius: 999 }} />
                        </span>
                        <span className="skel-line" style={{ width: i % 2 ? "7rem" : "9.25rem", height: "1.0625rem" }} />
                      </span>
                      <span className="jc-head-stats">
                        <span className="jc-head-stat">
                          <span className="skel-line" style={{ width: "3rem", height: "0.6875rem" }} />
                          <span className="skel-line" style={{ width: "3.5rem", height: "1.05rem" }} />
                        </span>
                        <span className="jc-head-stat">
                          <span className="skel-line" style={{ width: "3rem", height: "0.6875rem" }} />
                          <span className="skel-line" style={{ width: "3.5rem", height: "1.05rem" }} />
                        </span>
                      </span>
                      <span className="jc-project-counts">
                        <span className="skel-line" style={{ width: "8.5rem", height: "1.9375rem", borderRadius: 9 }} />
                        <span className="skel-line" style={{ width: "8.5rem", height: "1.9375rem", borderRadius: 9 }} />
                      </span>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
              )}
              </AnimatePresence>
              {!loading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                >
                  {jobs.length === 0 ? (
                    <Widget className="co-widget">
                      <div className="widget-no-data">
                        <ChartNoAxesColumn size={24} className="widget-no-data-icon" />
                        <span className="body-text">No data available</span>
                      </div>
                    </Widget>
                  ) : resultCount === 0 && (search || statusFilter !== "all" || phaseFilter !== "all") ? (
                    <div className="jc-empty-note body-text text-secondary">
                      {search
                        ? `No properties match "${search}"`
                        : "No properties match your filters"}
                    </div>
                  ) : (
                    <PropertyList
                      groups={filteredGroups}
                      openGroupKey={openGroupKey}
                      openKind={openKind}
                      entrance={!entrancePlayedRef.current}
                      showContract={!isManager}
                      marginColorsOn={marginColorsOn}
                      pins={pins}
                      onToggle={toggleGroup}
                      onToggleKind={toggleKind}
                      onOpenKind={openWithKind}
                      onOpenJob={openJob}
                      onTogglePin={togglePin}
                      onOpenProperty={openProperty}
                    />
                  )}
                </motion.div>
              )}
            </div>
          ) : loading ? (
            /* Flat-list skeleton enters with the app-standard blur-in, so a
               mid-load view toggle (or landing here) matches the rest of the
               dashboard instead of popping in behind the crossfade. */
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.08, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <Widget className="co-widget">
                <div className="widget-skeleton" />
              </Widget>
            </motion.div>
          ) : jobs.length === 0 ? (
            <Widget className="co-widget">
              <div className="widget-no-data">
                <ChartNoAxesColumn size={24} className="widget-no-data-icon" />
                <span className="body-text">No data available</span>
              </div>
            </Widget>
          ) : resultCount === 0 && (search || statusFilter !== "all" || phaseFilter !== "all") ? (
            <div className="jc-empty-note body-text text-secondary">
              {search
                ? `No projects match "${search}"`
                : "No projects match your filters"}
            </div>
          ) : (
          <Widget className="co-widget jc-table-widget">
            <JobTable
              jobs={filtered}
              isManager={isManager}
              marginColorsOn={marginColorsOn}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              openJobKey={openJobKey}
              details={details}
              pins={projectPins}
              onToggleExpand={toggleExpand}
              onOpenJob={openJob}
              onTogglePin={togglePinProject}
            />
          </Widget>
          )}
          </motion.div>
          </AnimatePresence>
        )}
      </MotionList>

      {isMobile && (
        <MobileFilterSheet
          open={filterSheetOpen}
          onClose={() => setFilterSheetOpen(false)}
          groups={(() => {
            const base = hideClosed
              ? FILTER_GROUPS.map((g) =>
                  g.key === "status" ? { ...g, options: g.options.filter((o) => o.value !== "6") } : g,
                )
              : FILTER_GROUPS
            return isManager ? [SCOPE_GROUP, ...base] : base
          })()}
          values={
            isManager
              ? { status: String(statusFilter), phase: String(phaseFilter), scope: showAllProjects ? "all" : "mine" }
              : { status: String(statusFilter), phase: String(phaseFilter) }
          }
          defaults={isManager ? MANAGER_FILTER_DEFAULTS : FILTER_DEFAULTS}
          onChange={(v) => {
            setStatusFilter(v.status === "all" ? "all" : Number(v.status))
            setPhaseFilter(v.phase === "all" ? "all" : Number(v.phase))
            if (isManager) setShowAllProjects(v.scope === "all")
          }}
        />
      )}

      <AnimatePresence>
        {tourBlockedTip && (
          // Plain outer div for the centering transform: framer-motion owns
          // `transform` entirely once it's animating x/y/scale, so a CSS
          // `translate(-50%, -100%)` on the SAME element it animates gets
          // silently clobbered. The inner motion.div is free to animate its
          // own transform for the fade/slide without disturbing this anchor.
          <div className="jc-tour-blocked-tip-anchor" style={{ left: tourBlockedTip.left, top: tourBlockedTip.top }}>
            <motion.div
              className="jc-tour-blocked-tip"
              role="status"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4, transition: { duration: 0.18 } }}
              transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              Finish the tour before opening a report
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Page>
  )
}
