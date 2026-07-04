import { useState, useEffect, useRef } from "react"
import { useParams, useNavigate, useLocation } from "react-router-dom"
import { ArrowLeft, ChevronDown, Download } from "lucide-react"
import { downloadXlsx } from "../../shared/utils/exportXlsx"
import { buildJobCostXlsx } from "./exportJobCostXlsx"
import { CostBreakdownTable } from "./components/CostBreakdownTable"
import { computeCostGroups, type BudgetBreakdown, type CostItem } from "./types"
import Page from "../../shared/components/Page"
import { PageDataProvider, useWidgetData } from "../../shared/context/PageContext"
import { Widget } from "../../shared/components/Widget/Widget"
import { Chart } from "../../shared/components/Chart/Chart"
import { ChartLegend } from "../../shared/components/Chart/ChartLegend"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { fetchPageData } from "../../shared/api/pageApi"
import { formatMoneyFull, formatDate, marginTextColor } from "../../shared/utils/format"
import useIsMobile from "../../shared/hooks/useIsMobile"
import useMarginColorsEnabled from "../../shared/hooks/useMarginColorsEnabled"
import useHashedRelationColors from "../../shared/hooks/useHashedRelationColors"
import { JOB_STATUS_LABELS } from "../directory/directoryShared"
import { ChangeOrderModal } from "../change-orders/components/ChangeOrderModal"
import type { ChangeOrder } from "../change-orders/types"
import type { SpendItem, LineMarker } from "../../shared/components/Chart/chart.types"
import { computeWeeklySpend, computeCostVsBilled, thinLabels, type DailySpend } from "./weeklySpend"
import { colorRamp, hashColor, RAMP_SCHEMES } from "../../shared/config/chartColors"
import { InvoiceDetailModal } from "../../shared/components/InvoiceDetailModal/InvoiceDetailModal"
import { JOBCOST_BACK_FALLBACK, type JobcostBackState } from "./useJobcostNav"
import { trackProjectView } from "../../shared/analytics/analytics"

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
// One job's billing position: how much has been billed vs. how much *should* be
// billed (earned via cost-to-cost % of completion). `variance` (expected −
// billed) is positive when under-billed, negative when over-billed. Mirrors the
// dashboard Progress Billings row so the two reconcile.
interface ProgressBilling {
  contract: number
  budget: number
  cost: number
  billed: number
  expected: number
  billedPct: number // billed ÷ contract (0–1)
  expectedPct: number // earned ÷ contract (0–1) = % complete
  variance: number
  hasBudget: boolean
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
      queries={["getPhases", "getBudgetByRecnum", "getAllCostItems", "getJobMonthlySpend", "getJobDailySpend", "getJobInvoices", "getProgressBilling"]}
      params={{ recnum: numericId }}
    >
      <JobcostDetail recnum={recnum} />
    </PageDataProvider>
  )
}

