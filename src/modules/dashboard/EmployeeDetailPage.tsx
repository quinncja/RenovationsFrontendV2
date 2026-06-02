import { useEffect, useMemo, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
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
import { fetchPageData } from "../../shared/api/pageApi"
import { EmployeePeriodAndYearSummary } from "./widgets/EmployeePeriodAndYearSummary"

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
  margin: number | null
  supervisor: string
}

function normalizeProject(p: BreakdownProject): ProjectRow {
  const contract = p.totalContract ?? 0
  const totalCost = p.totalCost ?? 0
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

function EmployeeDetail({ employeeId, year, onYearChange }: { employeeId: number; year: number; onYearChange: (y: number) => void }) {
  const navigate = useNavigate()
  const marginColorsOn = useMarginColorsEnabled()
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
      id: "Work Completed",
      data: sorted.map((d) => ({ x: String(d.year), y: d.income })),
    }]
  }, [yearly])

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
        id: "Work Completed",
        data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => ({
          x: shortMonth(m),
          y: byMonth.get(m) ?? 0,
        })),
      },
    ]
  }, [monthly])

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

  // All-time breakdown projects. Cached so toggling back & forth doesn't
  // refetch. Invalidated when the employee changes.
  const [allTimeProjects, setAllTimeProjects] = useState<BreakdownProject[] | null>(null)
  const [allTimeBreakdownLoading, setAllTimeBreakdownLoading] = useState(false)

  useEffect(() => {
    setAllTimeProjects(null)
  }, [employeeId])

  useEffect(() => {
    if (projectsMode !== "allTime" || allTimeProjects !== null) return
    const ctrl = new AbortController()
    setAllTimeBreakdownLoading(true)
    fetchPageData({
      module: "dashboard",
      queries: ["employeePerformanceBreakdown"],
      params: { detailId: employeeId, year: null },
      signal: ctrl.signal,
    })
      .then((d) => {
        const b = (d.employeePerformanceBreakdown as Breakdown | null) ?? null
        setAllTimeProjects(b?.projects ?? [])
        setAllTimeBreakdownLoading(false)
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return
        setAllTimeProjects([])
        setAllTimeBreakdownLoading(false)
      })
    return () => ctrl.abort()
  }, [projectsMode, allTimeProjects, employeeId])

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
    projectsMode === "currentYear" ? isLoading : allTimeBreakdownLoading

  return (
    <Page title={name} actions={<YearSelector value={year} onChange={onYearChange} />}>
      <MotionList className="widget-grid widget-grid-2 dashboard-home-grid">
        <MotionItem className="col-span-full">
          <EmployeePeriodAndYearSummary monthly={monthly} yearly={yearly} loading={isLoading} />
        </MotionItem>

        {/* Monthly views for the page year — sit above the yearly charts
            since the page year is the user's primary lens. */}
        <MotionItem>
          <Widget title={`Monthly Work Completed — ${year}`} loading={isLoading} noData={!monthlyWorkCompletedSeries}>
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
          <Widget title="Yearly Work Completed" loading={isLoading} noData={!workCompletedSeries}>
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
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Status</th>
                    <th>PM</th>
                    <th style={{ textAlign: "right" }}>Contract</th>
                    <th style={{ textAlign: "right" }}>Cost</th>
                    <th style={{ textAlign: "right" }}>Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedProjects.map((job) => (
                    <tr
                      key={job.recnum}
                      onClick={() => navigate(`/jobcost/${job.jobNumber}`)}
                      className="clickable-row"
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
                      <td style={{ textAlign: "right" }}>{formatMoneyFull(job.contract)}</td>
                      <td style={{ textAlign: "right" }}>{formatMoneyFull(job.totalCost)}</td>
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
            )}
          </Widget>
        </MotionItem>
      </MotionList>
    </Page>
  )
}
