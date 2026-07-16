import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { X, ChevronRight } from "lucide-react"
import { useParams } from "react-router-dom"
import { useJobcostNav } from "../jobcost/useJobcostNav"
import useIsMobile from "../../shared/hooks/useIsMobile"
import Page from "../../shared/components/Page"
import { PageDataProvider, useWidgetData } from "../../shared/context/PageContext"
import { PAGE_QUERIES } from "../../shared/config/pageQueries"
import { Widget } from "../../shared/components/Widget/Widget"
import { Chart } from "../../shared/components/Chart/Chart"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { YearSelector } from "../../shared/components/YearSelector/YearSelector"
import useLocalStorage from "../../shared/hooks/useLocalStorage"
import { formatMoneyFull, formatPercent, marginTextColor, shortMonth } from "../../shared/utils/format"
import useMarginColorsEnabled from "../../shared/hooks/useMarginColorsEnabled"
import { useTableSort, applySort } from "../../shared/hooks/useTableSort"
import { useModalLayer } from "../../shared/hooks/useModalLayer"
import { SortableHeader } from "../../shared/components/SortableHeader"
import { fetchPageData } from "../../shared/api/pageApi"
import { useAuth } from "../../core/auth/AuthProvider"
import { EmployeePeriodAndYearSummary } from "./widgets/EmployeePeriodAndYearSummary"
import { MarginWidget } from "./widgets/MarginWidget"
import { EmployeePerformanceWidget } from "./widgets/EmployeePerformanceWidget"
import { ReportWidget } from "./widgets/reports/ReportWidget"
import { DailyReportButton } from "./report/DailyReportButton"

// ───── Breakdown shape (page-level fetch) ────────────────────────────────
// `breakdown.projects[]` comes from the backend's `getProjectGridData`
// (same function the /jobcost page uses via `getPhases`), pre-filtered to
// this employee. That means every field the /jobcost projects table shows
// is already on each row — no second fetch + join needed. Earlier this
// page double-fetched via /jobcost and inner-joined by recnum; the join
// silently dropped any project that didn't survive both sides' phase
// consolidation, which is why some rows were missing vs the old frontend.
interface BreakdownProject {
  recnum: string | number
  name?: string
  jobnme?: string
  status: number
  totalContract?: number
  totalCost?: number
  // Raw phase rows expose the budget as `budget`; consolidated rows as
  // `totalBudget` (see project-utils.js). Accept either.
  totalBudget?: number
  budget?: number
  // Raw phase rows (consolidate:false from backend) carry pmName directly.
  pmName?: string | null
  // Consolidated rows (consolidate:true) bundle phases under here.
  phases?: { recnum: string; pmName: string | null }[]
}

interface Breakdown {
  employee: { employeeNum: number; firstName: string; lastName: string }
  stats: {
    totals: { totalCost: number; totalIncome: number; budget: number; margin: number }
    yearly: { year: number; income: number; totalCost: number; profit: number; margin: number }[]
    monthly: { month: number; income: number; totalCost: number; profit: number; margin: number }[]
  }
  projects: BreakdownProject[]
}

// Normalized row the table renders. Mirrors the shape Jobcost.tsx builds
// from getPhases, so the columns line up exactly with /jobcost.
interface ProjectRow {
  recnum: string
  jobNumber: string
  name: string
  status: number
  contract: number
  totalCost: number
  budget: number
  // Budget − Cost. Positive = under budget, negative = over.
  variance: number
  margin: number | null
  supervisor: string
}

