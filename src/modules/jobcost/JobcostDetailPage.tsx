import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { ArrowLeft, ChevronDown, Download } from "lucide-react"
import { downloadXlsx } from "../../shared/utils/exportXlsx"
import { buildJobCostXlsx } from "./exportJobCostXlsx"
import { CostBreakdownTable } from "./components/CostBreakdownTable"
import { computeCostGroups, type BudgetBreakdown, type CostItem } from "./types"
import Page from "../../shared/components/Page"
import { PageDataProvider, useWidgetData } from "../../shared/context/PageContext"
import { Widget } from "../../shared/components/Widget/Widget"
import { Chart } from "../../shared/components/Chart/Chart"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { fetchPageData } from "../../shared/api/pageApi"
import { formatMoneyFull, formatDate, marginTextColor } from "../../shared/utils/format"
import useMarginColorsEnabled from "../../shared/hooks/useMarginColorsEnabled"
import { JOB_STATUS_LABELS } from "../directory/directoryShared"
import { ChangeOrderModal } from "../change-orders/components/ChangeOrderModal"
import type { ChangeOrder } from "../change-orders/types"
import type { SpendItem } from "../../shared/components/Chart/chart.types"
import { colorRamp, RAMP_SCHEMES } from "../../shared/config/chartColors"
import { InvoiceDetailModal } from "../../shared/components/InvoiceDetailModal/InvoiceDetailModal"

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const INV_STATUS_LABEL: Record<number, string> = { 1: "Open", 2: "Review", 3: "Dispute", 4: "Paid", 5: "Void" }
const INV_STATUS_CLASS: Record<number, string> = { 1: "open", 2: "review", 3: "dispute", 4: "paid", 5: "void" }

// ─── Backend shapes ──────────────────────────────────────────────────
interface Phase { recnum: string; name: string; status: number; pmName: string | null }
interface Project {
  recnum: string
  name: string
  status: number
  originalContract: number
  changeOrderAmount: number
  totalContract: number
  totalBudget: number
  totalCost: number
  totalIncome: number
  totalMargin: number | null
  phases: Phase[]
}
interface MonthlyCost { year: number; month: number; spending: number }
interface JobInvoice {
  id: string
  invoiceNum: string
  description: string | null
  total: number
  invoiceDate: string
  status: number
  amountPaid: number
  amountRemaining: number
}

export default function JobcostDetailPage() {
  const { recnum } = useParams<{ recnum: string }>()
  const numericId = Number(recnum)
  if (!recnum || isNaN(numericId)) {
    return <Page title="Job Not Found"><p>Invalid job ID.</p></Page>
  }

  return (
    <PageDataProvider
      module="jobcostDetail"
      queries={["getPhases", "getBudgetByRecnum", "getAllCostItems", "getJobMonthlySpend", "getJobInvoices"]}
      params={{ recnum: numericId }}
    >
      <JobcostDetail recnum={recnum} />
    </PageDataProvider>
  )
}

