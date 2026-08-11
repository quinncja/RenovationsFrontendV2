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
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { YearSelector } from "../../shared/components/YearSelector/YearSelector"
import useLocalStorage from "../../shared/hooks/useLocalStorage"
import { formatMoneyFull, marginTextColor } from "../../shared/utils/format"
import useMarginColorsEnabled from "../../shared/hooks/useMarginColorsEnabled"
import { useTableSort, applySort } from "../../shared/hooks/useTableSort"
import { useModalLayer } from "../../shared/hooks/useModalLayer"
import { SortableHeader } from "../../shared/components/SortableHeader"
import { fetchPageData } from "../../shared/api/pageApi"
import { useAuth } from "../../core/auth/AuthProvider"
import { SnapPager } from "../../shared/components/SnapPager/SnapPager"
import { EmployeePeriodAndYearSummary } from "./widgets/EmployeePeriodAndYearSummary"
import { DailyReportButton } from "./report/DailyReportButton"
import {
  normalizeProject,
  STATUS_LABELS,
  WATCHLIST_MARGIN_THRESHOLD,
  type Breakdown,
  type BreakdownProject,
  type ProjectRow,
} from "./home/breakdownRows"
import { PerformanceCharts } from "./home/PerformanceCharts"
import { CurrentPerformanceSection } from "./home/CurrentPerformanceSection"
import { PerformanceOverTimeSection } from "./home/PerformanceOverTimeSection"

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
          <tr
            key={job.recnum}
            onClick={() => onRowClick(job.jobNumber)}
            className="clickable-row"
            tabIndex={0}
            role="button"
            onKeyDown={(e) => e.key === "Enter" && onRowClick(job.jobNumber)}
          >
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
  const { overlayZ, contentZ, isTopLayer } = useModalLayer(open)
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className={`modal-overlay${isTopLayer ? " modal-overlay--blur" : ""}`}
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

  // PM home and GM home share the two-section snap pager; the admin
  // /employees/:id route keeps the flat widget grid.
  const isHome = Boolean(isManagerHome || gmHome)

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

  // All-time breakdown (projects + the stats totals that back the home's
  // All Time strip), cached per employee so navigating between employees (or
  // toggling the Projects range) never refetches needlessly — and so we never
  // reset state from an effect. Missing key = not yet loaded for this id.
  const [allTimeByEmp, setAllTimeByEmp] = useState<
    Record<number, { projects: BreakdownProject[]; totals: Breakdown["stats"]["totals"] | null }>
  >({})
  const allTime = allTimeByEmp[employeeId] ?? null
  const allTimeProjects = allTime?.projects ?? null

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
        setAllTimeByEmp((prev) => ({
          ...prev,
          [employeeId]: { projects: b?.projects ?? [], totals: b?.stats?.totals ?? null },
        }))
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return
        setAllTimeByEmp((prev) => ({ ...prev, [employeeId]: { projects: [], totals: null } }))
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

  const pageActions = (
    <>
      {isManagerHome && <DailyReportButton />}
      <YearSelector value={year} onChange={onYearChange} />
    </>
  )

  const projectsModal = (
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
  )

  // ── PM / GM home: two-section snap pager ────────────────────────────────
  if (isHome) {
    return (
      <Page title={gmHome ? "Dashboard" : name} actions={pageActions}>
        <SnapPager
          sections={[
            {
              id: "current",
              title: "Current Project Performance",
              content: (
                <CurrentPerformanceSection
                  watchlistProjects={watchlistProjects}
                  openProjects={openProjects}
                  closedProjects={closedProjects}
                  monthly={monthly}
                  yearly={yearly}
                  isLoading={isLoading}
                  allTimeLoading={allTimeLoading}
                  year={year}
                  gmHome={gmHome}
                  onOpenModal={setActiveModal}
                />
              ),
            },
            {
              id: "overTime",
              title: "Performance Over Time",
              content: (
                <PerformanceOverTimeSection
                  monthly={monthly}
                  yearly={yearly}
                  isLoading={isLoading}
                  year={year}
                  gmHome={gmHome}
                  allTimeTotals={allTime?.totals ?? null}
                  allTimeRows={allTimeRows}
                  allTimeLoading={allTimeLoading}
                />
              ),
            },
          ]}
        />
        {projectsModal}
      </Page>
    )
  }

  // ── Admin /employees/:id: the original flat widget grid ─────────────────
  return (
    <Page title={name} actions={pageActions}>
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
          </div>
        </MotionItem>

        <MotionItem className="col-span-full">
          <EmployeePeriodAndYearSummary monthly={monthly} yearly={yearly} loading={isLoading} />
        </MotionItem>

        <PerformanceCharts monthly={monthly} yearly={yearly} year={year} isLoading={isLoading} />

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
      </MotionList>

      {projectsModal}
    </Page>
  )
}
