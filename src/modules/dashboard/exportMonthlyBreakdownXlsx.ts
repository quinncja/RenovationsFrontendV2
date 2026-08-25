import { fullMonth, formatDate } from "../../shared/utils/format"
import {
  isHiddenColumn,
  isDateKey,
  labelFor,
  orderColumns,
  collapseValue,
  isIsoDateString,
  transformUsername,
  NUMERIC_KEYS,
  USERNAME_KEYS,
} from "../../shared/components/MonthlyDetailTable/MonthlyDetailTable"
import type { SheetRow, StyledCell } from "../../shared/utils/exportXlsx"
import { XLSX_GOLD, XLSX_INK, XLSX_INK_SOFT, XLSX_MUTED, XLSX_HEAD_FILL, XLSX_STRIPE, xlsxCellBorder, xlsxTotalBorder } from "../../shared/utils/xlsxTheme"

// Builds the styled cell matrix for the Monthly Breakdown XLSX export. The base
// report is two sections — Monthly Summary (one row per month + total) followed
// by Line Items Detail (every contributing lgrtrn/lgtnln row, ordered +
// filtered the same way the on-screen MonthlyDetailTable does, with `Month`
// prepended so each detail row stands alone).
//
// Callers with richer data (the Overhead report) can opt into extra sections —
// a KPI summary band, a prior-year column on the monthly summary, and a
// per-category breakdown — via the optional fields on BreakdownExportInput.
// Callers that omit them get the original two-section layout unchanged.

// ── Colors: shared muted export palette (xlsxTheme.ts) ────────────────────────

const BRAND       = XLSX_GOLD      // accent text only
const HEAD_FILL   = XLSX_HEAD_FILL // section bands / headers / label cells
const STRIPE      = XLSX_STRIPE    // zebra + totals
const INK         = XLSX_INK
const INK_SOFT    = XLSX_INK_SOFT
const MUTED       = XLSX_MUTED

const MONEY_FMT = "#,##0.00"
const PCT_FMT   = '0.0"%"'

const cellBorder = xlsxCellBorder

// ── Reusable styles ──────────────────────────────────────────────────────────

const titleStyle: StyledCell["s"] = {
  font: { bold: true, sz: 20, color: { rgb: BRAND } },
  alignment: { horizontal: "left", vertical: "center" },
}

const subtitleStyle: StyledCell["s"] = {
  font: { sz: 12, color: { rgb: MUTED } },
  alignment: { horizontal: "left" },
}

const sectionStyle: StyledCell["s"] = {
  font: { bold: true, color: { rgb: INK }, sz: 14 },
  fill: { fgColor: { rgb: HEAD_FILL } },
  alignment: { horizontal: "left", vertical: "center" },
  border: cellBorder,
}

const tableHeaderStyle: StyledCell["s"] = {
  font: { bold: true, color: { rgb: INK_SOFT }, sz: 11 },
  fill: { fgColor: { rgb: HEAD_FILL } },
  alignment: { horizontal: "right", vertical: "center" },
  border: cellBorder,
}

const tableHeaderLeftStyle: StyledCell["s"] = {
  ...tableHeaderStyle,
  alignment: { horizontal: "left", vertical: "center" },
}

function bodyStyle(stripe: boolean): StyledCell["s"] {
  return {
    font: { sz: 12, color: { rgb: INK } },
    fill: stripe ? { fgColor: { rgb: STRIPE } } : undefined,
    border: cellBorder,
    alignment: { vertical: "center" },
  }
}

function bodyMoneyStyle(stripe: boolean): StyledCell["s"] {
  return {
    ...bodyStyle(stripe),
    numFmt: MONEY_FMT,
    alignment: { horizontal: "right", vertical: "center" },
  }
}

function bodyPctStyle(stripe: boolean): StyledCell["s"] {
  return {
    ...bodyStyle(stripe),
    numFmt: PCT_FMT,
    alignment: { horizontal: "right", vertical: "center" },
  }
}

function bodyCenterStyle(stripe: boolean): StyledCell["s"] {
  return {
    ...bodyStyle(stripe),
    alignment: { horizontal: "center", vertical: "center" },
  }
}

const totalLabelStyle: StyledCell["s"] = {
  font: { bold: true, sz: 12, color: { rgb: INK } },
  fill: { fgColor: { rgb: STRIPE } },
  border: xlsxTotalBorder,
  alignment: { vertical: "center" },
}

const totalMoneyStyle: StyledCell["s"] = {
  ...totalLabelStyle,
  numFmt: MONEY_FMT,
  alignment: { horizontal: "right", vertical: "center" },
}

const totalPctStyle: StyledCell["s"] = {
  ...totalLabelStyle,
  numFmt: PCT_FMT,
  alignment: { horizontal: "right", vertical: "center" },
}

const kpiLabelStyle: StyledCell["s"] = {
  font: { bold: true, sz: 12, color: { rgb: INK } },
  fill: { fgColor: { rgb: HEAD_FILL } },
  border: cellBorder,
  alignment: { horizontal: "left", vertical: "center" },
}

