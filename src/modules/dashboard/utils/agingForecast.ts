// Buckets open AR/AP invoices by the calendar week in which they reach their
// 31-day mark (invoice date + 31 days), so the dashboard can forecast upcoming
// billings. Powers the UpcomingBillingsWidget: the next 6 weeks drive the
// diverging chart, while anything already past its 31-day mark feeds the
// overdue AR/AP position cards.
//
// Source query: `agingSummaryOpen` — per-invoice rows already filtered to open,
// non-void invoices (status < 4, invbal <> 0). The `type` field is prefixed
// "AR-" or "AP-" (e.g. "AR-over30"); `invdte` is the invoice date (mssql ISO
// string or Sage YYYYMMDD integer); `invbal` is the open balance.

export interface AgingOpenRow {
  type?: string | null
  invdte?: string | number | null
  invbal?: number | string | null
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

/** Net terms assumed for every invoice — the 31-day mark from the invoice date. */
export const NET_DAYS = 31
/** How many forward weeks the upcoming-billings forecast spans. */
export const FORECAST_WEEKS = 6

const MS_PER_DAY = 86_400_000

export interface WeekBucket {
  label: string
  /** Receivables (money in) reaching their 31-day mark this week. */
  ar: number
  /** Payables (money out) reaching their 31-day mark this week. */
  ap: number
}

export interface AgingForecast {
  /** Exactly FORECAST_WEEKS entries, index 0 = current week. */
  weeks: WeekBucket[]
  arTotal: number
  apTotal: number
  /** Open invoices whose 31-day mark fell before the current week started. */
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

export function buildAgingForecast(
  rows: AgingOpenRow[] | null | undefined,
  now: Date
): AgingForecast | null {
  if (!Array.isArray(rows)) return null

  const weekStart = startOfWeek(now)
  const weeks: WeekBucket[] = Array.from({ length: FORECAST_WEEKS }, (_, i) => ({
    label: i === 0 ? "This wk" : `Wk ${i + 1}`,
    ar: 0,
    ap: 0,
  }))

  let overdueAR = 0
  let overdueAP = 0
  let overdueARCount = 0
  let overdueAPCount = 0

  for (const row of rows) {
    const type = typeof row.type === "string" ? row.type.toUpperCase() : ""
    const isAR = type.startsWith("AR")
    const isAP = type.startsWith("AP")
    if (!isAR && !isAP) continue

    const amount = Number(row.invbal) || 0
    if (amount === 0) continue

    const invoiced = parseInvoiceDate(row.invdte)
    if (!invoiced) continue

    // The 31-day mark, normalized to local midnight.
    const mark = new Date(invoiced.getFullYear(), invoiced.getMonth(), invoiced.getDate() + NET_DAYS)
    const weekIndex = Math.floor((startOfDay(mark).getTime() - weekStart.getTime()) / (7 * MS_PER_DAY))

    if (weekIndex < 0) {
      // 31-day mark already passed before this week → overdue bucket.
      if (isAR) {
        overdueAR += amount
        overdueARCount += 1
      } else {
        overdueAP += amount
        overdueAPCount += 1
      }
      continue
    }
    if (weekIndex >= FORECAST_WEEKS) continue // beyond the forecast horizon

    if (isAR) weeks[weekIndex].ar += amount
    else weeks[weekIndex].ap += amount
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

/** A single open invoice placed in the forecast window — the per-invoice rows
 *  behind the Upcoming Billings chart, for the breakdown view. */
export interface BillingsInvoice {
  side: "AR" | "AP"
  /** 0 = this week … FORECAST_WEEKS-1. */
  weekIndex: number
  weekLabel: string
  amount: number
  /** Invoice record number (for the standard invoice-detail modal). */
  recnum: string
  invnum: string
  /** Vendor (AP) or client (AR) name. */
  counterparty: string
  job: string
  description: string
  invoiceDate: Date | null
  /** The 31-day mark — when the invoice is expected to settle. */
  mark: Date
}

const weekLabel = (i: number) => (i === 0 ? "This wk" : `Wk ${i + 1}`)

/**
 * Same date math as buildAgingForecast, but returns the individual invoices
 * whose 31-day mark falls within the forecast window (so the breakdown view can
 * show exactly the invoices that make up each bar). Sorted by week, then AR
 * before AP, then largest first.
 */
export function buildBillingsInvoices(
  rows: AgingOpenRow[] | null | undefined,
  now: Date
): BillingsInvoice[] {
  if (!Array.isArray(rows)) return []

  const weekStart = startOfWeek(now)
  const out: BillingsInvoice[] = []

  for (const row of rows) {
    const type = typeof row.type === "string" ? row.type.toUpperCase() : ""
    const isAR = type.startsWith("AR")
    const isAP = type.startsWith("AP")
    if (!isAR && !isAP) continue

    const amount = Number(row.invbal) || 0
    if (amount === 0) continue

    const invoiced = parseInvoiceDate(row.invdte)
    if (!invoiced) continue

    const mark = new Date(invoiced.getFullYear(), invoiced.getMonth(), invoiced.getDate() + NET_DAYS)
    const weekIndex = Math.floor((startOfDay(mark).getTime() - weekStart.getTime()) / (7 * MS_PER_DAY))
    if (weekIndex < 0 || weekIndex >= FORECAST_WEEKS) continue

    out.push({
      side: isAR ? "AR" : "AP",
      weekIndex,
      weekLabel: weekLabel(weekIndex),
      amount,
      recnum: row.recnum != null ? String(row.recnum) : "",
      invnum: row.invnum != null ? String(row.invnum) : "",
      counterparty: row.vndnum ?? "",
      job: row.jobnme ?? "",
      description: row.dscrpt ?? "",
      invoiceDate: invoiced,
      mark,
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

/** A single open invoice already past its 31-day mark — the overdue AR/AP
 *  positions, for the click-through modal. */
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
  /** The 31-day mark — when the invoice was expected to settle. */
  due: Date
  daysOverdue: number
}

/**
 * Open invoices whose 31-day mark fell before the current week started (the
 * same set that feeds the overdue AR/AP totals in buildAgingForecast), as a
 * per-invoice list filtered to one side. Sorted most-overdue first.
 */
export function buildOverdueInvoices(
  rows: AgingOpenRow[] | null | undefined,
  now: Date,
  side: "AR" | "AP"
): OverdueInvoice[] {
  if (!Array.isArray(rows)) return []

  const weekStart = startOfWeek(now)
  const today = startOfDay(now)
  const out: OverdueInvoice[] = []

  for (const row of rows) {
    const type = typeof row.type === "string" ? row.type.toUpperCase() : ""
    const rowSide = type.startsWith("AR") ? "AR" : type.startsWith("AP") ? "AP" : null
    if (rowSide !== side) continue

    const amount = Number(row.invbal) || 0
    if (amount === 0) continue

    const invoiced = parseInvoiceDate(row.invdte)
    if (!invoiced) continue

    const mark = new Date(invoiced.getFullYear(), invoiced.getMonth(), invoiced.getDate() + NET_DAYS)
    const markStart = startOfDay(mark)
    if (markStart.getTime() >= weekStart.getTime()) continue // not yet overdue

    out.push({
      side,
      amount,
      recnum: row.recnum != null ? String(row.recnum) : "",
      invnum: row.invnum != null ? String(row.invnum) : "",
      counterparty: row.vndnum ?? "",
      job: row.jobnme ?? "",
      description: row.dscrpt ?? "",
      invoiceDate: invoiced,
      due: mark,
      daysOverdue: Math.round((today.getTime() - markStart.getTime()) / MS_PER_DAY),
    })
  }

  out.sort((a, b) => b.daysOverdue - a.daysOverdue || b.amount - a.amount)
  return out
}
