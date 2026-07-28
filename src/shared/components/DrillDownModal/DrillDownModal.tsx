import { useMemo } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { SortableHeader } from "../SortableHeader"
import { useTableSort, applySort } from "../../hooks/useTableSort"
import { formatMoneyFull } from "../../utils/format"
import { useModalLayer } from "../../hooks/useModalLayer"

// One line in a spending drill-down: a party or line item with its
// committed / posted split. `sub` renders as inline secondary text after the
// label (same voice as the Progress Billings modal's "name · client").
export interface DrillRow {
  id: string
  label: string
  sub?: string
  committed: number
  posted: number
}

interface DrillDownModalProps {
  open: boolean
  onClose: () => void
  title: string
  /** Header line under the title, e.g. "6 vendors · $128,400 total". */
  subtitle?: string
  /** First column's header — "Vendor / Source" or "Description". */
  labelHeader: string
  rows: DrillRow[]
  /** Rows become clickable drill-throughs when provided. */
  onRowClick?: (id: string) => void
}

type DrillSortKey = "label" | "committed" | "posted" | "total"

/**
 * Spending drill-down in the app's standard reports-modal shape (matching the
 * dashboard's Progress Billings "Net Under-billed" breakdown): title +
 * reconciling subtitle, a sortable data table, and a footer total row.
 */
export function DrillDownModal({
  open,
  onClose,
  title,
  subtitle,
  labelHeader,
  rows,
  onRowClick,
}: DrillDownModalProps) {
  const { overlayZ, contentZ } = useModalLayer(open)
  // Largest total first — the pie slice the user clicked reads top-down.
  const sort = useTableSort<DrillSortKey>("total", "desc")
  const sorted = useMemo(
    () =>
      applySort(rows, sort, (r, key) =>
        key === "label" ? r.label : key === "total" ? r.committed + r.posted : r[key]
      ),
    [rows, sort]
  )

  let totalCommitted = 0
  let totalPosted = 0
  for (const r of rows) {
    totalCommitted += r.committed
    totalPosted += r.posted
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="modal-overlay"
            style={{ zIndex: overlayZ }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <div className="modal-positioner" style={{ zIndex: contentZ }}>
            <motion.div
              className="modal reports-modal"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <div className="modal-header">
                <div className="reports-modal-title">
                  <div>
                    <h2 className="title2 emphasized">{title}</h2>
                    {subtitle && <span className="reports-modal-subtitle">{subtitle}</span>}
                  </div>
                </div>
                <button className="button modal-close" onClick={onClose}>
                  <X size={16} />
                </button>
              </div>

              <div className="reports-modal-body">
                {rows.length === 0 ? (
                  <p className="reports-modal-empty body-text text-secondary">Nothing to show.</p>
                ) : (
                  <table className="data-table billings-invoice-table">
                    <thead>
                      <tr>
                        <SortableHeader label={labelHeader} columnKey="label" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                        <SortableHeader label="Committed" columnKey="committed" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
                        <SortableHeader label="Posted" columnKey="posted" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
                        <SortableHeader label="Total" columnKey="total" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((r) => (
                        <tr
                          key={r.id}
                          className={onRowClick ? "clickable-row" : undefined}
                          onClick={onRowClick ? () => onRowClick(r.id) : undefined}
                          role={onRowClick ? "button" : undefined}
                          tabIndex={onRowClick ? 0 : undefined}
                          onKeyDown={onRowClick ? (e) => e.key === "Enter" && onRowClick(r.id) : undefined}
                        >
                          <td>
                            {r.label}
                            {r.sub && <span className="text-secondary"> · {r.sub}</span>}
                          </td>
                          <td className="num text-secondary">{r.committed ? formatMoneyFull(r.committed) : "—"}</td>
                          <td className="num text-secondary">{r.posted ? formatMoneyFull(r.posted) : "—"}</td>
                          <td className="num">{formatMoneyFull(r.committed + r.posted)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td>Total</td>
                        <td className="num">{totalCommitted ? formatMoneyFull(totalCommitted) : "—"}</td>
                        <td className="num">{totalPosted ? formatMoneyFull(totalPosted) : "—"}</td>
                        <td className="num">{formatMoneyFull(totalCommitted + totalPosted)}</td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
