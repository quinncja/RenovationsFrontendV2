import { X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import type { SpendItem } from "../Chart/chart.types"
import { formatMoney } from "../../utils/format"
import { useModalLayer } from "../../hooks/useModalLayer"

interface DrillDownModalProps {
  open: boolean
  onClose: () => void
  title: string
  items: SpendItem[]
  valueFormat?: (v: number) => string
  onItemClick?: (id: string) => void
}

export function DrillDownModal({
  open,
  onClose,
  title,
  items,
  valueFormat = formatMoney,
  onItemClick,
}: DrillDownModalProps) {
  const { overlayZ, contentZ } = useModalLayer(open)
  return (
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
          <motion.div
            className="modal"
            style={{ zIndex: contentZ }}
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <div className="modal-header">
              <h2 className="title2 emphasized">{title}</h2>
              <button className="button modal-close" onClick={onClose}>
                <X size={16} />
              </button>
            </div>
            <ol className="modal-spend-list">
              {items.map((item, i) => (
                <li
                  key={item.id}
                  className={`modal-spend-item${onItemClick ? " modal-spend-item-clickable" : ""}`}
                  onClick={onItemClick ? () => onItemClick(item.id) : undefined}
                >
                  <span className="modal-spend-rank subheadline">{i + 1}</span>
                  <span className="modal-spend-name body-text">{item.label}</span>
                  <span className="modal-spend-value body-text emphasized">
                    {valueFormat(item.value)}
                  </span>
                </li>
              ))}
            </ol>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
