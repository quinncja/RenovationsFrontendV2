import { useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { ChevronDown, ChevronRight, ChevronUp, ChevronsUpDown, Download } from "lucide-react"
import Page from "../../shared/components/Page"
import { PageDataProvider, useWidgetData } from "../../shared/context/PageContext"
import { PAGE_QUERIES } from "../../shared/config/pageQueries"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { Widget } from "../../shared/components/Widget/Widget"
import { Chart } from "../../shared/components/Chart/Chart"
import { InvoiceDetailModal } from "../../shared/components/InvoiceDetailModal/InvoiceDetailModal"
import {
  projectedMargin,
  marginClass,
  formatMargin,
  type JobSummary,
  type CostGroup,
  type CostTransaction,
} from "../../shared/components/JobDetailPanel/JobDetailPanel"
import { formatMoneyFull, formatDate } from "../../shared/utils/format"
import { useAuth } from "../../core/auth/AuthProvider"
import useLocalStorage from "../../shared/hooks/useLocalStorage"
import type { SpendItem } from "../../shared/components/Chart/chart.types"
import { SUPPLIER_COLORS_5 } from "../../shared/config/chartColors"
import { downloadXlsx } from "../../shared/utils/exportXlsx"
import { buildJobCostXlsx } from "./exportJobCostCsv"

interface VendorSpendItem extends SpendItem {
  vendorType: string
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface MonthlyCost {
  month: number
  year: number
  spending: number
}

interface JobInvoice {
  id: string
  invoiceNum: string
  description: string | null
  total: number
  invoiceDate: unknown
  status: number
  amountPaid: number
  amountRemaining: number
}

type CostSortKey = "costGroup" | "budget" | "actual" | "variance"
type InvSortKey = "invoiceNum" | "invoiceDate" | "status" | "total" | "amountPaid" | "amountRemaining"
type SortDir = "asc" | "desc"

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const JOB_STATUS_LABEL: Record<number, string> = { 1: "Bid", 2: "Refused", 3: "Contract", 4: "Current", 5: "Complete", 6: "Closed" }
const INV_STATUS_LABEL: Record<number, string> = { 1: "Open", 2: "Review", 3: "Dispute", 4: "Paid", 5: "Void" }
const INV_STATUS_CLASS: Record<number, string> = { 1: "open", 2: "review", 3: "dispute", 4: "paid", 5: "void" }

const VENDOR_COLORS = SUPPLIER_COLORS_5

// ─── Detail content ──────────────────────────────────────────────────────────

function JobcostDetailContent() {
  const navigate = useNavigate()
  const { claims } = useAuth()
  const canViewVendors = claims["role"] === "executive" || claims["role"] === "admin"
  const [hideCurrentMargin] = useLocalStorage("hideCurrentMargin", false)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [invoicesOpen, setInvoicesOpen] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [costSortKey, setCostSortKey] = useState<CostSortKey>("costGroup")
  const [costSortDir, setCostSortDir] = useState<SortDir>("asc")
  const [invSortKey, setInvSortKey] = useState<InvSortKey>("invoiceDate")
  const [invSortDir, setInvSortDir] = useState<SortDir>("desc")

  const { data, isLoading } = useWidgetData([
    "jobCostSummary",
    "jobCostGroups",
    "jobCostTransactions",
    "jobCostMonthlyCosts",
    "jobCostInvoices",
    "jobCostVendorSpend",
  ])

  const summary = data?.["jobCostSummary"] as JobSummary | null
  const costGroups = (data?.["jobCostGroups"] as CostGroup[] | null) ?? []
  const transactions = (data?.["jobCostTransactions"] as CostTransaction[] | null) ?? []
  const monthlyCosts = (data?.["jobCostMonthlyCosts"] as MonthlyCost[] | null) ?? []
  const invoices = (data?.["jobCostInvoices"] as JobInvoice[] | null) ?? []
  const vendorSpend = (data?.["jobCostVendorSpend"] as VendorSpendItem[] | null) ?? []

  // Computed values
  const revisedContract = summary?.revisedContract ?? 0
  const revisedEstimate = summary?.revisedEstimate ?? 0
  const actualToDate = summary?.actualToDate ?? 0
  const profit = revisedContract - revisedEstimate
  const margin = projectedMargin(revisedContract, revisedEstimate)

  // Pie chart data from cost groups
  const categorySpend: SpendItem[] = costGroups
    .filter((g) => g.actual > 0)
    .map((g) => ({ id: g.costGroup, label: g.costGroup, value: g.actual }))

  // Monthly spend line chart
  const monthlyLine = monthlyCosts.map((m) => ({
    x: `${MONTH_ABBR[m.month - 1]} '${String(m.year).slice(2)}`,
    y: m.spending,
  }))

  // Thin x-axis labels when there are too many months
  const MAX_X_LABELS = 12
  const monthlyTickValues = monthlyLine.length > MAX_X_LABELS
    ? monthlyLine
        .filter((_, i) => i % Math.ceil(monthlyLine.length / MAX_X_LABELS) === 0)
        .map((d) => d.x)
    : undefined

  // Spending by cost type (Materials, Labor, etc.)
  const costTypeSpend: SpendItem[] = (() => {
    const totals = new Map<string, number>()
    for (const t of transactions) {
      totals.set(t.costType, (totals.get(t.costType) ?? 0) + t.amount)
    }
    return Array.from(totals.entries())
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ id: label, label, value }))
  })()

  // Invoice totals
  const activeInvoices = invoices.filter((i) => i.status !== 5)
  const totalInvoiced = activeInvoices.reduce((s, i) => s + (i.total ?? 0), 0)
  const totalPaid = activeInvoices.reduce((s, i) => s + (i.amountPaid ?? 0), 0)
  const totalOutstanding = activeInvoices.reduce((s, i) => s + (i.amountRemaining ?? 0), 0)
  const invoicePct = revisedContract > 0 ? (totalInvoiced / revisedContract) * 100 : 0

  // Sorted cost groups
  const sortedCostGroups = [...costGroups].sort((a, b) => {
    let av: number | string, bv: number | string
    switch (costSortKey) {
      case "costGroup": av = a.costGroup; bv = b.costGroup; break
      case "budget":    av = a.budget;    bv = b.budget;    break
      case "actual":    av = a.actual;    bv = b.actual;    break
      case "variance":  av = a.variance;  bv = b.variance;  break
    }
    if (av < bv) return costSortDir === "asc" ? -1 : 1
    if (av > bv) return costSortDir === "asc" ? 1 : -1
    return 0
  })

  function handleCostSort(key: CostSortKey) {
    if (costSortKey === key) {
      setCostSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setCostSortKey(key)
      setCostSortDir(key === "costGroup" ? "asc" : "desc")
    }
  }

  function handleInvSort(key: InvSortKey) {
    if (invSortKey === key) {
      setInvSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setInvSortKey(key)
      setInvSortDir(key === "invoiceNum" ? "asc" : "desc")
    }
  }

  const sortedInvoices = [...invoices].sort((a, b) => {
    let av: number | string, bv: number | string
    switch (invSortKey) {
      case "invoiceNum":      av = a.invoiceNum;      bv = b.invoiceNum;      break
      case "invoiceDate":     av = String(a.invoiceDate ?? ""); bv = String(b.invoiceDate ?? ""); break
      case "status":          av = a.status;           bv = b.status;          break
      case "total":           av = a.total;            bv = b.total;           break
      case "amountPaid":      av = a.amountPaid;       bv = b.amountPaid;      break
      case "amountRemaining": av = a.amountRemaining;  bv = b.amountRemaining; break
    }
    if (av < bv) return invSortDir === "asc" ? -1 : 1
    if (av > bv) return invSortDir === "asc" ? 1 : -1
    return 0
  })

  function toggleGroup(name: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const jobName = summary?.jobName ?? "Project"
  const clientName = summary?.clientName
  const status = summary?.status
  const statusLabel = status ? JOB_STATUS_LABEL[status] ?? "" : ""
  const subtitle = [clientName, statusLabel].filter(Boolean).join(" \u00B7 ")

  function handleExport() {
    if (!summary) return
    const invoiceSummary = activeInvoices.length > 0 ? {
      totalInvoiced,
      totalPaid,
      totalOutstanding,
      invoicedPct: invoicePct,
    } : null
    const { rows: xlsxRows, transactionHeaderRow, transactionCols } = buildJobCostXlsx(summary, costGroups, transactions, invoiceSummary)
    const date = new Date().toISOString().slice(0, 10)
    const safeName = jobName.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "")
    downloadXlsx(xlsxRows, `${safeName}_Cost_Report_${date}.xlsx`, jobName, {
      autoFilterRow: transactionHeaderRow,
      autoFilterCols: transactionCols,
    })
  }

  function CostSortHeader({ label, sortKey }: { label: string; sortKey: CostSortKey }) {
    const active = costSortKey === sortKey
    const icon = active
      ? (costSortDir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />)
      : <ChevronsUpDown size={11} />
    return (
      <button className={`jc-sort-btn${active ? " active" : ""}`} onClick={() => handleCostSort(sortKey)}>
        {label}{icon}
      </button>
    )
  }

  function InvSortHeader({ label, sortKey }: { label: string; sortKey: InvSortKey }) {
    const active = invSortKey === sortKey
    const icon = active
      ? (invSortDir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />)
      : <ChevronsUpDown size={11} />
    return (
      <button className={`jc-sort-btn${active ? " active" : ""}`} onClick={(e) => { e.stopPropagation(); handleInvSort(sortKey) }}>
        {label}{icon}
      </button>
    )
  }

  return (
    <>
    <Page title={jobName} subtitle={subtitle} actions={
      <button
        className="jc-export-btn"
        onClick={handleExport}
        disabled={isLoading || !summary}
      >
        <Download size={14} />
        Export Report
      </button>
    }>
      <MotionList className="widget-grid widget-grid-2">

        {/* ── Project summary metrics row ── */}
        <MotionItem className="col-span-full">
          <div className="card jcd-metrics-card">
            {isLoading ? (
              <div className="jcd-metrics-skeleton">
                {[0,1,2,3].map((i) => (
                  <div key={i} className="jcd-metrics-skeleton-cell">
                    <div className="jcd-skel-value" />
                    <div className="jcd-skel-label" />
                  </div>
                ))}
              </div>
            ) : summary && (
              <div className="inv-metrics-row jcd-metrics-row">
                <div className="inv-metric">
                  <span className="inv-metric-value">{formatMoneyFull(revisedContract)}</span>
                  <span className="inv-metric-label">Revised Contract</span>
                </div>
                <div className="inv-metric-divider" />
                <div className="inv-metric">
                  <span className="inv-metric-value">{formatMoneyFull(actualToDate)}</span>
                  <span className="inv-metric-label">Spending to Date</span>
                </div>
                {!(hideCurrentMargin && status === 4) && (
                  <>
                    <div className="inv-metric-divider" />
                    <div className="inv-metric">
                      <span className={`inv-metric-value ${profit >= 0 ? "jc-margin-high" : "jc-margin-critical"}`}>{formatMoneyFull(profit)}</span>
                      <span className="inv-metric-label">{status === 4 ? "Projected Profit" : "Profit"}</span>
                    </div>
                    <div className="inv-metric-divider" />
                    <div className="inv-metric">
                      <span className={`inv-metric-value ${marginClass(margin)}`}>{formatMargin(margin)}</span>
                      <span className="inv-metric-label">{status === 4 ? "Projected Margin" : "Margin"}</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </MotionItem>

        {/* ── Invoiced vs Contract ── */}
        <MotionItem className="col-span-full">
          <div className="det-section card">
            <div className="det-section-toggle" onClick={isLoading ? undefined : () => setInvoicesOpen((o) => !o)}>
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
                    {[0,1,2].map((i) => (
                      <div key={i} className="jcd-metrics-skeleton-cell">
                        <div className="jcd-skel-value" />
                        <div className="jcd-skel-label" />
                      </div>
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
                      <span className="jcd-inv-amounts subheadline">{formatMoneyFull(totalInvoiced)} <span className="text-secondary">of</span> {formatMoneyFull(revisedContract)}</span>
                      <div className="jc-invoice-progress-bar">
                        <div
                          className="jc-invoice-progress-fill"
                          style={{ width: `${Math.min(invoicePct, 100)}%` }}
                        />
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
                        <th className="spend-rank-table-name inv-th-num"><InvSortHeader label="Invoice #" sortKey="invoiceNum" /></th>
                        <th className="spend-rank-table-name inv-th-date"><InvSortHeader label="Date" sortKey="invoiceDate" /></th>
                        <th className="spend-rank-table-name inv-th-status"><InvSortHeader label="Status" sortKey="status" /></th>
                        <th className="spend-rank-table-value"><InvSortHeader label="Total" sortKey="total" /></th>
                        <th className="spend-rank-table-value"><InvSortHeader label="Paid" sortKey="amountPaid" /></th>
                        <th className="spend-rank-table-value"><InvSortHeader label="Remaining" sortKey="amountRemaining" /></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedInvoices.map((inv) => (
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
          <Widget title="Monthly Spend" loading={isLoading} noData={!isLoading && monthlyLine.length === 0} className="jcd-chart-widget">
            <Chart config={{
              type: "line",
              series: [{ id: "Spend", color: "#1f78c5", data: monthlyLine }],
              enableArea: true,
              disableGrowthTooltip: true,
              axisBottomTickValues: monthlyTickValues,
            }} />
          </Widget>
        </MotionItem>

        {/* ── Spending by Category + Spending by Type (side by side) ── */}
        <MotionItem>
          <Widget title="Spending by Category" loading={isLoading} noData={!isLoading && categorySpend.length === 0}>
            <Chart config={{
              type: "pie-with-list",
              items: categorySpend,
              centerLabel: "TOTAL SPEND",
              centerTotal: actualToDate,
              showPercent: true,
              chartSize: "md",
            }} />
          </Widget>
        </MotionItem>
        <MotionItem>
          <Widget title="Spending by Type" loading={isLoading} noData={!isLoading && costTypeSpend.length === 0}>
            <Chart config={{
              type: "pie-with-list",
              items: costTypeSpend,
              centerLabel: "TOTAL SPEND",
              centerTotal: actualToDate,
              showPercent: true,
              chartSize: "md",
            }} />
          </Widget>
        </MotionItem>

        {/* ── Top Vendors ── */}
        <MotionItem>
          <Widget title="Top Vendors" loading={isLoading} noData={!isLoading && vendorSpend.length === 0}>
            <Chart config={{
              type: "pie-with-list",
              items: vendorSpend,
              centerLabel: "VENDOR SPEND",
              showPercent: true,
              chartSize: "md",
              colors: VENDOR_COLORS,
              onItemClick: canViewVendors ? (id) => {
                const vendor = vendorSpend.find((v) => v.id === id)
                const path = vendor?.vendorType === "subcontractor" ? "/subcontractors" : "/suppliers"
                navigate(`${path}/${id}`)
              } : undefined,
            }} />
          </Widget>
        </MotionItem>

        {/* ── Cost Breakdown + Transactions ── */}
        <MotionItem className="col-span-full">
          <Widget title="Cost Breakdown" loading={isLoading} noData={!isLoading && costGroups.length === 0} className="jcd-cost-widget">
            <table className="jc-cost-table">
              <thead>
                <tr>
                  <th className="jc-cost-th jc-cost-code-col">
                    <CostSortHeader label="Category" sortKey="costGroup" />
                  </th>
                  <th className="jc-cost-th jc-cost-num-col">
                    <CostSortHeader label="Budget" sortKey="budget" />
                  </th>
                  <th className="jc-cost-th jc-cost-num-col">
                    <CostSortHeader label="Actual" sortKey="actual" />
                  </th>
                  <th className="jc-cost-th jc-cost-num-col">
                    <CostSortHeader label="Variance" sortKey="variance" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedCostGroups.flatMap((group) => {
                  const isGroupExpanded = expandedGroups.has(group.costGroup)
                  const groupTxns = transactions.filter((t) => t.costGroup === group.costGroup)
                  const isOver = group.variance < 0
                  return [
                    <tr
                      key={group.costGroup}
                      className={`jc-group-row${isGroupExpanded ? " expanded" : ""}`}
                      onClick={() => toggleGroup(group.costGroup)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && toggleGroup(group.costGroup)}
                    >
                      <td className="jc-cost-code-col">
                        <span className="jc-group-chevron">
                          {isGroupExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                        </span>
                        {group.costGroup}
                      </td>
                      <td className="jc-cost-num-col">{formatMoneyFull(group.budget)}</td>
                      <td className="jc-cost-num-col">{formatMoneyFull(group.actual)}</td>
                      <td className={`jc-cost-num-col ${isOver ? "jc-variance-over" : group.variance > 0 ? "jc-variance-under" : ""}`}>
                        {group.variance > 0 ? "+" : ""}{formatMoneyFull(group.variance)}
                      </td>
                    </tr>,
                    ...(isGroupExpanded ? [
                      <tr key={`${group.costGroup}-txns`} className="jc-txn-container-row">
                        <td colSpan={4} style={{ padding: 0 }}>
                          <table className="jc-txn-table">
                            <thead>
                              <tr>
                                <th className="jc-txn-th jc-txn-date-col">Date</th>
                                <th className="jc-txn-th">Vendor / Employee</th>
                                <th className="jc-txn-th">Description</th>
                                <th className="jc-txn-th jc-txn-type-col">Type</th>
                                <th className="jc-txn-th">PO / Ref</th>
                                <th className="jc-txn-th jc-txn-amount-col">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {groupTxns.length === 0 ? (
                                <tr><td colSpan={6} className="jc-txn-empty">No transactions found</td></tr>
                              ) : groupTxns.map((t) => (
                                <tr key={t.id} className="jc-txn-row">
                                  <td className="jc-txn-date">{formatDate(t.transDate)}</td>
                                  <td className="jc-txn-vendor">{t.vendorName}</td>
                                  <td className="text-secondary">{t.description || "—"}</td>
                                  <td className="text-secondary">{t.costType}</td>
                                  <td className="text-secondary">{t.poReference || "—"}</td>
                                  <td className="jc-txn-amount-col emphasized">{formatMoneyFull(t.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>,
                    ] : []),
                  ]
                })}
              </tbody>
            </table>
          </Widget>
        </MotionItem>
      </MotionList>
    </Page>

    <InvoiceDetailModal
      invoiceId={selectedInvoiceId}
      module="clients"
      onClose={() => setSelectedInvoiceId(null)}
    />
    </>
  )
}

// ─── Page wrapper ────────────────────────────────────────────────────────────

export default function JobcostDetailPage() {
  const { recnum } = useParams<{ recnum: string }>()
  const numericId = recnum ? parseInt(recnum, 10) : null

  if (numericId === null || isNaN(numericId)) {
    return <Page title="Project Not Found" />
  }

  return (
    <PageDataProvider
      module="jobcost"
      queries={PAGE_QUERIES.jobCostDetailPage}
      params={{ recnum: numericId }}
    >
      <JobcostDetailContent />
    </PageDataProvider>
  )
}
