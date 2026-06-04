// Classifies every open AR/AP invoice on a single timeline anchored to its due
// date (`duedte`): the "mark" is the day the invoice reaches OVERDUE_DAYS past
// due. A mark already passed → the overdue AR/AP position cards (the same
// "over 30" aging cutoff the accounting software uses, so totals reconcile).
// A mark still ahead → the upcoming-billings forecast, bucketed by the
// calendar week the mark lands in (FORECAST_WEEKS weekly buckets plus a
// trailing "Later" catch-all). Every open invoice is in exactly one bucket —
// overdue or upcoming, never unaccounted for.
//
// Source query: `agingSummaryOpen` — per-invoice rows already filtered to open,
// non-void invoices (status < 4, invbal <> 0). The `type` field is prefixed
// "AR-" or "AP-" (e.g. "AR-over30"); `invdte` is the invoice date (mssql ISO
// string or Sage YYYYMMDD integer); `invbal` is the open balance.

export interface AgingOpenRow {
  type?: string | null
  invdte?: string | number | null
  invbal?: number | string | null
  /** Full invoice amount (the open balance `invbal` may be partially paid down). */
  invttl?: number | string | null
  // Extra per-invoice fields (used by the breakdown view, ignored by the chart):
  /** Invoice record number — the id the standard invoice-detail modal loads by. */
  recnum?: string | number | null
  invnum?: string | number | null
  jobnme?: string | null
  dscrpt?: string | null
  /** Counterparty name — vendor for AP, client for AR (aliased `vndnum`). */
  vndnum?: string | null
  duedte?: string | number | null
}

/** Fallback net terms — only used to synthesize a due date when Sage has none. */
export const NET_DAYS = 31
/** Weekly buckets in the upcoming forecast (a trailing "Later" bucket follows). */
export const FORECAST_WEEKS = 8
/**
 * An invoice counts as overdue only once its due date is more than this many
 * days in the past — matching the backend's `over30`/`over60`/`over90` aging
 * buckets (and the accounting software). Invoices 0–30 days past due are NOT
 * overdue yet; they sit in the upcoming buckets, approaching their mark.
 */
export const OVERDUE_DAYS = 30

const MS_PER_DAY = 86_400_000

export interface WeekBucket {
  label: string
  /** Receivables (money in) reaching OVERDUE_DAYS past due this week. */
  ar: number
  /** Payables (money out) reaching OVERDUE_DAYS past due this week. */
  ap: number
}

export interface AgingForecast {
  /** FORECAST_WEEKS weekly entries plus a trailing "Later" bucket; index 0 = current week. */
  weeks: WeekBucket[]
  /** All upcoming (not-yet-overdue) totals, including the "Later" bucket. */
  arTotal: number
  apTotal: number
  /** Open invoices more than OVERDUE_DAYS past their due date. */
  overdueAR: number
  overdueAP: number
  overdueARCount: number
  overdueAPCount: number
  /** Monday of the current week (forecast anchor). */
  weekStart: Date
  /** Last day covered by the forecast window (end of week FORECAST_WEEKS). */
  horizonEnd: Date
}

// Parse a backend invoice date into a local-midnight Date. Mirrors format.ts'
// formatDate: handle Sage YYYYMMDD integers and ISO strings as local dates so
// they don't shift a day under US timezones.
function parseInvoiceDate(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === 0 || raw === "") return null
  if (typeof raw === "number") {
    const s = String(raw)
    if (s.length === 8) return new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8))
    return null
  }
  if (typeof raw === "string") {
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3])
    const d = new Date(raw)
    return isNaN(d.getTime()) ? null : d
  }
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw
  return null
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

// Monday-anchored week start — RD operates on a work-week calendar, so "this
// week" runs Mon–Sun.
function startOfWeek(d: Date): Date {
  const s = startOfDay(d)
  const mondayOffset = (s.getDay() + 6) % 7 // Sun=6, Mon=0 … Sat=5
  s.setDate(s.getDate() - mondayOffset)
  return s
}

// Component-wise date arithmetic keeps results at local midnight across DST.
function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)
}

