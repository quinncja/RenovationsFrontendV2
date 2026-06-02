import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Search, ArrowUpDown, ArrowUp, ArrowDown, LayoutGrid } from "lucide-react"
import Page from "../../../shared/components/Page"
import { PageDataProvider, useWidgetData } from "../../../shared/context/PageContext"
import { PAGE_QUERIES } from "../../../shared/config/pageQueries"
import { MotionList, MotionItem } from "../../../shared/components/MotionList/MotionList"
import { Widget } from "../../../shared/components/Widget/Widget"
import { YearSelector } from "../../../shared/components/YearSelector/YearSelector"
import { formatMoneyFull } from "../../../shared/utils/format"
import useLocalStorage from "../../../shared/hooks/useLocalStorage"
import { TreemapModal } from "../../../shared/components/TreemapModal/TreemapModal"

// Mirrors ClientsPage — see comments there.

interface Vendor {
  id: string
  label: string
  value: number
  jobCount: number
}

type SortKey = "id" | "label" | "value" | "jobCount"
type SortDir = "asc" | "desc"

function SortTh({ col, label, align = "left", sortKey, sortDir, onSort }: {
  col: SortKey
  label: string
  align?: "left" | "right"
  sortKey: SortKey
  sortDir: SortDir
  onSort: (k: SortKey) => void
}) {
  const active = sortKey === col
  const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown
  const thClass = align === "right" ? "spend-rank-table-value" : "spend-rank-table-name"
  return (
    <th className={thClass}>
      <button
        className={`co-th-btn${align === "right" ? " co-th-btn-right" : ""}${active ? " co-th-btn-active" : ""}`}
        onClick={() => onSort(col)}
      >
        {label} <Icon size={11} />
      </button>
    </th>
  )
}

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
  const [treemapOpen, setTreemapOpen] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>("value")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const { data, isLoading } = useWidgetData<{ allVendorsBySpend: Vendor[] | null }>(["allVendorsBySpend"])
  const items = data?.allVendorsBySpend ?? []

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(key === "label" ? "asc" : "desc")
    }
  }

  const sorted = useMemo(() => {
    const q = search.toLowerCase()
    const filtered = q ? items.filter((v) => v.label?.toLowerCase().includes(q)) : items
    return [...filtered].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1
      if (sortKey === "label") return a.label.localeCompare(b.label) * dir
      if (sortKey === "id") return String(a.id).localeCompare(String(b.id), undefined, { numeric: true }) * dir
      if (sortKey === "jobCount") return (a.jobCount - b.jobCount) * dir
      return (a.value - b.value) * dir
    })
  }, [items, search, sortKey, sortDir])

  const treemapItems = useMemo(
    () => items.map((v) => ({ id: v.id, label: v.label, value: v.value })),
    [items]
  )

  return (
    <Page
      title="Vendors"
      actions={
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <button
            className="button primary-button"
            onClick={() => setTreemapOpen(true)}
            disabled={isLoading || treemapItems.length === 0}
            aria-label="Open treemap"
          >
            <LayoutGrid size={16} /> Treemap
          </button>
          <YearSelector value={year} onChange={onYearChange} allowAllTime />
        </div>
      }
    >
      <MotionList className="inv-page-stack">
        <MotionItem>
          <Widget loading={isLoading} noData={!isLoading && items.length === 0} className="co-widget">
            <div className="co-widget-toolbar">
              <div className="co-search-wrapper">
                <Search size={13} className="co-search-icon" />
                <input
                  className="co-search-input"
                  type="text"
                  placeholder="Search vendors..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <span className="co-count subheadline text-secondary">
                {sorted.length} {sorted.length === 1 ? "vendor" : "vendors"}
              </span>
            </div>

            {sorted.length === 0 && search ? (
              <div className="co-no-results body-text text-secondary">No vendors match "{search}"</div>
            ) : (
              <table className="spend-rank-table">
                <thead>
                  <tr>
                    <th className="spend-rank-table-num">#</th>
                    <SortTh col="label" label="Vendor Name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh col="jobCount" label="Jobs" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh col="value" label="Spend" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((item) => (
                    <tr
                      key={item.id}
                      className="spend-rank-table-row"
                      onClick={() => navigate(`/vendors/${item.id}`)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && navigate(`/vendors/${item.id}`)}
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

      <TreemapModal
        open={treemapOpen}
        onClose={() => setTreemapOpen(false)}
        title="Vendors"
        itemNoun="vendor"
        items={treemapItems}
        year={year}
        onItemClick={(id) => {
          setTreemapOpen(false)
          navigate(`/vendors/${id}`)
        }}
      />
    </Page>
  )
}
