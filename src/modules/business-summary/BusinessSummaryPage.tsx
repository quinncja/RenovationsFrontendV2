import Page from "../../shared/components/Page"
import { PageDataProvider, useWidgetData } from "../../shared/context/PageContext"
import { PAGE_QUERIES } from "../../shared/config/pageQueries"
import { YearSelector } from "../../shared/components/YearSelector/YearSelector"
import { Widget } from "../../shared/components/Widget/Widget"
import { StatWidget } from "../../shared/components/StatWidget/StatWidget"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { Chart } from "../../shared/components/Chart/Chart"
import useLocalStorage from "../../shared/hooks/useLocalStorage"
import { formatMoneyFull } from "../../shared/utils/format"
import { useMemo } from "react"

export default function BusinessSummaryPage() {
  const [year, setYear] = useLocalStorage("businessSummaryYear", new Date().getFullYear())

  return (
    <PageDataProvider module="businessSummary" queries={PAGE_QUERIES.businessSummary} params={{ year }}>
      <BusinessSummaryContent year={year} onYearChange={setYear} />
    </PageDataProvider>
  )
}

function BusinessSummaryContent({ year, onYearChange }: { year: number; onYearChange: (y: number) => void }) {
  const { data: financeData, isLoading: finLoading } = useWidgetData<{
    openMonthFinances: { margin?: number; income?: number; cogs?: number; grossProfit?: number } | null
    marginPerformance: Record<string, unknown> | null
    annualRevenueTrend: { year: number; revenue: number }[] | null
  }>(["openMonthFinances", "marginPerformance", "annualRevenueTrend"])

  const { data: expData, isLoading: expLoading } = useWidgetData<{
    annualDirectExpenses: Record<string, unknown>[] | null
    overHeadExpenses: Record<string, unknown> | null
  }>(["annualDirectExpenses", "overHeadExpenses"])

  const { data: hrData, isLoading: hrLoading } = useWidgetData<{
    employeePerformance: { name: string; margin: number; workCompleted: number }[] | null
    currentPeriodProjects: unknown[] | null
  }>(["employeePerformance", "currentPeriodProjects"])

  const openMonth = financeData?.openMonthFinances
  const employees = hrData?.employeePerformance

  const revenueSeries = useMemo(() => {
    const raw = financeData?.annualRevenueTrend
    if (!Array.isArray(raw)) return null
    return [{ id: "Revenue", data: raw.map(d => ({ x: String(d.year), y: d.revenue })) }]
  }, [financeData?.annualRevenueTrend])

  return (
    <Page title="Company Overview" actions={<YearSelector value={year} onChange={onYearChange} />}>
      <MotionList className="dashboard-grid">
        <MotionItem>
          <Widget title="Current Period" loading={finLoading} noData={!openMonth}>
            {openMonth && (
              <div className="stat-grid">
                <StatWidget title="Margin" value={openMonth.margin} format="percent" />
                <StatWidget title="Income" value={openMonth.income} />
                <StatWidget title="COGS" value={openMonth.cogs} />
                <StatWidget title="Gross Profit" value={openMonth.grossProfit} />
              </div>
            )}
          </Widget>
        </MotionItem>

        <MotionItem>
          <Widget title="Annual Revenue Trend" loading={finLoading} noData={!revenueSeries}>
            {revenueSeries && (
              <div style={{ height: 280 }}>
                <Chart config={{ type: "line", series: revenueSeries, yFormat: formatMoneyFull }} />
              </div>
            )}
          </Widget>
        </MotionItem>

        <MotionItem>
          <Widget title="Employee Performance" loading={hrLoading} noData={!employees}>
            {employees && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th style={{ textAlign: "right" }}>Margin</th>
                    <th style={{ textAlign: "right" }}>Work Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map(emp => (
                    <tr key={emp.name}>
                      <td>{emp.name}</td>
                      <td style={{ textAlign: "right" }}>{(emp.margin * 100).toFixed(1)}%</td>
                      <td style={{ textAlign: "right" }}>{formatMoneyFull(emp.workCompleted)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Widget>
        </MotionItem>

        <MotionItem>
          <Widget title="Direct Expenses" loading={expLoading} noData={!expData?.annualDirectExpenses}>
            {expData?.annualDirectExpenses && (
              <div style={{ height: 280 }}>
                <Chart config={{
                  type: "bar",
                  data: expData.annualDirectExpenses as Record<string, unknown>[],
                  keys: ["material", "labor", "subs", "wtpm"],
                  indexBy: "month",
                  yFormat: formatMoneyFull,
                }} />
              </div>
            )}
          </Widget>
        </MotionItem>
      </MotionList>
    </Page>
  )
}
