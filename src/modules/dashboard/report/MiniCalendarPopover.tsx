import { useEffect, useRef, useState } from "react"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import { addDays } from "./chicagoDate"

// ─── Month grid ──────────────────────────────────────────────────────────────

const MONTH_FMT = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" })
// Compact date for the trigger pill once a day is picked ("Jul 6") — a terse
// echo of the page subtitle's full "Monday, July 6". The year is added only when
// it differs from the current year, so a same-year pick stays short.
const PILL_FMT = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" })
const PILL_FMT_YEAR = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"]

/** Trigger-pill label for a picked day; `max` (today) supplies the current year. */
function pillLabel(value: string, max: string): string {
  const d = new Date(`${value}T00:00:00Z`)
  return (value.slice(0, 4) === max.slice(0, 4) ? PILL_FMT : PILL_FMT_YEAR).format(d)
}

/** "YYYY-MM" → cells for that month: leading blanks (Mon-first) then days. */
function monthGrid(viewMonth: string): Array<string | null> {
  const first = `${viewMonth}-01`
  const [y, m] = viewMonth.split("-").map(Number)
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay() // 0 Sun … 6 Sat
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const cells: Array<string | null> = Array.from({ length: (firstDow + 6) % 7 }, () => null)
  for (let d = 0; d < daysInMonth; d++) cells.push(addDays(first, d))
  return cells
}

function shiftMonth(viewMonth: string, delta: number): string {
  const [y, m] = viewMonth.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return d.toISOString().slice(0, 7)
}

/**
 * In-house day picker (no datepicker lib in the repo): a pill button opening a
 * small month-grid popover. Future days (past `max`, the current Chicago date)
 * are disabled.
 */
export function MiniCalendarPopover({
  value,
  max,
  active,
  onSelect,
}: {
  /** Selected day when the page is in single-day mode, else null. */
  value: string | null
  /** Latest pickable day (today, Chicago). */
  max: string
  /** Pill active state — true when a picked day drives the page. */
  active: boolean
  onSelect: (ymd: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState(() => (value ?? max).slice(0, 7))
  const rootRef = useRef<HTMLSpanElement>(null)

  // Re-anchor the view to the selection whenever the popover opens.
  function toggle() {
    if (!open) setViewMonth((value ?? max).slice(0, 7))
    setOpen(!open)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("pointerdown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const cells = monthGrid(viewMonth)
  const atCurrentMonth = viewMonth >= max.slice(0, 7)

  return (
    <span className="rpt-cal-anchor" ref={rootRef}>
      <button
        type="button"
        className={`over-under-toggle rpt-cal-btn${active ? " over-under-toggle--active" : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={toggle}
      >
        <CalendarDays size={14} />
        {active && value ? pillLabel(value, max) : "Day select"}
      </button>
      {open && (
        <div className="rpt-cal" role="dialog" aria-label="Pick a day">
          <div className="rpt-cal-head">
            <button
              type="button"
              className="btn-icon rpt-cal-nav"
              aria-label="Previous month"
              onClick={() => setViewMonth(shiftMonth(viewMonth, -1))}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="rpt-cal-month">
              {MONTH_FMT.format(new Date(`${viewMonth}-01T00:00:00Z`))}
            </span>
            <button
              type="button"
              className="btn-icon rpt-cal-nav"
              aria-label="Next month"
              disabled={atCurrentMonth}
              onClick={() => setViewMonth(shiftMonth(viewMonth, 1))}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="rpt-cal-grid" role="grid">
            {WEEKDAYS.map((w, i) => (
              <span key={`w${i}`} className="rpt-cal-dow" aria-hidden="true">
                {w}
              </span>
            ))}
            {cells.map((ymd, i) =>
              ymd === null ? (
                <span key={`b${i}`} />
              ) : (
                <button
                  key={ymd}
                  type="button"
                  className={`rpt-cal-day${ymd === value ? " rpt-cal-day--selected" : ""}${
                    ymd === max ? " rpt-cal-day--today" : ""
                  }`}
                  disabled={ymd > max}
                  onClick={() => {
                    onSelect(ymd)
                    setOpen(false)
                  }}
                >
                  {Number(ymd.slice(8))}
                </button>
              )
            )}
          </div>
        </div>
      )}
    </span>
  )
}
