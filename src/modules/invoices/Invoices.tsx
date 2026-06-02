import { useState, useEffect, useMemo, type CSSProperties } from "react"
import Page from "../../shared/components/Page"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { Widget } from "../../shared/components/Widget/Widget"
import { YearSelector } from "../../shared/components/YearSelector/YearSelector"
import { InvoiceDetailModal } from "../../shared/components/InvoiceDetailModal/InvoiceDetailModal"
import { SortableHeader } from "../../shared/components/SortableHeader"
import { useTableSort, applySort } from "../../shared/hooks/useTableSort"
import { fetchPageData } from "../../shared/api/pageApi"
import { formatMoneyFull, formatDate } from "../../shared/utils/format"
import { Search } from "lucide-react"
import useLocalStorage from "../../shared/hooks/useLocalStorage"

// Shape returned by the `allInvoices` query (AR + AP unioned).
interface Invoice {
  id: string
  invoiceNum: string
  type: "AR" | "AP"
  status: number
  invoiceDate: string
  total: number
  amountPaid: number
  amountRemaining: number
  description: string | null
  entityName: string | null
}

const INVOICE_STATUS: Record<number, string> = {
  1: "Open",
  2: "Review",
  3: "Dispute",
  4: "Paid",
  5: "Void",
}
const INVOICE_STATUS_CLASS: Record<number, string> = {
  1: "open",
  2: "review",
  3: "dispute",
  4: "paid",
  5: "void",
}

type TypeFilter = "all" | "AR" | "AP"
type StatusFilter = "all" | number

const TYPE_FILTERS: { key: TypeFilter; label: string; color: string }[] = [
  { key: "all", label: "All", color: "var(--primary-color)" },
  { key: "AR", label: "AR", color: "#22c55e" },
  { key: "AP", label: "AP", color: "#ef4444" },
]

const STATUS_FILTERS: { key: StatusFilter; label: string; color: string }[] = [
  { key: "all", label: "All", color: "var(--primary-color)" },
  { key: 1, label: "Open", color: "#3b82f6" },
  { key: 2, label: "Review", color: "#d97706" },
  { key: 3, label: "Dispute", color: "#dc2626" },
  { key: 4, label: "Paid", color: "#22c55e" },
  { key: 5, label: "Void", color: "#6b7280" },
]

type SortKey = "type" | "invoiceDate" | "total" | "entityName" | "status"

function FilterPills<T extends string | number>({
  label, options, value, onChange,
}: {
  label: string
  options: { key: T; label: string; color: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="invoices-filter-group">
      <span className="invoices-filter-label">{label}</span>
      <div className="filter-pills">
        {options.map((opt) => (
          <button
            key={String(opt.key)}
            type="button"
            className={`filter-pill${value === opt.key ? " filter-pill--active" : ""}`}
            style={{ "--pill": opt.color } as CSSProperties}
            onClick={() => onChange(opt.key)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function Invoices() {
  const [year, setYear] = useLocalStorage("invoicesYear", new Date().getFullYear())
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const sort = useTableSort<SortKey>("invoiceDate", "desc")
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Invoice | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    fetchPageData({
      module: "invoices",
      queries: ["allInvoices"],
      params: { year },
      signal: controller.signal,
    }).then(result => {
      const data = result.allInvoices
      if (Array.isArray(data)) setInvoices(data as Invoice[])
      setLoading(false)
    }).catch(err => {
      if (err.name !== "AbortError") setLoading(false)
    })
    return () => controller.abort()
  }, [year])

  // Type + status define the "scope" the summary stats describe.
  const scoped = useMemo(() => {
    return invoices.filter(inv => {
      if (typeFilter !== "all" && inv.type !== typeFilter) return false
      if (statusFilter !== "all" && inv.status !== statusFilter) return false
      return true
    })
  }, [invoices, typeFilter, statusFilter])

  const stats = useMemo(() => ({
    count: scoped.length,
    totalBilled: scoped.reduce((s, i) => s + (i.total || 0), 0),
    outstanding: scoped.reduce((s, i) => s + (i.amountRemaining || 0), 0),
  }), [scoped])

  // Text search narrows the table only (not the headline stats).
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    let list = scoped
    if (q) list = list.filter(inv =>
      inv.entityName?.toLowerCase().includes(q) ||
      inv.invoiceNum?.toLowerCase().includes(q) ||
      inv.description?.toLowerCase().includes(q)
    )
    return applySort(list, sort, (inv, key) => inv[key])
  }, [scoped, search, sort])

  return (
    <Page
      title="Invoices"
      actions={<YearSelector value={year} onChange={setYear} />}
    >
      <MotionList className="inv-page-stack">
        <MotionItem>
      <div className="invoices-toolbar card">
        <div className="invoices-filter-row">
          <FilterPills label="Type" options={TYPE_FILTERS} value={typeFilter} onChange={setTypeFilter} />
          <FilterPills label="Status" options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />
          <div className="invoices-search">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search invoice #, entity, or description..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="invoices-stats">
          <div className="invoices-stat">
            <span className="invoices-stat-value">{stats.count.toLocaleString()}</span>
            <span className="invoices-stat-label">Invoices</span>
          </div>
          <div className="invoices-stat">
            <span className="invoices-stat-value">{formatMoneyFull(stats.totalBilled)}</span>
            <span className="invoices-stat-label">Total Billed</span>
          </div>
          <div className="invoices-stat">
            <span className="invoices-stat-value">{formatMoneyFull(stats.outstanding)}</span>
            <span className="invoices-stat-label">Outstanding</span>
          </div>
        </div>
      </div>
        </MotionItem>

        <MotionItem>
      <Widget loading={loading} noData={!loading && invoices.length === 0}>
        <table className="data-table">
          <thead>
            <tr>
              <SortableHeader label="Type" columnKey="type" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
              <th>Number</th>
              <SortableHeader label="Client / Vendor" columnKey="entityName" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
              <SortableHeader label="Date" columnKey="invoiceDate" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
              <SortableHeader label="Amount" columnKey="total" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
              <SortableHeader label="Status" columnKey="status" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
            </tr>
          </thead>
          <tbody>
            {filtered.map(inv => (
              <tr key={inv.id} className="clickable-row" onClick={() => setSelected(inv)}>
                <td><span className={`inv-type-badge inv-type-badge--${inv.type.toLowerCase()}`}>{inv.type}</span></td>
                <td>{inv.invoiceNum}</td>
                <td>{inv.entityName || "—"}</td>
                <td>{formatDate(inv.invoiceDate)}</td>
                <td style={{ textAlign: "right" }}>{formatMoneyFull(inv.total)}</td>
                <td>
                  <span className={`invoice-status-badge invoice-status-badge--${INVOICE_STATUS_CLASS[inv.status] ?? "open"}`}>
                    {INVOICE_STATUS[inv.status] ?? `Status ${inv.status}`}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && filtered.length === 0 && (
          <div className="table-empty">No invoices match your filters</div>
        )}
      </Widget>
        </MotionItem>
      </MotionList>

      <InvoiceDetailModal
        invoiceId={selected ? String(selected.id) : null}
        module={selected?.type === "AP" ? "suppliers" : "clients"}
        onClose={() => setSelected(null)}
      />
    </Page>
  )
}