/** Bucket label — index FORECAST_WEEKS is the trailing "Later" catch-all. */
const weekLabel = (i: number) =>
  i === 0 ? "This Week" : i >= FORECAST_WEEKS ? "Later" : `Week ${i + 1}`

/**
 * Per-row classification shared by all three builders: side, open balance, the
 * real due date (invoice date + NET_DAYS only when Sage has no due date), and
 * the mark — the day the invoice reaches OVERDUE_DAYS past due. Returns null
 * for rows that can't be classified (no side, zero balance, no usable date).
 */
function resolveInvoice(row: AgingOpenRow): {
  side: "AR" | "AP"
  amount: number
  invoiced: Date | null
  due: Date
  mark: Date
} | null {
  const type = typeof row.type === "string" ? row.type.toUpperCase() : ""
  const side = type.startsWith("AR") ? "AR" : type.startsWith("AP") ? "AP" : null
  if (!side) return null

  const amount = Number(row.invbal) || 0
  if (amount === 0) return null

  const invoiced = parseInvoiceDate(row.invdte)
  const due = parseInvoiceDate(row.duedte) ?? (invoiced ? addDays(invoiced, NET_DAYS) : null)
  if (!due) return null

  return { side, amount, invoiced, due, mark: addDays(startOfDay(due), OVERDUE_DAYS) }
}

export function buildAgingForecast(
  rows: AgingOpenRow[] | null | undefined,
  now: Date
): AgingForecast | null {
  if (!Array.isArray(rows)) return null

  const weekStart = startOfWeek(now)
  const today = startOfDay(now)
  // FORECAST_WEEKS weekly buckets plus the trailing "Later" catch-all, so every
  // upcoming invoice lands in exactly one bucket.
  const weeks: WeekBucket[] = Array.from({ length: FORECAST_WEEKS + 1 }, (_, i) => ({
    label: weekLabel(i),
    ar: 0,
    ap: 0,
  }))

  let overdueAR = 0
  let overdueAP = 0
  let overdueARCount = 0
  let overdueAPCount = 0

  for (const row of rows) {
    const inv = resolveInvoice(row)
    if (!inv) continue

    if (inv.mark.getTime() < today.getTime()) {
      // Mark already passed → more than OVERDUE_DAYS past due. Same boundary as
      // the backend's `duedte < today - 30` over30/over60/over90 buckets.
      if (inv.side === "AR") {
        overdueAR += inv.amount
        overdueARCount += 1
      } else {
        overdueAP += inv.amount
        overdueAPCount += 1
      }
      continue
    }

    // Upcoming: mark >= today >= weekStart, so the index is never negative;
    // marks beyond the horizon collapse into the "Later" bucket.
    const weekIndex = Math.min(
      Math.floor((inv.mark.getTime() - weekStart.getTime()) / (7 * MS_PER_DAY)),
      FORECAST_WEEKS
    )
    if (inv.side === "AR") weeks[weekIndex].ar += inv.amount
    else weeks[weekIndex].ap += inv.amount
  }

  const arTotal = weeks.reduce((sum, w) => sum + w.ar, 0)
  const apTotal = weeks.reduce((sum, w) => sum + w.ap, 0)
  const horizonEnd = new Date(
    weekStart.getFullYear(),
    weekStart.getMonth(),
    weekStart.getDate() + FORECAST_WEEKS * 7 - 1
  )

  return {
    weeks,
    arTotal,
    apTotal,
    overdueAR,
    overdueAP,
    overdueARCount,
    overdueAPCount,
    weekStart,
    horizonEnd,
  }
}

/** A single upcoming (not-yet-overdue) invoice — the per-invoice rows behind
 *  the Upcoming Billings chart, for the breakdown view. */
export interface BillingsInvoice {
  side: "AR" | "AP"
  /** 0 = this week … FORECAST_WEEKS = the trailing "Later" bucket. */
  weekIndex: number
  weekLabel: string
  /** Open balance (what the chart and roll-up totals sum). */
  amount: number
  /** Full invoice amount (before any partial payments). */
  total: number
  /** Invoice record number (for the standard invoice-detail modal). */
  recnum: string
  invnum: string
  /** Vendor (AP) or client (AR) name. */
  counterparty: string
  job: string
  description: string
  invoiceDate: Date | null
  /** The real due date (invoice date + NET_DAYS only when Sage has none). */
  due: Date
  /** The day the invoice reaches OVERDUE_DAYS past due. */
  mark: Date
}

