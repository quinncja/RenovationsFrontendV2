import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { motion, type Transition } from "framer-motion"
import { Search, ChevronDown } from "lucide-react"
import Page from "../../../shared/components/Page"
import { PageDataProvider, useWidgetData } from "../../../shared/context/PageContext"
import { PAGE_QUERIES } from "../../../shared/config/pageQueries"
import { MotionList, MotionItem } from "../../../shared/components/MotionList/MotionList"
import { Widget } from "../../../shared/components/Widget/Widget"
import { YearSelector } from "../../../shared/components/YearSelector/YearSelector"
import { formatMoneyFull, marginTextColor } from "../../../shared/utils/format"
import useLocalStorage from "../../../shared/hooks/useLocalStorage"
import useMarginColorsEnabled from "../../../shared/hooks/useMarginColorsEnabled"
import useIsMobile from "../../../shared/hooks/useIsMobile"
import { EmployeeAvatar } from "../../../shared/components/EmployeeAvatar/EmployeeAvatar"
import { useJobcostNav } from "../../jobcost/useJobcostNav"
import { JOB_STATUS_LABELS } from "../directoryShared"
import { SortTh, type SortDir } from "./SortTh"
import { WorkloadTable } from "./WorkloadView"
import { deriveWorkload, type EmployeeWorkloadPayload } from "./workload"

// Directory peer of ClientsPage / VendorsPage / SubcontractorsPage for the
// company's employees. ONE table with two lenses on the same rows:
//  - Workload (default): current-state "who can take the next job" — open
//    phases, remaining backlog, progress mix, risk badges.
//  - Performance: the year-scoped financial figures (work completed /
//    budget / cost / variance / margin).
// The lenses share the card, search, and expanded row (toggling views keeps
// the same employee open); rows expand in both — Workload into the open-job
// sub-table, Performance into the year's phases in the app's standard
// project-table shape. The YearSelector only applies to Performance.

interface EmployeeRow {
  firstName: string
  lastName: string
  employeeNum: number
  totalIncome: number // "Work Completed"
  totalCost: number
  totalBudget: number // year-allocated budget across their jobs
  margin: number // already a whole percentage (0–100)
}

// A row of the shared project grid (getProjectGridData) — the phases behind
// each PM's performance numbers.
interface PerfPhase {
  recnum: string
  name: string | null
  jobnme: string | null
  status: number
  pmId: number | null
  totalContract: number
  budget: number
  totalCost: number
  margin: number
}

// Budget − Cost across the employee's jobs. Positive = under budget, negative
// = over (mirrors EmployeeDetailPage / Jobcost's per-job variance convention).
function budgetVariance(e: EmployeeRow): number {
  return (e.totalBudget ?? 0) - e.totalCost
}

type SortKey = "name" | "totalIncome" | "totalCost" | "totalBudget" | "variance" | "margin"
type ViewMode = "workload" | "performance"

// Same spring as the Job Costing command bar's segmented control (defined
// locally, like OverheadReportPage does, so this chunk doesn't pull in the
// whole jobcost module just for a constant).
const SEG_SPRING: Transition = { type: "spring", bounce: 0.15, visualDuration: 0.35 }

