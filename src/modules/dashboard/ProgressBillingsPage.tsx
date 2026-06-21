import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useJobcostNav } from "../jobcost/useJobcostNav"
import { ArrowLeft, ArrowUp, ArrowDown, ArrowUpDown, Search } from "lucide-react"
import Page from "../../shared/components/Page"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { Widget } from "../../shared/components/Widget/Widget"
import { PageDataProvider, useWidgetData } from "../../shared/context/PageContext"
import { PAGE_QUERIES } from "../../shared/config/pageQueries"
import { formatMoneyFull } from "../../shared/utils/format"

// One project's billing position. `variance` (= earned − billed) is positive
// when under-billed (work done but not yet invoiced), negative when over-billed.
interface ProjectRow {
  id: string
  name: string
  client: string | null
  contract: number
  budget: number
  cost: number
  billed: number
  expected: number // "should bill" = earned revenue (cost-to-cost % of completion)
  billedPct: number // billed ÷ contract
  expectedPct: number // earned ÷ contract = % complete
  variance: number
}

interface ProgressBillings {
  netOverUnder: number
  underBilledCount: number
  overBilledCount: number
  allProjects: ProjectRow[]
}

type SortKey = "name" | "contract" | "budget" | "cost" | "billed" | "expected" | "variance"
type SortDir = "asc" | "desc"

const pct = (v: number) => `${Math.round(v * 100)}%`

// Reuse the change-orders sortable header chrome (co-th-btn + spend-rank-table).
// `fill` makes a column absorb the table's slack so it (the Project name) takes
// the available horizontal space and the numeric columns hug the right edge.
function SortTh({ col, label, align = "left", fill = false, colSpan, sortKey, sortDir, onSort }: {
  col: SortKey
  label: string
  align?: "left" | "right" | "center"
  fill?: boolean
  colSpan?: number
  sortKey: SortKey
  sortDir: SortDir
  onSort: (k: SortKey) => void
}) {
  const active = sortKey === col
  const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown
  const thClass = align === "right" ? "spend-rank-table-value" : "spend-rank-table-name"
  const alignClass = align === "right" ? " co-th-btn-right" : align === "center" ? " co-th-btn-center" : ""
  return (
    <th className={thClass} colSpan={colSpan} style={fill ? { width: "100%" } : undefined}>
      <button
        className={`co-th-btn${alignClass}${active ? " co-th-btn-active" : ""}`}
        onClick={() => onSort(col)}
      >
        {label} <Icon size={11} />
      </button>
    </th>
  )
}

