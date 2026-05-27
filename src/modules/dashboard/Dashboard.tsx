import { useMemo, useState } from "react"
import Page from "../../shared/components/Page"
import { PageDataProvider, useWidgetData } from "../../shared/context/PageContext"
import { PAGE_QUERIES } from "../../shared/config/pageQueries"
import { YearSelector } from "../../shared/components/YearSelector/YearSelector"
import { Widget } from "../../shared/components/Widget/Widget"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { Chart } from "../../shared/components/Chart/Chart"
import { DrillDownModal } from "../../shared/components/DrillDownModal/DrillDownModal"
import type { SpendItem } from "../../shared/components/Chart/chart.types"
import { StatWidget } from "../../shared/components/StatWidget/StatWidget"
import useLocalStorage from "../../shared/hooks/useLocalStorage"
import { useAuth } from "../../core/auth/AuthProvider"
import type { AppRole } from "../../core/auth/roles"
import { formatMoneyFull } from "../../shared/utils/format"

export default function Dashboard() {
  const { claims } = useAuth()
  const role = claims["role"] as AppRole | undefined
  const isAdmin = role === "executive" || role === "admin"
  const [year, setYear] = useLocalStorage("dashboardYear", new Date().getFullYear())

  const queries = useMemo(
    () => isAdmin ? PAGE_QUERIES.adminDashboard : PAGE_QUERIES.employeeDashboard,
    [isAdmin]
  )

  return (
    <PageDataProvider module="dashboard" queries={queries} params={{ year }}>
      <DashboardContent year={year} onYearChange={setYear} isAdmin={isAdmin} />
    </PageDataProvider>
  )
}

function DashboardContent({
  year,
  onYearChange,
  isAdmin,
}: {
  year: number
  onYearChange: (y: number) => void
  isAdmin: boolean
}) {
  if (isAdmin) return <AdminDashboard year={year} onYearChange={onYearChange} />
  return <PMDashboard year={year} onYearChange={onYearChange} />
}

// ─── Admin Dashboard ─────────────────────────────────────────────

