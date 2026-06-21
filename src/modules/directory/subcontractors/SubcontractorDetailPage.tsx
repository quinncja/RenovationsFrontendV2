import { useState } from "react"
import { useParams } from "react-router-dom"
import { useJobcostNav } from "../../jobcost/useJobcostNav"
import Page from "../../../shared/components/Page"
import { PageDataProvider, useWidgetData } from "../../../shared/context/PageContext"
import { PAGE_QUERIES } from "../../../shared/config/pageQueries"
import { Widget } from "../../../shared/components/Widget/Widget"
import { StatWidget } from "../../../shared/components/StatWidget/StatWidget"
import { Chart } from "../../../shared/components/Chart/Chart"
import { YearSelector } from "../../../shared/components/YearSelector/YearSelector"
import { InvoiceDetailModal } from "../../../shared/components/InvoiceDetailModal/InvoiceDetailModal"
import { MotionList, MotionItem } from "../../../shared/components/MotionList/MotionList"
import { CollapsibleSection, Metric, MetricDivider } from "../../../shared/components/CollapsibleSection/CollapsibleSection"
import {
  projectedMargin,
  marginClass,
  formatMargin,
} from "../../../shared/components/JobDetailPanel/JobDetailPanel"
import { formatMoneyFull, formatDate } from "../../../shared/utils/format"
import useLocalStorage from "../../../shared/hooks/useLocalStorage"
import useMarginColorsEnabled from "../../../shared/hooks/useMarginColorsEnabled"
import { FileText } from "lucide-react"
import JobcostIcon from "../../../core/components/JobcostIcon"

// Shared accent colors / icons with ClientDetailPage / VendorDetailPage so
// the three directory detail pages all read the same. Mirrors the global
// nav: brand orange + JobcostIcon for Projects, FileText for Invoices.
const PROJECTS_ACCENT = "#c27c3e"
const INVOICES_ACCENT = "var(--secondary-text)" // theme-aware gray

const JOB_STATUS_LABEL: Record<number, string> = { 1: "Bid", 2: "Refused", 3: "Contract", 4: "Current", 5: "Complete", 6: "Closed" }
const JOB_STATUS_CLASS: Record<number, string> = { 1: "bid", 2: "refused", 3: "contract", 4: "current", 5: "complete", 6: "closed" }
const INV_STATUS_LABEL: Record<number, string> = { 1: "Open", 2: "Review", 3: "Dispute", 4: "Paid", 5: "Void" }
const INV_STATUS_CLASS: Record<number, string> = { 1: "open", 2: "review", 3: "dispute", 4: "paid", 5: "void" }

interface Summary {
  label: string
  value: number
}
interface YearPoint {
  label: string
  value: number
}
interface RecentInvoice {
  id: string
  jobName?: string
  invoiceNum: string
  description: string | null
  value: number
  invoiceDate: string
  status: number
  amountRemaining: number
}
interface SubJob {
  recnum: number
  jobName: string
  status: number
  spend: number
  revisedContract: number
  revisedEstimate: number
}

export default function SubcontractorDetailPage() {
  const { id } = useParams<{ id: string }>()
  const numericId = Number(id)
  // SubcontractorsPage shares this key and persists `null` for "All Time"
  // (the backend omits the year filter when null).
  const [year, setYear] = useLocalStorage<number | null>("subsYear", new Date().getFullYear())

  if (!id || isNaN(numericId)) return <Page title="Subcontractor Not Found"><p>Invalid ID.</p></Page>

  return (
    <PageDataProvider module="dashboard" queries={PAGE_QUERIES.subcontractorDetail} params={{ id: numericId, year }}>
      <SubcontractorDetail year={year} onYearChange={setYear} />
    </PageDataProvider>
  )
}