function JobcostDetail({ recnum }: { recnum: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const back = (location.state as JobcostBackState | null) ?? null
  const backTo = back?.backTo ?? JOBCOST_BACK_FALLBACK.to
  const backLabel = back?.backLabel ?? JOBCOST_BACK_FALLBACK.label
  const marginColorsOn = useMarginColorsEnabled()
  const hashedRelationColors = useHashedRelationColors()
  // Mobile: a slim header — just the job name with status + PM beneath
  // (mirroring the Job Costing list rows). The job number, back button and
  // export are desktop-only; the bottom nav covers navigation on mobile.
  const isMobile = useIsMobile()
  const { data, isLoading } = useWidgetData<{
    getPhases: Project[] | null
    getBudgetByRecnum: BudgetBreakdown | null
    getAllCostItems: CostItem[] | null
    getJobMonthlySpend: MonthlyCost[] | null
    getJobDailySpend: DailySpend[] | null
    getJobInvoices: JobInvoice[] | null
    getProgressBilling: ProgressBilling | null
  }>(["getPhases", "getBudgetByRecnum", "getAllCostItems", "getJobMonthlySpend", "getJobDailySpend", "getJobInvoices", "getProgressBilling"])

  const project = data?.getPhases?.[0] ?? null

  // Record a project_view once the job's name has resolved — one event per job
  // opened (the ref guards against re-fires on unrelated re-renders / data
  // refreshes while staying on the same job).
  const trackedRecnum = useRef<string | null>(null)
  useEffect(() => {
    if (!project?.name) return
    if (trackedRecnum.current === recnum) return
    trackedRecnum.current = recnum
    trackProjectView(recnum, project.name)
  }, [recnum, project?.name])
  const budget = data?.getBudgetByRecnum ?? null
  const costItems = Array.isArray(data?.getAllCostItems) ? data.getAllCostItems : []
  const monthlyCosts = Array.isArray(data?.getJobMonthlySpend) ? data.getJobMonthlySpend : []
  const dailySpend = Array.isArray(data?.getJobDailySpend) ? data.getJobDailySpend : []
  const invoices = Array.isArray(data?.getJobInvoices) ? data.getJobInvoices : []
  const pb = data?.getProgressBilling ?? null

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

  // Weekly buckets — jobs span ~a month, so weeks are the readable resolution.
  // Phones fit fewer x labels; thin from the end so the most recent week always
  // keeps its label.
  const weeks = computeWeeklySpend(dailySpend)
  const maxXLabels = isMobile ? 5 : 8
  const spentToDate = weeks.length ? weeks[weeks.length - 1].cumulative : 0
  const budgetLeft = totalBudget - spentToDate

  // Invoice totals (exclude void)
  const activeInvoices = invoices.filter(i => i.status !== 5)
  const totalInvoiced = activeInvoices.reduce((s, i) => s + (i.total || 0), 0)
  const totalPaid = activeInvoices.reduce((s, i) => s + (i.amountPaid || 0), 0)
  const totalOutstanding = activeInvoices.reduce((s, i) => s + (i.amountRemaining || 0), 0)

  // ── Cost & Billing Trajectory ──
  // One chart that answers all three "how is this job tracking" questions at
  // once: cumulative cost (are we burning fast?), the budget ceiling (will we
  // blow the budget?), and cumulative billed (are we collecting cash as fast as
  // we spend it?). Cost + billed share ONE weekly axis spanning the union of
  // both streams (computeCostVsBilled), so a job that bills before/after its
  // costs still lines up. `Cost` is series[0] → brand-orange; `Billed` next.
  const costVsBilled = computeCostVsBilled(
    dailySpend,
    activeInvoices.map(i => ({ day: i.invoiceDate, spending: i.total })),
  )
  // Explicit colors (matching CHART_COLORS[0]/[1]) so the slice tooltip tints
  // each value to its line — Cost orange, Billed green.
  const trajSeries = [
    { id: "Cost", color: "#c27c3e", data: costVsBilled.map(p => ({ x: p.label, y: p.cost })) },
    { id: "Billed", color: "#22c55e", data: costVsBilled.map(p => ({ x: p.label, y: p.billed })) },
  ]
  const trajTickValues = thinLabels(costVsBilled.map(p => p.label), maxXLabels)
  const cvbLast = costVsBilled[costVsBilled.length - 1] ?? null
  const maxBilled = cvbLast?.billed ?? 0
  // The budget ceiling ALWAYS renders, so the axis always extends to it (plus a
  // little headroom). Early in a job the budget can sit well above the plotted
  // cost + billed lines — that empty space above the data is itself the signal
  // ("lots of budget left"). The caption carries the exact figure.
  const trajDataMax = Math.max(spentToDate, maxBilled)
  const trajMaxValue = totalBudget > 0
    ? Math.max(trajDataMax, totalBudget) * 1.04
    : trajDataMax > 0 ? trajDataMax * 1.1 : "auto"
  // Horizontal dashed budget ceiling — the cost line crossing it = over budget.
  const trajMarkers: LineMarker[] = totalBudget > 0
    ? [{
        axis: "y",
        value: totalBudget,
        legend: "Budget",
        legendPosition: "top-right",
        lineStyle: { stroke: "var(--secondary-text)", strokeWidth: 1, strokeDasharray: "4 4", strokeOpacity: 0.7 },
        textStyle: { fill: "var(--secondary-text)", fontSize: 11, fontWeight: 600 },
        // Render the label as a pill sitting atop the line with the card's
        // surface color behind it, so it stays legible over the dashed line.
        labelBackground: "var(--card-color)",
      }]
    : []
  // Caption: budget burn % (+ $ left/over).
  const trajDesc = totalBudget > 0
    ? `${Math.round((spentToDate / totalBudget) * 100)}% of budget · ${
        budgetLeft >= 0 ? `${formatMoneyFull(budgetLeft)} left` : `${formatMoneyFull(-budgetLeft)} over`
      }`
    : undefined

  // ── Budget vs Actual by cost type ──
  // Where, specifically, is the money going off-plan? Grouped bars per cost
  // type (Material / Labor / Sub / WTPM): revised budget beside actual spend.
  // Reuses the same `groups` rollup as the Cost Breakdown table, so the two
  // reconcile exactly. Drop types with neither budget nor spend (e.g. WTPM).
  const budgetVsActual = groups
    .filter(g => g.budget > 0 || g.actual > 0)
    .map(g => ({ type: g.key, Budget: g.budget, Actual: g.actual }))
  // One-line caption — mirrors the trajectory's description so both widget
  // headers are the same height (and their plots/axes/legends line up). Reports
  // how many cost types have run past their budget.
  const overCount = budgetVsActual.filter(g => g.Actual > g.Budget).length
  const bvaDesc = budgetVsActual.length === 0
    ? undefined
    : overCount === 0
      ? "All cost types within budget"
      : `${overCount} of ${budgetVsActual.length} types over budget`


  const pm = project?.phases?.find(p => p.pmName?.trim())?.pmName?.trim()
  const margin = project && project.totalContract > 0
    ? ((project.totalContract - project.totalCost) / project.totalContract) * 100
    : project?.totalMargin ?? null
  // Budget Variance = revised budget − spend to date. POSITIVE = under budget
  // (good, green); NEGATIVE = over budget (bad, red). Colored by its own sign —
  // NOT by `margin` (a different metric on a percentage scale), which is what
  // made an over-budget job read green.
  const budgetVariance = project ? totalBudget - project.totalCost : null
  const budgetVarianceColor =
    budgetVariance == null || budgetVariance === 0
      ? undefined
      : budgetVariance > 0
        ? "#22c55e" // under budget — green (matches marginTextColor)
        : "#ef4444" // over budget — red (matches marginTextColor)
  const originalContract = project?.originalContract ?? 0
  const revisedContract = project?.totalContract ?? 0
  const invoicePct = revisedContract > 0 ? (totalInvoiced / revisedContract) * 100 : 0
  const coTotalBudget = changeOrders.reduce((s, co) => s + (Number(co.budget) || 0), 0)
  const coTotalContract = changeOrders.reduce((s, co) => s + (Number(co.total) || 0), 0)
  const coPctOfContract = originalContract > 0 ? (coTotalContract / originalContract) * 100 : 0

  const subtitleText = isMobile ? pm : [pm, `#${recnum}`].filter(Boolean).join(" · ")
  const subtitle = project ? (
    <span className="jcd-subtitle">
      {project.status != null && (
        <span className={`status-badge status-${project.status}`}>
          {JOB_STATUS_LABELS[project.status] ?? project.status}
        </span>
      )}
      {subtitleText && <span>{subtitleText}</span>}
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
        isMobile ? undefined : (
          <>
            <button className="jc-export-btn" onClick={() => navigate(backTo)} title={`Back to ${backLabel}`}>
              <ArrowLeft size={14} /> {backLabel}
            </button>
            <button className="jc-export-btn" onClick={handleExport} disabled={isLoading || !project}>
              <Download size={14} />
              Export Report
            </button>
          </>
        )
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
                  <span className="inv-metric-value" style={!marginColorsOn || budgetVarianceColor == null ? undefined : { color: budgetVarianceColor }}>
                    {formatMoneyFull(totalBudget - project.totalCost)}
                  </span>
                  <span className="inv-metric-label">Budget Variance</span>
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
          <div className="det-section card jcd-billing-card">
            <div
              className={!isLoading && invoices.length > 0 ? "det-section-toggle" : undefined}
              onClick={!isLoading && invoices.length > 0 ? () => setInvoicesOpen(o => !o) : undefined}
            >
              <div className="det-section-header">
                <span className="widget-title headline">Billing Position</span>
                {!isLoading && invoices.length > 0 && (
                  <span className="det-section-action">
                    {invoicesOpen ? "Hide Invoices" : "Show Invoices"}
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
                  {pb && pb.contract > 0 ? (
                    (() => {
                      const dir = pb.variance > 0 ? "under" : pb.variance < 0 ? "over" : "even"
                      const label = dir === "under" ? "Under-billed" : dir === "over" ? "Over-billed" : "On track"
                      const billedW = Math.min(pb.billedPct * 100, 100)
                      const earnedW = Math.min(pb.expectedPct * 100, 100)
                      return (
                        <div className="jcd-billing-pos">
                          <div className="jcd-bp-hero">
                            <div className="jcd-bp-stat">
                              <span className="jcd-bp-stat-label">Billed</span>
                              <span className="jcd-bp-stat-value">{formatMoneyFull(pb.billed)}</span>
                              <span className="jcd-bp-stat-sub">{Math.round(pb.billedPct * 100)}% of contract</span>
                            </div>
                            <div className="jcd-bp-stat-divider" />
                            <div className="jcd-bp-stat">
                              <span className="jcd-bp-stat-label">Earned</span>
                              <span className="jcd-bp-stat-value">{formatMoneyFull(pb.expected)}</span>
                              <span className="jcd-bp-stat-sub">
                                {pb.hasBudget ? `${Math.round(pb.expectedPct * 100)}% complete` : "no budget — est."}
                              </span>
                            </div>
                          </div>

                          {/* One combined meter: billed fill against the contract track,
                              with a marker at the earned (% complete) position. */}
                          <div className="jcd-bp-meter-wrap">
                            <div
                              className="jcd-bp-meter"
                              tabIndex={0}
                              onMouseMove={e => {
                                const meter = e.currentTarget
                                const rect = meter.getBoundingClientRect()
                                const x = e.clientX - rect.left
                                const tip = meter.querySelector<HTMLElement>(".jcd-bp-meter-tip")
                                const half = (tip?.offsetWidth ?? 0) / 2
                                const clamped = Math.max(half, Math.min(x, rect.width - half))
                                meter.style.setProperty("--bp-tip-x", `${clamped}px`)
                                meter.style.setProperty("--bp-arrow-x", `${x - clamped}px`)
                              }}
                            >
                              <div className="jcd-bp-meter-fill" style={{ width: `${billedW}%` }} />
                              <div className="jcd-bp-meter-marker" style={{ left: `${earnedW}%` }} />
                              <div className="jcd-bp-meter-tip" role="tooltip">
                                <div className="jcd-bp-tip-row"><span>Billed</span><strong>{formatMoneyFull(pb.billed)}</strong></div>
                                <div className="jcd-bp-tip-row"><span>Earned</span><strong>{formatMoneyFull(pb.expected)}</strong></div>
                                <div className="jcd-bp-tip-row"><span>Contract</span><strong>{formatMoneyFull(pb.contract)}</strong></div>
                              </div>
                            </div>
                            <div className="jcd-bp-earned-label" style={{ left: `${earnedW}%` }}>Earned</div>
                          </div>

                          <div className={`jcd-bp-variance jcd-bp-variance--${dir}`}>
                            <span className={`pb-dir-pill pb-dir-pill--${dir}`}>{label}</span>
                            <span className="jcd-bp-variance-amt">{formatMoneyFull(Math.abs(pb.variance))}</span>
                            <span className="jcd-bp-variance-sub">
                              {dir === "under"
                                ? "earned but not yet billed"
                                : dir === "over"
                                ? "billed ahead of work earned"
                                : "billing matches work earned"}
                            </span>
                          </div>
                        </div>
                      )
                    })()
                  ) : (
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
                  )}
                </>
              )}
            </div>
          </div>

            {!isLoading && invoices.length > 0 && (
              <div className={`det-section-body jcd-invoice-drop${invoicesOpen ? " open" : ""}`}>
                <div className="det-section-body-inner">
                  <div className="card jcd-invoice-card">
                  <div className="jcd-inv-summary">
                    <div className="jcd-inv-summary-card">
                      <div className="jcd-inv-summary-card-head">
                        <span className="jcd-inv-summary-label">Amount Paid</span>
                        <span className="invoice-status-badge invoice-status-badge--paid">Paid</span>
                      </div>
                      <span className="jcd-inv-summary-value">{formatMoneyFull(totalPaid)}</span>
                    </div>
                    <div className="jcd-inv-summary-card">
                      <div className="jcd-inv-summary-card-head">
                        <span className="jcd-inv-summary-label">Outstanding</span>
                        <span className="invoice-status-badge invoice-status-badge--open">Open</span>
                      </div>
                      <span className="jcd-inv-summary-value">{formatMoneyFull(totalOutstanding)}</span>
                    </div>
                  </div>
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
              </div>
            )}
        </MotionItem>

        {/* ── Cost & Billing Trajectory + Budget vs Actual by Type ── */}
        <MotionItem>
          <Widget
            title="Cost & Billing Trajectory"
            description={trajDesc}
            loading={isLoading}
            noData={!isLoading && costVsBilled.length === 0}
            className="jcd-chart-widget"
            // Custom HTML legend in the header's top-right corner (colors match
            // the series: Cost = CHART_COLORS[0], Billed = CHART_COLORS[1]).
            actions={
              <ChartLegend items={[
                { label: "Cost", color: "#c27c3e" },
                { label: "Billed", color: "#22c55e" },
              ]} />
            }
          >
            <Chart config={{
              type: "line",
              // `Cost` omits `color` so it falls through to CHART_COLORS[0]
              // (brand orange) — same line the home page revenue + directory
              // history charts use; `Billed` takes the next palette color.
              series: trajSeries,
              // Two cumulative lines plus a budget marker — no area fill (it
              // would muddy the overlap). Legend is rendered in the header
              // (actions) instead of nivo's in-plot legend.
              enableArea: false,
              legend: false,
              compactTop: true,
              disableGrowthTooltip: true,
              yFormat: formatMoneyFull,
              // Scaled to the plotted data, extended to the budget ceiling only
              // when that ceiling is actually in view (see trajMaxValue).
              maxValue: trajMaxValue,
              axisBottomTickValues: trajTickValues,
              markers: trajMarkers,
            }} />
          </Widget>
        </MotionItem>
        <MotionItem>
          <Widget
            title="Budget vs Actual by Type"
            description={bvaDesc}
            loading={isLoading}
            noData={!isLoading && budgetVsActual.length === 0}
            className="jcd-chart-widget"
            // Custom HTML legend in the header's top-right corner (colors match
            // the bar `colors` below).
            actions={
              <ChartLegend items={[
                { label: "Budget", color: "#94a3b8" },
                { label: "Actual", color: "#c27c3e" },
              ]} />
            }
          >
            <Chart config={{
              type: "bar",
              data: budgetVsActual,
              keys: ["Budget", "Actual"],
              indexBy: "type",
              groupMode: "grouped",
              // Align the plot with the trajectory line chart beside it.
              compactTop: true,
              // Legend is rendered in the header (actions) instead of nivo's.
              hideLegend: true,
              // Hovering a category shows one card with both Budget and Actual
              // plus the variance (budget − actual) for that cost type.
              groupTooltip: true,
              tooltipTotalLabel: "Variance",
              // Thin the y-axis to ~5 ticks so its label density matches the
              // line chart's (which uses everyOtherYTicks) instead of ~11.
              axisLeftTickValues: 5,
              // Budget reads as a neutral reference bar; actual takes brand
              // orange so an over-budget trade pops against its budget peer.
              colors: ["#94a3b8", "#c27c3e"],
              yFormat: formatMoneyFull,
            }} />
          </Widget>
        </MotionItem>

        {/* ── Spending by Type + Spending by Vendor ── */}
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
          <Widget title="Spending by Vendor" loading={isLoading} noData={!isLoading && vendorSpend.length === 0}>
            <Chart config={{
              type: "pie-with-list",
              items: vendorSpend,
              centerLabel: "VENDOR SPEND",
              showPercent: true,
              chartSize: "md",
              // Hashed mode keeps each vendor's color consistent with the
              // dashboard's Top Suppliers widget.
              colors: hashedRelationColors
                ? vendorSpend.map(v => hashColor(v.label))
                : colorRamp(RAMP_SCHEMES.orange.hue, RAMP_SCHEMES.orange.drift, 5),
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