function AdminDashboard({ year, onYearChange }: { year: number; onYearChange: (y: number) => void }) {
  const { data: revenueData, isLoading: revenueLoading } = useWidgetData<{
    annualRevenueTrend: { year: number; revenue: number }[] | null
    cumulativeRevenueGrowth: { year: number; cumulative: number }[] | null
    monthlyRevenueComparison: { month: string; current: number; previous: number }[] | null
  }>(["annualRevenueTrend", "cumulativeRevenueGrowth", "monthlyRevenueComparison"])

  const { data: marginData, isLoading: marginLoading } = useWidgetData<{
    marginPerformance: Record<string, unknown> | null
    openMonthFinances: Record<string, unknown> | null
  }>(["marginPerformance", "openMonthFinances"])

  const { data: expenseData, isLoading: expenseLoading } = useWidgetData<{
    annualDirectExpenses: Record<string, unknown>[] | null
    overHeadExpenses: Record<string, unknown> | null
  }>(["annualDirectExpenses", "overHeadExpenses"])

  const { data: insightData, isLoading: insightLoading } = useWidgetData<{
    clientInsights: unknown[] | null
    projectInsights: unknown[] | null
    subcontractorInsights: unknown[] | null
    vendorInsights: unknown[] | null
  }>(["clientInsights", "projectInsights", "subcontractorInsights", "vendorInsights"])

  const { data: hrData, isLoading: hrLoading } = useWidgetData<{
    employeePerformance: unknown[] | null
    agingSummary: Record<string, unknown> | null
    loc: Record<string, unknown> | null
    dataValidation: unknown[] | null
    projectsMissingContracts: unknown[] | null
    currentPeriodProjects: unknown[] | null
  }>(["employeePerformance", "agingSummary", "loc", "dataValidation", "projectsMissingContracts", "currentPeriodProjects"])

  // Drill-down modal showing the full ranked list for an insight widget
  const [drillDown, setDrillDown] = useState<{ title: string; items: SpendItem[] } | null>(null)
  const openDrillDown = (title: string, raw: unknown) => {
    if (Array.isArray(raw)) setDrillDown({ title, items: raw as SpendItem[] })
  }

  // Annual Revenue Trend chart data
  const revenueTrendSeries = useMemo(() => {
    const raw = revenueData?.annualRevenueTrend
    if (!Array.isArray(raw)) return null
    return [{
      id: "Revenue",
      data: raw.map((d: { year: number; revenue: number }) => ({ x: String(d.year), y: d.revenue })),
    }]
  }, [revenueData?.annualRevenueTrend])

  // Monthly Revenue Comparison chart data
  const monthlyCompSeries = useMemo(() => {
    const raw = revenueData?.monthlyRevenueComparison
    if (!Array.isArray(raw)) return null
    return [
      {
        id: `${year}`,
        data: raw.map((d: { month: string; current: number }) => ({ x: d.month, y: d.current })),
      },
      {
        id: `${year - 1}`,
        data: raw.map((d: { month: string; previous: number }) => ({ x: d.month, y: d.previous })),
      },
    ]
  }, [revenueData?.monthlyRevenueComparison, year])

  // Open month finances
  const openMonth = marginData?.openMonthFinances as {
    margin?: number
    income?: number
    cogs?: number
    grossProfit?: number
    overUnder?: number
  } | null

  // Aging summary
  const aging = hrData?.agingSummary as {
    ap?: { current?: number; over30?: number; over60?: number; over90?: number }
    ar?: { current?: number; over30?: number; over60?: number; over90?: number }
    cashFlow?: number
    bankBalance?: number
  } | null

  // Employee performance
  const employees = hrData?.employeePerformance as {
    name: string
    margin: number
    workCompleted: number
  }[] | null

  return (
    <Page title="Dashboard" actions={<YearSelector value={year} onChange={onYearChange} />}>
      <MotionList className="dashboard-grid">
        {/* Revenue Row */}
        <MotionItem>
          <Widget title="Annual Revenue Trend" loading={revenueLoading} noData={!revenueTrendSeries}>
            {revenueTrendSeries && (
              <div style={{ height: 280 }}>
                <Chart config={{ type: "line", series: revenueTrendSeries, yFormat: formatMoneyFull }} />
              </div>
            )}
          </Widget>
        </MotionItem>

        <MotionItem>
          <Widget title="Monthly Revenue Comparison" loading={revenueLoading} noData={!monthlyCompSeries}>
            {monthlyCompSeries && (
              <div style={{ height: 280 }}>
                <Chart config={{ type: "line", series: monthlyCompSeries, yFormat: formatMoneyFull }} />
              </div>
            )}
          </Widget>
        </MotionItem>

        {/* Current Period Summary */}
        <MotionItem>
          <Widget title="Current Period Summary" loading={marginLoading} noData={!openMonth}>
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

        {/* Expenses */}
        <MotionItem>
          <Widget title="Direct Expenses" loading={expenseLoading} noData={!expenseData?.annualDirectExpenses}>
            {expenseData?.annualDirectExpenses && (
              <div style={{ height: 280 }}>
                <Chart config={{
                  type: "bar",
                  data: expenseData.annualDirectExpenses as Record<string, unknown>[],
                  keys: ["material", "labor", "subs", "wtpm"],
                  indexBy: "month",
                  yFormat: formatMoneyFull,
                }} />
              </div>
            )}
          </Widget>
        </MotionItem>

        {/* Insights */}
        <MotionItem>
          <Widget title="Client Insights" loading={insightLoading} noData={!insightData?.clientInsights} expandable onExpand={() => openDrillDown("Client Insights", insightData?.clientInsights)}>
            {Array.isArray(insightData?.clientInsights) && (
              <div style={{ height: 280 }}>
                <Chart config={{
                  type: "pie-with-list",
                  items: (insightData.clientInsights as { id: string; label: string; value: number }[]).slice(0, 10),
                  centerLabel: "CLIENTS",
                }} />
              </div>
            )}
          </Widget>
        </MotionItem>

        <MotionItem>
          <Widget title="Subcontractor Insights" loading={insightLoading} noData={!insightData?.subcontractorInsights} expandable onExpand={() => openDrillDown("Subcontractor Insights", insightData?.subcontractorInsights)}>
            {Array.isArray(insightData?.subcontractorInsights) && (
              <div style={{ height: 280 }}>
                <Chart config={{
                  type: "pie-with-list",
                  items: (insightData.subcontractorInsights as { id: string; label: string; value: number }[]).slice(0, 10),
                  centerLabel: "SUBCONTRACTORS",
                }} />
              </div>
            )}
          </Widget>
        </MotionItem>

        <MotionItem>
          <Widget title="Vendor Insights" loading={insightLoading} noData={!insightData?.vendorInsights} expandable onExpand={() => openDrillDown("Vendor Insights", insightData?.vendorInsights)}>
            {Array.isArray(insightData?.vendorInsights) && (
              <div style={{ height: 280 }}>
                <Chart config={{
                  type: "pie-with-list",
                  items: (insightData.vendorInsights as { id: string; label: string; value: number }[]).slice(0, 10),
                  centerLabel: "VENDORS",
                }} />
              </div>
            )}
          </Widget>
        </MotionItem>

        {/* Employee Performance */}
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
                  {employees.map((emp) => (
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

        {/* Aging Summary */}
        <MotionItem>
          <Widget title="Aging Summary" loading={hrLoading} noData={!aging}>
            {aging && (
              <div className="stat-grid">
                <StatWidget title="Cash Flow" value={aging.cashFlow} />
                <StatWidget title="Bank Balance" value={aging.bankBalance} />
              </div>
            )}
          </Widget>
        </MotionItem>

        {/* Data Validation */}
        <MotionItem>
          <Widget title="Data Validation" loading={hrLoading} noData={!hrData?.dataValidation || (hrData.dataValidation as unknown[]).length === 0}>
            {Array.isArray(hrData?.dataValidation) && (hrData.dataValidation as { issue: string; count: number }[]).length > 0 && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Issue</th>
                    <th style={{ textAlign: "right" }}>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {(hrData.dataValidation as { issue: string; count: number }[]).map((item, i) => (
                    <tr key={i}>
                      <td>{item.issue}</td>
                      <td style={{ textAlign: "right" }}>{item.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Widget>
        </MotionItem>

        {/* Missing Contracts */}
        <MotionItem>
          <Widget title="Missing Contracts" loading={hrLoading} noData={!hrData?.projectsMissingContracts || (hrData.projectsMissingContracts as unknown[]).length === 0}>
            {Array.isArray(hrData?.projectsMissingContracts) && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Project</th>
                  </tr>
                </thead>
                <tbody>
                  {(hrData.projectsMissingContracts as { name: string; jobNum: string }[]).map((p) => (
                    <tr key={p.jobNum}>
                      <td>{p.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Widget>
        </MotionItem>
      </MotionList>

      <DrillDownModal
        open={drillDown !== null}
        onClose={() => setDrillDown(null)}
        title={drillDown?.title ?? ""}
        items={drillDown?.items ?? []}
        valueFormat={formatMoneyFull}
      />
    </Page>
  )
}

// ─── PM Dashboard ────────────────────────────────────────────────

function PMDashboard({ year, onYearChange }: { year: number; onYearChange: (y: number) => void }) {
  const { data, isLoading } = useWidgetData<{
    employeePerformanceBreakdown: Record<string, unknown> | null
    watchlist: unknown[] | null
    projectsMissingContracts: unknown[] | null
    projectCount: Record<string, number> | null
  }>(["employeePerformanceBreakdown", "watchlist", "projectsMissingContracts", "projectCount"])

  const counts = data?.projectCount as Record<string, number> | null

  return (
    <Page title="Dashboard" actions={<YearSelector value={year} onChange={onYearChange} />}>
      <MotionList className="dashboard-grid">
        {/* Project Counts */}
        <MotionItem>
          <Widget title="Project Counts" loading={isLoading} noData={!counts}>
            {counts && (
              <div className="stat-grid">
                {Object.entries(counts).map(([status, count]) => (
                  <StatWidget key={status} title={status} value={count} format="number" />
                ))}
              </div>
            )}
          </Widget>
        </MotionItem>

        {/* Watchlist */}
        <MotionItem>
          <Widget title="Watchlist" loading={isLoading} noData={!data?.watchlist || (data.watchlist as unknown[]).length === 0}>
            {Array.isArray(data?.watchlist) && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.watchlist as { name: string; reason: string }[]).map((item, i) => (
                    <tr key={i}>
                      <td>{item.name}</td>
                      <td>{item.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Widget>
        </MotionItem>

        {/* My Performance */}
        <MotionItem>
          <Widget title="My Performance" loading={isLoading} noData={!data?.employeePerformanceBreakdown}>
            {data?.employeePerformanceBreakdown && (
              <pre style={{ fontSize: "0.75rem", color: "var(--secondary-text)" }}>
                {JSON.stringify(data.employeePerformanceBreakdown, null, 2)}
              </pre>
            )}
          </Widget>
        </MotionItem>
      </MotionList>
    </Page>
  )
}