function SubcontractorDetail({ year, onYearChange }: { year: number | null; onYearChange: (y: number | null) => void }) {
  const { goToJobcost } = useJobcostNav()
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [jobsOpen, setJobsOpen] = useState(false)
  const [invOpen, setInvOpen] = useState(false)
  const [hideCurrentMargin] = useLocalStorage("hideCurrentMargin", false)
  const marginColorsOn = useMarginColorsEnabled()

  const { data, isLoading } = useWidgetData<{
    subcontractorSummary: Summary | null
    subcontractorSpendByYear: YearPoint[] | null
    subcontractorRecentInvoices: RecentInvoice[] | null
    subcontractorJobs: SubJob[] | null
  }>(["subcontractorSummary", "subcontractorSpendByYear", "subcontractorRecentInvoices", "subcontractorJobs"])

  const summary = data?.subcontractorSummary ?? null
  const spendByYear = data?.subcontractorSpendByYear ?? []
  const invoices = data?.subcontractorRecentInvoices ?? []
  const jobs = data?.subcontractorJobs ?? []

  // Exclude status=5 (Void) from rollup metrics so they match the backend's
  // summary totals (SQL applies `status < 5`). Voids still render in the table.
  const billableInvoices = invoices.filter((i) => i.status !== 5)
  const totalBilled = billableInvoices.reduce((s, i) => s + (i.value ?? 0), 0)
  const totalOutstanding = billableInvoices.reduce((s, i) => s + (i.amountRemaining ?? 0), 0)

  // Jobs rollup. For a sub, "spend" is what we paid the sub on the job;
  // contract/estimate are the project's totals. The 93E pattern shows
  // project profit & margin here (not sub-specific profit), so we mirror.
  const totalContract = jobs.reduce((s, j) => s + (j.revisedContract ?? 0), 0)
  const closedJobs = hideCurrentMargin ? jobs.filter((j) => j.status !== 4) : jobs
  const totalProfit = closedJobs.reduce(
    (s, j) => s + ((j.revisedContract ?? 0) - (j.revisedEstimate ?? 0)),
    0
  )
  const margins = closedJobs
    .map((j) => projectedMargin(j.revisedContract ?? 0, j.revisedEstimate ?? 0))
    .filter((m): m is number => m !== null)
  const avgMargin = margins.length > 0 ? margins.reduce((s, m) => s + m, 0) / margins.length : null

  return (
    <Page
      title={summary?.label ?? "Subcontractor"}
      actions={<YearSelector value={year} onChange={onYearChange} allowAllTime />}
    >
      <MotionList className="widget-grid widget-grid-2">
        <MotionItem>
          <StatWidget title={`${year ?? "All-Time"} Spend`} value={summary?.value ?? null} loading={isLoading} />
        </MotionItem>
        <MotionItem>
          <StatWidget
            title="All-Time Spend"
            value={spendByYear.reduce((s, p) => s + (p.value ?? 0), 0) || null}
            loading={isLoading}
          />
        </MotionItem>

        <MotionItem className="col-span-full">
          <Widget title="Spend History" loading={isLoading} noData={!isLoading && spendByYear.length === 0}>
            {spendByYear.length > 0 && (
              <Chart
                config={{
                  type: "line",
                  // Brand orange default (CHART_COLORS[0]) — matches the
                  // home page's AnnualRevenueWidget line color.
                  series: [
                    {
                      id: "Spend",
                      data: spendByYear.map((d) => ({ x: d.label, y: d.value })),
                    },
                  ],
                  enableArea: true,
                }}
              />
            )}
          </Widget>
        </MotionItem>

        <MotionItem className="col-span-full">
          <CollapsibleSection
            title={`Invoices — ${year ?? "All Time"}`}
            open={invOpen}
            onToggle={() => setInvOpen((o) => !o)}
            loading={isLoading}
            isEmpty={!isLoading && invoices.length === 0}
            emptyMessage="No invoices this year."
            icon={<FileText size={16} />}
            accentColor={INVOICES_ACCENT}
            metrics={
              <>
                <Metric value={billableInvoices.length} label="Invoices" />
                <MetricDivider />
                <Metric value={formatMoneyFull(totalBilled)} label="Total Billed" />
                <MetricDivider />
                <Metric
                  value={formatMoneyFull(totalOutstanding)}
                  label="Outstanding"
                  valueClass="invoice-amount-value--remaining"
                />
              </>
            }
          >
            <table className="spend-rank-table inv-table">
              <thead>
                <tr>
                  <th className="spend-rank-table-name inv-th-num">Invoice #</th>
                  <th className="spend-rank-table-name inv-th-date">Date</th>
                  <th className="spend-rank-table-name inv-th-status">Status</th>
                  <th className="spend-rank-table-value">Total</th>
                  <th className="spend-rank-table-value">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="spend-rank-table-row"
                    onClick={() => setSelectedInvoiceId(inv.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && setSelectedInvoiceId(inv.id)}
                  >
                    <td className="spend-rank-table-name body-text emphasized inv-th-num">{inv.invoiceNum}</td>
                    <td className="spend-rank-table-name body-text text-secondary inv-th-date">
                      {formatDate(inv.invoiceDate)}
                    </td>
                    <td className="spend-rank-table-name inv-th-status">
                      <span className={`invoice-status-badge invoice-status-badge--${INV_STATUS_CLASS[inv.status] ?? "open"}`}>
                        {INV_STATUS_LABEL[inv.status] ?? `Status ${inv.status}`}
                      </span>
                    </td>
                    <td className="spend-rank-table-value body-text emphasized">{formatMoneyFull(inv.value ?? 0)}</td>
                    <td className="spend-rank-table-value body-text invoice-amount-value--remaining">
                      {formatMoneyFull(inv.amountRemaining ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CollapsibleSection>
        </MotionItem>



        <MotionItem className="col-span-full">
          <CollapsibleSection
            title={`Projects — ${year ?? "All Time"}`}
            open={jobsOpen}
            onToggle={() => setJobsOpen((o) => !o)}
            loading={isLoading}
            isEmpty={!isLoading && jobs.length === 0}
            emptyMessage="No projects this year."
            icon={<JobcostIcon size={16} />}
            accentColor={PROJECTS_ACCENT}
            metrics={
              <>
                <Metric value={jobs.length} label="Projects" />
                <MetricDivider />
                <Metric value={formatMoneyFull(totalContract)} label="Total Contract" />
                <MetricDivider />
                <Metric
                  value={formatMoneyFull(totalProfit)}
                  label={hideCurrentMargin ? "Total Profit (Closed)" : "Total Profit"}
                  valueClass={totalProfit >= 0 ? "jc-margin-high" : "jc-margin-critical"}
                />
                <MetricDivider />
                <Metric
                  value={formatMargin(avgMargin)}
                  label={hideCurrentMargin ? "Avg. Margin (Closed)" : "Avg. Margin"}
                  valueClass={marginColorsOn ? marginClass(avgMargin) : undefined}
                />
              </>
            }
          >
            <table className="spend-rank-table">
              <thead>
                <tr>
                  <th className="spend-rank-table-num">#</th>
                  <th className="spend-rank-table-name">Job Name</th>
                  <th className="spend-rank-table-name">Status</th>
                  <th className="spend-rank-table-value">Contract</th>
                  <th className="spend-rank-table-value">Estimate</th>
                  <th className="spend-rank-table-value">Spend</th>
                  <th className="spend-rank-table-value">Margin</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const contract = job.revisedContract ?? 0
                  const estimate = job.revisedEstimate ?? 0
                  const pct = projectedMargin(contract, estimate)
                  const hide = hideCurrentMargin && job.status === 4
                  return (
                    <tr
                      key={job.recnum}
                      className="spend-rank-table-row"
                      onClick={() => goToJobcost(job.recnum)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && goToJobcost(job.recnum)}
                    >
                      <td className="spend-rank-table-num subheadline text-secondary">{job.recnum}</td>
                      <td className="spend-rank-table-name body-text">{job.jobName}</td>
                      <td className="spend-rank-table-name">
                        <span className={`jc-status-badge jc-badge-${JOB_STATUS_CLASS[job.status] ?? "closed"}`}>
                          {JOB_STATUS_LABEL[job.status] ?? `Status ${job.status}`}
                        </span>
                      </td>
                      <td className="spend-rank-table-value body-text">{formatMoneyFull(contract)}</td>
                      <td className="spend-rank-table-value body-text">{formatMoneyFull(estimate)}</td>
                      <td className="spend-rank-table-value body-text">{formatMoneyFull(job.spend ?? 0)}</td>
                      <td className={`spend-rank-table-value body-text ${hide || !marginColorsOn ? "" : marginClass(pct)}`}>
                        {hide ? "—" : formatMargin(pct)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CollapsibleSection>
        </MotionItem>
      </MotionList>

      <InvoiceDetailModal
        invoiceId={selectedInvoiceId}
        module="subcontractors"
        onClose={() => setSelectedInvoiceId(null)}
      />
    </Page>
  )
}