/**
 * Same classification as buildAgingForecast, but returns the individual
 * upcoming invoices (so the breakdown view can show exactly the invoices that
 * make up each bar, including "Later"). Sorted by week, then AR before AP,
 * then largest first.
 */
export function buildBillingsInvoices(
  rows: AgingOpenRow[] | null | undefined,
  now: Date
): BillingsInvoice[] {
  if (!Array.isArray(rows)) return []

  const weekStart = startOfWeek(now)
  const today = startOfDay(now)
  const out: BillingsInvoice[] = []

  for (const row of rows) {
    const inv = resolveInvoice(row)
    if (!inv) continue
    if (inv.mark.getTime() < today.getTime()) continue // overdue → OverdueWidget, not here

    const weekIndex = Math.min(
      Math.floor((inv.mark.getTime() - weekStart.getTime()) / (7 * MS_PER_DAY)),
      FORECAST_WEEKS
    )

    out.push({
      side: inv.side,
      weekIndex,
      weekLabel: weekLabel(weekIndex),
      amount: inv.amount,
      total: Number(row.invttl) || 0,
      recnum: row.recnum != null ? String(row.recnum) : "",
      invnum: row.invnum != null ? String(row.invnum) : "",
      counterparty: row.vndnum ?? "",
      job: row.jobnme ?? "",
      description: row.dscrpt ?? "",
      invoiceDate: inv.invoiced,
      due: inv.due,
      mark: inv.mark,
    })
  }

  out.sort(
    (a, b) =>
      a.weekIndex - b.weekIndex ||
      (a.side === b.side ? 0 : a.side === "AR" ? -1 : 1) ||
      b.amount - a.amount
  )

  return out
}

/** A single open invoice more than OVERDUE_DAYS past its due date — the
 *  overdue AR/AP positions, for the click-through modal. */
export interface OverdueInvoice {
  side: "AR" | "AP"
  amount: number
  /** Invoice record number (for the standard invoice-detail modal). */
  recnum: string
  invnum: string
  /** Vendor (AP) or client (AR) name. */
  counterparty: string
  job: string
  description: string
  invoiceDate: Date | null
  /** The real due date (invoice date + NET_DAYS only when Sage has none). */
  due: Date
  daysOverdue: number
}

/**
 * Open invoices more than OVERDUE_DAYS past their due date (the same set that
 * feeds the overdue AR/AP totals in buildAgingForecast), as a per-invoice list
 * filtered to one side. Sorted most-overdue first.
 */
export function buildOverdueInvoices(
  rows: AgingOpenRow[] | null | undefined,
  now: Date,
  side: "AR" | "AP"
): OverdueInvoice[] {
  if (!Array.isArray(rows)) return []

  const today = startOfDay(now)
  const out: OverdueInvoice[] = []

  for (const row of rows) {
    const inv = resolveInvoice(row)
    if (!inv || inv.side !== side) continue
    // Same mark rule as buildAgingForecast, so the modal reconciles with the
    // card total: mark passed → more than OVERDUE_DAYS past due.
    if (inv.mark.getTime() >= today.getTime()) continue

    out.push({
      side,
      amount: inv.amount,
      recnum: row.recnum != null ? String(row.recnum) : "",
      invnum: row.invnum != null ? String(row.invnum) : "",
      counterparty: row.vndnum ?? "",
      job: row.jobnme ?? "",
      description: row.dscrpt ?? "",
      invoiceDate: inv.invoiced,
      due: inv.due,
      daysOverdue: Math.round((today.getTime() - startOfDay(inv.due).getTime()) / MS_PER_DAY),
    })
  }

  out.sort((a, b) => b.daysOverdue - a.daysOverdue || b.amount - a.amount)
  return out
}
