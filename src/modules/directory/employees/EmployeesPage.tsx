import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import Page from "../../../shared/components/Page"
import { PageDataProvider, useWidgetData } from "../../../shared/context/PageContext"
import { PAGE_QUERIES } from "../../../shared/config/pageQueries"
import { MotionList, MotionItem } from "../../../shared/components/MotionList/MotionList"
import { Widget } from "../../../shared/components/Widget/Widget"
import { YearSelector } from "../../../shared/components/YearSelector/YearSelector"
import { formatMoneyFull, marginTextColor } from "../../../shared/utils/format"
import useLocalStorage from "../../../shared/hooks/useLocalStorage"
import useMarginColorsEnabled from "../../../shared/hooks/useMarginColorsEnabled"
import { EmployeeAvatar } from "../../../shared/components/EmployeeAvatar/EmployeeAvatar"

// Directory peer of ClientsPage / VendorsPage / SubcontractorsPage for the
// company's employees. Same chrome: co-widget toolbar (search + count),
// spend-rank-table with sortable headers, row → /employees/:employeeNum.
// Margin column gets marginTextColor like the home-page employee widget
// (no treemap — money already aggregates per employee, donut would re-do
// the same comparison the work-completed column does numerically).

interface EmployeeRow {
  firstName: string
  lastName: string
  employeeNum: number
  totalIncome: number // "Work Completed"
  totalCost: number
  margin: number // already a whole percentage (0–100)
}

type SortKey = "name" | "totalIncome" | "totalCost" | "margin"
type SortDir = "asc" | "desc"

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

export default function EmployeesPage() {
  const [year, setYear] = useLocalStorage<number | null>("employeesYear", new Date().getFullYear())

  return (
    <PageDataProvider module="dashboard" queries={PAGE_QUERIES.employees} params={{ year }}>
      <EmployeesContent year={year} onYearChange={setYear} />
    </PageDataProvider>
  )
}

function EmployeesContent({ year, onYearChange }: { year: number | null; onYearChange: (y: number | null) => void }) {
  const navigate = useNavigate()
  const marginColorsOn = useMarginColorsEnabled()
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
      return (a.margin - b.margin) * dir
    })
  }, [employees, search, sortKey, sortDir])

  return (
    <Page
      title="Employees"
      actions={<YearSelector value={year} onChange={onYearChange} allowAllTime />}
    >
      <MotionList className="inv-page-stack">
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
                    <SortTh col="totalIncome" label="Work Completed" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh col="totalCost" label="Cost" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
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
                        <td className="spend-rank-table-value subheadline text-secondary">{formatMoneyFull(emp.totalCost)}</td>
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
      </MotionList>
    </Page>
  )
}
