import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { ChevronRight, ChevronDown, ChevronUp, ChevronsUpDown, Search, DatabaseZap, ExternalLink } from "lucide-react"
import Page from "../../shared/components/Page"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { YearSelector } from "../../shared/components/YearSelector/YearSelector"
import { PeriodSelector, periodToParams, type Period } from "../../shared/components/PeriodSelector/PeriodSelector"
import { fetchPageData } from "../../shared/api/pageApi"
import { formatMoneyFull, formatDate } from "../../shared/utils/format"
import useIsMobile from "../../shared/hooks/useIsMobile"
import useLocalStorage from "../../shared/hooks/useLocalStorage"
import { MobileFilterSheet, activeFilterCount, type FilterGroup } from "../../shared/components/MobileFilterSheet/MobileFilterSheet"
import { MobileFilterButton } from "../../shared/components/MobileFilterSheet/MobileFilterButton"

// ─── Types ────────────────────────────────────────────────────────────────────

interface JobRow {
  recnum: number
  jobName: string
  status: number
  clientName: string | null
  originalContract: number
  revisedContract: number
  revisedEstimate: number
  actualToDate: number
}

interface JobSummary {
  originalContract: number
  changeOrderTotal: number
  revisedContract: number
  revisedEstimate: number
  actualToDate: number
}

interface ChangeOrder {
  recnum: number
  description: string
  estimateAmount: number
  contractAmount: number
  status: number
}

interface CostGroup {
  costGroup: string
  budget: number
  actual: number
  variance: number
}

interface CostTransaction {
  id: string
  costGroup: string
  costType: string
  vendorId: number | null
  vendorName: string
  description: string | null
  amount: number
  transDate: unknown
  poReference: string | null
}