function normalizeProject(p: BreakdownProject): ProjectRow {
  const contract = p.totalContract ?? 0
  const totalCost = p.totalCost ?? 0
  const budget = p.totalBudget ?? p.budget ?? 0
  // Raw phase rows (consolidate:false) have an 8-digit recnum directly; that
  // doubles as the URL id /jobcost navigates with. Consolidated rows
  // (4-digit recnum) drill into their first phase for the 8-digit id.
  // Supervisor comes either from `pmName` on the raw row, or from any
  // phase carrying one when consolidated.
  return {
    recnum: String(p.recnum),
    jobNumber: p.phases?.[0]?.recnum ?? String(p.recnum),
    name: p.jobnme ?? p.name ?? "",
    status: p.status,
    contract,
    totalCost,
    budget,
    variance: budget - totalCost,
    margin: contract > 0 ? ((contract - totalCost) / contract) * 100 : null,
    supervisor:
      p.pmName?.trim() ??
      p.phases?.find((ph) => ph.pmName?.trim())?.pmName?.trim() ??
      "",
  }
}

const STATUS_LABELS: Record<number, string> = {
  1: "Bidding", 2: "Refused", 3: "Contract", 4: "Current", 5: "Complete", 6: "Closed",
}

// Bar color for margin bars, mirroring MarginWidget's thresholds.
function marginColor(margin: number): string {
  if (margin >= 20) return "#22c55e"
  if (margin >= 17) return "#f59e0b"
  return "#ef4444"
}

// Margin below which an open project lands on the watchlist. The backend's
// getWatchList uses 17%; this page surfaces the stricter 15% the team asked for.
const WATCHLIST_MARGIN_THRESHOLD = 15

type ProjectSortKey = "name" | "status" | "supervisor" | "contract" | "budget" | "totalCost" | "variance" | "margin"