export default function EmployeesPage() {
  const [year, setYear] = useLocalStorage<number | null>("employeesYear", new Date().getFullYear())
  const [view, setView] = useLocalStorage<ViewMode>("employeesView", "workload")
  // Search + expanded row are shared across the two lenses so switching views
  // feels like re-dressing one table, not landing on a different page.
  const [search, setSearch] = useState("")
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const toggleRow = (id: number) => setExpandedId((cur) => (cur === id ? null : id))

  return (
    <PageDataProvider module="dashboard" queries={PAGE_QUERIES.employees} params={{ year }}>
      <Page
        title="Employees"
        actions={
          <div className="ewl-actions">
            {/* YearSelector sits LEFT of the seg so mounting it (Performance
                only) grows the actions row into the header's empty middle —
                the toggle itself never moves. */}
            {view === "performance" && <YearSelector value={year} onChange={setYear} allowAllTime />}
            <div className="ohr-seg" role="tablist" aria-label="Employees view">
              {(
                [
                  ["workload", "Workload"],
                  ["performance", "Performance"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={view === key}
                  className={`ohr-seg-btn${view === key ? " ohr-seg-btn-active" : ""}`}
                  onClick={() => setView(key)}
                >
                  {view === key && (
                    <motion.span layoutId="empViewThumb" className="ohr-seg-thumb" transition={SEG_SPRING} />
                  )}
                  <span className="ohr-seg-label">{label}</span>
                </button>
              ))}
            </div>
          </div>
        }
      >
        <MotionList className="inv-page-stack">
          <MotionItem>
            <EmployeesCard
              view={view}
              search={search}
              onSearch={setSearch}
              expandedId={expandedId}
              onToggleRow={toggleRow}
            />
          </MotionItem>
        </MotionList>
      </Page>
    </PageDataProvider>
  )
}

// The single card both lenses live in. It stays mounted across view switches
// so the toggle swaps content inside one surface instead of remounting.
function EmployeesCard({
  view,
  search,
  onSearch,
  expandedId,
  onToggleRow,
}: {
  view: ViewMode
  search: string
  onSearch: (q: string) => void
  expandedId: number | null
  onToggleRow: (id: number) => void
}) {
  const { data, isLoading } = useWidgetData<{
    employeePerformance: EmployeeRow[] | null
    employeeWorkload: EmployeeWorkloadPayload | null
    allProjectPhases: PerfPhase[] | null
  }>(["employeePerformance", "employeeWorkload", "allProjectPhases"])

  const employees = data?.employeePerformance ?? []
  const pms = useMemo(
    () => (data?.employeeWorkload ? deriveWorkload(data.employeeWorkload).pms : []),
    [data?.employeeWorkload],
  )
  const phasesByPm = useMemo(() => {
    const map = new Map<number, PerfPhase[]>()
    for (const phase of data?.allProjectPhases ?? []) {
      const pmId = phase.pmId == null ? 0 : Number(phase.pmId)
      const list = map.get(pmId)
      if (list) list.push(phase)
      else map.set(pmId, [phase])
    }
    for (const list of map.values()) list.sort((a, b) => b.totalCost - a.totalCost)
    return map
  }, [data?.allProjectPhases])

  const q = search.toLowerCase()
  const filteredEmployees = q
    ? employees.filter((e) => `${e.firstName} ${e.lastName}`.toLowerCase().includes(q))
    : employees
  const filteredPms = q ? pms.filter((pm) => pm.pmName.toLowerCase().includes(q)) : pms

  const empty = view === "workload" ? pms.length === 0 : employees.length === 0
  const noResults = view === "workload" ? filteredPms.length === 0 : filteredEmployees.length === 0

  return (
    <Widget loading={isLoading} noData={!isLoading && empty} className="co-widget">
      <div className="co-widget-toolbar">
        <div className="co-search-wrapper">
          <Search size={13} className="co-search-icon" />
          <input
            className="co-search-input"
            type="text"
            placeholder="Search employees..."
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
        {view === "workload" ? (
          <span className="ewl-legend caption1 text-secondary">
            <span className="ewl-legend-swatch ewl-mix-early" /> Early
            <span className="ewl-legend-swatch ewl-mix-mid" /> Mid
            <span className="ewl-legend-swatch ewl-mix-closing" /> Closing
          </span>
        ) : (
          <span className="co-count subheadline text-secondary">
            {filteredEmployees.length} {filteredEmployees.length === 1 ? "employee" : "employees"}
          </span>
        )}
      </div>

      {noResults && search ? (
        <div className="co-no-results body-text text-secondary">No employees match "{search}"</div>
      ) : view === "workload" ? (
        <WorkloadTable pms={filteredPms} expandedId={expandedId} onToggleRow={onToggleRow} />
      ) : (
        <PerformanceTable
          employees={filteredEmployees}
          phasesByPm={phasesByPm}
          expandedId={expandedId}
          onToggleRow={onToggleRow}
        />
      )}
    </Widget>
  )
}

// ── Performance lens ─────────────────────────────────────────────────────────

function PerformanceTable({
  employees,
  phasesByPm,
  expandedId,
  onToggleRow,
}: {
  employees: EmployeeRow[]
  phasesByPm: Map<number, PerfPhase[]>
  expandedId: number | null
  onToggleRow: (id: number) => void
}) {
  const marginColorsOn = useMarginColorsEnabled()
  // On mobile match the WIP toggle's label rather than "Work Completed".
  const isMobile = useIsMobile()
  const [sortKey, setSortKey] = useState<SortKey>("totalIncome")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  function fullName(e: EmployeeRow): string {
    return `${e.firstName} ${e.lastName}`.trim()
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      // Text → asc; numeric columns → desc by default.
      setSortDir(key === "name" ? "asc" : "desc")
    }
  }

  const sorted = useMemo(() => {
    return [...employees].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1
      if (sortKey === "name") return fullName(a).localeCompare(fullName(b)) * dir
      if (sortKey === "totalIncome") return (a.totalIncome - b.totalIncome) * dir
      if (sortKey === "totalCost") return (a.totalCost - b.totalCost) * dir
      if (sortKey === "totalBudget") return ((a.totalBudget ?? 0) - (b.totalBudget ?? 0)) * dir
      if (sortKey === "variance") return (budgetVariance(a) - budgetVariance(b)) * dir
      return (a.margin - b.margin) * dir
    })
  }, [employees, sortKey, sortDir])

  const columnCount = 6

  return (
    <table className="spend-rank-table spend-rank-table--airy">
      <thead>
        <tr>
          <SortTh col="name" label="Employee" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <SortTh col="totalIncome" label={isMobile ? "WIP" : "Work Completed"} align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <SortTh col="totalBudget" label="Budget" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <SortTh col="totalCost" label="Cost" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <SortTh col="variance" label={isMobile ? "Variance" : "Budget Variance"} align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <SortTh col="margin" label="Margin" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
        </tr>
      </thead>
      <tbody>
        {sorted.map((emp) => {
          const isUnassigned = emp.firstName?.toLowerCase() === "unassigned"
          const expanded = expandedId === emp.employeeNum
          return [
            <tr
              key={emp.employeeNum}
              className={`spend-rank-table-row ewl-row${expanded ? " ewl-row--open" : ""}`}
              onClick={() => onToggleRow(emp.employeeNum)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && onToggleRow(emp.employeeNum)}
              aria-expanded={expanded}
            >
              <td className="spend-rank-table-name body-text">
                <div className="emp-perf-name-cell">
                  <EmployeeAvatar firstName={emp.firstName} lastName={emp.lastName} />
                  <span
                    className="emp-perf-name body-text emphasized"
                    style={isUnassigned ? { fontStyle: "italic" } : undefined}
                  >
                    {fullName(emp)}
                  </span>
                  <ChevronDown size={13} className={`ewl-chevron${expanded ? " ewl-chevron--open" : ""}`} />
                </div>
              </td>
              <td className="spend-rank-table-value body-text emphasized">{formatMoneyFull(emp.totalIncome)}</td>
              <td className="spend-rank-table-value body-text emphasized">{formatMoneyFull(emp.totalBudget ?? 0)}</td>
              <td className="spend-rank-table-value body-text emphasized">{formatMoneyFull(emp.totalCost)}</td>
              {(() => {
                const variance = budgetVariance(emp)
                return (
                  <td className={`spend-rank-table-value body-text emphasized ${variance < 0 ? "jc-variance-over" : variance > 0 ? "jc-variance-under" : ""}`}>
                    {variance > 0 ? "+" : ""}{formatMoneyFull(variance)}
                  </td>
                )
              })()}
              <td
                className="spend-rank-table-value body-text emphasized"
                style={{ color: marginColorsOn ? marginTextColor(emp.margin) : undefined }}
              >
                {emp.margin.toFixed(1)}%
              </td>
            </tr>,
            expanded ? (
              <tr key={`${emp.employeeNum}-phases`} className="ewl-expand-row">
                <td colSpan={columnCount}>
                  <PerfPhasesPanel
                    employeeNum={emp.employeeNum}
                    phases={phasesByPm.get(emp.employeeNum) ?? []}
                  />
                </td>
              </tr>
            ) : null,
          ]
        })}
      </tbody>
    </table>
  )
}

