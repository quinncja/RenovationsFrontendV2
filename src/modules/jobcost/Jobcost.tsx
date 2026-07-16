import { useState, useMemo, useEffect, useLayoutEffect, useRef, Fragment } from "react"
import { useJobcostNav } from "./useJobcostNav"
import { Search, ArrowUpDown, ArrowUp, ArrowDown, ChevronRight, ExternalLink, ChartNoAxesColumn } from "lucide-react"
import Page from "../../shared/components/Page"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { Widget } from "../../shared/components/Widget/Widget"
import { YearSelector } from "../../shared/components/YearSelector/YearSelector"
import { fetchPageData } from "../../shared/api/pageApi"
import { takePreloadedPageData } from "../../shared/api/pageDataCache"
import { trackProjectView } from "../../shared/analytics/analytics"
import { formatMoneyFull, marginTextColor } from "../../shared/utils/format"
import useIsMobile from "../../shared/hooks/useIsMobile"
import useElementWidth from "../../shared/hooks/useElementWidth"
import useMarginColorsEnabled from "../../shared/hooks/useMarginColorsEnabled"
import useLocalStorage from "../../shared/hooks/useLocalStorage"
import { useAuth } from "../../core/auth/AuthProvider"
import { FilterPills } from "../../shared/components/FilterPills"
import { MobileFilterSheet, activeFilterCount, type FilterGroup } from "../../shared/components/MobileFilterSheet/MobileFilterSheet"
import { MobileFilterButton } from "../../shared/components/MobileFilterSheet/MobileFilterButton"
import { CostBreakdownTable } from "./components/CostBreakdownTable"
import type { BudgetBreakdown, CostItem } from "./types"

// Restyled to match the directory list pages (Clients / Vendors / Subs /
// Employees): co-widget shell with a search + count toolbar and
// spend-rank-table styling. Rows expand in place to an extended view
// (metrics + Contract/Cost summaries + reused Cost Breakdown table); a
// separate View button opens the full project report.

interface ProjectPhase {
  recnum: string
  pmName: string | null
}

interface RawProject {
  recnum: string
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
}

interface Job {
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
}

// Lazily-fetched per-job cost detail for the expanded view.
type JobDetail = { budget: BudgetBreakdown | null; costItems: CostItem[] }

function normalizeProject(p: RawProject): Job {
  const contract = p.totalContract ?? 0
  const totalCost = p.totalCost ?? 0
  const budget = p.totalBudget ?? p.budget ?? 0
  return {
    recnum: String(p.recnum),
    jobNumber: p.phases?.[0]?.recnum ?? String(p.recnum),
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
  }
}

type SortKey = "name" | "status" | "supervisor" | "contract" | "totalCost" | "budget" | "variance" | "margin"
type SortDir = "asc" | "desc"

const STATUS_LABELS: Record<number, string> = {
  1: "Bidding",
  2: "Refused",
  3: "Contract",
  4: "Current",
  5: "Complete",
  6: "Closed",
}

// Status filter (same pill look as the Invoices toolbar). Pill colors match
// the status-4/5/6 badge colors.
type StatusFilter = "all" | number

const STATUS_FILTERS: { key: StatusFilter; label: string; color: string }[] = [
  { key: "all", label: "All", color: "var(--primary-color)" },
  { key: 4, label: "Current", color: "var(--primary-color)" },
  { key: 5, label: "Complete", color: "#22c55e" },
  { key: 6, label: "Closed", color: "#6b7280" },
]

// Mobile sheet group mirrors the desktop pills (single-select).
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
]
const FILTER_DEFAULTS = { status: "all" }

// Fit-driven column hiding. Fixed pixel breakpoints can't know the real
// content widths, so the layout itself is the signal instead: every column
// except Project is nowrap (PM capped with an ellipsis), Project is the one
// flexible column with a min-width floor (see .jc-name-col), and when the
// fixed columns plus that floor can't fit, the table overflows its wrapper.
// After each layout pass, any overflow hides the least-critical visible
// column (HIDE_ORDER, front first). Each hide records the container width it
// happened at, and that column only returns once the container outgrows that
// mark by RESHOW_BUFFER, so drag-resizing doesn't flap. Hidden data stays
// reachable: everything lives in the row's expanded panel, and Status folds
// into the Project cell's sub-line.
const HIDE_ORDER = ["contract", "supervisor", "status", "variance", "budget"] as const
type HideableCol = (typeof HIDE_ORDER)[number]
// How far past the hide-point the container must grow before a column may
// try to come back.
const RESHOW_BUFFER = 60