// Shared projects table — used by the page's Projects section and by the
// drill-down modals so columns/behavior never drift between them. Sortable via
// the shared useTableSort/SortableHeader (three-state: desc → asc → unsorted).
function ProjectsTable({
  projects,
  onRowClick,
}: {
  projects: ProjectRow[]
  onRowClick: (jobNumber: string) => void
}) {
  const marginColorsOn = useMarginColorsEnabled()
  // Managers don't see contract figures in project tables (kept on the
  // jobcost open view + detail page only).
  const { claims } = useAuth()
  const isManager = claims["role"] === "manager"
  const sort = useTableSort<ProjectSortKey>()
  const sorted = applySort(projects, sort, (row, key) => row[key])
  // Mobile mirrors the Job Costing list: name + status/PM on the left,
  // margin + chevron on the right, tap → full project report (same classes,
  // so the two lists can't drift apart visually).
  const isMobile = useIsMobile()
  if (isMobile) {
    return (
      <ul className="jc-mobile-list">
        {sorted.map((job) => (
          <li key={job.recnum}>
            <button
              type="button"
              className="jc-mobile-row"
              onClick={() => onRowClick(job.jobNumber)}
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
    )
  }
  return (
    <table className="data-table">
      <thead>
        <tr>
          <SortableHeader label="Project" columnKey="name" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
          <SortableHeader label="Status" columnKey="status" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
          <SortableHeader label="PM" columnKey="supervisor" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
          {!isManager && (
            <SortableHeader label="Contract" columnKey="contract" align="right" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
          )}
          <SortableHeader label="Budget" columnKey="budget" align="right" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
          <SortableHeader label="Cost" columnKey="totalCost" align="right" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
          <SortableHeader label="Budget Variance" columnKey="variance" align="right" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
          <SortableHeader label="Margin" columnKey="margin" align="right" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
        </tr>
      </thead>
      <tbody>
        {sorted.map((job) => (
          <tr key={job.recnum} onClick={() => onRowClick(job.jobNumber)} className="clickable-row">
            <td>
              <div className="cell-primary">{job.name}</div>
              <div className="cell-secondary">#{job.jobNumber}</div>
            </td>
            <td>
              <span className={`status-badge status-${job.status}`}>
                {STATUS_LABELS[job.status] ?? job.status}
              </span>
            </td>
            <td>{job.supervisor || "—"}</td>
            {!isManager && (
              <td style={{ textAlign: "right" }}>{formatMoneyFull(job.contract)}</td>
            )}
            <td style={{ textAlign: "right" }}>{formatMoneyFull(job.budget)}</td>
            <td style={{ textAlign: "right" }}>{formatMoneyFull(job.totalCost)}</td>
            <td
              style={{
                textAlign: "right",
                color: !marginColorsOn || job.margin == null ? undefined : marginTextColor(job.margin),
              }}
            >
              {formatMoneyFull(job.variance)}
            </td>
            <td
              style={{
                textAlign: "right",
                color: !marginColorsOn || job.margin == null ? undefined : marginTextColor(job.margin),
              }}
            >
              {job.margin == null ? "—" : `${job.margin.toFixed(1)}%`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// Drill-down modal listing the projects behind one of the top summary cards.
function ProjectsModal({
  open,
  onClose,
  title,
  projects,
  onRowClick,
}: {
  open: boolean
  onClose: () => void
  title: string
  projects: ProjectRow[]
  onRowClick: (jobNumber: string) => void
}) {
  const { overlayZ, contentZ } = useModalLayer(open)
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="modal-overlay"
            style={{ zIndex: overlayZ }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <div className="modal-positioner" style={{ zIndex: contentZ }}>
            <motion.div
              className="modal modal--wide"
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <div className="modal-header">
                <h2 className="title2 emphasized">{title}</h2>
                <button className="button modal-close" onClick={onClose}>
                  <X size={16} />
                </button>
              </div>
              {projects.length > 0 ? (
                <ProjectsTable projects={projects} onRowClick={onRowClick} />
              ) : (
                <p className="body-text text-secondary">No projects.</p>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}

// Clickable KPI tile (label + figure) that opens a drill-down modal.
function StatCard({
  label,
  value,
  loading,
  warn,
  onClick,
}: {
  label: string
  value: number
  loading?: boolean
  warn?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`employee-stat-card${warn ? " employee-stat-card--warn" : ""}`}
      onClick={onClick}
      disabled={loading}
    >
      <span className="widget-title headline">{label}</span>
      {loading ? (
        <span className="stat-widget-skeleton" />
      ) : (
        <span className="employee-stat-card-value title1 emphasized">{value}</span>
      )}
    </button>
  )
}

export default function EmployeeDetailPage() {
  const { employeeNum } = useParams<{ employeeNum: string }>()
  const numericId = Number(employeeNum)
  const [year, setYear] = useLocalStorage("dashboardYear", new Date().getFullYear())

  if (employeeNum === undefined || isNaN(numericId)) {
    return <Page title="Employee Not Found"><p>Invalid employee ID.</p></Page>
  }

  return (
    <PageDataProvider module="dashboard" queries={PAGE_QUERIES.employeeDetail} params={{ detailId: numericId, year }}>
      <EmployeeDetail employeeId={numericId} year={year} onYearChange={setYear} />
    </PageDataProvider>
  )
}

type ProjectsMode = "currentYear" | "allTime"

// Exported so the manager home (`/dashboard` for role "manager") can render the
// exact same per-employee view, scoped to their own supervisor id. Must be
// wrapped in a PageDataProvider supplying PAGE_QUERIES.employeeDetail.
export function EmployeeDetail({
  employeeId,
  year,
  onYearChange,
  isManagerHome,
  gmHome,
}: {
  employeeId: number
  year: number
  onYearChange: (y: number) => void
  /** Manager home only — shows the daily-report clock button in the header.
   *  The admin /employees/:id route never sets this. */
  isManagerHome?: boolean
  /** General Manager home: company-wide rollup. Keeps the stat cards + period/
   *  year summary, swaps the four per-employee charts + project table for the
   *  Monthly Margin Performance and Employee Performance widgets side by side.
   *  Requires the provider to supply PAGE_QUERIES.generalManagerHome. */
  gmHome?: boolean
}) {
  const { goToJobcost } = useJobcostNav()
  const marginColorsOn = useMarginColorsEnabled()
  // On mobile match the WIP toggle's label rather than spelling out "Work
  // Completed" (keeps the chart titles/legends short and consistent).
  const isMobile = useIsMobile()
  const wcLabel = isMobile ? "WIP" : "Work Completed"
  const { data, isLoading } = useWidgetData<{ employeePerformanceBreakdown: Breakdown | null }>([
    "employeePerformanceBreakdown",
  ])
  const breakdown = data?.employeePerformanceBreakdown ?? null
  const name = breakdown?.employee
    ? `${breakdown.employee.firstName} ${breakdown.employee.lastName}`.trim()
    : "Employee"
  const yearly = breakdown?.stats.yearly
  const monthly = breakdown?.stats.monthly
  const projects = breakdown?.projects

  // Line chart: Work Completed (income) by year. Mirrors AnnualRevenueWidget's
  // line series shape — one series, x = year as string, y = income.
  const workCompletedSeries = useMemo(() => {
    if (!yearly || yearly.length === 0) return null
    const sorted = [...yearly].sort((a, b) => a.year - b.year)
    return [{
      id: wcLabel,
      data: sorted.map((d) => ({ x: String(d.year), y: d.income })),
    }]
  }, [yearly, wcLabel])

  // ── Monthly charts for the page year ─────────────────────────────────
  // breakdown.stats.monthly is already filtered to the selected year on
  // the backend; we just sort + project into the chart shapes. Both
  // charts use shortMonth labels on the x-axis so they line up with how
  // the home page monthly charts read.
  const monthlyWorkCompletedSeries = useMemo(() => {
    if (!monthly || monthly.length === 0) return null
    const byMonth = new Map<number, number>()
    for (const d of monthly) {
      if (d.month >= 1 && d.month <= 12) byMonth.set(d.month, d.income)
    }
    return [
      {
        id: wcLabel,
        data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => ({
          x: shortMonth(m),
          y: byMonth.get(m) ?? 0,
        })),
      },
    ]
  }, [monthly, wcLabel])

  // Bar chart: monthly margin %. Mirrors the yearly margin's symlog
  // scaling so the chart degrades the same way for outlier months. Fills
  // missing months with 0 so the x-axis always reads Jan→Dec.
  const monthlyMarginBars = useMemo(() => {
    if (!monthly || monthly.length === 0) return null
    const byMonth = new Map<number, number>()
    for (const d of monthly) {
      if (d.month >= 1 && d.month <= 12) byMonth.set(d.month, d.margin)
    }
    const bars = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => ({
      label: shortMonth(m),
      value: byMonth.get(m) ?? 0,
    }))
    const values = bars.map((b) => b.value)
    const NICE = [10, 20, 30, 50, 100, 200, 300, 500, 1000]
    const niceMag = (v: number) => NICE.find((m) => m >= Math.abs(v)) ?? Math.ceil(Math.abs(v) / 1000) * 1000
    const dataMin = Math.min(0, ...values)
    const dataMax = Math.max(0, ...values)
    const minValue = dataMin < 0 ? -niceMag(dataMin) : 0
    const maxValue = dataMax > 0 ? niceMag(dataMax) : 10
    const absDesc = values.map((v) => Math.abs(v)).sort((a, b) => b - a)
    const inlier = absDesc[1] ?? absDesc[0] ?? 30
    const scaleConstant = Math.max(30, Math.ceil(inlier / 10) * 10)
    const candidates = [20, 50, 100, 200, 300, 500, 1000]
    const ticks = [0]
    for (const m of candidates) {
      if (-m >= minValue) ticks.push(-m)
      if (m <= maxValue) ticks.push(m)
    }
    ticks.sort((a, b) => a - b)
    return { bars, minValue, maxValue, scaleConstant, ticks }
  }, [monthly])

  // Bar chart: yearly margin %. Mirrors MarginWidget's symlog config so very
  // negative outliers (a lost year) don't crush the rest of the bars to zero.
  const marginBars = useMemo(() => {
    if (!yearly || yearly.length === 0) return null
    const sorted = [...yearly].sort((a, b) => a.year - b.year)
    const bars = sorted.map((d) => ({ label: String(d.year), value: d.margin }))
    const values = bars.map((b) => b.value)
    const NICE = [10, 20, 30, 50, 100, 200, 300, 500, 1000]
    const niceMag = (v: number) => NICE.find((m) => m >= Math.abs(v)) ?? Math.ceil(Math.abs(v) / 1000) * 1000
    const dataMin = Math.min(0, ...values)
    const dataMax = Math.max(0, ...values)
    const minValue = dataMin < 0 ? -niceMag(dataMin) : 0
    const maxValue = dataMax > 0 ? niceMag(dataMax) : 10
    // Keep typical margins inside the symlog linear zone; only extremes compress.
    const absDesc = values.map((v) => Math.abs(v)).sort((a, b) => b - a)
    const inlier = absDesc[1] ?? absDesc[0] ?? 30
    const scaleConstant = Math.max(30, Math.ceil(inlier / 10) * 10)
    const candidates = [20, 50, 100, 200, 300, 500, 1000]
    const ticks = [0]
    for (const m of candidates) {
      if (-m >= minValue) ticks.push(-m)
      if (m <= maxValue) ticks.push(m)
    }
    ticks.sort((a, b) => a - b)
    return { bars, minValue, maxValue, scaleConstant, ticks }
  }, [yearly])

  // ───── Projects section ────────────────────────────────────────────────
  // `breakdown.projects[]` is already the same rich shape the /jobcost
  // projects table uses (backend reuses `getProjectGridData`), pre-filtered
  // to this employee. So we just normalize and render directly — no second
  // fetch, no join. Earlier this page joined against a /jobcost re-fetch,
  // which silently dropped any project that didn't survive both sides'
  // phase consolidation and matched the old frontend's row count poorly.
  //
  // Mode: Current Year reads from the page-level fetch (year-scoped on the
  // backend); All Time triggers a standalone breakdown fetch with
  // year=null so the backend returns every project the employee ever
  // worked on.

  const [projectsMode, setProjectsMode] = useState<ProjectsMode>("currentYear")

  // All-time breakdown projects, cached per employee so navigating between
  // employees (or toggling the Projects range) never refetches needlessly —
  // and so we never reset state from an effect. null = not yet loaded for this id.
  const [allTimeByEmp, setAllTimeByEmp] = useState<Record<number, BreakdownProject[]>>({})
  const allTimeProjects = allTimeByEmp[employeeId] ?? null

  // Eager: the top summary cards reflect the employee's whole portfolio, and
  // the Projects "All Time" toggle reuses this same cached set (no second fetch).
  useEffect(() => {
    if (allTimeProjects !== null) return
    const ctrl = new AbortController()
    fetchPageData({
      module: "dashboard",
      queries: ["employeePerformanceBreakdown"],
      params: { detailId: employeeId, year: null },
      signal: ctrl.signal,
    })
      .then((d) => {
        const b = (d.employeePerformanceBreakdown as Breakdown | null) ?? null
        setAllTimeByEmp((prev) => ({ ...prev, [employeeId]: b?.projects ?? [] }))
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return
        setAllTimeByEmp((prev) => ({ ...prev, [employeeId]: [] }))
      })
    return () => ctrl.abort()
  }, [allTimeProjects, employeeId])

  const displayedProjects = useMemo(() => {
    const list = projectsMode === "currentYear" ? projects : allTimeProjects
    if (!list) return null
    // In Current Year mode, drop status=6 (Closed) — a closed project that
    // still posted activity in the year shouldn't crowd the active list.
    // All Time keeps them so the full history is preserved.
    const filtered =
      projectsMode === "currentYear" ? list.filter((p) => p.status !== 6) : list
    return filtered.map(normalizeProject)
  }, [projectsMode, projects, allTimeProjects])

  const projectsLoading =
    projectsMode === "currentYear" ? isLoading : allTimeProjects === null

  // ───── Top summary cards ────────────────────────────────────────────────
  // Status codes: 4 = Current (open), 5 = Complete, 6 = Closed. Scoping:
  //   • Open      — currently-open projects (status 4), any year.
  //   • Watchlist — the selected year's open projects (status 4) under the
  //                 margin threshold.
  //   • Closed    — the selected year's *completed* projects (status 5 only).
  //                 Status 6 (Closed) is excluded — those roll up to a prior year.
  // Open draws on the all-time set; Watchlist and Closed come from the
  // year-scoped page fetch (`projects`).
  const allTimeRows = useMemo(() => (allTimeProjects ?? []).map(normalizeProject), [allTimeProjects])
  const yearRows = useMemo(() => (projects ?? []).map(normalizeProject), [projects])

  const openProjects = useMemo(() => allTimeRows.filter((p) => p.status === 4), [allTimeRows])
  const closedProjects = useMemo(() => yearRows.filter((p) => p.status === 5), [yearRows])
  const watchlistProjects = useMemo(
    () =>
      yearRows.filter(
        (p) => p.status === 4 && p.margin != null && p.margin < WATCHLIST_MARGIN_THRESHOLD
      ),
    [yearRows]
  )

  // Open needs the all-time set; Watchlist/Closed come from the page fetch.
  const allTimeLoading = allTimeProjects === null

  const [activeModal, setActiveModal] = useState<null | "watchlist" | "open" | "closed">(null)
  const modalContent = {
    watchlist: {
      title: `Watchlist — projects under ${WATCHLIST_MARGIN_THRESHOLD}% margin`,
      projects: watchlistProjects,
    },
    open: { title: "Open Projects", projects: openProjects },
    closed: { title: `Closed Projects — ${year}`, projects: closedProjects },
  }
  const activeContent = activeModal ? modalContent[activeModal] : null

  const openJob = (jobNumber: string) => goToJobcost(jobNumber)

  return (
    <Page
      title={gmHome ? "Dashboard" : name}
      actions={
        <>
          {isManagerHome && <DailyReportButton />}
          <YearSelector value={year} onChange={onYearChange} />
        </>
      }
    >
      <MotionList className="widget-grid widget-grid-2 dashboard-home-grid">
        <MotionItem className="col-span-full">
          <div className="employee-stat-row">
            <StatCard
              label="Low-Margin Watchlist"
              value={watchlistProjects.length}
              loading={isLoading}
              warn={watchlistProjects.length > 0}
              onClick={() => setActiveModal("watchlist")}
            />
            <StatCard
              label="Open Projects"
              value={openProjects.length}
              loading={allTimeLoading}
              onClick={() => setActiveModal("open")}
            />
            <StatCard
              label="Closed Projects"
              value={closedProjects.length}
              loading={isLoading}
              onClick={() => setActiveModal("closed")}
            />
            {/* GM home: the four data-validation reports (admin home's Reports
                section) as a 2x2 pill cluster inside a fourth card, so the
                strip belongs to the stat-card family instead of floating. */}
            {gmHome && (
              <div className="gm-reports-card">
                <span className="widget-title headline">Reports</span>
                <div className="gm-reports-cluster">
                  <ReportWidget reportId="reconciliation" compact />
                  <ReportWidget reportId="dataQuality" compact />
                  <ReportWidget reportId="missingContracts" compact />
                  <ReportWidget reportId="openProjectsNoBudget" compact />
                </div>
              </div>
            )}
          </div>
        </MotionItem>

        <MotionItem className="col-span-full">
          <EmployeePeriodAndYearSummary monthly={monthly} yearly={yearly} loading={isLoading} />
        </MotionItem>

        {/* GM home: company-wide Monthly Margin Performance next to the
            Employee Performance leaderboard (the PM roster the GM oversees).
            Both pull from the same page provider (generalManagerHome queries).
            No per-employee charts or project table — the latter lives on Job
            Costing. */}
        {gmHome && (
          <>
            <MotionItem>
              <MarginWidget />
            </MotionItem>
            <MotionItem>
              <EmployeePerformanceWidget />
            </MotionItem>
          </>
        )}

        {/* Monthly views for the page year — sit above the yearly charts
            since the page year is the user's primary lens. */}
        {!gmHome && (
        <>
        <MotionItem>
          <Widget title={`Monthly ${wcLabel} — ${year}`} loading={isLoading} noData={!monthlyWorkCompletedSeries}>
            {monthlyWorkCompletedSeries && (
              <Chart config={{ type: "line", series: monthlyWorkCompletedSeries, enableArea: true }} />
            )}
          </Widget>
        </MotionItem>

        <MotionItem>
          <Widget title={`Monthly Margin — ${year}`} loading={isLoading} noData={!monthlyMarginBars}>
            {monthlyMarginBars && (
              <Chart
                config={{
                  type: "bar",
                  data: monthlyMarginBars.bars,
                  yFormat: formatPercent,
                  colorBy: marginColorsOn ? marginColor : undefined,
                  scaleType: "symlog",
                  scaleConstant: monthlyMarginBars.scaleConstant,
                  minValue: monthlyMarginBars.minValue,
                  maxValue: monthlyMarginBars.maxValue,
                  axisLeftTickValues: monthlyMarginBars.ticks,
                  emphasizeZero: true,
                }}
              />
            )}
          </Widget>
        </MotionItem>

        <MotionItem>
          <Widget title={`Yearly ${wcLabel}`} loading={isLoading} noData={!workCompletedSeries}>
            {workCompletedSeries && (
              <Chart config={{ type: "line", series: workCompletedSeries, enableArea: true }} />
            )}
          </Widget>
        </MotionItem>

        <MotionItem>
          <Widget title="Yearly Margin" loading={isLoading} noData={!marginBars}>
            {marginBars && (
              <Chart
                config={{
                  type: "bar",
                  data: marginBars.bars,
                  yFormat: formatPercent,
                  colorBy: marginColorsOn ? marginColor : undefined,
                  scaleType: "symlog",
                  scaleConstant: marginBars.scaleConstant,
                  minValue: marginBars.minValue,
                  maxValue: marginBars.maxValue,
                  axisLeftTickValues: marginBars.ticks,
                  emphasizeZero: true,
                }}
              />
            )}
          </Widget>
        </MotionItem>

        <MotionItem className="col-span-full">
          <Widget
            title="Projects"
            loading={projectsLoading}
            noData={!projectsLoading && (!displayedProjects || displayedProjects.length === 0)}
            actions={
              <div className="period-selector period-selector--equal" role="tablist" aria-label="Projects range">
                <button
                  type="button"
                  role="tab"
                  aria-selected={projectsMode === "currentYear"}
                  className={`period-selector-btn${projectsMode === "currentYear" ? " period-selector-btn--active" : ""}`}
                  onClick={() => setProjectsMode("currentYear")}
                >
                  Current Year
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={projectsMode === "allTime"}
                  className={`period-selector-btn${projectsMode === "allTime" ? " period-selector-btn--active" : ""}`}
                  onClick={() => setProjectsMode("allTime")}
                >
                  All Time
                </button>
              </div>
            }
          >
            {displayedProjects && displayedProjects.length > 0 && (
              <ProjectsTable projects={displayedProjects} onRowClick={openJob} />
            )}
          </Widget>
        </MotionItem>
        </>
        )}
      </MotionList>

      <ProjectsModal
        open={!!activeContent}
        onClose={() => setActiveModal(null)}
        title={activeContent?.title ?? ""}
        projects={activeContent?.projects ?? []}
        onRowClick={(jobNumber) => {
          setActiveModal(null)
          openJob(jobNumber)
        }}
      />
    </Page>
  )
}
