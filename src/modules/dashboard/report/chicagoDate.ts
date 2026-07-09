// Report windows are identified by Chicago calendar dates — the timezone the
// backend's Sage wall-clock timestamps live in (see getRecentChangesCutoff in
// RenovationsBackend @shared/utils/date-utils). Using the browser's local date
// instead would let a traveling user disagree with the server about which day
// "today" is, double-showing or skipping the daily report.

const CHICAGO_YMD = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

/** Today's Chicago calendar date as "YYYY-MM-DD" (en-CA formats ISO-style). */
export function chicagoToday(now: Date = new Date()): string {
  return CHICAGO_YMD.format(now)
}

// ─── Calendar math on "YYYY-MM-DD" strings ───────────────────────────────────
// All arithmetic goes through UTC so DST transitions and the browser's own
// offset can never shift a date by a day.

function toUtc(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function addDays(ymd: string, n: number): string {
  const d = toUtc(ymd)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// ─── Range presets ───────────────────────────────────────────────────────────
// Calendar periods (Mon–Sun weeks, calendar months), not trailing windows —
// "last week" reads as the week people talk about, not "the last 7 days".

export type RangePreset =
  | "today"
  | "yesterday"
  | "thisWeek"
  | "lastWeek"
  | "thisMonth"
  | "thisYear"

/** Inclusive day range, both bounds "YYYY-MM-DD" (the backend expands `to`). */
export interface DateRange {
  from: string
  to: string
}

export function presetRange(preset: RangePreset, today: string = chicagoToday()): DateRange {
  // Monday of the current week (getUTCDay: 0 Sun … 6 Sat).
  const monday = addDays(today, -((toUtc(today).getUTCDay() + 6) % 7))
  switch (preset) {
    case "today":
      return { from: today, to: today }
    case "yesterday": {
      const y = addDays(today, -1)
      return { from: y, to: y }
    }
    case "thisWeek":
      return { from: monday, to: today }
    case "lastWeek":
      return { from: addDays(monday, -7), to: addDays(monday, -1) }
    case "thisMonth":
      return { from: `${today.slice(0, 8)}01`, to: today }
    case "thisYear":
      return { from: `${today.slice(0, 4)}-01-01`, to: today }
  }
}

/** The inclusive day range behind a report window's half-open [start, end). */
export function windowToRange(window: { start: string; end: string }): DateRange {
  return { from: window.start.slice(0, 10), to: addDays(window.end.slice(0, 10), -1) }
}

// ─── Labels ──────────────────────────────────────────────────────────────────

const DAY_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "long",
  month: "long",
  day: "numeric",
})
const SHORT_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
})

/** "Monday, July 6" — single-day headers. */
export function dayLabel(ymd: string): string {
  return DAY_FMT.format(toUtc(ymd))
}

/** "Jul 1 – Jul 6" for spans, "Monday, July 6" for a single day. */
export function rangeLabel({ from, to }: DateRange): string {
  if (from === to) return dayLabel(from)
  return `${SHORT_FMT.format(toUtc(from))} – ${SHORT_FMT.format(toUtc(to))}`
}