function ProgressBillingsContent() {
  const navigate = useNavigate()
  const { goToJobcost } = useJobcostNav()
  const { data, isLoading, disconnected } = useWidgetData<{ progressBillings: ProgressBillings | null }>([
    "progressBillings",
  ])
  const pb = data?.progressBillings
  const projects = useMemo(() => pb?.allProjects ?? [], [pb?.allProjects])

  // Totals for the summary band: under-billed and over-billed dollars summed
  // separately, with Net = Under − Over so the three figures reconcile with the
  // projects actually listed. (The backend's canonical `netOverUnder` sums over
  // ALL jobs including budget-less ones — which are excluded from this ranked
  // list because they have no real % of completion — so it would NOT add up to
  // Under − Over here.)
  const totals = useMemo(() => {
    let under = 0
    let over = 0
    for (const p of projects) {
      if (p.variance > 0) under += p.variance
      else if (p.variance < 0) over += -p.variance
    }
    return { under, over }
  }, [projects])
  const net = totals.under - totals.over

  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("variance")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      // Text → asc, numeric → desc.
      setSortDir(key === "name" ? "asc" : "desc")
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const list = q
      ? projects.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.client ?? "").toLowerCase().includes(q) ||
            p.id.toLowerCase().includes(q),
        )
      : projects
    return [...list].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir
      if (sortKey === "contract") return (a.contract - b.contract) * dir
      if (sortKey === "budget") return (a.budget - b.budget) * dir
      if (sortKey === "cost") return (a.cost - b.cost) * dir
      if (sortKey === "billed") return (a.billed - b.billed) * dir
      if (sortKey === "expected") return (a.expected - b.expected) * dir
      return (a.variance - b.variance) * dir
    })
  }, [projects, search, sortKey, sortDir])

  // Column sum totals for the table footer — over the currently-visible
  // (filtered) rows so the row reconciles with what's on screen. Billed/Earned
  // percentages roll up against the summed contract.
  const footer = useMemo(() => {
    const t = filtered.reduce(
      (acc, p) => {
        acc.contract += p.contract
        acc.budget += p.budget
        acc.cost += p.cost
        acc.billed += p.billed
        acc.expected += p.expected
        acc.variance += p.variance
        return acc
      },
      { contract: 0, budget: 0, cost: 0, billed: 0, expected: 0, variance: 0 },
    )
    return {
      ...t,
      billedPct: t.contract > 0 ? t.billed / t.contract : 0,
      expectedPct: t.contract > 0 ? t.expected / t.contract : 0,
    }
  }, [filtered])

  return (
    <Page
      title="Progress Billings"
      actions={
        <button className="jc-export-btn" onClick={() => navigate("/dashboard")} title="Back to dashboard">
          <ArrowLeft size={14} /> Dashboard
        </button>
      }
    >
      <MotionList className="inv-page-stack">
        <MotionItem>
          {/* invoices-toolbar gives us the padding:0 + overflow:hidden card; its
              own margin-bottom is dropped since inv-page-stack already gaps. */}
          <div className="invoices-toolbar card" style={{ marginBottom: 0 }}>
            <div className="invoices-stats">
              <div className="invoices-stat">
                <span className="invoices-stat-value">{formatMoneyFull(Math.abs(net))}</span>
                <span className="invoices-stat-label">
                  {net < 0 ? "Net Over-billed" : net > 0 ? "Net Under-billed" : "Net (balanced)"}
                </span>
              </div>
              <div className="invoices-stat">
                <span className="invoices-stat-value">{formatMoneyFull(totals.under)}</span>
                <span className="invoices-stat-label">Total Under-billed</span>
              </div>
              <div className="invoices-stat">
                <span className="invoices-stat-value">{formatMoneyFull(totals.over)}</span>
                <span className="invoices-stat-label">Total Over-billed</span>
              </div>
            </div>
          </div>
        </MotionItem>

        <MotionItem>
          <Widget
            loading={isLoading}
            noData={!isLoading && projects.length === 0}
            disconnected={disconnected}
            className="co-widget"
          >
            <div className="co-widget-toolbar">
              <div className="co-search-wrapper">
                <Search size={13} className="co-search-icon" />
                <input
                  className="co-search-input"
                  type="text"
                  placeholder="Search projects..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {pb && (
                <div className="co-count pb-headline-counts">
                  <span className="pb-count pb-count-under">
                    <strong>{pb.underBilledCount}</strong> under
                  </span>
                  <span className={`pb-count ${pb.overBilledCount > 0 ? "pb-count-over" : "pb-count-neutral"}`}>
                    <strong>{pb.overBilledCount}</strong> over
                  </span>
                </div>
              )}
            </div>

            {filtered.length === 0 && search ? (
              <div className="co-no-results body-text text-secondary">No projects match "{search}"</div>
            ) : (
              <div className="co-table-scroll">
                <table className="spend-rank-table" style={{ width: "100%" }}>
                  <thead>
                    <tr>
                      <SortTh col="name" label="Project" fill sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      <SortTh col="contract" label="Contract" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      <SortTh col="budget" label="Budget" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      <SortTh col="cost" label="Cost" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      <SortTh col="billed" label="Billed" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      <SortTh col="expected" label="Earned" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      <SortTh col="variance" label="Over / Under" align="center" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => {
                      const isOver = p.variance < 0
                      const isUnder = p.variance > 0
                      return (
                        <tr
                          key={p.id}
                          className="spend-rank-table-row"
                          role="button"
                          tabIndex={0}
                          title="Open job costing"
                          onClick={() => goToJobcost(p.id)}
                          onKeyDown={(e) => e.key === "Enter" && goToJobcost(p.id)}
                        >
                          <td className="spend-rank-table-name">
                            <div className="body-text emphasized">{p.name}</div>
                            {p.client && <div className="cell-secondary">{p.client}</div>}
                          </td>
                          <td className="spend-rank-table-value body-text">
                            <div>{formatMoneyFull(p.contract)}</div>
                            <div className="cell-secondary">Contract</div>
                          </td>
                          <td className="spend-rank-table-value body-text">
                            <div>{formatMoneyFull(p.budget)}</div>
                            <div className="cell-secondary">Budget</div>
                          </td>
                          <td className="spend-rank-table-value body-text">
                            <div>{formatMoneyFull(p.cost)}</div>
                            <div className="cell-secondary">Cost</div>
                          </td>
                          <td className="spend-rank-table-value body-text">
                            <div>{formatMoneyFull(p.billed)}</div>
                            <div className="cell-secondary">{pct(p.billedPct)} billed</div>
                          </td>
                          <td className="spend-rank-table-value body-text">
                            <div>{formatMoneyFull(p.expected)}</div>
                            <div className="cell-secondary">{pct(p.expectedPct)} complete</div>
                          </td>
                          <td className="spend-rank-table-value body-text pb-overunder-cell">
                            <div className="pb-overunder-inner">
                              <span>{formatMoneyFull(Math.abs(p.variance))}</span>
                              {isOver ? (
                                <span className="pb-dir-pill pb-dir-pill--over">over</span>
                              ) : isUnder ? (
                                <span className="pb-dir-pill pb-dir-pill--under">under</span>
                              ) : (
                                <span className="pb-dir-pill pb-dir-pill--even">even</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="pb-total-row">
                      <td className="spend-rank-table-name body-text emphasized">
                        Total
                        <span className="cell-secondary">
                          {filtered.length} {filtered.length === 1 ? "project" : "projects"}
                        </span>
                      </td>
                      <td className="spend-rank-table-value body-text emphasized">
                        <div>{formatMoneyFull(footer.contract)}</div>
                        <div className="cell-secondary">Contract</div>
                      </td>
                      <td className="spend-rank-table-value body-text emphasized">
                        <div>{formatMoneyFull(footer.budget)}</div>
                        <div className="cell-secondary">Budget</div>
                      </td>
                      <td className="spend-rank-table-value body-text emphasized">
                        <div>{formatMoneyFull(footer.cost)}</div>
                        <div className="cell-secondary">Cost</div>
                      </td>
                      <td className="spend-rank-table-value body-text emphasized">
                        <div>{formatMoneyFull(footer.billed)}</div>
                        <div className="cell-secondary">{pct(footer.billedPct)} billed</div>
                      </td>
                      <td className="spend-rank-table-value body-text emphasized">
                        <div>{formatMoneyFull(footer.expected)}</div>
                        <div className="cell-secondary">{pct(footer.expectedPct)} complete</div>
                      </td>
                      <td className="spend-rank-table-value body-text emphasized pb-overunder-cell">
                        <div className="pb-overunder-inner">
                          <span>{formatMoneyFull(Math.abs(footer.variance))}</span>
                          {footer.variance < 0 ? (
                            <span className="pb-dir-pill pb-dir-pill--over">over</span>
                          ) : footer.variance > 0 ? (
                            <span className="pb-dir-pill pb-dir-pill--under">under</span>
                          ) : (
                            <span className="pb-dir-pill pb-dir-pill--even">even</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Widget>
        </MotionItem>
      </MotionList>
    </Page>
  )
}

export default function ProgressBillingsPage() {
  return (
    <PageDataProvider module="dashboard" queries={PAGE_QUERIES.dashboardProgressBillings}>
      <ProgressBillingsContent />
    </PageDataProvider>
  )
}
