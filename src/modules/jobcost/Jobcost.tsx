import { useState, useMemo, useEffect, Fragment } from "react"
import { useNavigate } from "react-router-dom"
import { Search, ArrowUpDown, ArrowUp, ArrowDown, ChevronRight, ExternalLink } from "lucide-react"
import Page from "../../shared/components/Page"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { Widget } from "../../shared/components/Widget/Widget"
import { YearSelector } from "../../shared/components/YearSelector/YearSelector"
import { fetchPageData } from "../../shared/api/pageApi"
import { formatMoneyFull, marginTextColor } from "../../shared/utils/format"
import useMarginColorsEnabled from "../../shared/hooks/useMarginColorsEnabled"
import useLocalStorage from "../../shared/hooks/useLocalStorage"
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
  margin: number | null
  supervisor: string
}

// Lazily-fetched per-job cost detail for the expanded view.
type JobDetail = { budget: BudgetBreakdown | null; costItems: CostItem[] }

function normalizeProject(p: RawProject): Job {
  const contract = p.totalContract ?? 0
  const totalCost = p.totalCost ?? 0
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
    budget: p.totalBudget ?? p.budget ?? 0,
    margin: contract > 0 ? ((contract - totalCost) / contract) * 100 : null,
    supervisor:
      p.pmName?.trim() ??
      p.phases?.find((ph) => ph.pmName?.trim())?.pmName?.trim() ??
      "",
  }
}

type SortKey = "name" | "status" | "supervisor" | "contract" | "totalCost" | "budget" | "margin"
type SortDir = "asc" | "desc"

const STATUS_LABELS: Record<number, string> = {
  1: "Bidding",
  2: "Refused",
  3: "Contract",
  4: "Current",
  5: "Complete",
  6: "Closed",
}

// Number of <td>s in a job row — drives the expanded panel's colSpan.
const COLUMN_COUNT = 9

function SortTh({ col, label, align = "left", sortKey, sortDir, onSort }: {
  col: SortKey
  label: string
  align?: "left" | "right"
  sortKey: SortKey
  sortDir: SortDir
  onSort: (k: SortKey) => void
}) {
  const active = sortKey === col
  const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown
  const thClass = align === "right" ? "spend-rank-table-value" : "spend-rank-table-name"
  return (
    <th className={thClass}>
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
          <CostBreakdownTable budget={detail.budget} costItems={detail.costItems} />
        )}
      </div>
    </div>
  )
}

export default function Jobcost() {
  const navigate = useNavigate()
  const marginColorsOn = useMarginColorsEnabled()
  const [year, setYear] = useLocalStorage<number | null>("jobcostYear", new Date().getFullYear())
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [details, setDetails] = useState<Record<string, JobDetail | "loading">>({})

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    // A new year reloads the list, so drop any open rows + cached detail.
    setExpanded(new Set())
    setDetails({})
    fetchPageData({
      module: "jobcost",
      queries: ["getPhases"],
      params: { year },
      signal: controller.signal,
    })
      .then((result) => {
        const data = result.getPhases
        if (Array.isArray(data)) setJobs((data as RawProject[]).map(normalizeProject))
        setLoading(false)
      })
      .catch((err) => {
        if (err.name !== "AbortError") setLoading(false)
      })
    return () => controller.abort()
  }, [year])

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
    const list = q
      ? jobs.filter(
          (j) =>
            j.name?.toLowerCase().includes(q) ||
            j.jobNumber?.toLowerCase().includes(q) ||
            j.supervisor?.toLowerCase().includes(q),
        )
      : jobs
    return [...list].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir
      if (sortKey === "supervisor") return (a.supervisor ?? "").localeCompare(b.supervisor ?? "") * dir
      if (sortKey === "status") return (a.status - b.status) * dir
      if (sortKey === "contract") return (a.contract - b.contract) * dir
      if (sortKey === "totalCost") return (a.totalCost - b.totalCost) * dir
      if (sortKey === "budget") return (a.budget - b.budget) * dir
      // margin can be null — push nulls to the end regardless of direction.
      const am = a.margin == null ? Number.NEGATIVE_INFINITY : a.margin
      const bm = b.margin == null ? Number.NEGATIVE_INFINITY : b.margin
      return (am - bm) * dir
    })
  }, [jobs, search, sortKey, sortDir])

  return (
    <Page title="Job Costing" actions={<YearSelector value={year} onChange={setYear} allowAllTime />}>
      <MotionList className="inv-page-stack">
        <MotionItem>
          <Widget loading={loading} noData={!loading && jobs.length === 0} className="co-widget">
            <div className="co-widget-toolbar">
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
              <span className="co-count subheadline text-secondary">
                {filtered.length} {filtered.length === 1 ? "project" : "projects"}
              </span>
            </div>

            {filtered.length === 0 && search ? (
              <div className="co-no-results body-text text-secondary">No jobs match "{search}"</div>
            ) : (
              <table className="spend-rank-table">
                <thead>
                  <tr>
                    <th className="spend-rank-table-name jc-expand-th" aria-hidden="true" />
                    <SortTh col="name" label="Project" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh col="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh col="supervisor" label="PM" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh col="contract" label="Contract" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh col="budget" label="Budget" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh col="totalCost" label="Cost" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
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
                          <td className="spend-rank-table-name">
                            <div className="body-text emphasized">{job.name}</div>
                            <div className="cell-secondary">#{job.jobNumber}</div>
                          </td>
                          <td className="spend-rank-table-name">
                            <span className={`status-badge status-${job.status}`}>
                              {STATUS_LABELS[job.status] ?? job.status}
                            </span>
                          </td>
                          <td className="spend-rank-table-name body-text text-secondary">{job.supervisor || "—"}</td>
                          <td className="spend-rank-table-value body-text emphasized">{formatMoneyFull(job.contract)}</td>
                          <td className="spend-rank-table-value body-text emphasized">{formatMoneyFull(job.budget)}</td>
                          <td className="spend-rank-table-value body-text emphasized">{formatMoneyFull(job.totalCost)}</td>
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
                                navigate(`/jobcost/${job.jobNumber}`)
                              }}
                              title="Open full report"
                            >
                              View <ExternalLink size={13} />
                            </button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="jc-expand-row">
                            <td colSpan={COLUMN_COUNT}>
                              <JobExpandedPanel job={job} detail={details[job.recnum]} marginColorsOn={marginColorsOn} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            )}
          </Widget>
        </MotionItem>
      </MotionList>
    </Page>
  )
}
