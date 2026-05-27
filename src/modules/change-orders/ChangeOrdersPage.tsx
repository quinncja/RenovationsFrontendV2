import { useState, useEffect, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import Page from "../../shared/components/Page"
import { Widget } from "../../shared/components/Widget/Widget"
import { YearSelector } from "../../shared/components/YearSelector/YearSelector"
import { fetchPageData } from "../../shared/api/pageApi"
import { deleteChangeOrder } from "../../shared/api/mutationApi"
import { formatMoneyFull, formatDate } from "../../shared/utils/format"
import { Search, Plus, Trash2 } from "lucide-react"
import useLocalStorage from "../../shared/hooks/useLocalStorage"

interface ChangeOrder {
  recnum: string
  name: string
  jobName: string
  jobNum: string
  total: number
  status: number
  dateSubmitted: string
  user: string
}

export default function ChangeOrdersPage() {
  const navigate = useNavigate()
  const [year, setYear] = useLocalStorage("changeOrderYear", new Date().getFullYear())
  const [search, setSearch] = useState("")
  const [orders, setOrders] = useState<ChangeOrder[]>([])
  const [loading, setLoading] = useState(true)

  const loadOrders = useCallback(() => {
    setLoading(true)
    fetchPageData({
      module: "changeOrders",
      queries: [],
      params: { year },
    }).then(result => {
      const data = result as unknown
      if (Array.isArray(data)) setOrders(data)
      else if (data && typeof data === "object" && "changeOrders" in (data as Record<string, unknown>)) {
        setOrders((data as { changeOrders: ChangeOrder[] }).changeOrders)
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [year])

  useEffect(() => { loadOrders() }, [loadOrders])

  async function handleDelete(recnum: string) {
    if (!confirm("Delete this change order?")) return
    try {
      await deleteChangeOrder(recnum)
      loadOrders()
    } catch {
      alert("Failed to delete change order")
    }
  }

  const filtered = orders.filter(co => {
    const q = search.toLowerCase()
    if (!q) return true
    return co.name?.toLowerCase().includes(q) ||
           co.jobName?.toLowerCase().includes(q) ||
           co.jobNum?.toLowerCase().includes(q)
  })

  return (
    <Page
      title="Change Orders"
      actions={
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <YearSelector value={year} onChange={setYear} />
          <button className="button primary-button" onClick={() => navigate("/change-orders/new")}>
            <Plus size={16} /> New
          </button>
        </div>
      }
    >
      <Widget loading={loading} noData={!loading && filtered.length === 0}>
        <div className="widget-search">
          <Search size={14} />
          <input
            type="text"
            placeholder="Search change orders..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Project</th>
              <th style={{ textAlign: "right" }}>Total</th>
              <th>Submitted By</th>
              <th>Date</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(co => (
              <tr key={co.recnum}>
                <td>{co.name}</td>
                <td>
                  <div className="cell-primary">{co.jobName}</div>
                  <div className="cell-secondary">{co.jobNum}</div>
                </td>
                <td style={{ textAlign: "right" }}>{formatMoneyFull(co.total)}</td>
                <td>{co.user}</td>
                <td>{formatDate(co.dateSubmitted)}</td>
                <td>
                  <button className="button icon-button danger" onClick={() => handleDelete(co.recnum)} title="Delete">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Widget>
    </Page>
  )
}
