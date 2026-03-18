import { useState, useEffect } from "react"
import { Search, ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react"
import Page from "../../shared/components/Page"
import { Widget } from "../../shared/components/Widget/Widget"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { YearSelector } from "../../shared/components/YearSelector/YearSelector"
import { InvoiceDetailModal } from "../../shared/components/InvoiceDetailModal/InvoiceDetailModal"
import { fetchPageData } from "../../shared/api/pageApi"
import { formatMoneyFull, formatDate } from "../../shared/utils/format"

// ─── Types ────────────────────────────────────────────────────────────────────

interface InvoiceRow {
  id: string
  invoiceNum: string
  type: "AR" | "AP"
  status: number
  invoiceDate: unknown
  total: number
  amountPaid: number
  amountRemaining: number
  description: string | null
  entityName: string | null
}

type TypeFilter   = "all" | "AR" | "AP"
type StatusFilter = "all" | "1" | "2" | "3" | "4" | "5"
type SortCol = "type" | "invoiceNum" | "entityName" | "description" | "invoiceDate" | "status" | "total" | "amountRemaining"
type SortDir = "asc" | "desc"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<number, string> = { 1: "Open", 2: "Review", 3: "Dispute", 4: "Paid", 5: "Void" }
const STATUS_CLASS: Record<number, string> = { 1: "open", 2: "review", 3: "dispute", 4: "paid", 5: "void" }

function statusLabel(n: number) { return STATUS_LABEL[n] ?? `Status ${n}` }
function statusClass(n: number) { return STATUS_CLASS[n] ?? "open" }

function SortHeader({ col, label, active, dir, onSort, className }: {
  col: SortCol; label: string; active: boolean; dir: SortDir; onSort: (c: SortCol) => void; className?: string
}) {
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown
  return (
    <th
      className={`inv-th-sortable${active ? " inv-th-active" : ""}${className ? ` ${className}` : ""}`}
      onClick={() => onSort(col)}
    >
      <span className="inv-th-inner">
        {label}
        <Icon size={12} className="inv-sort-icon" />
      </span>
    </th>
  )
}

function FilterButton({
  active, colorClass, onClick, children,
}: { active: boolean; colorClass?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className={`jc-filter-btn${active ? " active" : ""}${colorClass ? ` ${colorClass}` : ""}`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Invoices() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [search, setSearch] = useState("")
  const [selectedInvoice, setSelectedInvoice] = useState<{ id: string; module: "clients" | "suppliers" } | null>(null)
  const [sortCol, setSortCol] = useState<SortCol>("invoiceDate")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setInvoices([])
    fetchPageData({ module: "invoices", queries: ["allInvoices"], params: { year } })
      .then((data) => { if (!cancelled) setInvoices((data.allInvoices as InvoiceRow[]) ?? []) })
      .catch(() => { if (!cancelled) setInvoices([]) })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [year])

  const filtered = invoices.filter((inv) => {
    if (typeFilter !== "all" && inv.type !== typeFilter) return false
    if (statusFilter !== "all" && inv.status !== parseInt(statusFilter)) return false
    if (search) {
      const q = search.toLowerCase()
      if (
        !inv.invoiceNum.toLowerCase().includes(q) &&
        !(inv.description ?? "").toLowerCase().includes(q) &&
        !(inv.entityName ?? "").toLowerCase().includes(q)
      ) return false
    }
    return true
  })

  const totalBilled      = filtered.reduce((s, i) => s + i.total, 0)
  const totalOutstanding = filtered.reduce((s, i) => s + i.amountRemaining, 0)

  function handleSort(col: SortCol) {
    if (col !== sortCol) { setSortCol(col); setSortDir("asc") }
    else if (sortDir === "asc") setSortDir("desc")
    else { setSortCol("invoiceDate"); setSortDir("desc") }
  }

  const sorted = [...filtered].sort((a, b) => {
    let av: string | number = 0
    let bv: string | number = 0
    if (sortCol === "invoiceDate") {
      av = a.invoiceDate ? new Date(a.invoiceDate as string).getTime() : 0
      bv = b.invoiceDate ? new Date(b.invoiceDate as string).getTime() : 0
    } else if (sortCol === "total" || sortCol === "amountRemaining" || sortCol === "status") {
      av = a[sortCol]
      bv = b[sortCol]
    } else {
      av = (a[sortCol] ?? "").toString().toLowerCase()
      bv = (b[sortCol] ?? "").toString().toLowerCase()
    }
    if (av < bv) return sortDir === "asc" ? -1 : 1
    if (av > bv) return sortDir === "asc" ? 1 : -1
    return 0
  })

  function openModal(inv: InvoiceRow) {
    setSelectedInvoice({
      id: inv.id,
      module: inv.type === "AR" ? "clients" : "suppliers",
    })
  }

  return (
    <Page title="Invoices">
      <MotionList className="inv-page-stack">

        {/* ── 1. Filters + Metrics card ── */}
        <MotionItem>
          <div className="card inv-filter-metrics-card">
            <div className="inv-filter-row">
              <div className="jc-filter-group">
                <span className="jc-filter-label">Type</span>
                <div className="jc-filter-buttons">
                  <FilterButton active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>All</FilterButton>
                  <FilterButton active={typeFilter === "AR"}  onClick={() => setTypeFilter("AR")}  colorClass="inv-filter-ar">AR</FilterButton>
                  <FilterButton active={typeFilter === "AP"}  onClick={() => setTypeFilter("AP")}  colorClass="inv-filter-ap">AP</FilterButton>
                </div>
              </div>

              <div className="jc-filter-group">
                <span className="jc-filter-label">Status</span>
                <div className="jc-filter-buttons">
                  <FilterButton active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>All</FilterButton>
                  <FilterButton active={statusFilter === "1"}   onClick={() => setStatusFilter("1")}>Open</FilterButton>
                  <FilterButton active={statusFilter === "2"}   onClick={() => setStatusFilter("2")} colorClass="inv-filter-review">Review</FilterButton>
                  <FilterButton active={statusFilter === "3"}   onClick={() => setStatusFilter("3")} colorClass="inv-filter-dispute">Dispute</FilterButton>
                  <FilterButton active={statusFilter === "4"}   onClick={() => setStatusFilter("4")} colorClass="inv-filter-paid">Paid</FilterButton>
                <FilterButton active={statusFilter === "5"}   onClick={() => setStatusFilter("5")} colorClass="inv-filter-void">Void</FilterButton>
                </div>
              </div>

              <div className="jc-search-wrapper inv-search-grow">
                <Search size={13} className="jc-search-icon" />
                <input
                  className="jc-search"
                  placeholder="Search invoice #, entity, or description..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <YearSelector value={year} onChange={setYear} />
            </div>

            {isLoading && (
              <div className="inv-metrics-skeleton" />
            )}

            {!isLoading && invoices.length > 0 && (
              <div className="inv-metrics-row">
                <div className="inv-metric">
                  <span className="inv-metric-value">{filtered.length}</span>
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
            )}
          </div>
        </MotionItem>

        {/* ── 3. Table widget ── */}
        <MotionItem>
          <Widget
            title="Invoices"
            loading={isLoading}
            noData={!isLoading && invoices.length === 0}
            className="inv-table-widget"
          >
            {filtered.length === 0 && invoices.length > 0 && (
              <p className="body-text text-secondary" style={{ padding: "2rem 1.25rem", textAlign: "center" }}>
                No invoices match the current filters.
              </p>
            )}

            {filtered.length > 0 && (
              <table className="spend-rank-table inv-table">
                <thead>
                  <tr>
                    <SortHeader col="type"            label="Type"        active={sortCol === "type"}            dir={sortDir} onSort={handleSort} className="inv-th-type" />
                    <SortHeader col="invoiceNum"      label="Invoice #"   active={sortCol === "invoiceNum"}      dir={sortDir} onSort={handleSort} className="inv-th-num" />
                    <SortHeader col="entityName"      label="Entity"      active={sortCol === "entityName"}      dir={sortDir} onSort={handleSort} />
                    <SortHeader col="description"     label="Description" active={sortCol === "description"}     dir={sortDir} onSort={handleSort} />
                    <SortHeader col="invoiceDate"     label="Date"        active={sortCol === "invoiceDate"}     dir={sortDir} onSort={handleSort} className="inv-th-date" />
                    <SortHeader col="status"          label="Status"      active={sortCol === "status"}          dir={sortDir} onSort={handleSort} className="inv-th-status" />
                    <SortHeader col="total"           label="Total"       active={sortCol === "total"}           dir={sortDir} onSort={handleSort} className="spend-rank-table-value" />
                    <SortHeader col="amountRemaining" label="Remaining"   active={sortCol === "amountRemaining"} dir={sortDir} onSort={handleSort} className="spend-rank-table-value" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((inv) => (
                    <tr
                      key={`${inv.type}-${inv.id}`}
                      className="spend-rank-table-row"
                      onClick={() => openModal(inv)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && openModal(inv)}
                    >
                      <td className="spend-rank-table-name inv-th-type">
                        <span className={`inv-type-badge inv-type-badge--${inv.type.toLowerCase()}`}>{inv.type}</span>
                      </td>
                      <td className="spend-rank-table-name body-text emphasized inv-th-num">{inv.invoiceNum}</td>
                      <td className="spend-rank-table-name body-text">{inv.entityName || "—"}</td>
                      <td className="spend-rank-table-name body-text text-secondary inv-td-desc">{inv.description || "—"}</td>
                      <td className="spend-rank-table-name body-text text-secondary inv-th-date">{formatDate(inv.invoiceDate)}</td>
                      <td className="spend-rank-table-name inv-th-status">
                        <span className={`invoice-status-badge invoice-status-badge--${statusClass(inv.status)}`}>
                          {statusLabel(inv.status)}
                        </span>
                      </td>
                      <td className="spend-rank-table-value body-text emphasized">{formatMoneyFull(inv.total)}</td>
                      <td className="spend-rank-table-value body-text invoice-amount-value--remaining">{formatMoneyFull(inv.amountRemaining)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Widget>
        </MotionItem>

      </MotionList>

      <InvoiceDetailModal
        invoiceId={selectedInvoice?.id ?? null}
        module={selectedInvoice?.module ?? "clients"}
        onClose={() => setSelectedInvoice(null)}
      />
    </Page>
  )
}
