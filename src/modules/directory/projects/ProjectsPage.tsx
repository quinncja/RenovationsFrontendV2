import { useState, useMemo, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import Page from "../../../shared/components/Page"
import { Widget } from "../../../shared/components/Widget/Widget"
import { fetchPageData } from "../../../shared/api/pageApi"
import { Search, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react"
import { formatMoneyFull } from "../../../shared/utils/format"

interface Project {
  recnum: number
  jobnum: string
  jobnme: string
  status: number
  contract: number
  supervisor: string
}

type SortKey = "jobnme" | "contract" | "supervisor"
type SortDir = "asc" | "desc"

const STATUS_LABELS: Record<number, string> = {
  1: "Bidding", 2: "Refused", 3: "Contract", 4: "Current", 5: "Complete", 6: "Closed",
}

export default function ProjectsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("jobnme")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPageData({ module: "projects", queries: ["homeProjectList"], params: {} })
      .then(result => {
        const data = result.homeProjectList
        if (Array.isArray(data)) setProjects(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir("asc") }
  }
  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown size={12} />
    return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    let list = projects
    if (q) list = list.filter(p => p.jobnme?.toLowerCase().includes(q) || p.jobnum?.toLowerCase().includes(q) || p.supervisor?.toLowerCase().includes(q))
    list = [...list].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av
      return sortDir === "asc" ? String(av ?? "").localeCompare(String(bv ?? "")) : String(bv ?? "").localeCompare(String(av ?? ""))
    })
    return list
  }, [projects, search, sortKey, sortDir])

  return (
    <Page title="Projects">
      <Widget loading={loading} noData={!loading && filtered.length === 0}>
        <div className="widget-search"><Search size={14} /><input type="text" placeholder="Search projects..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        <table className="data-table">
          <thead><tr>
            <th onClick={() => toggleSort("jobnme")} className="sortable-header">Project <SortIcon col="jobnme" /></th>
            <th>Status</th>
            <th onClick={() => toggleSort("supervisor")} className="sortable-header">PM <SortIcon col="supervisor" /></th>
            <th onClick={() => toggleSort("contract")} className="sortable-header" style={{ textAlign: "right" }}>Contract <SortIcon col="contract" /></th>
          </tr></thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.recnum} onClick={() => navigate(`/jobcost/${p.recnum}`)} className="clickable-row">
                <td><div className="cell-primary">{p.jobnme}</div><div className="cell-secondary">{p.jobnum}</div></td>
                <td><span className={`status-badge status-${p.status}`}>{STATUS_LABELS[p.status] ?? p.status}</span></td>
                <td>{p.supervisor}</td>
                <td style={{ textAlign: "right" }}>{formatMoneyFull(p.contract)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Widget>
    </Page>
  )
}
