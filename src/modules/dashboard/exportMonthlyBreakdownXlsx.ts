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

// Builds the styled cell matrix for the Monthly Breakdown XLSX export. Two
// sections — Monthly Summary (one row per month + total) followed by Line
// Items Detail (every contributing lgrtrn/lgtnln row, ordered + filtered
// the same way the on-screen MonthlyDetailTable does, with `Month`
// prepended so each detail row stands alone). Returns rows plus the
// header-row index so the caller can hand it to downloadXlsx's autofilter.

// ── Colors ────────────────────────────────────────────────────────────────────

const BRAND       = "1F78C5"
const BRAND_LIGHT = "EBF3FA"
const GRAY_BG     = "F5F6F8"
const BORDER_CLR  = "D0D5DD"
const WHITE       = "FFFFFF"
const BLACK       = "000000"

const thinBorder = { style: "thin" as const, color: { rgb: BORDER_CLR } }
const cellBorder = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder }

// ── Reusable styles ──────────────────────────────────────────────────────────

const titleStyle: StyledCell["s"] = {
  font: { bold: true, sz: 20, color: { rgb: BRAND } },
  alignment: { horizontal: "left", vertical: "center" },
}

const subtitleStyle: StyledCell["s"] = {
  font: { sz: 12, color: { rgb: "6B7280" } },
  alignment: { horizontal: "left" },
}

const sectionStyle: StyledCell["s"] = {
  font: { bold: true, color: { rgb: WHITE }, sz: 14 },
  fill: { fgColor: { rgb: BRAND } },
  alignment: { horizontal: "left", vertical: "center" },
  border: cellBorder,
}

const tableHeaderStyle: StyledCell["s"] = {
  font: { bold: true, color: { rgb: WHITE }, sz: 12 },
  fill: { fgColor: { rgb: BRAND } },
  alignment: { horizontal: "right", vertical: "center" },
  border: cellBorder,
}

const tableHeaderLeftStyle: StyledCell["s"] = {
  ...tableHeaderStyle,
  alignment: { horizontal: "left", vertical: "center" },
}

function bodyStyle(stripe: boolean): StyledCell["s"] {
  return {
    font: { sz: 12 },
    fill: stripe ? { fgColor: { rgb: BRAND_LIGHT } } : undefined,
    border: cellBorder,
    alignment: { vertical: "center" },
  }
}

function bodyMoneyStyle(stripe: boolean): StyledCell["s"] {
  return {
    ...bodyStyle(stripe),
    numFmt: '#,##0.00',
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
  font: { bold: true, sz: 12 },
  fill: { fgColor: { rgb: GRAY_BG } },
  border: { top: { style: "medium" as const, color: { rgb: BLACK } }, bottom: thinBorder, left: thinBorder, right: thinBorder },
  alignment: { vertical: "center" },
}

const totalMoneyStyle: StyledCell["s"] = {
  ...totalLabelStyle,
  numFmt: '#,##0.00',
  alignment: { horizontal: "right", vertical: "center" },
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function styled(v: string | number | null, s?: StyledCell["s"]): StyledCell {
  return { v, s }
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
}

export interface XlsxBuildResult {
  rows: SheetRow[]
  /** Row index of the line-item header (for autofilter). */
  lineItemHeaderRow: number
  lineItemCols: number
}

export function buildMonthlyBreakdownXlsx(input: BreakdownExportInput): XlsxBuildResult {
  const { title, totalLabel, year, monthlyTotals, lineItems } = input
  const rows: SheetRow[] = []

  // ── Report title ──
  rows.push([styled(`${title} Breakdown`, titleStyle)])
  rows.push([styled(`Fiscal Year ${year}`, subtitleStyle)])
  rows.push([
    styled(`Exported ${new Date().toLocaleDateString("en-US")}  ·  All amounts in USD`, subtitleStyle),
  ])
  rows.push(emptyRow())

  // ── Monthly summary ──
  rows.push(sectionHeader("Monthly Summary", 2))
  rows.push([
    styled("Month", tableHeaderLeftStyle),
    styled(totalLabel, tableHeaderStyle),
  ])
  const sortedMonthly = [...monthlyTotals].sort((a, b) => a.month - b.month)
  let yearTotal = 0
  sortedMonthly.forEach((row, i) => {
    const stripe = i % 2 === 1
    yearTotal += row.value
    rows.push([
      styled(fullMonth(row.month), bodyStyle(stripe)),
      { v: row.value, s: bodyMoneyStyle(stripe), t: "n" },
    ])
  })
  rows.push([
    styled("Total", totalLabelStyle),
    { v: yearTotal, s: totalMoneyStyle, t: "n" },
  ])
  rows.push(emptyRow())

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