function SortTh({ col, label, align = "left", sortKey, sortDir, onSort, className }: {
  col: SortKey
  label: string
  align?: "left" | "right"
  sortKey: SortKey
  sortDir: SortDir
  onSort: (k: SortKey) => void
  className?: string
}) {
  const active = sortKey === col
  const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown
  const thClass = align === "right" ? "spend-rank-table-value" : "spend-rank-table-name"
  return (
    <th className={`${thClass}${className ? ` ${className}` : ""}`}>
      <button
        className={`co-th-btn${align === "right" ? " co-th-btn-right" : ""}${active ? " co-th-btn-active" : ""}`}
        onClick={() => onSort(col)}
      >
        {label} <Icon size={11} />
      </button>
    </th>
  )
}

// Label/value row inside a summary card; `total` bolds it as the card's
// bottom-line figure.
function SummaryRow({ label, value, total, valueColor, valueClass }: {
  label: string
  value: string
  total?: boolean
  valueColor?: string
  valueClass?: string
}) {
  return (
    <div className={`jc-summary-row${total ? " jc-summary-total" : ""}`}>
      <span className="jc-summary-label">{label}</span>
      <span className={`jc-summary-value${valueClass ? ` ${valueClass}` : ""}`} style={valueColor ? { color: valueColor } : undefined}>{value}</span>
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
          <SummaryRow label="Revised Contract" value={formatMoneyFull(job.contract)} total />
        </div>
        <div className="jc-summary-card">
          <div className="jc-summary-title subheadline text-secondary">Cost Summary</div>
          <SummaryRow label="Revised Budget" value={formatMoneyFull(job.budget)} />
          <SummaryRow label="Spent to Date" value={formatMoneyFull(spentToDate)} />
          <SummaryRow label="Committed (Open POs + Subs)" value={formatMoneyFull(job.totalCommitted)} />
          <SummaryRow label="Total Committed + Spent" value={formatMoneyFull(job.totalCost)} />
          <SummaryRow label="Projected Variance" value={formatMoneyFull(projectedVariance)} valueClass={varianceClass} />
          <SummaryRow
            label="Projected Margin"
            value={job.margin == null ? "—" : `${job.margin.toFixed(1)}%`}
            total
            valueColor={marginColor}
          />
        </div>
      </div>

      {/* Cost Breakdown (reused from the detail page) */}
      <div className="jc-expand-breakdown">
        <div className="jc-summary-title subheadline text-secondary">Cost Breakdown</div>
        {detail === "loading" || detail === undefined ? (
          <div className="jc-expand-loading body-text text-secondary">Loading cost breakdown…</div>
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

export default function Jobcost() {
  const { goToJobcost } = useJobcostNav()
  const marginColorsOn = useMarginColorsEnabled()
  // Mobile: the table collapses to a simple tap-through list — name + status
  // on the left, margin + chevron on the right, tap → full project report.
  const isMobile = useIsMobile()
  // Managers (PMs) default to their own projects but can flip to the whole
  // company list via a toolbar toggle; everyone else always sees all projects.
  const { claims } = useAuth()
  const isManager = claims["role"] === "manager"
  const [showAllProjects, setShowAllProjects] = useLocalStorage("jobcostShowAllProjects", false)
  const [year, setYear] = useLocalStorage<number | null>("jobcostYear", new Date().getFullYear())
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [details, setDetails] = useState<Record<string, JobDetail | "loading">>({})

  // Fit-driven column visibility (see HIDE_ORDER above). `hiddenCount` is how
  // deep into the hide order we currently are; the layout effect below nudges
  // it up/down one column per commit until the Project column is readable.
  const [observeWrapWidth, tableWidth] = useElementWidth()
  const wrapElRef = useRef<HTMLDivElement | null>(null)
  // One callback ref feeds both the width observer and the overflow check.
  const tableWrapRef = (el: HTMLDivElement | null) => {
    wrapElRef.current = el
    observeWrapWidth(el)
  }
  const [hiddenCount, setHiddenCount] = useState(0)
  // Container width at the moment each hide happened, indexed by the hide
  // level it created — the re-show hysteresis marks.
  const hidAtWidthRef = useRef<number[]>([])
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
  // Once Status drops, the View button goes icon-only too.
  const compactActions = !showStatus
  // Chevron + Project + Cost + Margin + View always render; the rest count
  // only when visible. Drives the expanded panel's colSpan.
  const visibleColumnCount =
    5 +
    (showContract ? 1 : 0) +
    (showPM ? 1 : 0) +
    (showStatus ? 1 : 0) +
    (showVariance ? 1 : 0) +
    (showBudget ? 1 : 0)

  // Deliberately no dependency array: this must re-measure after *every*
  // commit that could change the layout (data, filters, width, hides). Each
  // pass changes hiddenCount by at most one — setState from a layout effect
  // re-renders synchronously, so a cascade of hides settles before paint and
  // never flashes. Termination: hides are capped at hideOrder.length, and a
  // re-show that immediately re-squeezes re-records the *current* width as
  // its mark, which the re-show condition can't beat without real growth.
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
  })

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    // A new year reloads the list, so drop any open rows + cached detail.
    setExpanded(new Set())
    setDetails({})
    // allProjects is a manager-only hint: when on, the backend drops the
    // PM scoping and returns the whole company list. Ignored for other roles.
    // Params must keep this exact shape/order so a daily-arrival preload's
    // cache key matches (see pageDataCache).
    const params = { year, allProjects: isManager ? showAllProjects : null }
    const preloaded = takePreloadedPageData("jobcost", ["getPhases"], params)
    const request = preloaded
      ? // A failed preload shouldn't strand the page — fall back to a real fetch.
        preloaded.catch(() =>
          fetchPageData({ module: "jobcost", queries: ["getPhases"], params, signal: controller.signal })
        )
      : fetchPageData({ module: "jobcost", queries: ["getPhases"], params, signal: controller.signal })
    request
      .then((result) => {
        if (controller.signal.aborted) return
        const data = result.getPhases
        if (Array.isArray(data)) setJobs((data as RawProject[]).map(normalizeProject))
        setLoading(false)
      })
      .catch((err) => {
        if (err.name !== "AbortError") setLoading(false)
      })
    return () => controller.abort()
  }, [year, isManager, showAllProjects])

  function loadDetail(job: Job) {
    setDetails((d) => ({ ...d, [job.recnum]: "loading" }))
    fetchPageData({
      module: "jobcost",
      queries: ["getBudgetByRecnum", "getAllCostItems"],
      // Pass the active year so the inline breakdown matches the row's
      // year-filtered summary numbers (the full report via View is all-time).
      params: { recnum: Number(job.jobNumber), year },
    })
      .then((result) => {
        setDetails((d) => ({
          ...d,
          [job.recnum]: {
            budget: (result.getBudgetByRecnum as BudgetBreakdown) ?? null,
            costItems: Array.isArray(result.getAllCostItems) ? (result.getAllCostItems as CostItem[]) : [],
          },
        }))
      })
      .catch(() => {
        setDetails((d) => ({ ...d, [job.recnum]: { budget: null, costItems: [] } }))
      })
  }

  function toggleExpand(job: Job) {
    const willOpen = !expanded.has(job.recnum)
    // Count an inline expand as a "widget"-source project view (distinct from a
    // full job-detail page open). Only on open, and use jobNumber so it groups
    // with page opens under the same recnum.
    if (willOpen) trackProjectView(job.jobNumber, job.name, "widget")
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(job.recnum)) {
        next.delete(job.recnum)
      } else {
        next.add(job.recnum)
        if (!details[job.recnum]) loadDetail(job)
      }
      return next
    })
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      // Text columns default asc, numeric columns default desc.
      setSortDir(key === "name" || key === "supervisor" ? "asc" : "desc")
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    let list = statusFilter === "all" ? jobs : jobs.filter((j) => j.status === statusFilter)
    if (q)
      list = list.filter(
        (j) =>
          j.name?.toLowerCase().includes(q) ||
          j.jobNumber?.toLowerCase().includes(q) ||
          j.supervisor?.toLowerCase().includes(q),
      )
    return [...list].sort((a, b) => {
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
  }, [jobs, search, statusFilter, sortKey, sortDir])

  return (
    <Page title="Job Costing" actions={<YearSelector value={year} onChange={setYear} allowAllTime />}>
      <MotionList className="inv-page-stack">
        <MotionItem>
          {/* No `loading`/`noData` on the Widget: those swap the whole body for a
              skeleton, which would take the toolbar (scope toggle, search,
              filters) with it. Keep the toolbar mounted and skeleton only the
              data region below so the navbar stays put across reloads/toggles. */}
          <Widget className="co-widget">
            <div className="co-widget-toolbar">
              {!isMobile && (
                <FilterPills label="Status" options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />
              )}
              {isManager && !isMobile && (
                <div
                  className="period-selector period-selector--equal jc-scope-toggle"
                  role="tablist"
                  aria-label="Project scope"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={!showAllProjects}
                    className={`period-selector-btn${!showAllProjects ? " period-selector-btn--active" : ""}`}
                    onClick={() => setShowAllProjects(false)}
                  >
                    My Projects
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={showAllProjects}
                    className={`period-selector-btn${showAllProjects ? " period-selector-btn--active" : ""}`}
                    onClick={() => setShowAllProjects(true)}
                  >
                    All Projects
                  </button>
                </div>
              )}
              <div className="co-search-wrapper">
                <Search size={13} className="co-search-icon" />
                <input
                  className="co-search-input"
                  type="text"
                  placeholder="Search jobs..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {isMobile && (
                <MobileFilterButton
                  count={activeFilterCount({ status: String(statusFilter) }, FILTER_DEFAULTS)}
                  onClick={() => setFilterSheetOpen(true)}
                />
              )}
              <span className="co-count subheadline text-secondary">
                {filtered.length} {filtered.length === 1 ? "project" : "projects"}
              </span>
            </div>

            {loading ? (
              <div className="widget-skeleton" />
            ) : jobs.length === 0 ? (
              <div className="widget-no-data">
                <ChartNoAxesColumn size={24} className="widget-no-data-icon" />
                <span className="body-text">No data available</span>
              </div>
            ) : filtered.length === 0 && (search || statusFilter !== "all") ? (
              <div className="co-no-results body-text text-secondary">
                {search ? `No jobs match "${search}"` : "No jobs match your filters"}
              </div>
            ) : isMobile ? (
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
            ) : (
              <div className="jc-table-wrap" ref={tableWrapRef}>
              <table className="spend-rank-table">
                <thead>
                  <tr>
                    <th className="spend-rank-table-name jc-expand-th" aria-hidden="true" />
                    <SortTh col="name" label="Project" className="jc-name-col" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    {showStatus && (
                      <SortTh col="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    )}
                    {showPM && (
                      <SortTh col="supervisor" label="PM" className="jc-pm-col" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    )}
                    {showContract && (
                      <SortTh col="contract" label="Contract" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    )}
                    {showBudget && (
                      <SortTh col="budget" label="Budget" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    )}
                    <SortTh col="totalCost" label="Cost" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    {showVariance && (
                      <SortTh
                        col="variance"
                        label={showPM ? "Budget Variance" : "Variance"}
                        align="right"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={handleSort}
                      />
                    )}
                    <SortTh col="margin" label="Margin" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <th className="spend-rank-table-name jc-view-th" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((job) => {
                    const isOpen = expanded.has(job.recnum)
                    return (
                      <Fragment key={job.recnum}>
                        {/* The project row is unchanged on open/close — it just
                            tints orange and the chevron rotates. */}
                        <tr
                          className={`spend-rank-table-row${isOpen ? " jc-row-open" : ""}`}
                          onClick={() => toggleExpand(job)}
                          role="button"
                          tabIndex={0}
                          aria-expanded={isOpen}
                          onKeyDown={(e) => e.key === "Enter" && toggleExpand(job)}
                        >
                          <td className="jc-expand-chevron-cell">
                            <ChevronRight size={14} className={`jc-expand-chevron${isOpen ? " open" : ""}`} />
                          </td>
                          <td className="spend-rank-table-name jc-name-col">
                            <div className="body-text emphasized jc-name-text" title={job.name}>{job.name}</div>
                            <div className="cell-secondary jc-name-sub">
                              <span className="jc-name-number">#{job.jobNumber}</span>
                              {/* When the Status column is dropped for width, the
                                  badge folds into the sub-line (mirrors the mobile
                                  list) so status stays visible. */}
                              {!showStatus && (
                                <span className={`status-badge status-${job.status}`}>
                                  {STATUS_LABELS[job.status] ?? job.status}
                                </span>
                              )}
                            </div>
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
                              className="button secondary-button jc-view-btn"
                              onClick={(e) => {
                                e.stopPropagation()
                                goToJobcost(job.jobNumber)
                              }}
                              title="Open full report"
                              aria-label="Open full report"
                            >
                              {!compactActions && "View "}
                              <ExternalLink size={13} />
                            </button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="jc-expand-row">
                            <td colSpan={visibleColumnCount}>
                              <JobExpandedPanel job={job} detail={details[job.recnum]} marginColorsOn={marginColorsOn} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
              </div>
            )}
          </Widget>
        </MotionItem>
      </MotionList>

      {isMobile && (
        <MobileFilterSheet
          open={filterSheetOpen}
          onClose={() => setFilterSheetOpen(false)}
          groups={FILTER_GROUPS}
          values={{ status: String(statusFilter) }}
          defaults={FILTER_DEFAULTS}
          onChange={(v) => setStatusFilter(v.status === "all" ? "all" : Number(v.status))}
        />
      )}
    </Page>
  )
}
