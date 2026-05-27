import { useState, useEffect, useMemo } from "react"
import Page from "../../shared/components/Page"
import { Widget } from "../../shared/components/Widget/Widget"
import { YearSelector } from "../../shared/components/YearSelector/YearSelector"
import { InvoiceDetailModal } from "../../shared/components/InvoiceDetailModal/InvoiceDetailModal"
import { fetchPageData } from "../../shared/api/pageApi"
import { formatMoneyFull, formatDate } from "../../shared/utils/format"
import { Search, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react"
import useLocalStorage from "../../shared/hooks/useLocalStorage"

interface Invoice {
  id: number
  number: string
  date: string
  amount: number
  client: string
  status: string
  type: string
}

type SortKey = "date" | "amount" | "client"
type SortDir = "asc" | "desc"

export default function Invoices() {
  const [year, setYear] = useLocalStorage("invoicesYear", new Date().getFullYear())
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("date")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)

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
      if (Array.isArray(data)) setInvoices(data)
      setLoading(false)
    }).catch(err => {
      if (err.name !== "AbortError") setLoading(false)
    })
    return () => controller.abort()
  }, [year])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir("desc") }
  }
  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown size={12} />
    return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    let list = invoices
    if (q) list = list.filter(inv =>
      inv.client?.toLowerCase().includes(q) ||
      inv.number?.toLowerCase().includes(q)
    )
    list = [...list].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av
      return sortDir === "asc" ? String(av ?? "").localeCompare(String(bv ?? "")) : String(bv ?? "").localeCompare(String(av ?? ""))
    })
    return list
  }, [invoices, search, sortKey, sortDir])

  return (
    <Page title="Invoices" actions={<YearSelector value={year} onChange={setYear} />}>
      <Widget loading={loading} noData={!loading && filtered.length === 0}>
        <div className="widget-search">
          <Search size={14} />
          <input type="text" placeholder="Search invoices..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Number</th>
              <th onClick={() => toggleSort("client")} className="sortable-header">Client <SortIcon col="client" /></th>
              <th onClick={() => toggleSort("date")} className="sortable-header">Date <SortIcon col="date" /></th>
              <th onClick={() => toggleSort("amount")} className="sortable-header" style={{ textAlign: "right" }}>Amount <SortIcon col="amount" /></th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(inv => (
              <tr key={inv.id} className="clickable-row" onClick={() => setSelectedInvoiceId(String(inv.id))}>
                <td>{inv.number}</td>
                <td>{inv.client}</td>
                <td>{formatDate(inv.date)}</td>
                <td style={{ textAlign: "right" }}>{formatMoneyFull(inv.amount)}</td>
                <td><span className="status-badge">{inv.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Widget>

      <InvoiceDetailModal
        invoiceId={selectedInvoiceId}
        module="clients"
        onClose={() => setSelectedInvoiceId(null)}
      />
    </Page>
  )
}
