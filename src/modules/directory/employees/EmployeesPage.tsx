import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Search } from "lucide-react"
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
import { SortTh, type SortDir } from "./SortTh"
import { WorkloadView } from "./WorkloadView"

// Directory peer of ClientsPage / VendorsPage / SubcontractorsPage for the
// company's employees, in two modes:
//  - Workload (default): current-state "who can take the next job" — open
//    phases, remaining backlog, progress mix, risk badges, per-PM job lanes.
//  - Performance: the year-scoped financial table (work completed / budget /
//    cost / variance / margin), same chrome as the other directory pages.
// The YearSelector only applies to Performance — Workload is inherently "now".

interface EmployeeRow {
  firstName: string
  lastName: string
  employeeNum: number
  totalIncome: number // "Work Completed"
  totalCost: number
  totalBudget: number // year-allocated budget across their jobs
  margin: number // already a whole percentage (0–100)
}

// Budget − Cost across the employee's jobs. Positive = under budget, negative
// = over (mirrors EmployeeDetailPage / Jobcost's per-job variance convention).
function budgetVariance(e: EmployeeRow): number {
  return (e.totalBudget ?? 0) - e.totalCost
}

type SortKey = "name" | "totalIncome" | "totalCost" | "totalBudget" | "variance" | "margin"
type ViewMode = "workload" | "performance"

export default function EmployeesPage() {
  const [year, setYear] = useLocalStorage<number | null>("employeesYear", new Date().getFullYear())
  const [view, setView] = useLocalStorage<ViewMode>("employeesView", "workload")

  return (
    <PageDataProvider module="dashboard" queries={PAGE_QUERIES.employees} params={{ year }}>
      <Page
        title="Employees"
        actions={
          <div className="ewl-actions">
            <div className="period-selector period-selector--equal">
              <button
                className={`period-selector-btn${view === "workload" ? " period-selector-btn--active" : ""}`}
                onClick={() => setView("workload")}
              >
                Workload
              </button>
              <button
                className={`period-selector-btn${view === "performance" ? " period-selector-btn--active" : ""}`}
                onClick={() => setView("performance")}
              >
                Performance
              </button>
            </div>
            {view === "performance" && <YearSelector value={year} onChange={setYear} allowAllTime />}
          </div>
        }
      >
        {/* key remounts the list on toggle so the entrance stagger re-runs —
            the switch reads as arriving on a new page, not a content swap. */}
        <MotionList className="inv-page-stack" key={view}>
          {view === "workload" ? <WorkloadView /> : <PerformanceView />}
        </MotionList>
      </Page>
    </PageDataProvider>
  )
}

function PerformanceView() {
  const navigate = useNavigate()
  const marginColorsOn = useMarginColorsEnabled()
  // On mobile match the WIP toggle's label rather than "Work Completed".
  const isMobile = useIsMobile()
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("totalIncome")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const { data, isLoading } = useWidgetData<{ employeePerformance: EmployeeRow[] | null }>([
    "employeePerformance",
  ])
  const employees = data?.employeePerformance ?? []

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
    const q = search.toLowerCase()
    const filtered = q ? employees.filter((e) => fullName(e).toLowerCase().includes(q)) : employees
    return [...filtered].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1
      if (sortKey === "name") return fullName(a).localeCompare(fullName(b)) * dir
      if (sortKey === "totalIncome") return (a.totalIncome - b.totalIncome) * dir
      if (sortKey === "totalCost") return (a.totalCost - b.totalCost) * dir
      if (sortKey === "totalBudget") return ((a.totalBudget ?? 0) - (b.totalBudget ?? 0)) * dir
      if (sortKey === "variance") return (budgetVariance(a) - budgetVariance(b)) * dir
      return (a.margin - b.margin) * dir
    })
  }, [employees, search, sortKey, sortDir])

  return (
    <MotionItem>
      <Widget loading={isLoading} noData={!isLoading && employees.length === 0} className="co-widget">
        <div className="co-widget-toolbar">
          <div className="co-search-wrapper">
            <Search size={13} className="co-search-icon" />
            <input
              className="co-search-input"
              type="text"
              placeholder="Search employees..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="co-count subheadline text-secondary">
            {sorted.length} {sorted.length === 1 ? "employee" : "employees"}
          </span>
        </div>

        {sorted.length === 0 && search ? (
          <div className="co-no-results body-text text-secondary">No employees match "{search}"</div>
        ) : (
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
                const name = fullName(emp)
                return (
                  <tr
                    key={emp.employeeNum}
                    className="spend-rank-table-row"
                    onClick={() => navigate(`/employees/${emp.employeeNum}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && navigate(`/employees/${emp.employeeNum}`)}
                  >
                    <td className="spend-rank-table-name body-text">
                      <div className="emp-perf-name-cell">
                        <EmployeeAvatar firstName={emp.firstName} lastName={emp.lastName} />
                        <span
                          className="emp-perf-name body-text emphasized"
                          style={isUnassigned ? { fontStyle: "italic" } : undefined}
                        >
                          {name}
                        </span>
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
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Widget>
    </MotionItem>
  )
}
