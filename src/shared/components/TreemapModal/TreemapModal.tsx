import { X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { Treemap, type TreemapItem } from "../Treemap/Treemap"
import { Metric, MetricDivider } from "../CollapsibleSection/CollapsibleSection"
import { formatMoney } from "../../utils/format"

// Modal host for the directory treemap. The header reuses the same Metric /
// MetricDivider chips the directory detail pages use for their Projects /
// Invoices section rollups, so the treemap modal reads as part of the same
// design system. Period label is the active list-page year, or
// "Since 2018" for All Time (matches the old RD wording — RD's backend
// data floor is 2018).

interface TreemapModalProps {
  open: boolean
  onClose: () => void
  /** Heading shown in the modal header, e.g. "Clients". */
  title: string
  /** Singular noun for the count chip, e.g. "client" → "12 Clients". */
  itemNoun: string
  /** Items to plot. The modal computes the total and count itself. */
  items: TreemapItem[]
  /** Year the list query was filtered to. `null` = All Time. */
  year: number | null
  /** Click on a tile — typically a `navigate(`/clients/${id}`)`. */
  onItemClick?: (id: string) => void
}

export function TreemapModal({
  open,
  onClose,
  title,
  itemNoun,
  items,
  year,
  onItemClick,
}: TreemapModalProps) {
  const total = items.reduce((s, i) => s + (i.value ?? 0), 0)
  const count = items.length
  const periodLabel = year != null ? String(year) : "Since 2018"
  // Capitalize the noun for the chip label ("Clients", "Vendors", etc.) so
  // the metric labels match the visual weight of "Total" and "Period".
  const countLabel = `${itemNoun.charAt(0).toUpperCase()}${itemNoun.slice(1)}${count === 1 ? "" : "s"}`

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          {/* `.modal-positioner` centers via flexbox so framer-motion's
              scale/y animation doesn't clobber the base `.modal` rule's
              `transform: translate(-50%, -50%)`. */}
          <div className="modal-positioner">
            <motion.div
              className="modal treemap-modal"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <div className="treemap-modal-header">
                <div className="treemap-modal-title-row">
                  <h2 className="treemap-modal-title title2 emphasized">{title}</h2>
                  <button
                    className="button modal-close"
                    onClick={onClose}
                    aria-label="Close treemap"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="treemap-modal-metrics">
                  <div className="inv-metrics-row">
                    <Metric value={count} label={countLabel} />
                    <MetricDivider />
                    <Metric value={formatMoney(total)} label="Total" />
                    <MetricDivider />
                    <Metric value={periodLabel} label="Year" />
                  </div>
                </div>
              </div>
              <Treemap
                items={items}
                totalSum={total}
                rootName={`All ${title}`}
                onNodeClick={onItemClick}
              />
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
