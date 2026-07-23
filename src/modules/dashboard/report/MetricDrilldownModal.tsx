import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"
import { useModalLayer } from "../../../shared/hooks/useModalLayer"
import { useCloseOnRouteChange } from "../../../shared/hooks/useCloseOnRouteChange"
import { formatMoneyFull } from "../../../shared/utils/format"
import type { RecentChangeItem } from "../widgets/recent/recentTypes"
import type { ReportMetricKey } from "./reportTypes"
import type { DateRange } from "./chicagoDate"
import { metricDef } from "./metricDefs"
import { ActivityFeedRows, useItemDrilldown } from "./ActivityFeed"

/**
 * The list behind one report metric tile: every feed item of that metric's
 * kinds, each drilling on into its detail modal. Stacks above the daily
 * report modal / Reports page via useModalLayer.
 */
export function MetricDrilldownModal({
  metric,
  items,
  window,
  subtitle,
  backLabel,
  blockProjectNav = false,
  onClose,
}: {
  metric: ReportMetricKey | null
  items: RecentChangeItem[]
  window?: DateRange
  /** Window line under the title — "Monday, July 6" etc. */
  subtitle: string
  backLabel: string
  /** Block the drill-down's "View project" jump (the intro walkthrough). */
  blockProjectNav?: boolean
  onClose: () => void
}) {
  const open = metric !== null
  const { overlayZ, contentZ } = useModalLayer(open)
  // The item drill-downs below can navigate ("View project") while this list —
  // mounted above the routes — stays up; a route change dismisses it.
  useCloseOnRouteChange(open, onClose)
  const { openItem, modals } = useItemDrilldown({ backLabel, window, blockProjectNav })

  const def = metric !== null ? metricDef(metric) : null
  const shown = def ? items.filter((i) => def.kinds.includes(i.kind)) : []
  const total = shown.reduce((acc, i) => acc + (i.amount ?? 0), 0)

  return createPortal(
    <>
      <AnimatePresence>
        {open && def && (
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
                className="modal rcnt-modal"
                role="dialog"
                aria-modal="true"
                initial={{ opacity: 0, scale: 0.96, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 16 }}
                transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <div className="modal-header">
                  <div className="rcnt-modal-heading">
                    <h2 className="title2 emphasized">{def.label}</h2>
                    <span className="rcnt-modal-subtitle">{subtitle}</span>
                  </div>
                  <button className="button modal-close" onClick={onClose}>
                    <X size={16} />
                  </button>
                </div>
                <div className="rcnt-modal-body">
                  {shown.length === 0 ? (
                    <div className="widget-no-data">
                      <span className="body-text">Nothing in this window</span>
                    </div>
                  ) : (
                    <section className="rcnt-group">
                      <header className="rcnt-group-head">
                        <span>
                          {shown.length} {shown.length === 1 ? "item" : "items"}
                        </span>
                        {total !== 0 && (
                          <span className="rcnt-group-total">{formatMoneyFull(total)}</span>
                        )}
                      </header>
                      <ActivityFeedRows items={shown} onSelect={openItem} modal />
                    </section>
                  )}
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
      {modals}
    </>,
    document.body
  )
}
