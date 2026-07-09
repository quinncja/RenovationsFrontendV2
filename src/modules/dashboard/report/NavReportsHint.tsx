import { useLayoutEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useDailyReport } from "./DailyReportContext"

/**
 * Second intro coachmark (step 2): a popover anchored to the "Reports" nav item,
 * shown once the clock spotlight (step 1) is closed. It teaches that the nav item
 * opens reports for past periods. Positioned by measuring the nav button
 * (`[data-nav="/reports"]`) and sitting to its right, vertically centered — so it
 * tracks the item whether the sidebar is collapsed or expanded. Dismissed via
 * "Got it" (advanceIntro → done) or by navigating to /reports (cleared upstream).
 */
export function NavReportsHint() {
  const { introStep, advanceIntro } = useDailyReport()
  const active = introStep === 2
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!active) {
      setPos(null)
      return
    }
    const measure = () => {
      const el = document.querySelector<HTMLElement>('[data-nav="/reports"]')
      if (!el) {
        setPos(null)
        return
      }
      const r = el.getBoundingClientRect()
      setPos({ top: r.top + r.height / 2, left: r.right + 12 })
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [active])

  if (!active || !pos) return null

  return createPortal(
    <div
      className="nav-hint"
      role="dialog"
      aria-label="Reports shortcut"
      style={{ top: pos.top, left: pos.left }}
    >
      <span className="nav-hint-arrow" aria-hidden="true" />
      <p className="gear-hint-body">
        To view activity reports from other time periods, click here.
      </p>
      <button type="button" className="gear-hint-dismiss" onClick={advanceIntro}>
        Got it
      </button>
    </div>,
    document.body
  )
}
