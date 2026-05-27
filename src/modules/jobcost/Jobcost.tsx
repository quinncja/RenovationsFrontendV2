import { useState, useMemo, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import Page from "../../shared/components/Page"
import { Widget } from "../../shared/components/Widget/Widget"
import { YearSelector } from "../../shared/components/YearSelector/YearSelector"
import { fetchPageData } from "../../shared/api/pageApi"
import { formatMoneyFull } from "../../shared/utils/format"
import { Search, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react"
import useLocalStorage from "../../shared/hooks/useLocalStorage"

interface Job {
  recnum: number
  jobnum: string
  jobnme: string
  status: number
  contract: number
  totalCost: number
  margin: number
  supervisor: string
}

type SortKey = "jobnme" | "contract" | "totalCost" | "margin" | "supervisor"
type SortDir = "asc" | "desc"

const STATUS_LABELS: Record<number, string> = {
  1: "Bidding",
  2: "Refused",
  3: "Contract",
  4: "Current",
  5: "Complete",
  6: "Closed",
}

export default function Jobcost() {
  const navigate = useNavigate()
  const [year, setYear] = useLocalStorage("jobcostYear", new Date().getFullYear())
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("jobnme")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    fetchPageData({
      module: "jobcost",
      queries: ["getPhases"],
      params: { year },
      signal: controller.signal,
    }).then(result => {
      const data = result.getPhases
      if (Array.isArray(data)) setJobs(data)
      setLoading(false)
    }).catch(err => {
      if (err.name !== "AbortError") setLoading(false)
    })
    return () => controller.abort()
  }, [year])

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
    let list = jobs
    if (q) list = list.filter(j =>
      j.jobnme?.toLowerCase().includes(q) ||
      j.jobnum?.toLowerCase().includes(q) ||
      j.supervisor?.toLowerCase().includes(q)
    )
    list = [...list].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av
      return sortDir === "asc"
        ? String(av ?? "").localeCompare(String(bv ?? ""))
        : String(bv ?? "").localeCompare(String(av ?? ""))
    })
    return list
  }, [jobs, search, sortKey, sortDir])

  return (
    <Page title="Job Costing" actions={<YearSelector value={year} onChange={setYear} />}>
      <Widget loading={loading} noData={!loading && filtered.length === 0}>
        <div className="widget-search">
          <Search size={14} />
          <input
            type="text"
            placeholder="Search jobs..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th onClick={() => toggleSort("jobnme")} className="sortable-header">
                Project <SortIcon col="jobnme" />
              </th>
              <th>Status</th>
              <th onClick={() => toggleSort("supervisor")} className="sortable-header">
                PM <SortIcon col="supervisor" />
              </th>
              <th onClick={() => toggleSort("contract")} className="sortable-header" style={{ textAlign: "right" }}>
                Contract <SortIcon col="contract" />
              </th>
              <th onClick={() => toggleSort("totalCost")} className="sortable-header" style={{ textAlign: "right" }}>
                Cost <SortIcon col="totalCost" />
              </th>
              <th onClick={() => toggleSort("margin")} className="sortable-header" style={{ textAlign: "right" }}>
                Margin <SortIcon col="margin" />
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(job => (
              <tr key={job.recnum} onClick={() => navigate(`/jobcost/${job.recnum}`)} className="clickable-row">
                <td>
                  <div className="cell-primary">{job.jobnme}</div>
                  <div className="cell-secondary">{job.jobnum}</div>
                </td>
                <td><span className={`status-badge status-${job.status}`}>{STATUS_LABELS[job.status] ?? job.status}</span></td>
                <td>{job.supervisor}</td>
                <td style={{ textAlign: "right" }}>{formatMoneyFull(job.contract)}</td>
                <td style={{ textAlign: "right" }}>{formatMoneyFull(job.totalCost)}</td>
                <td style={{ textAlign: "right" }}>{(job.margin * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Widget>
    </Page>
  )
}
