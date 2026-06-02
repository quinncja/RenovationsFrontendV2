import { useMemo } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ChevronRight } from "lucide-react"
import { Widget } from "../../../shared/components/Widget/Widget"
import { EmployeeAvatar } from "../../../shared/components/EmployeeAvatar/EmployeeAvatar"
import { useWidgetData } from "../../../shared/context/PageContext"
import { formatMoneyFull, marginTextColor } from "../../../shared/utils/format"
import useMarginColorsEnabled from "../../../shared/hooks/useMarginColorsEnabled"

interface EmployeeRow {
  firstName: string
  lastName: string
  employeeNum: number
  totalIncome: number // "Work Completed"
  totalCost: number
  margin: number // already a percentage (0–100)
}

const TOP_N = 5

export function EmployeePerformanceWidget() {
  const { data, isLoading } = useWidgetData<{ employeePerformance: EmployeeRow[] | null }>([
    "employeePerformance",
  ])
  const employees = data?.employeePerformance
  const navigate = useNavigate()
  const marginColorsOn = useMarginColorsEnabled()

  // Always rank by work completed descending; show only the top N. Sort
  // headers removed alongside this — the widget's purpose now is "who got
  // the most done?" at a glance, not a sortable leaderboard.
  const topEmployees = useMemo(
    () =>
      [...(employees ?? [])]
        .sort((a, b) => (b.totalIncome ?? 0) - (a.totalIncome ?? 0))
        .slice(0, TOP_N),
    [employees]
  )

  const seeAllLink = (
    <Link to="/employees" className="widget-link-btn" title="See all employees">
      See all <ChevronRight size={12} />
    </Link>
  )

  return (
    <Widget title="Employee Performance" loading={isLoading} noData={!employees} actions={seeAllLink}>
      {employees && (
        <table className="data-table data-table-airy emp-perf-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th style={{ textAlign: "right" }}>Work Completed</th>
              <th style={{ textAlign: "right" }}>Margin</th>
            </tr>
          </thead>
          <tbody>
            {topEmployees.map((emp) => {
              const isUnassigned = emp.firstName?.toLowerCase() === "unassigned"
              const fullName = `${emp.firstName} ${emp.lastName}`.trim()
              return (
                <tr
                  key={emp.employeeNum}
                  className="clickable-row"
                  onClick={() => navigate(`/employees/${emp.employeeNum}`)}
                >
                  <td>
                    <div className="emp-perf-name-cell">
                      <EmployeeAvatar firstName={emp.firstName} lastName={emp.lastName} />
                      <span
                        className="emp-perf-name body-text emphasized"
                        style={isUnassigned ? { fontStyle: "italic" } : undefined}
                      >
                        {fullName}
                      </span>
                    </div>
                  </td>
                  <td className="emp-perf-money" style={{ textAlign: "right" }}>{formatMoneyFull(emp.totalIncome)}</td>
                  <td
                    className="emp-perf-margin"
                    style={{ textAlign: "right", color: marginColorsOn ? marginTextColor(emp.margin) : undefined }}
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
  )
}
