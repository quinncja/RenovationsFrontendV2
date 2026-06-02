import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronDown, ChevronRight } from "lucide-react"
import { fetchPageData } from "../../api/pageApi"
import { formatMoneyFull, formatDate } from "../../utils/format"
import useMarginColorsEnabled from "../../hooks/useMarginColorsEnabled"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JobSummary {
  recnum?: number
  jobName?: string
  status?: number
  clientName?: string | null
  originalContract: number
  changeOrderTotal: number
  revisedContract: number
  revisedEstimate: number
  actualToDate: number
}

export interface ChangeOrder {
  recnum: number
  description: string
  estimateAmount: number
  contractAmount: number
  status: number
}

export interface CostGroup {
  costGroup: string
  budget: number
  actual: number
  variance: number
}

export interface CostTransaction {
  id: string
  costGroup: string
  costType: string
  vendorId: number | null
  vendorName: string
  description: string | null
  amount: number
  transDate: unknown
  poReference: string | null
}

export interface JobDetailData {
  summary: JobSummary | null
  changeOrders: ChangeOrder[]
  costGroups: CostGroup[]
  transactions: CostTransaction[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function projectedMargin(contract: number, estimate: number): number | null {
  if (contract <= 0 || estimate <= 0) return null
  return ((contract - estimate) / contract) * 100
}

export function marginClass(pct: number | null): string {
  if (pct === null) return ""
  if (pct >= 30) return "jc-margin-high"
  if (pct >= 20) return "jc-margin-target"
  return "jc-margin-critical"
}

export function formatMargin(pct: number | null): string {
  return pct === null ? "—" : `${pct.toFixed(1)}%`
}

function SummaryRow({ label, value, valueClass, total }: {
  label: string; value: string; valueClass?: string; total?: boolean
}) {
  return (
    <div className={`jc-summary-row${total ? " total" : ""}`}>
      <span className="jc-summary-label">{label}</span>
      <span className={`jc-summary-value${valueClass ? ` ${valueClass}` : ""}`}>{value}</span>
    </div>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useJobDetail(year: number) {
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [details, setDetails] = useState<Record<number, JobDetailData>>({})
  const [loadingId, setLoadingId] = useState<number | null>(null)

  function loadDetail(recnum: number) {
    setLoadingId(recnum)
    fetchPageData({
      module: "jobcost",
      queries: ["jobCostSummary", "jobCostChangeOrders", "jobCostGroups", "jobCostTransactions"],
      params: { year, recnum },
    })
      .then((data) => {
        setDetails((prev) => ({
          ...prev,
          [recnum]: {
            summary: (data.jobCostSummary as JobSummary | null) ?? null,
            changeOrders: (data.jobCostChangeOrders as ChangeOrder[]) ?? [],
            costGroups: (data.jobCostGroups as CostGroup[]) ?? [],
            transactions: (data.jobCostTransactions as CostTransaction[]) ?? [],
          },
        }))
      })
      .finally(() => setLoadingId(null))
  }

  function toggleExpand(recnum: number) {
    if (expandedId === recnum) {
      setExpandedId(null)
      setExpandedGroups(new Set())
    } else {
      setExpandedId(recnum)
      setExpandedGroups(new Set())
      if (!details[recnum]) loadDetail(recnum)
    }
  }

  function toggleGroup(groupName: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      next.has(groupName) ? next.delete(groupName) : next.add(groupName)
      return next
    })
  }

  return { expandedId, expandedGroups, details, loadingId, toggleExpand, toggleGroup }
}

// ─── Panel component ──────────────────────────────────────────────────────────

interface JobDetailPanelProps {
  detail: JobDetailData
  expandedGroups: Set<string>
  onToggleGroup: (g: string) => void
}

export function JobDetailPanel({ detail, expandedGroups, onToggleGroup }: JobDetailPanelProps) {
  const navigate = useNavigate()
  const marginColorsOn = useMarginColorsEnabled()
  const s = detail.summary
  const projProfit = s ? (s.revisedContract ?? 0) - (s.revisedEstimate ?? 0) : 0
  const projPct = s ? projectedMargin(s.revisedContract ?? 0, s.revisedEstimate ?? 0) : null

  return (
    <div className="jc-job-detail">
      <div className="jc-summaries">
        <div className="jc-summary-panel">
          <p className="jc-summary-section-label">Contract Summary</p>
          <SummaryRow label="Original Contract" value={formatMoneyFull(s?.originalContract ?? 0)} />
          <SummaryRow
            label="Change Orders"
            value={s && (s.changeOrderTotal ?? 0) > 0 ? `+${formatMoneyFull(s.changeOrderTotal)}` : "—"}
            valueClass={s && (s.changeOrderTotal ?? 0) > 0 ? "jc-margin-high" : ""}
          />
          <SummaryRow label="Revised Contract" value={formatMoneyFull(s?.revisedContract ?? 0)} total />
          {detail.changeOrders.length > 0 && (
            <>
              <p className="jc-summary-section-label" style={{ marginTop: "1.25rem" }}>Change Orders</p>
              <div className="jc-co-list">
                {detail.changeOrders.map((co) => (
                  <div key={co.recnum} className="jc-co-row">
                    <span className="jc-co-desc">{co.description}</span>
                    <div className="jc-co-amounts">
                      <div className="jc-co-amount-item">
                        <span className="jc-co-amount-label">Est.</span>
                        <span className={`jc-co-amount-value ${(co.estimateAmount ?? 0) >= 0 ? "jc-margin-high" : "jc-margin-critical"}`}>
                          {(co.estimateAmount ?? 0) > 0 ? "+" : ""}{formatMoneyFull(co.estimateAmount ?? 0)}
                        </span>
                      </div>
                      <div className="jc-co-amount-item">
                        <span className="jc-co-amount-label">Contract</span>
                        <span className={`jc-co-amount-value ${(co.contractAmount ?? 0) >= 0 ? "jc-margin-high" : "jc-margin-critical"}`}>
                          {(co.contractAmount ?? 0) > 0 ? "+" : ""}{formatMoneyFull(co.contractAmount ?? 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="jc-summary-panel">
          <p className="jc-summary-section-label">Cost Summary</p>
          <SummaryRow label="Revised Estimate" value={formatMoneyFull(s?.revisedEstimate ?? 0)} />
          <SummaryRow label="Spending to Date" value={formatMoneyFull(s?.actualToDate ?? 0)} />
          <SummaryRow
            label="Projected Profit"
            value={formatMoneyFull(projProfit)}
            valueClass={projProfit >= 0 ? "jc-margin-high" : "jc-margin-critical"}
          />
          <SummaryRow
            label="Projected Margin"
            value={formatMargin(projPct)}
            valueClass={marginColorsOn ? marginClass(projPct) : undefined}
            total
          />
        </div>
      </div>

      <div className="jc-cost-detail">
        <div className="jc-cost-detail-header">
          <p className="jc-cost-section-title">Cost Breakdown</p>
        </div>
        <table className="jc-cost-table">
          <thead>
            <tr>
              <th className="jc-cost-th jc-cost-code-col">Category</th>
              <th className="jc-cost-th jc-cost-num-col">Budget</th>
              <th className="jc-cost-th jc-cost-num-col">Actual</th>
              <th className="jc-cost-th jc-cost-num-col">Variance</th>
            </tr>
          </thead>
          <tbody>
            {detail.costGroups.flatMap((group) => {
              const isGroupExpanded = expandedGroups.has(group.costGroup)
              const groupTxns = detail.transactions.filter((t) => t.costGroup === group.costGroup)
              return [
                <tr
                  key={group.costGroup}
                  className={`jc-group-row${isGroupExpanded ? " expanded" : ""}`}
                  onClick={() => onToggleGroup(group.costGroup)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && onToggleGroup(group.costGroup)}
                >
                  <td className="jc-cost-code-col">
                    <span className="jc-group-chevron">
                      {isGroupExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    </span>
                    {group.costGroup}
                  </td>
                  <td className="jc-cost-num-col">{formatMoneyFull(group.budget ?? 0)}</td>
                  <td className="jc-cost-num-col">{formatMoneyFull(group.actual ?? 0)}</td>
                  <td className={`jc-cost-num-col ${(group.variance ?? 0) < 0 ? "jc-variance-over" : (group.variance ?? 0) > 0 ? "jc-variance-under" : ""}`}>
                    {(group.variance ?? 0) > 0 ? "+" : ""}{formatMoneyFull(group.variance ?? 0)}
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
                          ) : groupTxns.map((t) => {
                            const txnPath = t.vendorId
                              ? (t.costType === "Subcontractor" ? `/subcontractors/${t.vendorId}` : `/suppliers/${t.vendorId}`)
                              : null
                            return (
                              <tr
                                key={t.id}
                                className={`jc-txn-row${txnPath ? " jc-txn-row-link" : ""}`}
                                onClick={txnPath ? (e) => { e.stopPropagation(); navigate(txnPath) } : undefined}
                                role={txnPath ? "button" : undefined}
                                tabIndex={txnPath ? 0 : undefined}
                                onKeyDown={txnPath ? (e) => e.key === "Enter" && navigate(txnPath) : undefined}
                              >
                                <td className="jc-txn-date">{formatDate(t.transDate)}</td>
                                <td className="jc-txn-vendor">{t.vendorName}</td>
                                <td className="text-secondary">{t.description || "—"}</td>
                                <td className="text-secondary">{t.costType}</td>
                                <td className="text-secondary">{t.poReference || "—"}</td>
                                <td className="jc-txn-amount-col emphasized">{formatMoneyFull(t.amount ?? 0)}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </td>
                  </tr>,
                ] : []),
              ]
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
