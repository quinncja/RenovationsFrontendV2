import { formatDate } from "../../shared/utils/format"
import type { SheetRow, StyledCell } from "../../shared/utils/exportXlsx"
import type { ChangeOrder } from "../change-orders/types"

// Job-cost report builder — same export shape as the 93E version (SheetRow[],
// auto-filtered transaction detail), but styled with RD's copper palette and
// adapted to RD's data: committed-vs-posted cost split, separate change-order
// and monthly-spend sections.

// ─── Public shapes the builder accepts ────────────────────────────────

export interface ExportProject {
  name: string
  recnum: string | number
  status: number | null
  pmName: string | null
  originalContract: number
  changeOrderAmount: number
  totalContract: number
  totalBudget: number
  totalCost: number
  totalIncome: number
}

export interface ExportGroupRow {
  key: string
  budget: number
  actual: number
  variance: number
  variancePct: number | null
}

export interface ExportCostItem {
  costType: string
  id: string
  dscrpt: string
  committedAmount: number
  postedAmount: number
}

export interface ExportInvoiceSummary {
  totalInvoiced: number
  totalPaid: number
  totalOutstanding: number
  invoicedPct: number
}

export interface ExportMonthlySpend {
  year: number
  month: number
  spending: number
}

const JOB_STATUS_LABEL: Record<number, string> = {
  1: "Bidding", 2: "Refused", 3: "Contract", 4: "Current", 5: "Complete", 6: "Closed",
}

const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

// ── RD palette (copper + warm neutrals) ──────────────────────────────────────

const BRAND       = "C27C3E"  // copper accent
const BRAND_LIGHT = "FAF2E7"  // tinted row stripe (very warm cream)
const GRAY_BG     = "F5F1EC"  // warm gray for label cells
const BORDER_CLR  = "D7CFC6"  // warm border line
const WHITE       = "FFFFFF"
const BLACK       = "19375A"  // navy used elsewhere by RD for primary text
const SUBTEXT     = "6B7A8D"  // muted secondary text
const RED         = "DC2626"
const GREEN       = "15803D"

const thinBorder = { style: "thin" as const, color: { rgb: BORDER_CLR } }
const cellBorder = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder }

// ── Reusable styles ─────────────────────────────────────────────────────────

const titleStyle: StyledCell["s"] = {
  font: { bold: true, sz: 20, color: { rgb: BRAND } },
  alignment: { horizontal: "left", vertical: "center" },
}