const kpiValueStyle: StyledCell["s"] = {
  font: { bold: true, sz: 12, color: { rgb: BRAND } },
  border: cellBorder,
  numFmt: MONEY_FMT,
  alignment: { horizontal: "right", vertical: "center" },
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function styled(v: string | number | null, s?: StyledCell["s"]): StyledCell {
  return { v, s }
}

function num(v: number, s?: StyledCell["s"]): StyledCell {
  return { v, s, t: "n" }
}

function sectionHeader(label: string, colSpan: number): SheetRow {
  const row: SheetRow = [styled(label, sectionStyle)]
  for (let i = 1; i < colSpan; i++) row.push(styled("", sectionStyle))
  return row
}

function emptyRow(): SheetRow {
  return []
}

/** Right-align numeric/money columns, center-align dates, otherwise left. */
function isRightAlignedKey(key: string): boolean {
  return NUMERIC_KEYS.has(key.toLowerCase())
}

function isCenterAlignedKey(key: string): boolean {
  return isDateKey(key)
}

/** Prepare a cell value for Excel — collapse mssql duplicates, normalize
 *  usernames, parse dates, leave raw numerics so Excel can format them. */
function cellFor(key: string, value: unknown, stripe: boolean): StyledCell {
  const v = collapseValue(value)
  const k = key.toLowerCase()

  if (v === null || v === undefined) {
    return styled("", bodyStyle(stripe))
  }

  if (USERNAME_KEYS.has(k)) {
    return styled(transformUsername(v) || "", bodyStyle(stripe))
  }

  if (NUMERIC_KEYS.has(k)) {
    const n = typeof v === "number" ? v : Number(v)
    if (Number.isFinite(n)) return { v: n, s: bodyMoneyStyle(stripe), t: "n" }
    return styled(String(v), bodyMoneyStyle(stripe))
  }

  if (isDateKey(key) || isIsoDateString(v)) {
    const formatted = formatDate(v)
    return styled(formatted === "—" ? "" : formatted, bodyCenterStyle(stripe))
  }

  if (typeof v === "number") return { v, s: bodyStyle(stripe), t: "n" }
  return styled(String(v).trim(), bodyStyle(stripe))
}

// ── Builder ──────────────────────────────────────────────────────────────────

export interface BreakdownExportInput {
  /** e.g. "Gross Revenue", "Total Direct Expense", "Overhead Expense" */
  title: string
  /** e.g. "Revenue", "Direct Expense" — used as the totals column header */
  totalLabel: string
  year: number
  monthlyTotals: { month: number; value: number }[]
  lineItems: Record<string, unknown>[]

  // ── Optional richer sections (Overhead report) ──
  /** Summary band rendered above the monthly table. */
  kpis?: { label: string; value: number | null; format?: "money" | "percent" }[]
  /** Prior-year value per month. When present the Monthly Summary gains
   *  {prevYear} / Change / Change % columns. */
  monthlyPrevious?: { month: number; value: number }[]
  /** Per-account breakdown, both years, rendered as its own section. */
  categories?: {
    accountNumber: string | number
    accountName: string
    current: number
    previous: number
  }[]
}

export interface XlsxBuildResult {
  rows: SheetRow[]
  /** Row index of the line-item header (for autofilter). */
  lineItemHeaderRow: number
  lineItemCols: number
}

export function buildMonthlyBreakdownXlsx(input: BreakdownExportInput): XlsxBuildResult {
  const { title, totalLabel, year, monthlyTotals, lineItems, kpis, monthlyPrevious, categories } = input
  const prevYear = year - 1
  const rows: SheetRow[] = []

  // ── Report title ──
  rows.push([styled(`${title} Breakdown`, titleStyle)])
  rows.push([styled(`Fiscal Year ${year}`, subtitleStyle)])
  rows.push([
    styled(`Exported ${new Date().toLocaleDateString("en-US")}  ·  All amounts in USD`, subtitleStyle),
  ])
  rows.push(emptyRow())

  // ── Summary KPIs (optional) ──
  if (kpis && kpis.length) {
    rows.push(sectionHeader("Summary", 2))
    for (const k of kpis) {
      const valueCell: StyledCell =
        k.value == null
          ? styled("—", { ...kpiValueStyle, numFmt: undefined })
          : k.format === "percent"
            ? num(k.value, { ...kpiValueStyle, numFmt: PCT_FMT })
            : num(k.value, kpiValueStyle)
      rows.push([styled(k.label, kpiLabelStyle), valueCell])
    }
    rows.push(emptyRow())
  }

  // ── Monthly summary ──
  const withPrev = !!(monthlyPrevious && monthlyPrevious.length)
  const prevByMonth = new Map((monthlyPrevious ?? []).map((r) => [r.month, r.value]))

  const monthlyCols = withPrev ? 5 : 2
  rows.push(sectionHeader("Monthly Summary", monthlyCols))
  rows.push(
    withPrev
      ? [
          styled("Month", tableHeaderLeftStyle),
          styled(`${totalLabel} (${year})`, tableHeaderStyle),
          styled(`${totalLabel} (${prevYear})`, tableHeaderStyle),
          styled("Change", tableHeaderStyle),
          styled("Change %", tableHeaderStyle),
        ]
      : [styled("Month", tableHeaderLeftStyle), styled(totalLabel, tableHeaderStyle)],
  )

  const sortedMonthly = [...monthlyTotals].sort((a, b) => a.month - b.month)
  let yearTotal = 0
  let prevTotal = 0
  sortedMonthly.forEach((row, i) => {
    const stripe = i % 2 === 1
    yearTotal += row.value
    if (withPrev) {
      const prev = prevByMonth.get(row.month) ?? 0
      prevTotal += prev
      const change = row.value - prev
      rows.push([
        styled(fullMonth(row.month), bodyStyle(stripe)),
        num(row.value, bodyMoneyStyle(stripe)),
        num(prev, bodyMoneyStyle(stripe)),
        num(change, bodyMoneyStyle(stripe)),
        prev !== 0 ? num((change / Math.abs(prev)) * 100, bodyPctStyle(stripe)) : styled("—", bodyPctStyle(stripe)),
      ])
    } else {
      rows.push([styled(fullMonth(row.month), bodyStyle(stripe)), num(row.value, bodyMoneyStyle(stripe))])
    }
  })

  if (withPrev) {
    const totalChange = yearTotal - prevTotal
    rows.push([
      styled("Total", totalLabelStyle),
      num(yearTotal, totalMoneyStyle),
      num(prevTotal, totalMoneyStyle),
      num(totalChange, totalMoneyStyle),
      prevTotal !== 0 ? num((totalChange / Math.abs(prevTotal)) * 100, totalPctStyle) : styled("—", totalPctStyle),
    ])
  } else {
    rows.push([styled("Total", totalLabelStyle), num(yearTotal, totalMoneyStyle)])
  }
  rows.push(emptyRow())

  // ── Category breakdown (optional) ──
  if (categories && categories.length) {
    const sortedCats = [...categories].sort((a, b) => b.current - a.current)
    const catTotal = sortedCats.reduce((s, c) => s + c.current, 0)
    const catPrevTotal = sortedCats.reduce((s, c) => s + c.previous, 0)

    rows.push(sectionHeader("Category Breakdown", 6))
    rows.push([
      styled("Account", tableHeaderLeftStyle),
      styled("Category", tableHeaderLeftStyle),
      styled(`${year}`, tableHeaderStyle),
      styled(`${prevYear}`, tableHeaderStyle),
      styled("Change", tableHeaderStyle),
      styled("% of Total", tableHeaderStyle),
    ])
    sortedCats.forEach((c, i) => {
      const stripe = i % 2 === 1
      const change = c.current - c.previous
      const share = catTotal > 0 ? (c.current / catTotal) * 100 : 0
      rows.push([
        styled(String(c.accountNumber), bodyStyle(stripe)),
        styled(c.accountName, bodyStyle(stripe)),
        num(c.current, bodyMoneyStyle(stripe)),
        num(c.previous, bodyMoneyStyle(stripe)),
        num(change, bodyMoneyStyle(stripe)),
        num(share, bodyPctStyle(stripe)),
      ])
    })
    rows.push([
      styled("Total", totalLabelStyle),
      styled("", totalLabelStyle),
      num(catTotal, totalMoneyStyle),
      num(catPrevTotal, totalMoneyStyle),
      num(catTotal - catPrevTotal, totalMoneyStyle),
      num(100, totalPctStyle),
    ])
    rows.push(emptyRow())
  }

  // ── Line-item detail (every GL line, ordered + filtered like the on-screen table) ──
  const visibleKeys = (() => {
    const seen = new Set<string>()
    for (const r of lineItems) for (const k of Object.keys(r)) seen.add(k)
    seen.delete("month")
    return orderColumns(Array.from(seen).filter((k) => !isHiddenColumn(k)))
  })()

  // Prepend a "Month" column so detail rows are easy to scan in Excel.
  const allCols = ["month", ...visibleKeys]

  rows.push(sectionHeader("Line Items", allCols.length))
  const lineItemHeaderRow = rows.length
  rows.push(
    allCols.map((k) => {
      const right = isRightAlignedKey(k) || isCenterAlignedKey(k)
      const label = k === "month" ? "Month" : labelFor(k)
      return styled(label, right ? tableHeaderStyle : tableHeaderLeftStyle)
    }),
  )

  const sortedItems = [...lineItems].sort((a, b) => {
    const am = Number(a.month) || 0
    const bm = Number(b.month) || 0
    if (am !== bm) return am - bm
    const ad = String(collapseValue(a.trndte) ?? "")
    const bd = String(collapseValue(b.trndte) ?? "")
    return ad.localeCompare(bd)
  })

  sortedItems.forEach((item, i) => {
    const stripe = i % 2 === 1
    const row: SheetRow = []
    for (const k of allCols) {
      if (k === "month") {
        const m = Number(item.month)
        row.push(styled(Number.isFinite(m) ? fullMonth(m) : "", bodyStyle(stripe)))
        continue
      }
      row.push(cellFor(k, item[k], stripe))
    }
    rows.push(row)
  })

  return {
    rows,
    lineItemHeaderRow,
    lineItemCols: allCols.length,
  }
}
