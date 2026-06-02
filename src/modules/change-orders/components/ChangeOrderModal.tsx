import { createPortal } from "react-dom"
import { useNavigate } from "react-router-dom"
import { X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { formatMoneyFull, formatDate } from "../../../shared/utils/format"
import type { ChangeOrder } from "../types"

const CATEGORIES = [
  { key: "labor", label: "Labor" },
  { key: "material", label: "Material" },
  { key: "subs", label: "Subs" },
  { key: "wtpm", label: "WTPM" },
] as const

interface ChangeOrderModalProps {
  order: ChangeOrder | null
  onClose: () => void
}

export function ChangeOrderModal({ order, onClose }: ChangeOrderModalProps) {
  return createPortal(
    <AnimatePresence>
      {order && (
        <>
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <div className="modal-positioner">
            <motion.div
              className="modal co-modal"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <ChangeOrderModalContent order={order} onClose={onClose} />
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}

function ChangeOrderModalContent({ order, onClose }: { order: ChangeOrder; onClose: () => void }) {
  const navigate = useNavigate()
  const items = order.lineItems ?? []
  const openJobcost = () => {
    if (!order.jobnum) return
    navigate(`/jobcost/${order.jobnum}`)
    onClose()
  }
  const subtotal = order.material + order.labor + order.subs + order.wtpm
  const markup = order.total - subtotal
  const markupPct = subtotal > 0 ? ((markup / subtotal) * 100).toFixed(1) : "0.0"

  return (
    <>
      <div className="modal-header">
        <div className="co-modal-title">
          <h2 className="title2 emphasized">{order.name}</h2>
          {order.jobnum ? (
            <span
              className="co-modal-subtitle co-project-link"
              role="button"
              tabIndex={0}
              title="Open job costing"
              onClick={openJobcost}
              onKeyDown={(e) => e.key === "Enter" && openJobcost()}
            >
              {order.jobString || "No job assigned"} · #{order.jobnum}
            </span>
          ) : (
            <span className="co-modal-subtitle">{order.jobString || "No job assigned"}</span>
          )}
        </div>
        <button className="button modal-close" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="co-modal-totals">
        <div className="co-modal-total">
          <span className="co-modal-total-label">Budget</span>
          <span className="co-modal-total-value">{formatMoneyFull(subtotal)}</span>
        </div>
        <div className="co-modal-total">
          <span className="co-modal-total-label">Markup ({markupPct}%)</span>
          <span className="co-modal-total-value">{formatMoneyFull(markup)}</span>
        </div>
        <div className="co-modal-total co-modal-total-primary">
          <span className="co-modal-total-label">Total Cost</span>
          <span className="co-modal-total-value">{formatMoneyFull(order.total)}</span>
        </div>
      </div>

      <div className="co-modal-body">
        {items.length === 0 ? (
          <p className="table-empty">No line items</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Unit</th>
                {CATEGORIES.map((c) => (
                  <th key={c.key} style={{ textAlign: "right" }}>{c.label}</th>
                ))}
                <th style={{ textAlign: "right" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row, i) => (
                <tr key={i}>
                  <td>{row.desc}</td>
                  <td>{row.unit}</td>
                  {CATEGORIES.map((c) => (
                    <td key={c.key} style={{ textAlign: "right" }}>
                      {row[c.key] ? formatMoneyFull(row[c.key]) : <span className="text-secondary">—</span>}
                    </td>
                  ))}
                  <td style={{ textAlign: "right" }}>{formatMoneyFull(row.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="co-modal-foot">
                <td>Totals</td>
                <td className="text-secondary">{items.length} item{items.length !== 1 ? "s" : ""}</td>
                {CATEGORIES.map((c) => (
                  <td key={c.key} style={{ textAlign: "right" }}>{formatMoneyFull(order[c.key])}</td>
                ))}
                <td style={{ textAlign: "right" }}>{formatMoneyFull(subtotal)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <div className="co-modal-meta">
        <span>Submitted by {order.user || "—"}</span>
        <span>{order.date ? formatDate(order.date) : "—"}</span>
      </div>
    </>
  )
}
