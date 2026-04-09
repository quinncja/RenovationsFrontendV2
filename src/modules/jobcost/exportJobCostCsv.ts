import { formatDate } from "../../shared/utils/format"
import type { JobSummary, CostGroup, CostTransaction } from "../../shared/components/JobDetailPanel/JobDetailPanel"
import type { SheetRow, StyledCell } from "../../shared/utils/exportXlsx"

export interface InvoiceSummary {
  totalInvoiced: number
  totalPaid: number
  totalOutstanding: number
  invoicedPct: number
}

const JOB_STATUS_LABEL: Record<number, string> = {
  1: "Bid", 2: "Refused", 3: "Contract", 4: "Current", 5: "Complete", 6: "Closed",
}

// ── Colors ───────────────────────────────────────────────────────────────────

const BRAND      = "1F78C5"
const BRAND_LIGHT = "EBF3FA"   // tinted row stripe
const GRAY_BG     = "F5F6F8"   // label cell background
const BORDER_CLR  = "D0D5DD"
const WHITE       = "FFFFFF"
const BLACK       = "000000"
const RED         = "DC2626"
const GREEN       = "15803D"

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

const statusLabelStyle: StyledCell["s"] = {
  font: { bold: true, sz: 12, color: { rgb: "374151" } },
  alignment: { horizontal: "left" },
}