const subtitleStyle: StyledCell["s"] = {
  font: { sz: 12, color: { rgb: SUBTEXT } },
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
  font: { bold: true, sz: 12, color: { rgb: BLACK } },
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

function bodyStyle(stripe: boolean): StyledCell["s"] {
  return {
    font: { sz: 12 },
    fill: stripe ? { fgColor: { rgb: BRAND_LIGHT } } : undefined,
    border: cellBorder,
    alignment: { vertical: "center" },
  }
}

function bodyMoneyStyle(stripe: boolean): StyledCell["s"] {
  return { ...bodyStyle(stripe), numFmt: '#,##0.00', alignment: { horizontal: "right", vertical: "center" } }
}

function bodyPctStyle(stripe: boolean): StyledCell["s"] {
  return { ...bodyStyle(stripe), numFmt: '0.0%', alignment: { horizontal: "right", vertical: "center" } }
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

// ── Helpers ─────────────────────────────────────────────────────────────────

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

function emptyRow(): SheetRow { return [] }

function varianceColor(variance: number) {
  const color = variance < 0 ? RED : variance > 0 ? GREEN : BLACK
  return { font: { sz: 12, color: { rgb: color } } }
}

// ── Builder ─────────────────────────────────────────────────────────────────

export interface XlsxBuildResult {
  rows: SheetRow[]
  /** 0-indexed header row of the Transaction Detail table for auto-filter. */
  transactionHeaderRow: number
  transactionCols: number
}

export function buildJobCostXlsx(
  project: ExportProject,
  groups: ExportGroupRow[],
  costItems: ExportCostItem[],
  changeOrders: ChangeOrder[],
  invoiceSummary: ExportInvoiceSummary | null,
  monthlySpend: ExportMonthlySpend[],
): XlsxBuildResult {
  const rows: SheetRow[] = []

  // ── Report title ──
  rows.push([styled(project.name || "Project", titleStyle)])
  rows.push([styled(`Job #${project.recnum}`, subtitleStyle)])
  if (project.status != null && JOB_STATUS_LABEL[project.status]) {
    rows.push([styled("Status:", labelStyle), styled(JOB_STATUS_LABEL[project.status], { font: { bold: true, sz: 12, color: { rgb: BRAND } }, alignment: { horizontal: "left", vertical: "center" } })])
  }
  if (project.pmName) {
    rows.push([styled("Project Manager:", labelStyle), styled(project.pmName, valueStyle)])
  }
  rows.push([styled(`Exported ${new Date().toLocaleDateString("en-US")}  ·  All amounts in USD`, subtitleStyle)])
  rows.push(emptyRow())

  // ── Financial Summary ──
  rows.push(sectionHeader("Financial Summary", 2))
  rows.push(kvMoney("Original Contract", project.originalContract))
  rows.push(kvMoney("Change Orders", project.changeOrderAmount))
  rows.push(kvMoney("Revised Contract", project.totalContract))
  rows.push(kvMoney("Revised Budget", project.totalBudget))
  rows.push(kvMoney("Spending to Date", project.totalCost))
  const profit = project.totalContract - project.totalCost
  rows.push(kvMoney("Projected Profit", profit))
  const margin = project.totalContract > 0
    ? ((project.totalContract - project.totalCost) / project.totalContract) * 100
    : null
  rows.push(kvPct("Projected Margin", margin))
  rows.push(emptyRow())

  // ── Invoice Summary ──
  if (invoiceSummary) {
    rows.push(sectionHeader("Invoice Summary", 2))
    rows.push(kvMoney("Total Invoiced", invoiceSummary.totalInvoiced))
    rows.push(kvMoney("Amount Paid", invoiceSummary.totalPaid))
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
  groups.forEach((g, i) => {
    const stripe = i % 2 === 1
    const usedPct = g.budget > 0 ? (g.actual / g.budget) * 100 : null
    const varColor = varianceColor(g.variance)
    rows.push([
      styled(g.key, bodyStyle(stripe)),
      { v: g.budget, s: bodyMoneyStyle(stripe), t: "n" },
      { v: g.actual, s: bodyMoneyStyle(stripe), t: "n" },
      { v: g.variance, s: { ...bodyMoneyStyle(stripe), font: varColor.font }, t: "n" },
      g.variancePct !== null
        ? { v: g.variancePct / 100, s: { ...bodyPctStyle(stripe), font: varColor.font }, t: "n" }
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

  // ── Change Orders ──
  if (changeOrders.length > 0) {
    rows.push(sectionHeader("Change Orders", 5))
    rows.push([
      styled("Description", tableHeaderLeftStyle),
      styled("Date", tableHeaderStyle),
      styled("Submitted By", tableHeaderLeftStyle),
      styled("Budget", tableHeaderStyle),
      styled("Contract", tableHeaderStyle),
    ])
    let coBudget = 0
    let coContract = 0
    changeOrders.forEach((co, i) => {
      const stripe = i % 2 === 1
      const budget = Number(co.budget) || 0
      const contract = Number(co.total) || 0
      coBudget += budget
      coContract += contract
      rows.push([
        styled(co.name ?? "", bodyStyle(stripe)),
        styled(formatDate(co.date), { ...bodyStyle(stripe), alignment: { horizontal: "center", vertical: "center" } }),
        styled(co.user ?? "", bodyStyle(stripe)),
        { v: budget, s: bodyMoneyStyle(stripe), t: "n" },
        { v: contract, s: bodyMoneyStyle(stripe), t: "n" },
      ])
    })
    rows.push([
      styled(`Total (${changeOrders.length})`, totalLabelStyle),
      styled("", totalLabelStyle),
      styled("", totalLabelStyle),
      { v: coBudget, s: totalMoneyStyle, t: "n" },
      { v: coContract, s: totalMoneyStyle, t: "n" },
    ])
    rows.push(emptyRow())
  }

  // ── Monthly Spend ──
  if (monthlySpend.length > 0) {
    rows.push(sectionHeader("Monthly Spend", 3))
    rows.push([
      styled("Month", tableHeaderLeftStyle),
      styled("Year", tableHeaderStyle),
      styled("Spending", tableHeaderStyle),
    ])
    let monthTotal = 0
    monthlySpend.forEach((m, i) => {
      const stripe = i % 2 === 1
      monthTotal += m.spending
      rows.push([
        styled(MONTH_FULL[m.month - 1] ?? String(m.month), bodyStyle(stripe)),
        styled(m.year, { ...bodyStyle(stripe), alignment: { horizontal: "center", vertical: "center" } }),
        { v: m.spending, s: bodyMoneyStyle(stripe), t: "n" },
      ])
    })
    rows.push([
      styled("Total", totalLabelStyle),
      styled("", totalLabelStyle),
      { v: monthTotal, s: totalMoneyStyle, t: "n" },
    ])
    rows.push(emptyRow())
  }

  // ── Transaction Detail (cost items, sorted by category) ──
  const sorted = [...costItems].sort((a, b) => a.costType.localeCompare(b.costType))

  rows.push(sectionHeader("Transaction Detail", 6))
  const transactionHeaderRow = rows.length
  rows.push([
    styled("Category", tableHeaderLeftStyle),
    styled("Vendor / Source", tableHeaderLeftStyle),
    styled("Description", tableHeaderLeftStyle),
    styled("Committed", tableHeaderStyle),
    styled("Posted", tableHeaderStyle),
    styled("Total", tableHeaderStyle),
  ])
  sorted.forEach((c, i) => {
    const stripe = i % 2 === 1
    const total = (c.committedAmount || 0) + (c.postedAmount || 0)
    rows.push([
      styled(c.costType, bodyStyle(stripe)),
      styled(c.id ?? "", bodyStyle(stripe)),
      styled(c.dscrpt ?? "", bodyStyle(stripe)),
      { v: c.committedAmount || 0, s: bodyMoneyStyle(stripe), t: "n" },
      { v: c.postedAmount || 0, s: bodyMoneyStyle(stripe), t: "n" },
      { v: total, s: bodyMoneyStyle(stripe), t: "n" },
    ])
  })

  return { rows, transactionHeaderRow, transactionCols: 6 }
}