interface JobDetail {
  summary: JobSummary | null
  changeOrders: ChangeOrder[]
  costGroups: CostGroup[]
  transactions: CostTransaction[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const JOB_STATUS_LABEL: Record<number, string> = {
  1: "Bid",
  2: "Refused",
  3: "Contract",
  4: "Current",
  5: "Complete",
  6: "Closed",
}
const JOB_STATUS_CLASS: Record<number, string> = {
  1: "bid",
  2: "refused",
  3: "contract",
  4: "current",
  5: "complete",
  6: "closed",
}

function getJobStatusLabel(status: number): string {
  return JOB_STATUS_LABEL[status] ?? `Status ${status}`
}
function getJobStatusClass(status: number): string {
  return JOB_STATUS_CLASS[status] ?? "closed"
}


function projectedMargin(revisedContract: number, revisedEstimate: number): number | null {
  if (revisedContract <= 0 || revisedEstimate <= 0) return null
  return ((revisedContract - revisedEstimate) / revisedContract) * 100
}

function marginClass(pct: number | null): string {
  if (pct === null) return ""
  if (pct >= 30) return "jc-margin-high"
  if (pct >= 20) return "jc-margin-target"
  return "jc-margin-critical"
}

function formatMargin(pct: number | null): string {
  if (pct === null) return "—"
  return `${pct.toFixed(1)}%`
}


// ─── Sub-components ───────────────────────────────────────────────────────────

function FilterButton({
  active, colorClass, onClick, children,
}: { active: boolean; colorClass?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className={`jc-filter-btn${active ? " active" : ""}${colorClass ? ` ${colorClass}` : ""}`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

type SortKey = "jobName" | "clientName" | "revisedContract" | "revisedEstimate" | "profit" | "margin"
type CostSortKey = "costGroup" | "budget" | "actual" | "variance"
type SortDir = "asc" | "desc"

function SortHeader({
  label, sortKey, active, dir, onSort,
}: {
  label: string; sortKey: SortKey; active: boolean; dir: SortDir; onSort: (k: SortKey) => void
}) {
  const icon = active
    ? (dir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />)
    : <ChevronsUpDown size={11} />
  return (
    <button className={`jc-sort-btn${active ? " active" : ""}`} onClick={() => onSort(sortKey)}>
      {label}{icon}
    </button>
  )
}

function SummaryRow({
  label, value, valueClass, total,
}: { label: string; value: string; valueClass?: string; total?: boolean }) {
  return (
    <div className={`jc-summary-row${total ? " total" : ""}`}>
      <span className="jc-summary-label">{label}</span>
      <span className={`jc-summary-value${valueClass ? ` ${valueClass}` : ""}`}>{value}</span>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Jobcost() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [hideCurrentMargin] = useLocalStorage("hideCurrentMargin", false)
  const [year, setYear] = useState<number | null>(new Date().getFullYear())
  const [period, setPeriod] = useState<Period>("annual")
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [disconnected, setDisconnected] = useState(false)
  const [statusFilter, setStatusFilter] = useState("any")
  const [marginFilter, setMarginFilter] = useState("all")
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("revisedContract")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [costSortKey, setCostSortKey] = useState<CostSortKey>("costGroup")
  const [costSortDir, setCostSortDir] = useState<SortDir>("asc")
  const [jobDetails, setJobDetails] = useState<Record<number, JobDetail>>({})
  const [loadingDetailId, setLoadingDetailId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setJobs([])
    setExpandedId(null)
    fetchPageData({ module: "jobcost", queries: ["jobCostList"], params: { year, ...(year !== null ? periodToParams(period) : {}) } })
      .then((data) => {
        if (cancelled) return
        const allNull = Object.values(data).every((v) => v === null)
        setDisconnected(allNull)
        setJobs((data.jobCostList as JobRow[]) ?? [])
      })
      .catch(() => { if (!cancelled) setJobs([]) })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [year, period])

  function loadDetail(recnum: number) {
    setLoadingDetailId(recnum)
    fetchPageData({
      module: "jobcost",
      queries: ["jobCostSummary", "jobCostChangeOrders", "jobCostGroups", "jobCostTransactions"],
      params: { year, recnum, ...(year !== null ? periodToParams(period) : {}) },
    })
      .then((data) => {
        setJobDetails((prev) => ({
          ...prev,
          [recnum]: {
            summary: (data.jobCostSummary as JobSummary | null) ?? null,
            changeOrders: (data.jobCostChangeOrders as ChangeOrder[]) ?? [],
            costGroups: (data.jobCostGroups as CostGroup[]) ?? [],
            transactions: (data.jobCostTransactions as CostTransaction[]) ?? [],
          },
        }))
      })
      .finally(() => setLoadingDetailId(null))
  }

  function toggleExpand(recnum: number) {
    if (expandedId === recnum) {
      setExpandedId(null)
      setExpandedGroups(new Set())
    } else {
      setExpandedId(recnum)
      setExpandedGroups(new Set())
      if (!jobDetails[recnum]) loadDetail(recnum)
    }
  }

  function toggleGroup(groupName: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      next.has(groupName) ? next.delete(groupName) : next.add(groupName)
      return next
    })
  }

  const filteredJobs = jobs.filter((job) => {
    if (statusFilter !== "any" && job.status !== parseInt(statusFilter)) return false
    const pct = projectedMargin(job.revisedContract, job.revisedEstimate)
    if (marginFilter === "high"     && (pct === null || pct < 30)) return false
    if (marginFilter === "target"   && (pct === null || pct < 20 || pct >= 30)) return false
    if (marginFilter === "critical" && (pct === null || pct >= 20)) return false
    if (search) {
      const q = search.toLowerCase()
      if (!job.jobName.toLowerCase().includes(q) && !(job.clientName ?? "").toLowerCase().includes(q))
        return false
    }
    return true
  })

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(key === "jobName" || key === "clientName" ? "asc" : "desc")
    }
  }

  function handleCostSort(key: CostSortKey) {
    if (costSortKey === key) {
      setCostSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setCostSortKey(key)
      setCostSortDir(key === "costGroup" ? "asc" : "desc")
    }
  }

  const sortedJobs = [...filteredJobs].sort((a, b) => {
    let av: number | string
    let bv: number | string
    switch (sortKey) {
      case "jobName":          av = a.jobName;                                      bv = b.jobName;                                      break
      case "clientName":       av = a.clientName ?? "";                              bv = b.clientName ?? "";                              break
      case "revisedContract":  av = a.revisedContract;                               bv = b.revisedContract;                               break
      case "revisedEstimate":  av = a.revisedEstimate;                               bv = b.revisedEstimate;                               break
      case "profit":           av = (hideCurrentMargin && a.status === 4) ? -Infinity : (a.revisedContract - a.revisedEstimate);
                               bv = (hideCurrentMargin && b.status === 4) ? -Infinity : (b.revisedContract - b.revisedEstimate); break
      case "margin":           av = (hideCurrentMargin && a.status === 4) ? -Infinity : (projectedMargin(a.revisedContract, a.revisedEstimate) ?? -Infinity);
                               bv = (hideCurrentMargin && b.status === 4) ? -Infinity : (projectedMargin(b.revisedContract, b.revisedEstimate) ?? -Infinity); break
    }
    if (av < bv) return sortDir === "asc" ? -1 : 1
    if (av > bv) return sortDir === "asc" ? 1 : -1
    return 0
  })

  const jcFilterGroups: FilterGroup[] = [
    {
      key: "status",
      label: "Status",
      options: [
        { value: "any", label: "Any" },
        { value: "4", label: "Current", colorClass: "jc-filter-current" },
        { value: "5", label: "Complete", colorClass: "jc-filter-complete" },
        { value: "6", label: "Closed", colorClass: "jc-filter-closed" },
      ],
    },
    {
      key: "margin",
      label: "Margin",
      options: [
        { value: "all", label: "All" },
        { value: "high", label: "High >30%", colorClass: "jc-filter-high" },
        { value: "target", label: "Target 20–30%", colorClass: "jc-filter-target" },
        { value: "critical", label: "Critical <20%", colorClass: "jc-filter-critical" },
      ],
    },
  ]

  const jcFilterDefaults = { status: "any", margin: "all" }
  const jcFilterValues = { status: statusFilter, margin: marginFilter }
  const jcActiveCount = activeFilterCount(jcFilterValues, jcFilterDefaults)

  return (
    <Page title="Projects" actions={<><PeriodSelector value={period} onChange={setPeriod} disabled={year === null} /><YearSelector allowAllTime value={year} onChange={setYear} /></>}>
      <MotionList className="inv-page-stack">

      {/* ── Filter bar + metrics card ── */}
      <MotionItem>
      <div className="card inv-filter-metrics-card" style={{ marginBottom: "2rem" }}>
        {isMobile ? (
          <div className="jc-filter-bar">
            <div className="jc-search-wrapper" style={{ flex: 1 }}>
              <Search size={13} className="jc-search-icon" />
              <input
                className="jc-search"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <MobileFilterButton count={jcActiveCount} onClick={() => setFilterSheetOpen(true)} />
          </div>
        ) : (
          <div className="jc-filter-bar">
            <div className="jc-filter-group">
              <span className="jc-filter-label">Status</span>
              <div className="jc-filter-buttons">
                <FilterButton active={statusFilter === "any"} onClick={() => setStatusFilter("any")}>Any</FilterButton>
                <FilterButton active={statusFilter === "4"} onClick={() => setStatusFilter("4")} colorClass="jc-filter-current">Current</FilterButton>
                <FilterButton active={statusFilter === "5"} onClick={() => setStatusFilter("5")} colorClass="jc-filter-complete">Complete</FilterButton>
                <FilterButton active={statusFilter === "6"} onClick={() => setStatusFilter("6")} colorClass="jc-filter-closed">Closed</FilterButton>
              </div>
            </div>

            <div className="jc-filter-group">
              <span className="jc-filter-label">Margin</span>
              <div className="jc-filter-buttons">
                <FilterButton active={marginFilter === "all"}      onClick={() => setMarginFilter("all")}>All</FilterButton>
                <FilterButton active={marginFilter === "high"}     colorClass="jc-filter-high"     onClick={() => setMarginFilter("high")}>High &gt;30%</FilterButton>
                <FilterButton active={marginFilter === "target"}   colorClass="jc-filter-target"   onClick={() => setMarginFilter("target")}>Target 20–30%</FilterButton>
                <FilterButton active={marginFilter === "critical"} colorClass="jc-filter-critical" onClick={() => setMarginFilter("critical")}>Critical &lt;20%</FilterButton>
              </div>
            </div>

            <div className="jc-search-wrapper">
              <Search size={13} className="jc-search-icon" />
              <input
                className="jc-search"
                placeholder="Search projects or clients..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        )}

        <MobileFilterSheet
          open={filterSheetOpen}
          onClose={() => setFilterSheetOpen(false)}
          groups={jcFilterGroups}
          values={jcFilterValues}
          defaults={jcFilterDefaults}
          onChange={(v) => { setStatusFilter(v.status); setMarginFilter(v.margin) }}
        />

        {isLoading && <div className="inv-metrics-skeleton" />}

        {!isLoading && jobs.length > 0 && (() => {
          const totalContract = filteredJobs.reduce((s, j) => s + j.revisedContract, 0)
          const nonCurrentJobs = hideCurrentMargin ? filteredJobs.filter(j => j.status !== 4) : filteredJobs
          const totalProfit   = nonCurrentJobs.reduce((s, j) => s + (j.revisedContract - j.revisedEstimate), 0)
          const margins       = nonCurrentJobs.map(j => projectedMargin(j.revisedContract, j.revisedEstimate)).filter((m): m is number => m !== null)
          const avgMargin     = margins.length > 0 ? margins.reduce((s, m) => s + m, 0) / margins.length : null
          return (
            <div className="inv-metrics-row">
              <div className="inv-metric">
                <span className="inv-metric-value">{filteredJobs.length}</span>
                <span className="inv-metric-label">Projects</span>
              </div>
              <div className="inv-metric-divider" />
              <div className="inv-metric">
                <span className="inv-metric-value">{formatMoneyFull(totalContract)}</span>
                <span className="inv-metric-label">Total Contract</span>
              </div>
              <div className="inv-metric-divider" />
              <div className="inv-metric">
                <span className={`inv-metric-value ${totalProfit >= 0 ? "jc-margin-high" : "jc-margin-critical"}`}>{formatMoneyFull(totalProfit)}</span>
                <span className="inv-metric-label">{hideCurrentMargin ? "Total Profit (Closed)" : "Total Profit"}</span>
              </div>
              <div className="inv-metric-divider" />
              <div className="inv-metric">
                <span className={`inv-metric-value ${marginClass(avgMargin)}`}>{formatMargin(avgMargin)}</span>
                <span className="inv-metric-label">{hideCurrentMargin ? "Avg. Margin (Closed)" : "Avg. Margin"}</span>
              </div>
            </div>
          )
        })()}
      </div>
      </MotionItem>

      <MotionItem>
      {/* ── Loading / empty ── */}
      {isLoading && <div className="widget-skeleton" style={{ height: "5rem" }} />}

      {!isLoading && disconnected && (
        <div className="widget-no-data widget-disconnected" style={{ marginTop: "2.5rem" }}>
          <DatabaseZap size={24} className="widget-no-data-icon" />
          <span className="body-text">Data source offline</span>
        </div>
      )}

      {!isLoading && !disconnected && filteredJobs.length === 0 && (
        <p className="body-text text-secondary" style={{ marginTop: "2.5rem", textAlign: "center" }}>
          No jobs found{year ? ` for ${year}` : ""}.
        </p>
      )}

      {/* ── Sort header ── */}
      {!isLoading && sortedJobs.length > 0 && (
        <div className="jc-list-header">
          <div className="jc-list-header-left">
            <SortHeader label="Project"  sortKey="jobName"    active={sortKey === "jobName"}    dir={sortDir} onSort={handleSort} />
            <SortHeader label="Client"   sortKey="clientName" active={sortKey === "clientName"} dir={sortDir} onSort={handleSort} />
          </div>
          <div className="jc-list-header-right">
            <div className="jc-financial-col">
              <SortHeader label="Revised Contract" sortKey="revisedContract" active={sortKey === "revisedContract"} dir={sortDir} onSort={handleSort} />
            </div>
            <div className="jc-financial-col">
              <SortHeader label="Revised Estimate" sortKey="revisedEstimate" active={sortKey === "revisedEstimate"} dir={sortDir} onSort={handleSort} />
            </div>
            <div className="jc-financial-col">
              <SortHeader label="Profit" sortKey="profit" active={sortKey === "profit"} dir={sortDir} onSort={handleSort} />
            </div>
            <div className="jc-financial-col">
              <SortHeader label="Margin" sortKey="margin" active={sortKey === "margin"} dir={sortDir} onSort={handleSort} />
            </div>
          </div>
          <div className="jc-header-btn-spacer" />
        </div>
      )}

      {/* ── Job list ── */}
      <div className="jc-job-list">
        {sortedJobs.map((job, index) => {
          const isExpanded    = expandedId === job.recnum
          const pct           = projectedMargin(job.revisedContract, job.revisedEstimate)
          const profit        = job.revisedContract - job.revisedEstimate
          const detail        = jobDetails[job.recnum]
          const isLoadingDetail = loadingDetailId === job.recnum

          return (
            <motion.div
              key={job.recnum}
              className={`jc-job${isExpanded ? " expanded" : ""}`}
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94], delay: Math.min(index * 0.08, 0.6) }}
            >

              {/* ── Header ── */}
              <div
                className="jc-job-header"
                onClick={() => toggleExpand(job.recnum)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && toggleExpand(job.recnum)}
              >
                <div className="jc-job-left">
                  <span className="jc-expand-chevron">
                    {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </span>
                  <div className="jc-job-meta">
                    <div className="jc-job-title-row">
                      <span className="jc-recnum-badge">#{job.recnum}</span>
                      <span
                        className="jc-job-name jc-job-name-link"
                        onClick={(e) => { e.stopPropagation(); navigate(`/jobcosting/${job.recnum}`) }}
                        role="link"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); navigate(`/jobcosting/${job.recnum}`) } }}
                      >{job.jobName}</span>
                      <span className={`jc-status-badge jc-badge-${getJobStatusClass(job.status)}`}>{getJobStatusLabel(job.status)}</span>
                    </div>
                    {job.clientName && (
                      <span className="jc-client-name">{job.clientName}</span>
                    )}
                  </div>
                </div>

                <div className="jc-job-financials">
                  <div className="jc-financial-col">
                    <div className="jc-financial-label">Revised Contract</div>
                    <div className="jc-financial-value">{formatMoneyFull(job.revisedContract)}</div>
                  </div>
                  <div className="jc-financial-col">
                    <div className="jc-financial-label">Revised Estimate</div>
                    <div className="jc-financial-value">{formatMoneyFull(job.revisedEstimate)}</div>
                  </div>
                  <div className="jc-financial-col">
                    <div className="jc-financial-label">{job.status === 4 ? "Projected Profit" : "Profit"}</div>
                    <div className={`jc-financial-value ${hideCurrentMargin && job.status === 4 ? "" : (profit >= 0 ? "jc-margin-high" : "jc-margin-critical")}`}>
                      {hideCurrentMargin && job.status === 4 ? "—" : formatMoneyFull(profit)}
                    </div>
                  </div>
                  <div className="jc-financial-col">
                    <div className="jc-financial-label">{job.status === 4 ? "Projected Margin" : "Margin"}</div>
                    <div className={`jc-financial-value ${hideCurrentMargin && job.status === 4 ? "" : marginClass(pct)}`} style={{ fontSize: "1.0625rem" }}>
                      {hideCurrentMargin && job.status === 4 ? "—" : formatMargin(pct)}
                    </div>
                  </div>
                </div>

                <button
                  className="jc-view-project-btn"
                  onClick={(e) => { e.stopPropagation(); navigate(`/jobcosting/${job.recnum}`) }}
                  title="View project details"
                >
                  View Project <ExternalLink size={13} />
                </button>
              </div>

              {/* ── Expanded detail ── */}
              {isExpanded && (
                <div className="jc-job-detail">
                  {isLoadingDetail && (
                    <div className="widget-skeleton" style={{ height: "9rem" }} />
                  )}

                  {!isLoadingDetail && detail && (() => {
                    const s = detail.summary
                    const projProfit = s ? s.revisedContract - s.revisedEstimate : 0
                    const projPct = s ? projectedMargin(s.revisedContract, s.revisedEstimate) : null

                    return (
                      <>
                        {/* ── Summary panels ── */}
                        <div className="jc-summaries">
                          <div className="jc-summary-panel">
                            <p className="jc-summary-section-label">Contract Summary</p>
                            <SummaryRow label="Original Contract" value={formatMoneyFull(s?.originalContract ?? 0)} />
                            <SummaryRow
                              label="Change Orders"
                              value={s && s.changeOrderTotal > 0 ? `+${formatMoneyFull(s.changeOrderTotal)}` : "—"}
                              valueClass={s && s.changeOrderTotal > 0 ? "jc-margin-high" : ""}
                            />
                            <SummaryRow label="Revised Contract" value={formatMoneyFull(s?.revisedContract ?? 0)} total />

                            {detail.changeOrders.length > 0 && (
                              <>
                                <p className="jc-summary-section-label" style={{ marginTop: "1.25rem" }}>Change Orders</p>
                                <div className="jc-co-list">
                                  {detail.changeOrders.map((co) => (
                                    <div key={co.recnum} className="jc-co-row">
                                      <span className="jc-co-desc">{co.description}</span>
                                      <div className="jc-co-amounts">
                                        <div className="jc-co-amount-item">
                                          <span className="jc-co-amount-label">Est.</span>
                                          <span className={`jc-co-amount-value ${co.estimateAmount >= 0 ? "jc-margin-high" : "jc-margin-critical"}`}>
                                            {co.estimateAmount > 0 ? "+" : ""}{formatMoneyFull(co.estimateAmount)}
                                          </span>
                                        </div>
                                        <div className="jc-co-amount-item">
                                          <span className="jc-co-amount-label">Contract</span>
                                          <span className={`jc-co-amount-value ${co.contractAmount >= 0 ? "jc-margin-high" : "jc-margin-critical"}`}>
                                            {co.contractAmount > 0 ? "+" : ""}{formatMoneyFull(co.contractAmount)}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>

                          <div className="jc-summary-panel">
                            <p className="jc-summary-section-label">Cost Summary</p>
                            <SummaryRow label="Revised Estimate" value={formatMoneyFull(s?.revisedEstimate ?? 0)} />
                            <SummaryRow label="Spending to Date"   value={formatMoneyFull(s?.actualToDate ?? 0)} />
                            {!(hideCurrentMargin && job.status === 4) && (
                              <>
                                <SummaryRow
                                  label={job.status === 4 ? "Projected Profit" : "Profit"}
                                  value={formatMoneyFull(projProfit)}
                                  valueClass={projProfit >= 0 ? "jc-margin-high" : "jc-margin-critical"}
                                />
                                <SummaryRow
                                  label={job.status === 4 ? "Projected Margin" : "Margin"}
                                  value={formatMargin(projPct)}
                                  valueClass={marginClass(projPct)}
                                  total
                                />
                              </>
                            )}
                          </div>
                        </div>

                        {/* ── Cost code detail ── */}
                        <div className="jc-cost-detail">
                          <div className="jc-cost-detail-header">
                            <p className="jc-cost-section-title">Cost Breakdown</p>
                          </div>
                          <table className="jc-cost-table">
                            <thead>
                              <tr>
                                <th className="jc-cost-th jc-cost-code-col">
                                  <button className={`jc-sort-btn${costSortKey === "costGroup" ? " active" : ""}`} onClick={() => handleCostSort("costGroup")}>
                                    Category{costSortKey === "costGroup" ? (costSortDir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />) : <ChevronsUpDown size={11} />}
                                  </button>
                                </th>
                                <th className="jc-cost-th jc-cost-num-col">
                                  <button className={`jc-sort-btn${costSortKey === "budget" ? " active" : ""}`} onClick={() => handleCostSort("budget")}>
                                    Budget{costSortKey === "budget" ? (costSortDir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />) : <ChevronsUpDown size={11} />}
                                  </button>
                                </th>
                                <th className="jc-cost-th jc-cost-num-col">
                                  <button className={`jc-sort-btn${costSortKey === "actual" ? " active" : ""}`} onClick={() => handleCostSort("actual")}>
                                    Actual{costSortKey === "actual" ? (costSortDir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />) : <ChevronsUpDown size={11} />}
                                  </button>
                                </th>
                                <th className="jc-cost-th jc-cost-num-col">
                                  <button className={`jc-sort-btn${costSortKey === "variance" ? " active" : ""}`} onClick={() => handleCostSort("variance")}>
                                    Variance{costSortKey === "variance" ? (costSortDir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />) : <ChevronsUpDown size={11} />}
                                  </button>
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {[...detail.costGroups].sort((a, b) => {
                                let av: number | string
                                let bv: number | string
                                switch (costSortKey) {
                                  case "costGroup": av = a.costGroup; bv = b.costGroup; break
                                  case "budget":    av = a.budget;    bv = b.budget;    break
                                  case "actual":    av = a.actual;    bv = b.actual;    break
                                  case "variance":  av = a.variance;  bv = b.variance;  break
                                }
                                if (av < bv) return costSortDir === "asc" ? -1 : 1
                                if (av > bv) return costSortDir === "asc" ? 1 : -1
                                return 0
                              }).flatMap((group) => {
                                const isGroupExpanded = expandedGroups.has(group.costGroup)
                                const groupTxns = detail.transactions.filter(
                                  (t) => t.costGroup === group.costGroup
                                )
                                return [
                                  <tr
                                    key={group.costGroup}
                                    className={`jc-group-row${isGroupExpanded ? " expanded" : ""}`}
                                    onClick={() => toggleGroup(group.costGroup)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => e.key === "Enter" && toggleGroup(group.costGroup)}
                                  >
                                    <td className="jc-cost-code-col">
                                      <span className="jc-group-chevron">
                                        {isGroupExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                                      </span>
                                      {group.costGroup}
                                    </td>
                                    <td className="jc-cost-num-col">{formatMoneyFull(group.budget)}</td>
                                    <td className="jc-cost-num-col">{formatMoneyFull(group.actual)}</td>
                                    <td className={`jc-cost-num-col ${group.variance < 0 ? "jc-variance-over" : group.variance > 0 ? "jc-variance-under" : ""}`}>
                                      {group.variance > 0 ? "+" : ""}{formatMoneyFull(group.variance)}
                                    </td>
                                  </tr>,

                                  ...(isGroupExpanded ? [
                                    <tr key={`${group.costGroup}-txns`} className="jc-txn-container-row">
                                      <td colSpan={4} style={{ padding: 0 }}>
                                        <table className="jc-txn-table">
                                          <thead>
                                            <tr>
                                              <th className="jc-txn-th jc-txn-date-col">Date</th>
                                              <th className="jc-txn-th">Vendor / Employee</th>
                                              <th className="jc-txn-th">Description</th>
                                              <th className="jc-txn-th jc-txn-type-col">Type</th>
                                              <th className="jc-txn-th">PO / Ref</th>
                                              <th className="jc-txn-th jc-txn-amount-col">Amount</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {groupTxns.length === 0 ? (
                                              <tr>
                                                <td colSpan={6} className="jc-txn-empty">No transactions found</td>
                                              </tr>
                                            ) : groupTxns.map((t) => {
                                              return (
                                                <tr
                                                  key={t.id}
                                                  className="jc-txn-row"
                                                >
                                                  <td className="jc-txn-date">{formatDate(t.transDate)}</td>
                                                  <td className="jc-txn-vendor">{t.vendorName}</td>
                                                  <td className="text-secondary">{t.description || "—"}</td>
                                                  <td className="text-secondary">{t.costType}</td>
                                                  <td className="text-secondary">{t.poReference || "—"}</td>
                                                  <td className="jc-txn-amount-col emphasized">{formatMoneyFull(t.amount)}</td>
                                                </tr>
                                              )
                                            })}
                                          </tbody>
                                        </table>
                                      </td>
                                    </tr>,
                                  ] : []),
                                ]
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )
                  })()}
                </div>
              )}
            </motion.div>
          )
        })}
      </div>
      </MotionItem>
      </MotionList>
    </Page>
  )
}
