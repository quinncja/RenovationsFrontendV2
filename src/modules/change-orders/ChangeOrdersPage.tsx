import { useState, useEffect, useCallback, useMemo } from "react"
import { useJobcostNav } from "../jobcost/useJobcostNav"
import { Search, Plus, ArrowUpDown, ArrowUp, ArrowDown, Upload } from "lucide-react"
import Page from "../../shared/components/Page"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { Widget } from "../../shared/components/Widget/Widget"
import { YearSelector } from "../../shared/components/YearSelector/YearSelector"
import { fetchPageData } from "../../shared/api/pageApi"
import { formatMoneyFull, formatDate } from "../../shared/utils/format"
import useLocalStorage from "../../shared/hooks/useLocalStorage"
import { useAuth } from "../../core/auth/AuthProvider"
import { effectiveRole } from "../../core/auth/roles"
import type { ChangeOrder } from "./types"
import { coCost, coMarkup, unitsCsv } from "./utils/coMath"
import { ChangeOrderModal, type CreateChangeOrderConfig } from "./components/ChangeOrderModal"

// Same co-widget chrome + spend-rank-table styling the directory list
// pages use. Clicking a row opens the change-order modal, which also owns
// the delete flow (onDeleted → reload). "+ New" (or a file drop) opens the
// same modal in create mode. Managers get the view-only variant: no create
// affordances, no delete.

type SortKey = "name" | "job" | "budget" | "markup" | "total" | "user" | "date"
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

export default function ChangeOrdersPage() {
  const { goToJobcost } = useJobcostNav()
  const { claims } = useAuth()
  const role = effectiveRole(claims["role"] as string | undefined)
  // Managers browse only — no create, no delete (backend enforces both too).
  const canEdit = role !== "manager"
  const [year, setYear] = useLocalStorage("changeOrderYear", new Date().getFullYear())
  const [search, setSearch] = useState("")
  const [orders, setOrders] = useState<ChangeOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<ChangeOrder | null>(null)
  const [creating, setCreating] = useState<CreateChangeOrderConfig | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>("date")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [dragActive, setDragActive] = useState(false)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
    if (!canEdit) return
    const file = e.dataTransfer.files?.[0]
    if (file) setCreating({ file })
  }

  const loadOrders = useCallback(() => {
    setLoading(true)
    fetchPageData({
      module: "changeOrders",
      queries: [],
      params: { year },
    })
      .then((result) => {
        const data = result as unknown
        if (Array.isArray(data)) setOrders(data)
        else if (data && typeof data === "object" && "changeOrders" in (data as Record<string, unknown>)) {
          setOrders((data as { changeOrders: ChangeOrder[] }).changeOrders)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [year])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      // Text → asc, numeric/date → desc.
      setSortDir(key === "name" || key === "job" || key === "user" ? "asc" : "desc")
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const list = q
      ? orders.filter(
          (co) =>
            co.name?.toLowerCase().includes(q) ||
            co.jobString?.toLowerCase().includes(q) ||
            String(co.jobnum ?? "").toLowerCase().includes(q),
        )
      : orders
    return [...list].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1
      if (sortKey === "name") return (a.name ?? "").localeCompare(b.name ?? "") * dir
      if (sortKey === "job") return (a.jobString ?? "").localeCompare(b.jobString ?? "") * dir
      if (sortKey === "user") return (a.user ?? "").localeCompare(b.user ?? "") * dir
      if (sortKey === "budget") return (coCost(a) - coCost(b)) * dir
      if (sortKey === "markup") return (coMarkup(a) - coMarkup(b)) * dir
      if (sortKey === "total") return ((a.total ?? 0) - (b.total ?? 0)) * dir
      // date — string compare works for ISO; both sides may be missing.
      const ad = String(a.date ?? "")
      const bd = String(b.date ?? "")
      return ad.localeCompare(bd) * dir
    })
  }, [orders, search, sortKey, sortDir])

  return (
    <Page
      title="Change Orders"
      actions={
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <YearSelector value={year} onChange={setYear} />
          {canEdit && (
            <button className="button primary-button" onClick={() => setCreating({})}>
              <Plus size={16} /> New
            </button>
          )}
        </div>
      }
    >
      <MotionList className="inv-page-stack">
        <MotionItem>
          <div
            className={`co-dropzone${dragActive ? " co-dropzone-active" : ""}`}
            onDragOver={canEdit ? (e) => {
              e.preventDefault()
              setDragActive(true)
            } : undefined}
            onDragLeave={canEdit ? (e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragActive(false)
            } : undefined}
            onDrop={canEdit ? handleDrop : undefined}
          >
          <Widget loading={loading} noData={!loading && orders.length === 0} className="co-widget">
            <div className="co-widget-toolbar">
              <div className="co-search-wrapper">
                <Search size={13} className="co-search-icon" />
                <input
                  className="co-search-input"
                  type="text"
                  placeholder="Search change orders..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <span className="co-count subheadline text-secondary">
                {filtered.length} {filtered.length === 1 ? "change order" : "change orders"}
              </span>
            </div>

            {filtered.length === 0 && search ? (
              <div className="co-no-results body-text text-secondary">No change orders match "{search}"</div>
            ) : (
              <div className="co-table-scroll">
              <table className="spend-rank-table">
                <thead>
                  <tr>
                    <SortTh col="name" label="Name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh col="job" label="Project" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <th className="spend-rank-table-name">Units</th>
                    <SortTh col="budget" label="Budget" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh col="markup" label="Markup" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh col="total" label="Total Cost" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <th aria-hidden="true" style={{ width: "100%" }} />
                    <SortTh col="user" label="Submitted By" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh col="date" label="Date" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((co) => (
                    <tr
                      key={co.recnum}
                      className="spend-rank-table-row"
                      onClick={() => setSelected(co)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && setSelected(co)}
                    >
                      <td className="spend-rank-table-name body-text" style={{ whiteSpace: "nowrap" }}>{co.name}</td>
                      <td className="spend-rank-table-name">
                        <div
                          className="co-project-link"
                          role="button"
                          tabIndex={0}
                          title="Open job costing"
                          onClick={(e) => {
                            e.stopPropagation()
                            goToJobcost(co.jobnum)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.stopPropagation()
                              goToJobcost(co.jobnum)
                            }
                          }}
                        >
                          <div className="body-text emphasized">{co.jobString}</div>
                          <div className="cell-secondary">#{co.jobnum}</div>
                        </div>
                      </td>
                      <td className="spend-rank-table-name body-text text-secondary" style={{ whiteSpace: "nowrap" }}>{unitsCsv(co)}</td>
                      <td className="spend-rank-table-value body-text">{formatMoneyFull(coCost(co))}</td>
                      <td className="spend-rank-table-value body-text">{formatMoneyFull(coMarkup(co))}</td>
                      <td className="spend-rank-table-value body-text">{formatMoneyFull(co.total)}</td>
                      <td aria-hidden="true" />
                      <td className="spend-rank-table-name body-text text-secondary">{co.user}</td>
                      <td className="spend-rank-table-name subheadline text-secondary">{formatDate(co.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </Widget>
            {dragActive && (
              <div className="co-drop-overlay">
                <Upload size={28} />
                <span className="body-text emphasized">Drop Excel file to create a change order</span>
              </div>
            )}
          </div>
        </MotionItem>
      </MotionList>

      <ChangeOrderModal
        order={selected}
        create={creating}
        onClose={() => {
          setSelected(null)
          setCreating(null)
        }}
        onDeleted={canEdit ? loadOrders : undefined}
        onCreated={loadOrders}
      />
    </Page>
  )
}
