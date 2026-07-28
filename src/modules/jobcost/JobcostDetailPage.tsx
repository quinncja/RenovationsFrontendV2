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
import { SummaryRow } from "./Jobcost"
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
interface Phase {
  recnum: string
  name: string
  status: number
  pmName: string | null
  // Enriched fields carried through consolidatePhasesIntoProjects — optional
  // until the backend that emits them is deployed.
  unitCount?: number | string | null
  startDate?: string | null
  completedDate?: string | null
  totalContract?: number
  totalCost?: number
  budget?: number
  margin?: number | null
}
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
  // Consolidated rollups (actrec.usrdf1 units; sttdte/cmpdte dates; committed
  // POs + subs; client) — optional until the emitting backend is deployed.
  totalUnitCount?: number
  totalCommitted?: number
  clientName?: string | null
  startDate?: string | null
  completedDate?: string | null
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

// Sage stores unset dates as null (or a pre-2000 sentinel on old rows) — treat
// both as "no date".
function parseValidDate(raw: string | null | undefined): Date | null {
  if (!raw) return null
  const d = new Date(raw)
  if (isNaN(d.getTime()) || d.getFullYear() < 2000) return null
  return d
}

function fmtLongDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

// One identity/pace stat in the overview card's facts row.
function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="jcd-fact">
      <span className="jcd-fact-value">{value}</span>
      <span className="jcd-fact-label">{label}</span>
      {sub && <span className="jcd-fact-sub">{sub}</span>}
    </div>
  )
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
  const { groups, totalBudget } = computeCostGroups(budget, costItems)

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

  // ── Overview facts ──
  // Identity + pace figures for the hero card. Timeline is strictly factual —
  // actrec.sttdte / actrec.cmpdte only. No projected finish: an expected-end
  // field is coming to Sage via project scheduling; extrapolating one from burn
  // would read as a commitment.
  const jobStartDate = parseValidDate(project?.startDate)
  const jobCompletedDate = parseValidDate(project?.completedDate)
  const timelineEnd = jobCompletedDate ?? new Date()
  const daysElapsed = jobStartDate
    ? Math.max(0, Math.round((timelineEnd.getTime() - jobStartDate.getTime()) / 86_400_000))
    : null
  // Units only matter plural — at 1 unit, cost/unit merely restates total cost.
  const unitCount = project?.totalUnitCount && project.totalUnitCount > 1 ? project.totalUnitCount : null
  const costPerUnit = unitCount && project ? project.totalCost / unitCount : null
  const budgetPerUnit = unitCount && totalBudget > 0 ? totalBudget / unitCount : null
  // Most recent cost entry or invoice — a stalled job shows its age here.
  // YYYY-MM-DD prefixes compare lexicographically.
  const lastActivity = (() => {
    const days = [
      ...dailySpend.map(d => d.day?.slice(0, 10)),
      ...activeInvoices.map(i => i.invoiceDate?.slice(0, 10)),
    ].filter((s): s is string => !!s)
    return days.length ? days.reduce((a, b) => (a > b ? a : b)) : null
  })()
  // Committed vs posted split (list-panel parity). Null until the backend
  // that rolls totalCommitted into the consolidated project is deployed.
  const committed = project?.totalCommitted ?? null
  const spentPosted = committed != null && project ? project.totalCost - committed : null

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

  const pm = project?.phases?.find(p => p.pmName?.trim())?.pmName?.trim()
  const margin = project && project.totalContract > 0
    ? ((project.totalContract - project.totalCost) / project.totalContract) * 100
    : project?.totalMargin ?? null
  const marginColor = !marginColorsOn || margin == null ? undefined : marginTextColor(margin)
  // Budget Variance = revised budget − spend to date. POSITIVE = under budget
  // (good); NEGATIVE = over budget (bad). Class-colored by its own sign — same
  // treatment as the list's expanded panel.
  const budgetVariance = project ? totalBudget - project.totalCost : null
  const varianceClass = budgetVariance == null || budgetVariance === 0
    ? undefined
    : budgetVariance > 0 ? "jc-variance-under" : "jc-variance-over"
  const originalContract = project?.originalContract ?? 0
  const revisedContract = project?.totalContract ?? 0
  const invoicePct = revisedContract > 0 ? (totalInvoiced / revisedContract) * 100 : 0
  const coTotalBudget = changeOrders.reduce((s, co) => s + (Number(co.budget) || 0), 0)
  const coTotalContract = changeOrders.reduce((s, co) => s + (Number(co.total) || 0), 0)
  const coPctOfContract = originalContract > 0 ? (coTotalContract / originalContract) * 100 : 0

  const phases = project?.phases ?? []
  const showPhases = !isLoading && phases.length > 1
  const showChanges = !isLoading && changeOrders.length > 0

  // Closed jobs (status > 4, matching the backend's closed rollup) report
  // final figures — "Projected" would read as if the job were still moving.
  const isClosed = (project?.status ?? 0) > 4
  const grossProfit = project ? project.totalContract - project.totalCost : null
  const hasHeroFacts = Boolean(project?.clientName || pm || unitCount != null || lastActivity)
  const hasTimeline = Boolean(jobStartDate || jobCompletedDate)

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
      <MotionList className="jcd-sections">

        {/* ── Overview ─────────────────────────────────────────────── */}
        <MotionItem>
          <section className="jcd-section">
            {/* Hero: who/what/where facts + factual timeline strip. Skipped
                entirely when the job has neither (older Sage records). */}
            {(isLoading || hasHeroFacts || hasTimeline) && (
              <div className="card jcd-overview-card">
                {isLoading ? (
                  <>
                    <div className="jcd-facts">
                      {[0, 1, 2, 3].map(i => (
                        <div key={i} className="jcd-fact">
                          <div className="jcd-skel-value jcd-skel-fact-value" />
                          <div className="jcd-skel-label jcd-skel-fact-label" />
                        </div>
                      ))}
                    </div>
                    <div className="jcd-timeline jcd-timeline-skeleton">
                      <div className="jcd-skel-bar" />
                    </div>
                  </>
                ) : project && (
                  <>
                    {hasHeroFacts && (
                      <div className="jcd-facts">
                        {project.clientName && <Fact label="Client" value={project.clientName} />}
                        {pm && <Fact label="Project Manager" value={pm} />}
                        {unitCount != null && <Fact label="Units" value={String(unitCount)} />}
                        {unitCount != null && costPerUnit != null && (
                          <Fact
                            label="Cost / Unit"
                            value={formatMoneyFull(costPerUnit)}
                            sub={budgetPerUnit != null ? `${formatMoneyFull(budgetPerUnit)} budgeted` : undefined}
                          />
                        )}
                        {lastActivity && <Fact label="Last Activity" value={formatDate(lastActivity)} />}
                      </div>
                    )}

                    {hasTimeline && (
                      <div className={`jcd-timeline${hasHeroFacts ? "" : " jcd-timeline-only"}`}>
                        <div className="jcd-tl-cap">
                          <span className="jcd-tl-cap-label">Started</span>
                          <span className="jcd-tl-cap-date">{jobStartDate ? fmtLongDate(jobStartDate) : "—"}</span>
                        </div>
                        <div className="jcd-tl-line">
                          <span className="jcd-tl-dot" />
                          <span className="jcd-tl-rule" />
                          {daysElapsed != null && <span className="jcd-tl-days">{daysElapsed} days</span>}
                          <span className="jcd-tl-rule" />
                          <span className={`jcd-tl-dot ${jobCompletedDate ? "jcd-tl-dot-done" : "jcd-tl-dot-open"}`} />
                        </div>
                        <div className="jcd-tl-cap jcd-tl-cap-end">
                          <span className="jcd-tl-cap-label">{jobCompletedDate ? "Completed" : "In Progress"}</span>
                          <span className="jcd-tl-cap-date">{jobCompletedDate ? fmtLongDate(jobCompletedDate) : "Today"}</span>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Contract + Cost summary cards — same pair the list's expanded
                row shows, so the two views reconcile at a glance. Skeletons
                mirror the loaded card shape so nothing jumps on arrival. */}
            {isLoading ? (
              <div className="jc-summary-grid">
                {[4, 4].map((rows, c) => (
                  <div key={c} className="card jc-summary-card">
                    <div className="jcd-skel-label jcd-skel-sum-title" />
                    {Array.from({ length: rows }, (_, i) => (
                      <div key={i} className="jc-summary-row">
                        <span className="jcd-skel-label jcd-skel-sum-label" />
                        <span className="jcd-skel-label jcd-skel-sum-value" />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : project && (
              <div className="jc-summary-grid">
                {/* Contract card carries the contract-side verdict (Gross
                    Profit + Margin, as on the list's group cards); the cost
                    card carries the budget-side verdict (Variance). Closed
                    jobs report final figures, not "Projected". */}
                <div className="card jc-summary-card">
                  <div className="jc-summary-title subheadline text-secondary">Contract Summary</div>
                  <SummaryRow label="Original Contract" value={formatMoneyFull(project.originalContract)} />
                  <SummaryRow label="Change Orders" value={project.changeOrderAmount ? formatMoneyFull(project.changeOrderAmount) : "—"} />
                  <SummaryRow label="Revised Contract" value={formatMoneyFull(project.totalContract)} total />
                  <div className="jc-summary-totals">
                    <SummaryRow
                      label="Gross Profit"
                      value={grossProfit == null ? "—" : formatMoneyFull(grossProfit)}
                      total
                      valueColor={marginColor ?? (grossProfit != null && grossProfit < 0 ? "#ef4444" : undefined)}
                    />
                    <SummaryRow
                      label={isClosed ? "Margin" : "Projected Margin"}
                      value={margin == null ? "—" : `${margin.toFixed(1)}%`}
                      total
                      valueColor={marginColor}
                    />
                  </div>
                </div>
                <div className="card jc-summary-card">
                  <div className="jc-summary-title subheadline text-secondary">Cost Summary</div>
                  <SummaryRow label="Revised Budget" value={formatMoneyFull(totalBudget)} />
                  {spentPosted != null && committed != null ? (
                    committed > 0 ? (
                      <>
                        <SummaryRow label="Spent to Date" value={formatMoneyFull(spentPosted)} />
                        <SummaryRow label="Committed (Open POs + Subs)" value={formatMoneyFull(committed)} />
                        <SummaryRow label="Total Committed + Spent" value={formatMoneyFull(project.totalCost)} />
                      </>
                    ) : (
                      // Nothing on order — a $0 Committed row and a repeated
                      // total are noise; one Spent line says it all.
                      <SummaryRow label="Spent to Date" value={formatMoneyFull(project.totalCost)} />
                    )
                  ) : (
                    <SummaryRow label="Total Committed + Spent" value={formatMoneyFull(project.totalCost)} />
                  )}
                  <div className="jc-summary-totals">
                    <SummaryRow
                      label={isClosed ? "Budget Variance" : "Projected Variance"}
                      value={budgetVariance == null ? "—" : formatMoneyFull(budgetVariance)}
                      total
                      valueClass={varianceClass}
                    />
                  </div>
                </div>
              </div>
            )}
          </section>
        </MotionItem>

        {/* ── Costs ────────────────────────────────────────────────── */}
        <MotionItem>
          <section className="jcd-section">
            <h2 className="jcd-section-title title2 emphasized">Costs</h2>
            <div className="widget-grid widget-grid-2">
              {/* Cost Breakdown leads the section — it sits directly under the
                  overview's summary cards, which it itemizes. It is the single
                  by-type view (no duplicate budget-vs-actual chart or by-type
                  pie beside it). */}
              <div className="col-span-full">
                <Widget title="Cost Breakdown" loading={isLoading} noData={!isLoading && !budget} className="jcd-cost-widget">
                  <CostBreakdownTable budget={budget} costItems={costItems} />
                </Widget>
              </div>

              <Widget
                title="Cost & Billing Trajectory"
                description={trajDesc}
                loading={isLoading}
                noData={!isLoading && costVsBilled.length === 0}
                className="jcd-chart-widget"
                // Custom HTML legend in the header's top-right corner (colors
                // match the series: Cost = CHART_COLORS[0], Billed = [1]).
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
                  // Scaled to the plotted data, extended to the budget ceiling
                  // only when that ceiling is actually in view (trajMaxValue).
                  maxValue: trajMaxValue,
                  axisBottomTickValues: trajTickValues,
                  markers: trajMarkers,
                }} />
              </Widget>

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
            </div>
          </section>
        </MotionItem>

        {/* ── Billing ──────────────────────────────────────────────── */}
        <MotionItem>
          <section className="jcd-section">
            <h2 className="jcd-section-title title2 emphasized">Billing</h2>
            <div>
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
            </div>
          </section>
        </MotionItem>

        {/* ── Changes & Phases ─────────────────────────────────────── */}
        {(showChanges || showPhases) && (
          <MotionItem>
            <section className="jcd-section">
              <h2 className="jcd-section-title title2 emphasized">Changes &amp; Phases</h2>

              {showChanges && (
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
                            const coBudget = co.budget == null ? null : Number(co.budget)
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
                                  {coBudget == null ? "-" : formatMoneyFull(coBudget)}
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
              )}

              {/* Per-phase rollup — the consolidated project's members, which
                  were previously fetched but never shown. */}
              {showPhases && (
                <div className="card jcd-phases-card">
                  <div className="jcd-phases-head">
                    <span className="widget-title headline">Phases</span>
                    <span className="jcd-phases-count">{phases.length} phases</span>
                  </div>
                  <table className="spend-rank-table inv-table">
                    <thead>
                      <tr>
                        <th className="spend-rank-table-name jcd-co-th-num">Phase #</th>
                        <th className="spend-rank-table-name">Name</th>
                        <th className="spend-rank-table-name inv-th-status">Status</th>
                        <th className="spend-rank-table-name inv-th-date">PM</th>
                        <th className="spend-rank-table-value">Units</th>
                        <th className="spend-rank-table-value">Contract</th>
                        <th className="spend-rank-table-value">Committed + Spent</th>
                        <th className="spend-rank-table-value">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {phases.map(ph => {
                        const phMargin = ph.margin == null ? null : Number(ph.margin)
                        const phUnits = Number(ph.unitCount) || 0
                        return (
                          <tr key={ph.recnum} className="spend-rank-table-row">
                            <td className="spend-rank-table-name body-text emphasized jcd-co-th-num">#{ph.recnum}</td>
                            <td className="spend-rank-table-name body-text">{ph.name}</td>
                            <td className="spend-rank-table-name inv-th-status">
                              <span className={`status-badge status-${ph.status}`}>
                                {JOB_STATUS_LABELS[ph.status] ?? ph.status}
                              </span>
                            </td>
                            <td className="spend-rank-table-name body-text text-secondary inv-th-date">{ph.pmName?.trim() || "—"}</td>
                            <td className="spend-rank-table-value body-text">{phUnits > 0 ? phUnits : "—"}</td>
                            <td className="spend-rank-table-value body-text">{formatMoneyFull(ph.totalContract ?? 0)}</td>
                            <td className="spend-rank-table-value body-text">{formatMoneyFull(ph.totalCost ?? 0)}</td>
                            <td
                              className="spend-rank-table-value body-text emphasized"
                              style={!marginColorsOn || phMargin == null ? undefined : { color: marginTextColor(phMargin) }}
                            >
                              {phMargin == null ? "—" : `${phMargin.toFixed(1)}%`}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </MotionItem>
        )}
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