// The phases behind one PM's performance numbers, in the app's standard
// project-table columns (Project / Status / Contract / Budget / Cost /
// Variance / Margin — the EmployeeDetail / Jobcost convention).
function PerfPhasesPanel({ employeeNum, phases }: { employeeNum: number; phases: PerfPhase[] }) {
  const { goToJobcost } = useJobcostNav()
  const marginColorsOn = useMarginColorsEnabled()

  return (
    <>
      {phases.length === 0 ? (
        <p className="ewl-sub-empty body-text text-secondary">No phases with activity this year.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Status</th>
              <th style={{ textAlign: "right" }}>Contract</th>
              <th style={{ textAlign: "right" }}>Budget</th>
              <th style={{ textAlign: "right" }}>Cost</th>
              <th style={{ textAlign: "right" }}>Variance</th>
              <th style={{ textAlign: "right" }}>Margin</th>
            </tr>
          </thead>
          <tbody>
            {phases.map((phase) => {
              const variance = (phase.budget ?? 0) - (phase.totalCost ?? 0)
              return (
                <tr key={phase.recnum} className="clickable-row" onClick={() => goToJobcost(phase.recnum)}>
                  <td>
                    <div className="cell-primary">{(phase.name || phase.jobnme || phase.recnum).trim()}</div>
                    <div className="cell-secondary">#{phase.recnum}</div>
                  </td>
                  <td>
                    <span className={`status-badge status-${phase.status}`}>
                      {JOB_STATUS_LABELS[phase.status] ?? phase.status}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>{formatMoneyFull(phase.totalContract ?? 0)}</td>
                  <td style={{ textAlign: "right" }}>{formatMoneyFull(phase.budget ?? 0)}</td>
                  <td style={{ textAlign: "right" }}>{formatMoneyFull(phase.totalCost ?? 0)}</td>
                  <td
                    style={{ textAlign: "right" }}
                    className={variance < 0 ? "jc-variance-over" : variance > 0 ? "jc-variance-under" : ""}
                  >
                    {variance > 0 ? "+" : ""}{formatMoneyFull(variance)}
                  </td>
                  <td
                    style={{
                      textAlign: "right",
                      color: marginColorsOn ? marginTextColor(phase.margin) : undefined,
                    }}
                  >
                    {phase.margin == null ? "—" : `${phase.margin.toFixed(1)}%`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <div className="ewl-expand-foot">
        <Link className="ewl-profile-link" to={`/employees/${employeeNum}`}>
          View full profile →
        </Link>
      </div>
    </>
  )
}
