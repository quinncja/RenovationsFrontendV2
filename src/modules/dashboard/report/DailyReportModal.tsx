import { useState } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"
import { useModalLayer } from "../../../shared/hooks/useModalLayer"
import { useCloseOnRouteChange } from "../../../shared/hooks/useCloseOnRouteChange"
import type { ReportMetricKey, ReportPayload } from "./reportTypes"
import { addDays, chicagoToday, dayLabel, rangeLabel, windowToRange } from "./chicagoDate"
import { MetricGrid, MetricGridSkeleton } from "./MetricGrid"
import { MetricDrilldownModal } from "./MetricDrilldownModal"
import Logo from "../../../core/components/Logo"

// "yesterday" on a normal morning, the weekday name after a gap (Monday shows
// Friday; a Saturday login shows Friday too), with the weekend called out when
// the window spans it.
function sinceText(payload: ReportPayload): string {
  const range = windowToRange(payload.window)
  if (payload.window.includesWeekend) return "since Friday morning"
  if (range.from === addDays(chicagoToday(), -1)) return "yesterday"
  return dayLabel(range.from).split(",")[0] // weekday name
}

/**
 * The manual re-open of the daily recap (the header clock button). It mirrors the
 * full-screen arrival — R logo, date, "here's what happened yesterday", then the
 * same sectioned metric grid — minus the greeting and the entrance choreography.
 * The first-run introduction lives on the arrival now, not here.
 */
export function DailyReportModal({
  open,
  payload,
  loading,
  pmScoped = false,
  onClose,
}: {
  open: boolean
  payload: ReportPayload | null
  /** True while a manual (clock-button) open is still fetching. */
  loading: boolean
  /** PM-scoped reports show only Job Activity — used so the skeleton matches. */
  pmScoped?: boolean
  onClose: () => void
}) {
  const { overlayZ, contentZ } = useModalLayer(open)
  const navigate = useNavigate()
  const [metric, setMetric] = useState<ReportMetricKey | null>(null)
  // Mounted app-wide (DailyReportProvider): a drill-down's "View project" can
  // change the route underneath this modal — dismiss it when that happens.
  // The drill-down layers watch the same change and close themselves.
  useCloseOnRouteChange(open, onClose)

  const range = payload ? windowToRange(payload.window) : null
  const subtitle = payload
    ? `Here's what happened ${sinceText(payload)}.`
    : "Here's what happened yesterday."

  return createPortal(
    <>
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
                className={`modal rpt-modal rpt-modal--recap${pmScoped ? " rpt-modal--wide" : ""}`}
                role="dialog"
                aria-modal="true"
                aria-label="Daily recap"
                initial={{ opacity: 0, scale: 0.96, y: 24 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 16 }}
                transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <button className="button modal-close rpt-recap-close" onClick={onClose}>
                  <X size={16} />
                </button>

                <div className="rpt-recap-head">
                  <div className="rpt-recap-logo">
                    <Logo size={44} />
                  </div>
                  <span className="rpt-recap-sub">{subtitle}</span>
                </div>

                <div className="rpt-modal-body">
                  {loading ? (
                    <MetricGridSkeleton pmScoped={pmScoped} />
                  ) : payload ? (
                    <MetricGrid summary={payload.summary} onOpen={setMetric} />
                  ) : (
                    <div className="widget-no-data">
                      <span className="body-text">Couldn't load the report — try again shortly</span>
                    </div>
                  )}
                </div>

                <div className="rpt-modal-footer">
                  <button
                    type="button"
                    className="widget-link-btn"
                    onClick={() => {
                      onClose()
                      navigate("/reports")
                    }}
                  >
                    View past recaps
                  </button>
                  <button type="button" className="primary-button rpt-dismiss" onClick={onClose}>
                    Done
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      <MetricDrilldownModal
        metric={metric}
        items={payload?.items ?? []}
        window={range ?? undefined}
        subtitle={range ? rangeLabel(range) : ""}
        backLabel="Dashboard"
        onClose={() => setMetric(null)}
      />
    </>,
    document.body
  )
}
