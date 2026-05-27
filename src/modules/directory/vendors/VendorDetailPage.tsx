import { useParams } from "react-router-dom"
import Page from "../../../shared/components/Page"
import { PageDataProvider, useWidgetData } from "../../../shared/context/PageContext"
import { PAGE_QUERIES } from "../../../shared/config/pageQueries"
import { Widget } from "../../../shared/components/Widget/Widget"
import { StatWidget } from "../../../shared/components/StatWidget/StatWidget"
import { MotionList, MotionItem } from "../../../shared/components/MotionList/MotionList"
import { formatMoneyFull, formatDate } from "../../../shared/utils/format"

export default function VendorDetailPage() {
  const { id } = useParams<{ id: string }>()
  const numericId = Number(id)
  if (!id || isNaN(numericId)) return <Page title="Vendor Not Found"><p>Invalid vendor ID.</p></Page>

  return (
    <PageDataProvider module="dashboard" queries={PAGE_QUERIES.vendorDetail} params={{ id: numericId }}>
      <VendorDetail />
    </PageDataProvider>
  )
}

function VendorDetail() {
  const { data, isLoading } = useWidgetData<{
    vendorSummary: { name: string; totalSpend: number; jobCount: number } | null
    vendorSpendByYear: { year: number; spend: number }[] | null
    vendorRecentInvoices: { id: number; date: string; amount: number; description: string }[] | null
    vendorJobs: { recnum: number; jobnme: string; spend: number }[] | null
  }>(["vendorSummary", "vendorSpendByYear", "vendorRecentInvoices", "vendorJobs"])

  const summary = data?.vendorSummary
  const invoices = data?.vendorRecentInvoices
  const jobs = data?.vendorJobs

  return (
    <Page title={summary?.name ?? "Vendor"}>
      <MotionList className="dashboard-grid">
        <MotionItem>
          <Widget title="Summary" loading={isLoading} noData={!summary}>
            {summary && (
              <div className="stat-grid">
                <StatWidget title="Total Spend" value={summary.totalSpend} />
                <StatWidget title="Jobs" value={summary.jobCount} format="number" />
              </div>
            )}
          </Widget>
        </MotionItem>
        <MotionItem>
          <Widget title="Recent Invoices" loading={isLoading} noData={!invoices || invoices.length === 0}>
            {invoices && (
              <table className="data-table">
                <thead><tr><th>Date</th><th>Description</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
                <tbody>{invoices.map(inv => (<tr key={inv.id}><td>{formatDate(inv.date)}</td><td>{inv.description}</td><td style={{ textAlign: "right" }}>{formatMoneyFull(inv.amount)}</td></tr>))}</tbody>
              </table>
            )}
          </Widget>
        </MotionItem>
        <MotionItem>
          <Widget title="Jobs" loading={isLoading} noData={!jobs || jobs.length === 0}>
            {jobs && (
              <table className="data-table">
                <thead><tr><th>Project</th><th style={{ textAlign: "right" }}>Spend</th></tr></thead>
                <tbody>{jobs.map(j => (<tr key={j.recnum}><td>{j.jobnme}</td><td style={{ textAlign: "right" }}>{formatMoneyFull(j.spend)}</td></tr>))}</tbody>
              </table>
            )}
          </Widget>
        </MotionItem>
      </MotionList>
    </Page>
  )
}
