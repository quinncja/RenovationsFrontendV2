import { useParams } from "react-router-dom"
import Page from "../../../shared/components/Page"
import { PageDataProvider, useWidgetData } from "../../../shared/context/PageContext"
import { PAGE_QUERIES } from "../../../shared/config/pageQueries"
import { Widget } from "../../../shared/components/Widget/Widget"
import { StatWidget } from "../../../shared/components/StatWidget/StatWidget"
import { Chart } from "../../../shared/components/Chart/Chart"
import { MotionList, MotionItem } from "../../../shared/components/MotionList/MotionList"
import { formatMoneyFull, formatDate } from "../../../shared/utils/format"

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const numericId = Number(id)
  if (!id || isNaN(numericId)) return <Page title="Client Not Found"><p>Invalid client ID.</p></Page>

  return (
    <PageDataProvider module="dashboard" queries={PAGE_QUERIES.clientDetail} params={{ id: numericId }}>
      <ClientDetail />
    </PageDataProvider>
  )
}

function ClientDetail() {
  const { data, isLoading } = useWidgetData<{
    clientSummary: { name: string; totalRevenue: number; jobCount: number; avgMargin: number } | null
    clientRevenueByYear: { year: number; revenue: number }[] | null
    clientRecentInvoices: { id: number; date: string; amount: number; description: string }[] | null
    clientJobs: { recnum: number; jobnme: string; revenue: number; margin: number }[] | null
  }>(["clientSummary", "clientRevenueByYear", "clientRecentInvoices", "clientJobs"])

  const summary = data?.clientSummary
  const revenueByYear = data?.clientRevenueByYear
  const invoices = data?.clientRecentInvoices
  const jobs = data?.clientJobs

  const revenueSeries = revenueByYear ? [{
    id: "Revenue",
    data: revenueByYear.map(d => ({ x: String(d.year), y: d.revenue })),
  }] : null

  return (
    <Page title={summary?.name ?? "Client"}>
      <MotionList className="dashboard-grid">
        <MotionItem>
          <Widget title="Summary" loading={isLoading} noData={!summary}>
            {summary && (
              <div className="stat-grid">
                <StatWidget title="Total Revenue" value={summary.totalRevenue} />
                <StatWidget title="Jobs" value={summary.jobCount} format="number" />
                <StatWidget title="Avg Margin" value={summary.avgMargin} format="percent" />
              </div>
            )}
          </Widget>
        </MotionItem>

        <MotionItem>
          <Widget title="Revenue by Year" loading={isLoading} noData={!revenueSeries}>
            {revenueSeries && (
              <div style={{ height: 280 }}>
                <Chart config={{ type: "bar", data: revenueByYear as Record<string, unknown>[], keys: ["revenue"], indexBy: "year", yFormat: formatMoneyFull }} />
              </div>
            )}
          </Widget>
        </MotionItem>

        <MotionItem>
          <Widget title="Recent Invoices" loading={isLoading} noData={!invoices || invoices.length === 0}>
            {invoices && (
              <table className="data-table">
                <thead><tr><th>Date</th><th>Description</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id}>
                      <td>{formatDate(inv.date)}</td>
                      <td>{inv.description}</td>
                      <td style={{ textAlign: "right" }}>{formatMoneyFull(inv.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Widget>
        </MotionItem>

        <MotionItem>
          <Widget title="Jobs" loading={isLoading} noData={!jobs || jobs.length === 0}>
            {jobs && (
              <table className="data-table">
                <thead><tr><th>Project</th><th style={{ textAlign: "right" }}>Revenue</th><th style={{ textAlign: "right" }}>Margin</th></tr></thead>
                <tbody>
                  {jobs.map(j => (
                    <tr key={j.recnum}>
                      <td>{j.jobnme}</td>
                      <td style={{ textAlign: "right" }}>{formatMoneyFull(j.revenue)}</td>
                      <td style={{ textAlign: "right" }}>{(j.margin * 100).toFixed(1)}%</td>
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
