import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Search, Plus, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Upload } from "lucide-react"
import Page from "../../shared/components/Page"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { Widget } from "../../shared/components/Widget/Widget"
import { YearSelector } from "../../shared/components/YearSelector/YearSelector"
import { fetchPageData } from "../../shared/api/pageApi"
import { deleteChangeOrder } from "../../shared/api/mutationApi"
import { formatMoneyFull, formatDate } from "../../shared/utils/format"
import useLocalStorage from "../../shared/hooks/useLocalStorage"
import type { ChangeOrder } from "./types"
import { ChangeOrderModal } from "./components/ChangeOrderModal"
import { ConfirmModal } from "../../shared/components/ConfirmModal/ConfirmModal"

// Same co-widget chrome + spend-rank-table styling the directory list
// pages use. Action column on the right preserves the per-row delete
// button; clicking the row body opens the change-order modal.

type SortKey = "name" | "job" | "budget" | "markup" | "total" | "user" | "date"
type SortDir = "asc" | "desc"

// Unique, non-empty unit #s across a change order's line items, as CSV.
function unitsCsv(co: ChangeOrder): string {
  const units = Array.from(
    new Set((co.lineItems ?? []).map((li) => String(li.unit ?? "").trim()).filter(Boolean)),
  )
  return units.length ? units.join(", ") : "—"
}

// Cost (a.k.a. budget) = the line-item subtotal before markup; markup = total − cost.
function coCost(co: ChangeOrder): number {
  return (co.material ?? 0) + (co.labor ?? 0) + (co.subs ?? 0) + (co.wtpm ?? 0)
}
function coMarkup(co: ChangeOrder): number {
  return (co.total ?? 0) - coCost(co)
}

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
  const navigate = useNavigate()
  const [year, setYear] = useLocalStorage("changeOrderYear", new Date().getFullYear())
  const [search, setSearch] = useState("")
  const [orders, setOrders] = useState<ChangeOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<ChangeOrder | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ChangeOrder | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("date")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Both the "+ New" button and a file drop hand the chosen file to the
  // upload flow, which parses it on arrival.
  const startUpload = useCallback(
    (file: File) => navigate("/change-orders/new", { state: { file } }),
    [navigate],
  )

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = "" // let the same file be picked again next time
    if (file) startUpload(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file) startUpload(file)
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

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    setDeleteError("")
    try {
      await deleteChangeOrder(pendingDelete.recnum)
      setPendingDelete(null)
      loadOrders()
    } catch {
      setDeleteError("Failed to delete change order. Please try again.")
    } finally {
      setDeleting(false)
    }
  }

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
          <button className="button primary-button" onClick={() => fileInputRef.current?.click()}>
            <Plus size={16} /> New
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: "none" }}
            onChange={handleFilePick}
          />
        </div>
      }
    >
      <MotionList className="inv-page-stack">
        <MotionItem>
          <div
            className={`co-dropzone${dragActive ? " co-dropzone-active" : ""}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragActive(false)
            }}
            onDrop={handleDrop}
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
                    <th className="spend-rank-table-name" style={{ width: 40 }} aria-label="Actions" />
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
                            navigate(`/jobcost/${co.jobnum}`)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.stopPropagation()
                              navigate(`/jobcost/${co.jobnum}`)
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
                      <td className="spend-rank-table-name">
                        <button
                          className="button icon-button danger"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteError("")
                            setPendingDelete(co)
                          }}
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
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

      <ChangeOrderModal order={selected} onClose={() => setSelected(null)} />

      <ConfirmModal
        open={!!pendingDelete}
        title="Delete change order?"
        message={
          pendingDelete ? (
            <>
              This will permanently delete <strong>{pendingDelete.name}</strong>
              {pendingDelete.jobString ? <> for {pendingDelete.jobString}</> : null}. This can't be undone.
            </>
          ) : null
        }
        confirmLabel="Delete"
        danger
        loading={deleting}
        error={deleteError || undefined}
        onConfirm={confirmDelete}
        onCancel={() => {
          setPendingDelete(null)
          setDeleteError("")
        }}
      />
    </Page>
  )
}
