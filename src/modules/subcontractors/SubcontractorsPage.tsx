import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import Page from "../../shared/components/Page"
import { PageDataProvider, useWidgetData } from "../../shared/context/PageContext"
import { PAGE_QUERIES } from "../../shared/config/pageQueries"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { Widget } from "../../shared/components/Widget/Widget"
import { YearSelector } from "../../shared/components/YearSelector/YearSelector"
import { formatMoneyFull } from "../../shared/utils/format"

interface SpendItem { id: string; label: string; value: number; jobCount: number }
type SortKey = "label" | "value" | "jobCount"
type SortDir = "asc" | "desc"

function SortTh({ col, label, align = "left", sortKey, sortDir, onSort }: {
  col: SortKey; label: string; align?: "left" | "right"
  sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void
}) {
  const active = sortKey === col
  const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown
  const thClass = align === "right" ? "spend-rank-table-value" : "spend-rank-table-name"
  return (
    <th className={thClass}>
      <button className={`co-th-btn${align === "right" ? " co-th-btn-right" : ""}${active ? " co-th-btn-active" : ""}`} onClick={() => onSort(col)}>
        {label} <Icon size={11} />
      </button>
    </th>
  )
}

function SubcontractorsContent({ year, setYear }: { year: number | null; setYear: (y: number | null) => void }) {
  const navigate = useNavigate()
  const { data, isLoading } = useWidgetData(["allSubcontractorsBySpend"])
  const items = (data?.["allSubcontractorsBySpend"] as SpendItem[] | null) ?? []

  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("label")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir(key === "label" ? "asc" : "desc") }
  }

  const sorted = useMemo(() => {
    const q = search.toLowerCase()
    const filtered = items.filter(i => i.label.toLowerCase().includes(q))
    return [...filtered].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1
      if (sortKey === "label") return a.label.localeCompare(b.label) * dir
      if (sortKey === "jobCount") return (a.jobCount - b.jobCount) * dir
      return (a.value - b.value) * dir
    })
  }, [items, search, sortKey, sortDir])

  return (
    <Page title="Subcontractors">
      <MotionList className="inv-page-stack">
        <MotionItem>
          <Widget loading={isLoading} noData={!isLoading && items.length === 0} className="co-widget">
            <div className="co-widget-toolbar">
              <div className="co-search-wrapper">
                <Search size={13} className="co-search-icon" />
                <input
                  className="co-search-input"
                  type="text"
                  placeholder="Search subcontractors..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <YearSelector allowAllTime value={year} onChange={setYear} />
              <span className="co-count subheadline text-secondary">
                {sorted.length} {sorted.length === 1 ? "subcontractor" : "subcontractors"}
              </span>
            </div>

            {sorted.length === 0 && search ? (
              <div className="co-no-results body-text text-secondary">No subcontractors match "{search}"</div>
            ) : (
              <table className="spend-rank-table">
                <thead>
                  <tr>
                    <th className="spend-rank-table-num">#</th>
                    <SortTh col="label" label="Subcontractor Name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh col="jobCount" label="Jobs" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh col="value" label="Spend" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((item, i) => (
                    <tr
                      key={item.id}
                      className="spend-rank-table-row"
                      onClick={() => navigate(`/subcontractors/${item.id}`)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => e.key === "Enter" && navigate(`/subcontractors/${item.id}`)}
                    >
                      <td className="spend-rank-table-num subheadline text-secondary">{item.id}</td>
                      <td className="spend-rank-table-name body-text">{item.label}</td>
                      <td className="spend-rank-table-value subheadline text-secondary">{item.jobCount}</td>
                      <td className="spend-rank-table-value body-text emphasized">{formatMoneyFull(item.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Widget>
        </MotionItem>
      </MotionList>
    </Page>
  )
}

export default function SubcontractorsPage() {
  const [year, setYear] = useState<number | null>(null)
  return (
    <PageDataProvider module="subcontractors" queries={PAGE_QUERIES.subcontractors} params={{ year }}>
      <SubcontractorsContent year={year} setYear={setYear} />
    </PageDataProvider>
  )
}