function JobcostDetail({ recnum }: { recnum: string }) {
  const navigate = useNavigate()
  const marginColorsOn = useMarginColorsEnabled()
  const { data, isLoading } = useWidgetData<{
    getPhases: Project[] | null
    getBudgetByRecnum: BudgetBreakdown | null
    getAllCostItems: CostItem[] | null
    getJobMonthlySpend: MonthlyCost[] | null
    getJobInvoices: JobInvoice[] | null
  }>(["getPhases", "getBudgetByRecnum", "getAllCostItems", "getJobMonthlySpend", "getJobInvoices"])

  const project = data?.getPhases?.[0] ?? null
  const budget = data?.getBudgetByRecnum ?? null
  const costItems = Array.isArray(data?.getAllCostItems) ? data.getAllCostItems : []
  const monthlyCosts = Array.isArray(data?.getJobMonthlySpend) ? data.getJobMonthlySpend : []
  const invoices = Array.isArray(data?.getJobInvoices) ? data.getJobInvoices : []

  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([])
  const [selectedCO, setSelectedCO] = useState<ChangeOrder | null>(null)
  const [changeOrdersOpen, setChangeOrdersOpen] = useState(false)
  const [invoicesOpen, setInvoicesOpen] = useState(false)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)

  useEffect(() => {
    fetchPageData({ module: "changeOrders", queries: [], params: { jobnum: recnum } })
      .then(result => { if (Array.isArray(result)) setChangeOrders(result as ChangeOrder[]) })
      .catch(() => setChangeOrders([]))
  }, [recnum])

  // Cost-type groups + totals (shared with the Cost Breakdown table and the
  // Job Costing list's inline view).
  const { groups, totalBudget, totalActual } = computeCostGroups(budget, costItems)

  // Spending by cost type (pie)
  const typeSpend: SpendItem[] = groups
    .filter(g => g.actual > 0)
    .map(g => ({ id: g.key, label: g.key, value: g.actual }))

  // Top vendors / sources by total cost (pie)
  const vendorSpend: SpendItem[] = (() => {
    const totals = new Map<string, number>()
    for (const c of costItems) {
      const amt = (c.committedAmount || 0) + (c.postedAmount || 0)
      if (amt > 0) totals.set(c.id, (totals.get(c.id) ?? 0) + amt)
    }
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ id: label, label, value }))
  })()

  // Monthly spend line
  const monthlyLine = monthlyCosts.map(m => ({
    x: `${MONTH_ABBR[m.month - 1] ?? m.month} '${String(m.year).slice(2)}`,
    y: m.spending,
  }))
  // Thin x-axis labels when there are too many months.
  const MAX_X_LABELS = 12
  const monthlyTickValues = monthlyLine.length > MAX_X_LABELS
    ? monthlyLine
        .filter((_, i) => i % Math.ceil(monthlyLine.length / MAX_X_LABELS) === 0)
        .map(d => d.x)
    : undefined

  // Invoice totals (exclude void)
  const activeInvoices = invoices.filter(i => i.status !== 5)
  const totalInvoiced = activeInvoices.reduce((s, i) => s + (i.total || 0), 0)
  const totalPaid = activeInvoices.reduce((s, i) => s + (i.amountPaid || 0), 0)
  const totalOutstanding = activeInvoices.reduce((s, i) => s + (i.amountRemaining || 0), 0)


  const pm = project?.phases?.find(p => p.pmName?.trim())?.pmName?.trim()
  const margin = project && project.totalContract > 0
    ? ((project.totalContract - project.totalCost) / project.totalContract) * 100
    : project?.totalMargin ?? null
  const originalContract = project?.originalContract ?? 0
  const revisedContract = project?.totalContract ?? 0
  const invoicePct = revisedContract > 0 ? (totalInvoiced / revisedContract) * 100 : 0
  const coTotalBudget = changeOrders.reduce((s, co) => s + (Number(co.budget) || 0), 0)
  const coTotalContract = changeOrders.reduce((s, co) => s + (Number(co.total) || 0), 0)
  const coPctOfContract = originalContract > 0 ? (coTotalContract / originalContract) * 100 : 0

  const subtitle = project ? (
    <span className="jcd-subtitle">
      {project.status != null && (
        <span className={`status-badge status-${project.status}`}>
          {JOB_STATUS_LABELS[project.status] ?? project.status}
        </span>
      )}
      <span>{[`#${recnum}`, pm].filter(Boolean).join(" · ")}</span>
    </span>
  ) : undefined

  function handleExport() {
    if (!project) return
    const invoiceSummary = activeInvoices.length > 0
      ? { totalInvoiced, totalPaid, totalOutstanding, invoicedPct: invoicePct }
      : null
    const { rows: xlsxRows, transactionHeaderRow, transactionCols } = buildJobCostXlsx(
      {
        name: project.name,
        recnum: recnum,
        status: project.status,
        pmName: pm ?? null,
        originalContract: project.originalContract,
        changeOrderAmount: project.changeOrderAmount,
        totalContract: project.totalContract,
        totalBudget,
        totalCost: project.totalCost,
        totalIncome: project.totalIncome,
      },
      groups.map(g => ({ key: g.key, budget: g.budget, actual: g.actual, variance: g.variance, variancePct: g.variancePct })),
      costItems.map(c => ({ costType: c.costType, id: c.id, dscrpt: c.dscrpt, committedAmount: c.committedAmount, postedAmount: c.postedAmount })),
      changeOrders,
      invoiceSummary,
      monthlyCosts,
    )
    const date = new Date().toISOString().slice(0, 10)
    const safeName = (project.name || `Job_${recnum}`).replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "")
    downloadXlsx(xlsxRows, `${safeName}_Cost_Report_${date}.xlsx`, project.name || "Report", {
      autoFilterRow: transactionHeaderRow,
      autoFilterCols: transactionCols,
    })
  }

  return (
    <Page
      title={project?.name ?? `Job #${recnum}`}
      subtitle={subtitle}
      actions={
        <>
          <button className="jc-export-btn" onClick={() => navigate("/jobcost")} title="Back to Job Costing">
            <ArrowLeft size={14} /> Job Costing
          </button>
          <button className="jc-export-btn" onClick={handleExport} disabled={isLoading || !project}>
            <Download size={14} />
            Export Report
          </button>
        </>
      }
    >
      <MotionList className="widget-grid widget-grid-2">

        {/* ── Project summary metrics ── */}
        <MotionItem className="col-span-full">
          <div className="card jcd-metrics-card">
            {isLoading ? (
              <div className="jcd-metrics-skeleton">
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className="jcd-metrics-skeleton-cell"><div className="jcd-skel-value" /><div className="jcd-skel-label" /></div>
                ))}
              </div>
            ) : project && (
              <div className="inv-metrics-row jcd-metrics-row">
                <div className="inv-metric">
                  <span className="inv-metric-value">{formatMoneyFull(project.totalContract)}</span>
                  <span className="inv-metric-label">Revised Contract</span>
                </div>
                <div className="inv-metric-divider" />
                <div className="inv-metric">
                  <span className="inv-metric-value">{formatMoneyFull(totalBudget)}</span>
                  <span className="inv-metric-label">Revised Budget</span>
                </div>
                <div className="inv-metric-divider" />
                <div className="inv-metric">
                  <span className="inv-metric-value">{formatMoneyFull(project.totalCost)}</span>
                  <span className="inv-metric-label">Spending to Date</span>
                </div>
                <div className="inv-metric-divider" />
                <div className="inv-metric">
                  <span className="inv-metric-value" style={!marginColorsOn || margin == null ? undefined : { color: marginTextColor(margin) }}>
                    {margin == null ? "—" : `${margin.toFixed(1)}%`}
                  </span>
                  <span className="inv-metric-label">Projected Margin</span>
                </div>
              </div>
            )}
          </div>
        </MotionItem>

        {/* ── Change Orders ── */}
        {!isLoading && changeOrders.length > 0 && (
          <MotionItem className="col-span-full">
            <div className="det-section card">
              <div className="det-section-toggle" onClick={() => setChangeOrdersOpen(o => !o)}>
                <div className="det-section-header">
                  <span className="widget-title headline">Change Orders</span>
                  <span className="det-section-action">
                    {changeOrdersOpen ? "Hide" : "Show"}
                    <ChevronDown size={13} className={`det-section-chevron${changeOrdersOpen ? " open" : ""}`} />
                  </span>
                </div>
                <div className="inv-metrics-row jcd-inv-metrics">
                  <div className="inv-metric">
                    <span className={`inv-metric-value ${coTotalContract >= 0 ? "jc-margin-high" : "jc-margin-critical"}`}>
                      {coTotalContract > 0 ? "+" : ""}{formatMoneyFull(coTotalContract)}
                    </span>
                    <span className="inv-metric-label">Total Change Orders</span>
                  </div>
                  <div className="inv-metric-divider" />
                  <div className="inv-metric">
                    <span className="inv-metric-value">{coTotalBudget > 0 ? "+" : ""}{formatMoneyFull(coTotalBudget)}</span>
                    <span className="inv-metric-label">Total Budget Increase</span>
                  </div>
                  <div className="inv-metric-divider" />
                  <div className="inv-metric">
                    <span className="inv-metric-value">{changeOrders.length}</span>
                    <span className="inv-metric-label">Count</span>
                  </div>
                  <div className="inv-metric-divider" />
                  <div className="inv-metric">
                    <span className="inv-metric-value">{coPctOfContract.toFixed(1)}%</span>
                    <span className="inv-metric-label">of Original Contract</span>
                  </div>
                </div>
              </div>
              <div className={`det-section-body${changeOrdersOpen ? " open" : ""}`}>
                <div className="det-section-body-inner">
                  <table className="spend-rank-table inv-table">
                    <thead>
                      <tr>
                        <th className="spend-rank-table-name jcd-co-th-num">CO #</th>
                        <th className="spend-rank-table-name">Description</th>
                        <th className="spend-rank-table-value">Budget</th>
                        <th className="spend-rank-table-value">Contract</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changeOrders.map(co => {
                        const budget = co.budget == null ? null : Number(co.budget)
                        const contract = Number(co.total) || 0
                        return (
                          <tr
                            key={co.recnum}
                            className="spend-rank-table-row"
                            onClick={() => setSelectedCO(co)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={e => e.key === "Enter" && setSelectedCO(co)}
                          >
                            <td className="spend-rank-table-name body-text emphasized jcd-co-th-num">#{co.chgnum ?? co.recnum}</td>
                            <td className="spend-rank-table-name body-text">{co.name}</td>
                            <td className="spend-rank-table-value body-text emphasized">
                              {budget == null ? "-" : formatMoneyFull(budget)}
                            </td>
                            <td className={`spend-rank-table-value body-text emphasized ${contract >= 0 ? "jc-margin-high" : "jc-margin-critical"}`}>
                              {contract > 0 ? "+" : ""}{formatMoneyFull(contract)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </MotionItem>
        )}

        {/* ── Invoiced vs Contract ── */}
        <MotionItem className="col-span-full">
          <div className="det-section card">
            <div className="det-section-toggle" onClick={isLoading ? undefined : () => setInvoicesOpen(o => !o)}>
              <div className="det-section-header">
                <span className="widget-title headline">Invoiced vs Contract</span>
                {!isLoading && (
                  <span className="det-section-action">
                    {invoicesOpen ? "Hide" : "Show"}
                    <ChevronDown size={13} className={`det-section-chevron${invoicesOpen ? " open" : ""}`} />
                  </span>
                )}
              </div>

              {isLoading ? (
                <div className="jcd-inv-skeleton">
                  <div className="jcd-skel-bar" />
                  <div className="jcd-inv-skeleton-metrics">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="jcd-metrics-skeleton-cell"><div className="jcd-skel-value" /><div className="jcd-skel-label" /></div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div className="jcd-inv-hero">
                    <div className="jcd-inv-hero-left">
                      <span className="jcd-inv-pct">{invoicePct.toFixed(1)}%</span>
                      <span className="jcd-inv-pct-label">of contract invoiced</span>
                    </div>
                    <div className="jcd-inv-hero-right">
                      <span className="jcd-inv-amounts subheadline">
                        {formatMoneyFull(totalInvoiced)} <span className="text-secondary">of</span> {formatMoneyFull(revisedContract)}
                      </span>
                      <div className="jc-invoice-progress-bar">
                        <div className="jc-invoice-progress-fill" style={{ width: `${Math.min(invoicePct, 100)}%` }} />
                      </div>
                    </div>
                  </div>
                  <div className="inv-metrics-row jcd-inv-metrics">
                    <div className="inv-metric">
                      <span className="inv-metric-value">{formatMoneyFull(totalInvoiced)}</span>
                      <span className="inv-metric-label">Total Invoiced</span>
                    </div>
                    <div className="inv-metric-divider" />
                    <div className="inv-metric">
                      <span className="inv-metric-value">{formatMoneyFull(totalPaid)}</span>
                      <span className="inv-metric-label">Amount Paid</span>
                    </div>
                    <div className="inv-metric-divider" />
                    <div className="inv-metric">
                      <span className="inv-metric-value invoice-amount-value--remaining">{formatMoneyFull(totalOutstanding)}</span>
                      <span className="inv-metric-label">Outstanding</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {!isLoading && invoices.length > 0 && (
              <div className={`det-section-body${invoicesOpen ? " open" : ""}`}>
                <div className="det-section-body-inner">
                  <table className="spend-rank-table inv-table">
                    <thead>
                      <tr>
                        <th className="spend-rank-table-name inv-th-num">Invoice #</th>
                        <th className="spend-rank-table-name inv-th-date">Date</th>
                        <th className="spend-rank-table-name inv-th-status">Status</th>
                        <th className="spend-rank-table-value">Total</th>
                        <th className="spend-rank-table-value">Paid</th>
                        <th className="spend-rank-table-value">Remaining</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map(inv => (
                        <tr
                          key={inv.id}
                          className="spend-rank-table-row"
                          onClick={() => setSelectedInvoiceId(inv.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={e => e.key === "Enter" && setSelectedInvoiceId(inv.id)}
                        >
                          <td className="spend-rank-table-name body-text emphasized inv-th-num">{inv.invoiceNum}</td>
                          <td className="spend-rank-table-name body-text text-secondary inv-th-date">{formatDate(inv.invoiceDate)}</td>
                          <td className="spend-rank-table-name inv-th-status">
                            <span className={`invoice-status-badge invoice-status-badge--${INV_STATUS_CLASS[inv.status] ?? "open"}`}>
                              {INV_STATUS_LABEL[inv.status] ?? `Status ${inv.status}`}
                            </span>
                          </td>
                          <td className="spend-rank-table-value body-text">{formatMoneyFull(inv.total)}</td>
                          <td className="spend-rank-table-value body-text">{formatMoneyFull(inv.amountPaid)}</td>
                          <td className="spend-rank-table-value body-text invoice-amount-value--remaining">{formatMoneyFull(inv.amountRemaining)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </MotionItem>

        {/* ── Monthly Spend ── */}
        <MotionItem className="col-span-full">
          <Widget
            title="Monthly Spend"
            loading={isLoading}
            noData={!isLoading && monthlyLine.length === 0}
            className="jcd-chart-widget"
          >
            <Chart config={{
              type: "line",
              // Series omits `color` so it falls through to CHART_COLORS[0]
              // (brand orange) — same line color the home page revenue +
              // directory history charts use.
              series: [{ id: "Spend", data: monthlyLine }],
              enableArea: true,
              disableGrowthTooltip: true,
              axisBottomTickValues: monthlyTickValues,
            }} />
          </Widget>
        </MotionItem>

        {/* ── Spending by Type + Top Vendors ── */}
        <MotionItem>
          <Widget title="Spending by Type" loading={isLoading} noData={!isLoading && typeSpend.length === 0}>
            <Chart config={{
              type: "pie-with-list",
              items: typeSpend,
              centerLabel: "TOTAL SPEND",
              centerTotal: totalActual,
              showPercent: true,
              chartSize: "md",
            }} />
          </Widget>
        </MotionItem>
        <MotionItem>
          <Widget title="Top Vendors" loading={isLoading} noData={!isLoading && vendorSpend.length === 0}>
            <Chart config={{
              type: "pie-with-list",
              items: vendorSpend,
              centerLabel: "VENDOR SPEND",
              showPercent: true,
              chartSize: "md",
              colors: colorRamp(RAMP_SCHEMES.orange.hue, RAMP_SCHEMES.orange.drift, 5),
            }} />
          </Widget>
        </MotionItem>

        {/* ── Cost Breakdown (groups → line items) ── */}
        <MotionItem className="col-span-full">
          <Widget title="Cost Breakdown" loading={isLoading} noData={!isLoading && !budget} className="jcd-cost-widget">
            <CostBreakdownTable budget={budget} costItems={costItems} />
          </Widget>
        </MotionItem>
      </MotionList>

      <ChangeOrderModal order={selectedCO} onClose={() => setSelectedCO(null)} />
      <InvoiceDetailModal
        invoiceId={selectedInvoiceId}
        module="clients"
        onClose={() => setSelectedInvoiceId(null)}
      />
    </Page>
  )
}
