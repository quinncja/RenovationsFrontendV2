import { Clock } from "lucide-react"
import { useDailyReport } from "./DailyReportContext"

/**
 * Header clock button that re-opens the daily report.
 *
 * On its first run the intro arrival hands off to the dashboard and arms the
 * coachmark sequence (`introStep === 1`): DailyReportCoach drops a blurred,
 * dimmed layer over the page, and THIS button lifts itself above that layer
 * (`.rpt-btn-anchor--coach`, z above the coach) so the REAL clock — not a mock —
 * stands out crisp, pulses, and carries its teaching hint. Clicking the clock or
 * "Got it" advances to step 2 (the Reports nav hint), leaving the same button in
 * the same spot.
 */
export function DailyReportButton() {
  const { open, introStep, advanceIntro } = useDailyReport()
  const coaching = introStep === 1

  return (
    <span className={`rpt-btn-anchor${coaching ? " rpt-btn-anchor--coach" : ""}`}>
      <button
        className="btn-icon rpt-btn"
        aria-label="Daily recap"
        title="Daily recap"
        onClick={coaching ? advanceIntro : open}
      >
        <Clock size={18} />
      </button>
      {coaching && (
        <div className="report-hint" role="dialog" aria-label="Daily report shortcut">
          <span className="report-hint-arrow" aria-hidden="true" />
          <p className="gear-hint-body">To view the report again, click here.</p>
          <button type="button" className="gear-hint-dismiss" onClick={advanceIntro}>
            Got it
          </button>
        </div>
      )}
    </span>
  )
}
