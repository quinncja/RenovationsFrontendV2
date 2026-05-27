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

interface Vendor { id: number; name: string; spend: number; jobCount: number }
type SortKey = "name" | "spend" | "jobCount"
type SortDir = "asc" | "desc"

export default function VendorsPage() {
  const [year, setYear] = useLocalStorage<number | null>("vendorsYear", new Date().getFullYear())
  return (
    <PageDataProvider module="dashboard" queries={PAGE_QUERIES.vendors} params={{ year }}>
      <VendorsContent year={year} onYearChange={setYear} />
    </PageDataProvider>
  )
}

function VendorsContent({ year, onYearChange }: { year: number | null; onYearChange: (y: number | null) => void }) {
  const navigate = useNavigate()
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("spend")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const { data, isLoading } = useWidgetData<{ allVendorsBySpend: Vendor[] | null }>(["allVendorsBySpend"])
  const vendors = data?.allVendorsBySpend

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir("desc") }
  }
  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown size={12} />
    return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  const filtered = useMemo(() => {
    if (!vendors) return []
    const q = search.toLowerCase()
    let list = q ? vendors.filter(v => v.name?.toLowerCase().includes(q)) : [...vendors]
    list.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av
      return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
    })
    return list
  }, [vendors, search, sortKey, sortDir])

  return (
    <Page title="Vendors" actions={<YearSelector value={year} onChange={onYearChange} allowAllTime />}>
      <Widget loading={isLoading} noData={!isLoading && filtered.length === 0}>
        <div className="widget-search"><Search size={14} /><input type="text" placeholder="Search vendors..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        <table className="data-table">
          <thead><tr>
            <th onClick={() => toggleSort("name")} className="sortable-header">Vendor <SortIcon col="name" /></th>
            <th onClick={() => toggleSort("spend")} className="sortable-header" style={{ textAlign: "right" }}>Spend <SortIcon col="spend" /></th>
            <th onClick={() => toggleSort("jobCount")} className="sortable-header" style={{ textAlign: "right" }}>Jobs <SortIcon col="jobCount" /></th>
          </tr></thead>
          <tbody>
            {filtered.map(v => (
              <tr key={v.id} onClick={() => navigate(`/vendors/${v.id}`)} className="clickable-row">
                <td>{v.name}</td>
                <td style={{ textAlign: "right" }}>{formatMoneyFull(v.spend)}</td>
                <td style={{ textAlign: "right" }}>{v.jobCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Widget>
    </Page>
  )
}
