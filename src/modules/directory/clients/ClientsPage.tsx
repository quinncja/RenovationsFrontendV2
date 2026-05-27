import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import Page from "../../../shared/components/Page"
import { PageDataProvider, useWidgetData } from "../../../shared/context/PageContext"
import { PAGE_QUERIES } from "../../../shared/config/pageQueries"
import { YearSelector } from "../../../shared/components/YearSelector/YearSelector"
import { Widget } from "../../../shared/components/Widget/Widget"
import { Search, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react"
import { formatMoneyFull } from "../../../shared/utils/format"
import useLocalStorage from "../../../shared/hooks/useLocalStorage"

interface Client {
  id: number
  name: string
  revenue: number
  jobCount: number
}

type SortKey = "name" | "revenue" | "jobCount"
type SortDir = "asc" | "desc"

export default function ClientsPage() {
  const [year, setYear] = useLocalStorage<number | null>("clientsYear", new Date().getFullYear())

  return (
    <PageDataProvider module="dashboard" queries={PAGE_QUERIES.clients} params={{ year }}>
      <ClientsContent year={year} onYearChange={setYear} />
    </PageDataProvider>
  )
}

function ClientsContent({ year, onYearChange }: { year: number | null; onYearChange: (y: number | null) => void }) {
  const navigate = useNavigate()
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("revenue")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const { data, isLoading } = useWidgetData<{ allClientsByRevenue: Client[] | null }>(["allClientsByRevenue"])

  const clients = data?.allClientsByRevenue

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir("desc") }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown size={12} />
    return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  const filtered = useMemo(() => {
    if (!clients) return []
    const q = search.toLowerCase()
    let list = q ? clients.filter(c => c.name?.toLowerCase().includes(q)) : [...clients]
    list.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av
      return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
    })
    return list
  }, [clients, search, sortKey, sortDir])

  return (
    <Page title="Clients" actions={<YearSelector value={year} onChange={onYearChange} allowAllTime />}>
      <Widget loading={isLoading} noData={!isLoading && filtered.length === 0}>
        <div className="widget-search">
          <Search size={14} />
          <input type="text" placeholder="Search clients..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th onClick={() => toggleSort("name")} className="sortable-header">Client <SortIcon col="name" /></th>
              <th onClick={() => toggleSort("revenue")} className="sortable-header" style={{ textAlign: "right" }}>Revenue <SortIcon col="revenue" /></th>
              <th onClick={() => toggleSort("jobCount")} className="sortable-header" style={{ textAlign: "right" }}>Jobs <SortIcon col="jobCount" /></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id} onClick={() => navigate(`/clients/${c.id}`)} className="clickable-row">
                <td>{c.name}</td>
                <td style={{ textAlign: "right" }}>{formatMoneyFull(c.revenue)}</td>
                <td style={{ textAlign: "right" }}>{c.jobCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Widget>
    </Page>
  )
}
