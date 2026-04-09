import { useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { ChevronDown } from "lucide-react"
import Page from "../../shared/components/Page"
import { PageDataProvider, useWidgetData } from "../../shared/context/PageContext"
import { PAGE_QUERIES } from "../../shared/config/pageQueries"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { StatWidget } from "../../shared/components/StatWidget/StatWidget"
import { Widget } from "../../shared/components/Widget/Widget"
import { Chart } from "../../shared/components/Chart/Chart"
import { YearSelector } from "../../shared/components/YearSelector/YearSelector"
import { PeriodSelector, periodToParams, type Period } from "../../shared/components/PeriodSelector/PeriodSelector"
import { InvoiceDetailModal } from "../../shared/components/InvoiceDetailModal/InvoiceDetailModal"
import { projectedMargin, marginClass, formatMargin } from "../../shared/components/JobDetailPanel/JobDetailPanel"
import { formatMoneyFull, formatDate } from "../../shared/utils/format"
import useLocalStorage from "../../shared/hooks/useLocalStorage"
import type { BarDataPoint } from "../../shared/components/Chart/chart.types"

const JOB_STATUS_LABEL: Record<number, string> = { 1: "Bid", 2: "Refused", 3: "Contract", 4: "Current", 5: "Complete", 6: "Closed" }
const JOB_STATUS_CLASS: Record<number, string> = { 1: "bid", 2: "refused", 3: "contract", 4: "current", 5: "complete", 6: "closed" }
const INV_STATUS_LABEL: Record<number, string> = { 1: "Open", 2: "Review", 3: "Dispute", 4: "Paid", 5: "Void" }
const INV_STATUS_CLASS: Record<number, string> = { 1: "open", 2: "review", 3: "dispute", 4: "paid", 5: "void" }

interface SubcontractorSummary { label: string; value: number }
interface SubcontractorInvoice {
  id: string; invoiceNum: string; description: string | null
  value: number; invoiceDate: unknown; status: number; amountRemaining: number
}
interface SubcontractorJob {
  recnum: number; jobName: string; status: number; spend: number
  revisedContract: number; revisedEstimate: number
}

function SubcontractorDetailContent({ year, setYear, period, setPeriod }: { year: number; setYear: (y: number) => void; period: Period; setPeriod: (p: Period) => void }) {
  const navigate = useNavigate()
  const [hideCurrentMargin] = useLocalStorage("hideCurrentMargin", false)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [jobsOpen, setJobsOpen] = useState(false)
  const [invOpen, setInvOpen] = useState(false)

  const { data, isLoading } = useWidgetData([
    "subcontractorSummary",
    "subcontractorSpendByYear",
    "subcontractorRecentInvoices",
    "subcontractorJobs",
  ])
  const summary = data?.["subcontractorSummary"] as SubcontractorSummary | null
  const spendByYear = (data?.["subcontractorSpendByYear"] as BarDataPoint[] | null) ?? []
  const recentInvoices = (data?.["subcontractorRecentInvoices"] as SubcontractorInvoice[] | null) ?? []
  const jobs = (data?.["subcontractorJobs"] as SubcontractorJob[] | null) ?? []

  const totalBilled = recentInvoices.reduce((s, i) => s + (i.value ?? 0), 0)
  const totalOutstanding = recentInvoices.reduce((s, i) => s + (i.amountRemaining ?? 0), 0)

  const totalContract = jobs.reduce((s, j) => s + (j.revisedContract ?? 0), 0)
  const nonCurrentJobs = hideCurrentMargin ? jobs.filter(j => j.status !== 4) : jobs
  const totalProfit = nonCurrentJobs.reduce((s, j) => s + ((j.revisedContract ?? 0) - (j.revisedEstimate ?? 0)), 0)
  const margins = nonCurrentJobs.map(j => projectedMargin(j.revisedContract ?? 0, j.revisedEstimate ?? 0)).filter((m): m is number => m !== null)
  const avgMargin = margins.length > 0 ? margins.reduce((s, m) => s + m, 0) / margins.length : null

  return (
    <>
      <Page
        title={summary?.label ?? "Subcontractor"}
        actions={<><PeriodSelector value={period} onChange={setPeriod} /><YearSelector value={year} onChange={setYear} /></>}
      >
        <MotionList className="widget-grid widget-grid-2">
          <MotionItem>
            <StatWidget
              title={`${year} Subcontractor Spend`}
              value={summary?.value ?? null}
              loading={isLoading}
            />
          </MotionItem>

          <MotionItem className="col-span-full">
            <Widget title="Spend History" loading={isLoading} noData={!isLoading && spendByYear.length === 0}>
              <Chart config={{ type: "line", series: [{ id: "Spend", color: "#c2410c", data: spendByYear.map((d) => ({ x: d.label, y: d.value })) }], enableArea: true }} />
            </Widget>
          </MotionItem>

          {/* ── Projects section ── */}
          <MotionItem className="col-span-full">
            <div className="det-section card">
              <div className="det-section-toggle" onClick={() => setJobsOpen((o) => !o)}>
                <div className="det-section-header">
                  <span className="widget-title headline">Projects — {year}</span>
                  <span className="det-section-action">
                    {jobsOpen ? "Hide" : "Show"}
                    <ChevronDown size={13} className={`det-section-chevron${jobsOpen ? " open" : ""}`} />
                  </span>
                </div>

                {isLoading && <div className="inv-metrics-skeleton" style={{ margin: "0 1.25rem 1rem" }} />}
                {!isLoading && jobs.length === 0 && (
                  <p className="body-text text-secondary" style={{ padding: "0 1.25rem 1rem" }}>No projects this year.</p>
                )}
                {!isLoading && jobs.length > 0 && (
                  <div className="det-section-metrics">
                    <div className="inv-metrics-row">
                    <div className="inv-metric">
                      <span className="inv-metric-value">{jobs.length}</span>
                      <span className="inv-metric-label">Projects</span>
                    </div>
                    <div className="inv-metric-divider" />
                    <div className="inv-metric">
                      <span className="inv-metric-value">{formatMoneyFull(totalContract)}</span>
                      <span className="inv-metric-label">Total Contract</span>
                    </div>
                    <div className="inv-metric-divider" />
                    <div className="inv-metric">
                      <span className={`inv-metric-value ${totalProfit >= 0 ? "jc-margin-high" : "jc-margin-critical"}`}>{formatMoneyFull(totalProfit)}</span>
                      <span className="inv-metric-label">{hideCurrentMargin ? "Total Profit (Closed)" : "Total Profit"}</span>
                    </div>
                    <div className="inv-metric-divider" />
                    <div className="inv-metric">
                      <span className={`inv-metric-value ${marginClass(avgMargin)}`}>{formatMargin(avgMargin)}</span>
                      <span className="inv-metric-label">{hideCurrentMargin ? "Avg. Margin (Closed)" : "Avg. Margin"}</span>
                    </div>
                  </div>
                  </div>
                )}
              </div>

              {!isLoading && jobs.length > 0 && (
                <div className={`det-section-body${jobsOpen ? " open" : ""}`}>
                  <div className="det-section-body-inner">
                    <hr className="det-section-separator" />
                    <table className="spend-rank-table">
                      <thead>
                        <tr>
                          <th className="spend-rank-table-num">#</th>
                          <th className="spend-rank-table-name">Job Name</th>
                          <th className="spend-rank-table-name">Status</th>
                          <th className="spend-rank-table-value">Contract</th>
                          <th className="spend-rank-table-value">Estimate</th>
                          <th className="spend-rank-table-value">Profit</th>
                          <th className="spend-rank-table-value">Margin</th>
                        </tr>
                      </thead>
                      <tbody>
                        {jobs.map((job) => {
                          const pct = projectedMargin(job.revisedContract ?? 0, job.revisedEstimate ?? 0)
                          const profit = (job.revisedContract ?? 0) - (job.revisedEstimate ?? 0)
                          return (
                            <tr
                              key={job.recnum}
                              className="spend-rank-table-row"
                              onClick={() => navigate(`/jobcosting/${job.recnum}`)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => e.key === "Enter" && navigate(`/jobcosting/${job.recnum}`)}
                            >
                              <td className="spend-rank-table-num subheadline text-secondary">{job.recnum}</td>
                              <td className="spend-rank-table-name body-text">{job.jobName}</td>
                              <td className="spend-rank-table-name">
                                <span className={`jc-status-badge jc-badge-${JOB_STATUS_CLASS[job.status] ?? "closed"}`}>
                                  {JOB_STATUS_LABEL[job.status] ?? `Status ${job.status}`}
                                </span>
                              </td>
                              <td className="spend-rank-table-value body-text">{formatMoneyFull(job.revisedContract ?? 0)}</td>
                              <td className="spend-rank-table-value body-text">{formatMoneyFull(job.revisedEstimate ?? 0)}</td>
                              <td className={`spend-rank-table-value body-text ${hideCurrentMargin && job.status === 4 ? "" : (profit >= 0 ? "jc-margin-high" : "jc-margin-critical")}`}>{hideCurrentMargin && job.status === 4 ? "—" : formatMoneyFull(profit)}</td>
                              <td className={`spend-rank-table-value body-text ${hideCurrentMargin && job.status === 4 ? "" : marginClass(pct)}`}>{hideCurrentMargin && job.status === 4 ? "—" : formatMargin(pct)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </MotionItem>

          {/* ── Invoices section ── */}
          <MotionItem className="col-span-full">
            <div className="det-section card">
              <div className="det-section-toggle" onClick={() => setInvOpen((o) => !o)}>
                <div className="det-section-header">
                  <span className="widget-title headline">Invoices — {year}</span>
                  <span className="det-section-action">
                    {invOpen ? "Hide" : "Show"}
                    <ChevronDown size={13} className={`det-section-chevron${invOpen ? " open" : ""}`} />
                  </span>
                </div>

                {isLoading && <div className="inv-metrics-skeleton" style={{ margin: "0 1.25rem 1rem" }} />}
                {!isLoading && recentInvoices.length === 0 && (
                  <p className="body-text text-secondary" style={{ padding: "0 1.25rem 1rem" }}>No invoices this year.</p>
                )}
                {!isLoading && recentInvoices.length > 0 && (
                  <div className="det-section-metrics">
                    <div className="inv-metrics-row">
                      <div className="inv-metric">
                        <span className="inv-metric-value">{recentInvoices.length}</span>
                        <span className="inv-metric-label">Invoices</span>
                      </div>
                      <div className="inv-metric-divider" />
                      <div className="inv-metric">
                        <span className="inv-metric-value">{formatMoneyFull(totalBilled)}</span>
                        <span className="inv-metric-label">Total Billed</span>
                      </div>
                      <div className="inv-metric-divider" />
                      <div className="inv-metric">
                        <span className="inv-metric-value invoice-amount-value--remaining">{formatMoneyFull(totalOutstanding)}</span>
                        <span className="inv-metric-label">Outstanding</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {!isLoading && recentInvoices.length > 0 && (
                <div className={`det-section-body${invOpen ? " open" : ""}`}>
                  <div className="det-section-body-inner">
                    <hr className="det-section-separator" />
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
                        {recentInvoices.map((inv) => (
                          <tr
                            key={inv.id}
                            className="spend-rank-table-row"
                            onClick={() => setSelectedInvoiceId(inv.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => e.key === "Enter" && setSelectedInvoiceId(inv.id)}
                          >
                            <td className="spend-rank-table-name body-text emphasized inv-th-num">{inv.invoiceNum}</td>
                            <td className="spend-rank-table-name body-text text-secondary inv-th-date">{formatDate(inv.invoiceDate)}</td>
                            <td className="spend-rank-table-name inv-th-status">
                              <span className={`invoice-status-badge invoice-status-badge--${INV_STATUS_CLASS[inv.status] ?? "open"}`}>
                                {INV_STATUS_LABEL[inv.status] ?? `Status ${inv.status}`}
                              </span>
                            </td>
                            <td className="spend-rank-table-value body-text emphasized">{formatMoneyFull(inv.value ?? 0)}</td>
                            <td className="spend-rank-table-value body-text invoice-amount-value--remaining">{formatMoneyFull(inv.amountRemaining ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </MotionItem>
        </MotionList>
      </Page>

      <InvoiceDetailModal
        invoiceId={selectedInvoiceId}
        module="subcontractors"
        onClose={() => setSelectedInvoiceId(null)}
      />
    </>
  )
}

export default function SubcontractorDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [year, setYear] = useState(new Date().getFullYear())
  const [period, setPeriod] = useState<Period>("annual")
  const numericId = id ? parseInt(id, 10) : null

  if (numericId === null || isNaN(numericId)) {
    return <Page title="Subcontractor Not Found" />
  }

  return (
    <PageDataProvider
      module="subcontractors"
      queries={PAGE_QUERIES.subcontractorDetail}
      params={{ year, id: numericId, ...periodToParams(period) }}
    >
      <SubcontractorDetailContent year={year} setYear={setYear} period={period} setPeriod={setPeriod} />
    </PageDataProvider>
  )
}