const statusValueStyle: StyledCell["s"] = {
  font: { bold: true, sz: 13, color: { rgb: BRAND } },
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

const labelStyle: StyledCell["s"] = {
  font: { bold: true, sz: 12, color: { rgb: "374151" } },
  fill: { fgColor: { rgb: GRAY_BG } },
  border: cellBorder,
  alignment: { vertical: "center" },
}

const valueStyle: StyledCell["s"] = {
  font: { sz: 12 },
  border: cellBorder,
  alignment: { vertical: "center" },
}

const valueMoney: StyledCell["s"] = {
  ...valueStyle,
  numFmt: '#,##0.00',
  alignment: { horizontal: "right", vertical: "center" },
}

const valuePct: StyledCell["s"] = {
  ...valueStyle,
  numFmt: '0.0%',
  alignment: { horizontal: "right", vertical: "center" },
}

// Table body cells
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

function bodyPctStyle(stripe: boolean): StyledCell["s"] {
  return {
    ...bodyStyle(stripe),
    numFmt: '0.0%',
    alignment: { horizontal: "right", vertical: "center" },
  }
}

const totalLabelStyle: StyledCell["s"] = {
  font: { bold: true, sz: 12 },
  fill: { fgColor: { rgb: GRAY_BG } },
  border: { top: { style: "medium" as const, color: { rgb: BLACK } }, bottom: thinBorder, left: thinBorder, right: thinBorder },
  alignment: { vertical: "center" },
}

const totalMoneyStyle: StyledCell["s"] = {
  font: { bold: true, sz: 12 },
  fill: { fgColor: { rgb: GRAY_BG } },
  numFmt: '#,##0.00',
  border: { top: { style: "medium" as const, color: { rgb: BLACK } }, bottom: thinBorder, left: thinBorder, right: thinBorder },
  alignment: { horizontal: "right", vertical: "center" },
}

const totalPctStyle: StyledCell["s"] = {
  font: { bold: true, sz: 12 },
  fill: { fgColor: { rgb: GRAY_BG } },
  numFmt: '0.0%',
  border: { top: { style: "medium" as const, color: { rgb: BLACK } }, bottom: thinBorder, left: thinBorder, right: thinBorder },
  alignment: { horizontal: "right", vertical: "center" },
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function styled(v: string | number | null, s?: StyledCell["s"]): StyledCell {
  return { v, s }
}

function kvMoney(label: string, v: number): SheetRow {
  return [styled(label, labelStyle), { v, s: valueMoney, t: "n" }]
}

function kvPct(label: string, v: number | null): SheetRow {
  if (v === null) return [styled(label, labelStyle), styled("—", valueStyle)]
  return [styled(label, labelStyle), { v: v / 100, s: valuePct, t: "n" }]
}

function sectionHeader(label: string, colSpan: number): SheetRow {
  const row: SheetRow = [styled(label, sectionStyle)]
  for (let i = 1; i < colSpan; i++) row.push(styled("", sectionStyle))
  return row
}

function emptyRow(): SheetRow {
  return []
}

function varianceColor(variance: number) {
  const color = variance < 0 ? RED : variance > 0 ? GREEN : BLACK
  return { font: { sz: 12, color: { rgb: color } } }
}

// ── Builder ──────────────────────────────────────────────────────────────────

export interface XlsxBuildResult {
  rows: SheetRow[]
  transactionHeaderRow: number
  transactionCols: number
}

export function buildJobCostXlsx(
  summary: JobSummary,
  costGroups: CostGroup[],
  transactions: CostTransaction[],
  invoiceSummary: InvoiceSummary | null,
): XlsxBuildResult {
  const rows: SheetRow[] = []

  // ── Report title ──
  rows.push([styled(summary.jobName ?? "Project", titleStyle)])
  if (summary.clientName) rows.push([styled(summary.clientName, subtitleStyle)])
  if (summary.status) {
    rows.push([styled("Project Status:", statusLabelStyle), styled(JOB_STATUS_LABEL[summary.status] ?? "", statusValueStyle)])
  }
  rows.push([styled(`Exported ${new Date().toLocaleDateString("en-US")}  ·  All amounts in USD`, subtitleStyle)])
  rows.push(emptyRow())

  // ── Financial Summary ──
  rows.push(sectionHeader("Financial Summary", 2))
  rows.push(kvMoney("Original Contract", summary.originalContract))
  rows.push(kvMoney("Change Order Total", summary.changeOrderTotal))
  rows.push(kvMoney("Revised Contract", summary.revisedContract))
  rows.push(kvMoney("Revised Estimate", summary.revisedEstimate))
  rows.push(kvMoney("Actual to Date", summary.actualToDate))
  const profit = summary.revisedContract - summary.revisedEstimate
  rows.push(kvMoney("Projected Profit", profit))
  const margin = summary.revisedContract > 0
    ? ((summary.revisedContract - summary.revisedEstimate) / summary.revisedContract) * 100
    : null
  rows.push(kvPct("Projected Margin", margin))
  rows.push(emptyRow())

  // ── Invoice Summary ──
  if (invoiceSummary) {
    rows.push(sectionHeader("Invoice Summary", 2))
    rows.push(kvMoney("Total Invoiced", invoiceSummary.totalInvoiced))
    rows.push(kvMoney("Total Paid", invoiceSummary.totalPaid))
    rows.push(kvMoney("Outstanding", invoiceSummary.totalOutstanding))
    rows.push(kvPct("% of Contract Invoiced", invoiceSummary.invoicedPct))
    rows.push(emptyRow())
  }

  // ── Cost Breakdown ──
  rows.push(sectionHeader("Cost Breakdown", 6))
  rows.push([
    styled("Category", tableHeaderLeftStyle),
    styled("Budget", tableHeaderStyle),
    styled("Actual", tableHeaderStyle),
    styled("Variance", tableHeaderStyle),
    styled("Variance %", tableHeaderStyle),
    styled("% Used", tableHeaderStyle),
  ])
  let totalBudget = 0
  let totalActual = 0
  let totalVariance = 0
  costGroups.forEach((g, i) => {
    const stripe = i % 2 === 1
    const variancePct = g.budget > 0 ? (g.variance / g.budget) * 100 : null
    const usedPct = g.budget > 0 ? (g.actual / g.budget) * 100 : null
    const varColor = varianceColor(g.variance)
    rows.push([
      styled(g.costGroup, bodyStyle(stripe)),
      { v: g.budget, s: bodyMoneyStyle(stripe), t: "n" },
      { v: g.actual, s: bodyMoneyStyle(stripe), t: "n" },
      { v: g.variance, s: { ...bodyMoneyStyle(stripe), font: varColor.font }, t: "n" },
      variancePct !== null
        ? { v: variancePct / 100, s: { ...bodyPctStyle(stripe), font: varColor.font }, t: "n" }
        : styled("—", bodyStyle(stripe)),
      usedPct !== null
        ? { v: usedPct / 100, s: bodyPctStyle(stripe), t: "n" }
        : styled("—", bodyStyle(stripe)),
    ])
    totalBudget += g.budget
    totalActual += g.actual
    totalVariance += g.variance
  })
  const totalVariancePct = totalBudget > 0 ? (totalVariance / totalBudget) * 100 : null
  const totalUsedPct = totalBudget > 0 ? (totalActual / totalBudget) * 100 : null
  const totalVarColor = varianceColor(totalVariance)
  rows.push([
    styled("Total", totalLabelStyle),
    { v: totalBudget, s: totalMoneyStyle, t: "n" },
    { v: totalActual, s: totalMoneyStyle, t: "n" },
    { v: totalVariance, s: { ...totalMoneyStyle, font: { ...totalMoneyStyle!.font, color: totalVarColor.font.color } }, t: "n" },
    totalVariancePct !== null
      ? { v: totalVariancePct / 100, s: { ...totalPctStyle, font: { ...totalPctStyle!.font, color: totalVarColor.font.color } }, t: "n" }
      : styled("—", totalLabelStyle),
    totalUsedPct !== null
      ? { v: totalUsedPct / 100, s: totalPctStyle, t: "n" }
      : styled("—", totalLabelStyle),
  ])
  rows.push(emptyRow())

  // ── Transaction Detail (sorted by category then date) ──
  const sorted = [...transactions].sort((a, b) => {
    const cmp = a.costGroup.localeCompare(b.costGroup)
    if (cmp !== 0) return cmp
    return String(a.transDate ?? "").localeCompare(String(b.transDate ?? ""))
  })

  rows.push(sectionHeader("Transaction Detail", 7))
  const transactionHeaderRow = rows.length
  rows.push([
    styled("Category", tableHeaderLeftStyle),
    styled("Cost Type", tableHeaderLeftStyle),
    styled("Vendor", tableHeaderLeftStyle),
    styled("Description", tableHeaderLeftStyle),
    styled("Date", tableHeaderStyle),
    styled("PO / Ref", tableHeaderStyle),
    styled("Amount", tableHeaderStyle),
  ])
  sorted.forEach((t, i) => {
    const stripe = i % 2 === 1
    rows.push([
      styled(t.costGroup, bodyStyle(stripe)),
      styled(t.costType, bodyStyle(stripe)),
      styled(t.vendorName, bodyStyle(stripe)),
      styled(t.description ?? "", bodyStyle(stripe)),
      styled(formatDate(t.transDate), { ...bodyStyle(stripe), alignment: { horizontal: "center", vertical: "center" } }),
      styled(t.poReference ?? "", { ...bodyStyle(stripe), alignment: { horizontal: "center", vertical: "center" } }),
      { v: t.amount, s: bodyMoneyStyle(stripe), t: "n" },
    ])
  })

  return { rows, transactionHeaderRow, transactionCols: 7 }
}
