import XLSX from "xlsx-js-style"
import { shortMonth } from "../../shared/utils/format"
import { computeRow, computeSummary } from "./calc"
import type { ProjectionRow, ProjectionSummary, SheetActuals } from "./types"
import { XLSX_GOLD, XLSX_INK, XLSX_INK_SOFT, XLSX_MUTED, XLSX_HEAD_FILL, XLSX_STRIPE, XLSX_NEG, xlsxCellBorder, xlsxTotalBorder } from "../../shared/utils/xlsxTheme"

/**
 * Excel export of the Projection Board — one sheet, laid out in page order:
 * Summary (the stat strip) → Unit Projection → Pipeline → Monthly Summary.
 *
 * Structure follows the dashboard's other reports (exportMonthlyBreakdownXlsx.ts:
 * title + Fiscal Year / Exported lines, section bands, bordered zebra rows,
 * total rows with a medium top rule) but the dress is the board's own muted
 * palette: warm off-white bands and headers with dark text, gold used only as
 * accent text, never as a solid fill.
 *
 * LIVE WORKBOOK: inputs (identity, units, price, % win, margin, the monthly
 * schedule, monthly overhead, booked actuals) are plain values; every derived
 * cell (row totals, COGS, gross revenue/profit, scheduled/unscheduled units,
 * section totals, the Monthly Summary P&L, the Summary KPIs and their notes)
 * is an Excel formula mirroring calc.ts, with the board's current figure
 * cached as its value. Change a unit count or a price in Excel and the
 * whole sheet follows, exactly as the board would.
 *
 * Per-cell colors from the grid carry over: a board fill token maps to the
 * same soft tint here, replacing the zebra stripe on that cell.
 */

export interface ExportActuals {
  /** Booked units by month; absent for stored versions (Sage-only figure). */
  units?: number[]
  revenue: number[]
  cogs: number[]
  overhead: number[]
  hasMonth: boolean[]
}

export interface ExportSource {
  year: number
  overheadMonthly: number
  rows: ProjectionRow[]
  pipeline: ProjectionRow[]
  actuals: SheetActuals
  /** Booked figures for the Actual block (the page shows Sage; a stored
   *  version falls back to its own actuals block when this is absent). */
  bookedActuals?: ExportActuals | null
  /** Extra line under the title for a stored version ("Version … · saved …"). */
  versionLine?: string
}

/* ── Colors — the shared muted export palette (shared/utils/xlsxTheme.ts) ── */
const GOLD = XLSX_GOLD // accent TEXT only; never a fill
const INK = XLSX_INK
const INK_SOFT = XLSX_INK_SOFT
const HEAD_FILL = XLSX_HEAD_FILL
const STRIPE = XLSX_STRIPE
const MUTED = XLSX_MUTED
const MUTED_INK = "7A7269" // computed (read-only) columns
const NEG = XLSX_NEG

/** Board fill tokens → Excel tint (light-mode `--pj-c-*` at the grid's opacity). */
const FILL_HEX: Record<string, string> = {
  red: "F3DBD7",
  amber: "F7E8D0",
  green: "DCEBE0",
  blue: "DAE4F1",
  purple: "E6DEF1",
  copper: "F3E3D4",
  gray: "E8E5E1",
}

const MONEY_FMT = "#,##0.00"
const MONEY0_FMT = "#,##0;[Red]-#,##0"
const PCT_FMT = "0.0%"
const UNITS_FMT = "0.###"

type Cell = XLSX.CellObject
type Style = XLSX.CellStyle

const cellBorder = xlsxCellBorder
const inkFont = (extra: object = {}) => ({ sz: 12, color: { rgb: INK }, ...extra })

/* ── Styles: the breakdown report's structure, the board's calm dress ── */
const titleStyle: Style = { font: { bold: true, sz: 20, color: { rgb: GOLD } }, alignment: { horizontal: "left", vertical: "center" } }
const subtitleStyle: Style = { font: { sz: 12, color: { rgb: MUTED } }, alignment: { horizontal: "left" } }
const sectionStyle: Style = {
  font: { bold: true, sz: 14, color: { rgb: INK } },
  fill: { fgColor: { rgb: HEAD_FILL } },
  alignment: { horizontal: "left", vertical: "center" },
  border: cellBorder,
}
const sectionNoteStyle: Style = { ...sectionStyle, font: { sz: 11, color: { rgb: INK_SOFT } }, alignment: { horizontal: "right", vertical: "center" } }
const headerStyle: Style = {
  font: { bold: true, sz: 11, color: { rgb: INK_SOFT } },
  fill: { fgColor: { rgb: HEAD_FILL } },
  alignment: { horizontal: "right", vertical: "center" },
  border: cellBorder,
}
const headerLeftStyle: Style = { ...headerStyle, alignment: { horizontal: "left", vertical: "center" } }
const groupHeaderStyle: Style = { ...headerStyle, font: { bold: true, sz: 11, color: { rgb: GOLD } }, alignment: { horizontal: "center", vertical: "center" } }
const bandStyle: Style = {
  font: { bold: true, sz: 11, color: { rgb: GOLD } },
  fill: { fgColor: { rgb: STRIPE } },
  border: cellBorder,
  alignment: { horizontal: "left", vertical: "center" },
}
const totalLabelStyle: Style = {
  font: inkFont({ bold: true }),
  fill: { fgColor: { rgb: STRIPE } },
  border: xlsxTotalBorder,
  alignment: { vertical: "center" },
}
const kpiLabelStyle: Style = { font: inkFont({ bold: true }), fill: { fgColor: { rgb: HEAD_FILL } }, border: cellBorder, alignment: { horizontal: "left", vertical: "center" } }
const kpiValueStyle: Style = { font: { bold: true, sz: 12, color: { rgb: GOLD } }, border: cellBorder, alignment: { horizontal: "right", vertical: "center" } }
const kpiNoteStyle: Style = { font: { sz: 11, color: { rgb: INK_SOFT } }, border: cellBorder, alignment: { horizontal: "left", vertical: "center" } }

function body(stripe: boolean, align: "left" | "right" = "left", extra: Partial<Style> = {}): Style {
  return {
    font: inkFont(),
    fill: stripe ? { fgColor: { rgb: STRIPE } } : undefined,
    border: cellBorder,
    alignment: { horizontal: align, vertical: "center" },
    ...extra,
  }
}
function total(align: "left" | "right", numFmt?: string): Style {
  return { ...totalLabelStyle, alignment: { horizontal: align, vertical: "center" }, ...(numFmt ? { numFmt } : {}) }
}

/* ── Cells ── */
function text(v: string | null | undefined, s: Style): Cell {
  return { v: v ?? "", t: "s", s }
}
function num(v: number, s: Style): Cell {
  return { v, t: "n", s }
}
/** Apply a board fill token (replaces the stripe) and/or mute computed cells. */
function dress(cell: Cell, fill?: string, muted = false): Cell {
  const s: Style = { ...(cell.s ?? {}) }
  if (fill && FILL_HEX[fill]) s.fill = { fgColor: { rgb: FILL_HEX[fill] } }
  if (muted) s.font = { ...(s.font ?? {}), color: { rgb: MUTED_INK } }
  return { ...cell, s }
}
function negAware(v: number, s: Style): Cell {
  return num(v, v < 0 ? { ...s, font: { ...(s.font ?? {}), color: { rgb: NEG } } } : s)
}
/** A numeric formula cell; `cached` is what the board shows today, kept so a
 *  viewer that doesn't recalculate still sees the figure. Negative cached
 *  values keep the red ink (Excel's own conditional color would need a
 *  number format, which the muted palette reserves for the money0 style). */
function fx(formula: string, cached: number, s: Style): Cell {
  const cell = negAware(cached, s)
  return { ...cell, f: formula }
}
/** A text-producing formula (the KPI notes). */
function fxText(formula: string, cached: string, s: Style): Cell {
  return { v: cached, t: "s", f: formula, s }
}

/* ── Addressing: 0-based sheet coords → A1 refs ── */
const COL = (c: number) => XLSX.utils.encode_col(c)
/** Relative A1 for a 0-based row/col. */
const A1 = (r: number, c: number) => `${COL(c)}${r + 1}`
/** Absolute A1. */
const ABS = (r: number, c: number) => `$${COL(c)}$${r + 1}`
/** Absolute column range over rows r0..r1 (inclusive, 0-based). */
const RANGE = (c: number, r0: number, r1: number) => `${ABS(r0, c)}:${ABS(r1, c)}`

/** Grid column indexes (Unit Projection / Pipeline share the first eight). */
const C = {
  address: 0, client: 1, name: 2,
  units: 3, price: 4, total: 5, pctWin: 6, margin: 7,
  cogs: 8, grossRev: 9, grossProfit: 10,
  month0: 11, // L..W
  sched: 23, unsched: 24,
} as const

/** Where the sections landed, for cross-references. */
interface Anchors {
  /** First/last project row (0-based sheet rows); null when there are none. */
  grid: { r0: number; r1: number } | null
  gridTotals: number
  /** The editable monthly-overhead input cell. */
  overhead: { r: number; c: number }
  /** Monthly Summary "Net" row and its Total column, for the Projected Net KPI. */
  monthlyNet?: { r: number; totalC: number }
}

class Sheet {
  cells: Record<string, Cell> = {}
  merges: XLSX.Range[] = []
  heights: Record<number, number> = {}
  maxR = -1
  maxC = 0
  r = 0
  put(row: number, col: number, cell: Cell) {
    this.cells[XLSX.utils.encode_cell({ r: row, c: col })] = cell
    this.maxR = Math.max(this.maxR, row)
    this.maxC = Math.max(this.maxC, col + 1)
  }
  line(cells: Cell[], height?: number) {
    cells.forEach((c, i) => this.put(this.r, i, c))
    if (height) this.heights[this.r] = height
    this.r += 1
  }
  merge(row: number, c0: number, c1: number) {
    if (c1 > c0) this.merges.push({ s: { r: row, c: c0 }, e: { r: row, c: c1 } })
  }
  skip(n = 1) {
    this.r += n
  }
  /** Section band spanning `span` columns, optional right-aligned note. */
  section(label: string, span: number, note?: string) {
    const cells = Array.from({ length: span }, () => text("", sectionStyle))
    cells[0] = text(label, sectionStyle)
    if (note) cells[span - 1] = text(note, sectionNoteStyle)
    this.line(cells, 22)
    this.merge(this.r - 1, 0, note ? span - 2 : span - 1)
  }
  finish(colWidths: number[]): XLSX.WorkSheet {
    const ws: XLSX.WorkSheet = { ...this.cells }
    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(this.maxR, 0), c: Math.max(this.maxC - 1, 0) } })
    ws["!merges"] = this.merges
    ws["!cols"] = colWidths.map((w) => ({ wch: w }))
    ws["!rows"] = Array.from({ length: this.maxR + 1 }, (_, i) => (this.heights[i] ? { hpt: this.heights[i] } : {}))
    return ws
  }
}

const money = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`
const pct = (v: number) => `${Math.round(v * 1000) / 10}%`

/** Address / Client / Name, honoring board fills. */
function identity(row: ProjectionRow, stripe: boolean): Cell[] {
  const s = row.styles ?? {}
  return [
    dress(text(row.address, body(stripe)), s.address?.fill),
    dress(text(row.client, body(stripe)), s.client?.fill),
    dress(text(row.name, body(stripe)), s.name?.fill),
  ]
}

const GRID_COLS = 3 + 8 + 14 // identity + economics + 12 months + sched/left

/* ── Sections ── */

/** The Summary block references totals that live further down the sheet, so
 *  it reserves its rows first and is filled in by `fillSummary` once every
 *  section has landed. Returns the row of the first KPI. */
function reserveSummary(b: Sheet): number {
  b.section("Summary", 4)
  const r0 = b.r
  b.skip(5) // four KPIs + the overhead input
  b.skip()
  return r0
}

function fillSummary(b: Sheet, src: ExportSource, summary: ProjectionSummary, r0: number, a: Anchors) {
  const g = a.grid
  const T = (c: number) => ABS(a.gridTotals, c)
  const units = T(C.units)
  const value = T(C.total)
  const gross = T(C.grossProfit)
  const winAdj = T(C.grossRev)
  const sched = T(C.sched)
  const projects = g ? `ROWS(${RANGE(C.address, g.r0, g.r1)})` : "0"
  const overhead = ABS(a.overhead.r, a.overhead.c)
  const net = a.monthlyNet ? ABS(a.monthlyNet.r, a.monthlyNet.totalC) : null

  const kpis: Array<[string, Cell, Cell]> = [
    [
      "Projected Units",
      fx(units, summary.totalUnits, { ...kpiValueStyle, numFmt: UNITS_FMT }),
      fxText(`${projects}&" projects · "&ROUND(${sched},3)&" scheduled"`, `${src.rows.length} projects · ${summary.scheduledUnits} scheduled`, kpiNoteStyle),
    ],
    [
      "Projected Contract",
      fx(value, summary.totalValue, { ...kpiValueStyle, numFmt: MONEY_FMT }),
      fxText(`TEXT(${winAdj},"$#,##0")&" win-adjusted"`, `${money(summary.totalGrossRevenue)} win-adjusted`, kpiNoteStyle),
    ],
    [
      "Projected Gross",
      fx(gross, summary.totalGrossProfit, { ...kpiValueStyle, numFmt: MONEY_FMT }),
      fxText(`"bid at "&ROUND(IFERROR(${gross}/${winAdj},0)*100,0)&"% margin"`, `bid at ${pct(summary.blendedMargin)} margin`, kpiNoteStyle),
    ],
    [
      "Projected Net",
      net ? fx(net, summary.scheduledNet, { ...kpiValueStyle, numFmt: MONEY_FMT }) : num(summary.scheduledNet, { ...kpiValueStyle, numFmt: MONEY_FMT }),
      fxText(`"after "&TEXT(${overhead},"$#,##0")&"/mo overhead"`, `after ${money(src.overheadMonthly)}/mo overhead`, kpiNoteStyle),
    ],
  ]
  kpis.forEach(([label, valueCell, note], i) => {
    const r = r0 + i
    b.put(r, 0, text(label, kpiLabelStyle))
    b.put(r, 1, valueCell)
    b.put(r, 2, note)
    b.put(r, 3, text("", kpiNoteStyle))
    b.merge(r, 2, 3)
  })
  // The one input up here: monthly overhead, which the Monthly Summary reads.
  const r = a.overhead.r
  b.put(r, 0, text("Monthly Overhead", kpiLabelStyle))
  b.put(r, 1, num(src.overheadMonthly, { ...kpiValueStyle, numFmt: MONEY_FMT, font: inkFont({ bold: true }) }))
  b.put(r, 2, text("Input · edit to re-run the P&L", kpiNoteStyle))
  b.put(r, 3, text("", kpiNoteStyle))
  b.merge(r, 2, 3)
}

function projectionSection(b: Sheet, src: ExportSource, summary: ProjectionSummary): Pick<Anchors, "grid" | "gridTotals"> {
  b.section("Unit Projection", GRID_COLS, "Awarded projects · units scheduled per month")

  // Column-group row (Project | Economics | Schedule) then the headers.
  const groups: Cell[] = []
  const push = (label: string, span: number) => {
    const start = groups.length
    for (let i = 0; i < span; i++) groups.push(text(i === 0 ? label : "", groupHeaderStyle))
    b.merge(b.r, start, start + span - 1)
  }
  push("Project", 3)
  push("Economics", 8)
  push("Schedule · units per month", 14)
  b.line(groups, 18)

  b.line(
    [
      text("Address", headerLeftStyle), text("Client", headerLeftStyle), text("Name", headerLeftStyle),
      text("Units", headerStyle), text("Avg Unit Price", headerStyle), text("Total", headerStyle),
      text("% Win", headerStyle), text("Margin", headerStyle), text("COGS", headerStyle),
      text("Gross Rev", headerStyle), text("Gross Profit", headerStyle),
      ...Array.from({ length: 12 }, (_, m) => text(shortMonth(m + 1), headerStyle)),
      text("Sched", headerStyle), text("Unsched", headerStyle),
    ],
    18
  )

  const r0 = b.r
  src.rows.forEach((row, i) => {
    const stripe = i % 2 === 1
    const c = computeRow(row)
    const s = row.styles ?? {}
    const R = (fmt: string) => body(stripe, "right", { numFmt: fmt })
    const r = b.r
    const at = (col: number) => A1(r, col)
    const monthRange = `${at(C.month0)}:${at(C.month0 + 11)}`
    b.line([
      ...identity(row, stripe),
      dress(num(row.units, R(UNITS_FMT)), s.units?.fill),
      dress(num(row.avgUnitPrice, R(MONEY_FMT)), s.avgUnitPrice?.fill),
      dress(fx(`${at(C.units)}*${at(C.price)}`, c.total, R(MONEY_FMT)), undefined, true),
      dress(num(row.pctWin, R(PCT_FMT)), s.pctWin?.fill),
      dress(num(row.grossMargin, R(PCT_FMT)), s.grossMargin?.fill),
      dress(fx(`1-${at(C.margin)}`, c.cogs, R(PCT_FMT)), undefined, true),
      dress(fx(`${at(C.total)}*${at(C.pctWin)}`, c.grossRevenue, R(MONEY_FMT)), undefined, true),
      dress(fx(`${at(C.grossRev)}*${at(C.margin)}`, c.grossProfit, R(MONEY_FMT)), undefined, true),
      ...row.months.map((u, m) => dress(u ? num(u, R(UNITS_FMT)) : text("", R(UNITS_FMT)), s[`month:${m}`]?.fill)),
      dress(fx(`SUM(${monthRange})`, c.unitsScheduled, R(UNITS_FMT)), undefined, true),
      dress(fx(`${at(C.units)}-${at(C.sched)}`, c.unitsRemaining, R(UNITS_FMT)), undefined, true),
    ])
  })
  const r1 = b.r - 1
  const grid = src.rows.length ? { r0, r1 } : null
  const sum = (col: number, cached: number, fmt: string) =>
    grid ? fx(`SUM(${RANGE(col, grid.r0, grid.r1)})`, cached, total("right", fmt)) : num(cached, total("right", fmt))

  // Totals row — same cells the on-screen footer fills, now summing the
  // rows above so an edited row rolls up.
  const tr = b.r
  b.line([
    text("Totals", total("left")), text("", total("left")), text("", total("left")),
    sum(C.units, summary.totalUnits, UNITS_FMT),
    text("", total("right")),
    sum(C.total, summary.totalValue, MONEY_FMT),
    text("", total("right")), text("", total("right")), text("", total("right")),
    sum(C.grossRev, summary.totalGrossRevenue, MONEY_FMT),
    sum(C.grossProfit, summary.totalGrossProfit, MONEY_FMT),
    ...summary.unitsByMonth.map((u, m) => sum(C.month0 + m, u, UNITS_FMT)),
    sum(C.sched, summary.scheduledUnits, UNITS_FMT),
    fx(`${A1(tr, C.units)}-${A1(tr, C.sched)}`, summary.totalUnits - summary.scheduledUnits, total("right", UNITS_FMT)),
  ])
  b.skip()
  return { grid, gridTotals: tr }
}

function pipelineSection(b: Sheet, src: ExportSource, summary: ProjectionSummary) {
  const COLS = 10
  b.section("Pipeline", COLS, "Bidding-stage · excluded from the P&L until awarded")
  b.line(
    [
      text("Address", headerLeftStyle), text("Client", headerLeftStyle), text("Name", headerLeftStyle),
      text("Units", headerStyle), text("Avg Unit Price", headerStyle), text("Total", headerStyle),
      text("% Win", headerStyle), text("Margin", headerStyle), text("Gross Rev", headerStyle), text("Gross Profit", headerStyle),
    ],
    18
  )
  // Pipeline columns: the grid's first eight, then Gross Rev / Gross Profit
  // directly (no COGS column here).
  const P = { grossRev: 8, grossProfit: 9 }
  const r0 = b.r
  src.pipeline.forEach((row, i) => {
    const stripe = i % 2 === 1
    const c = computeRow(row)
    const s = row.styles ?? {}
    const R = (fmt: string) => body(stripe, "right", { numFmt: fmt })
    const r = b.r
    const at = (col: number) => A1(r, col)
    b.line([
      ...identity(row, stripe),
      dress(num(row.units, R(UNITS_FMT)), s.units?.fill),
      dress(num(row.avgUnitPrice, R(MONEY_FMT)), s.avgUnitPrice?.fill),
      dress(fx(`${at(C.units)}*${at(C.price)}`, c.total, R(MONEY_FMT)), undefined, true),
      dress(num(row.pctWin, R(PCT_FMT)), s.pctWin?.fill),
      dress(num(row.grossMargin, R(PCT_FMT)), s.grossMargin?.fill),
      dress(fx(`${at(C.total)}*${at(C.pctWin)}`, c.grossRevenue, R(MONEY_FMT)), undefined, true),
      dress(fx(`${at(P.grossRev)}*${at(C.margin)}`, c.grossProfit, R(MONEY_FMT)), undefined, true),
    ])
  })
  const r1 = b.r - 1
  const has = src.pipeline.length > 0
  const sum = (col: number, cached: number, fmt: string) =>
    has ? fx(`SUM(${RANGE(col, r0, r1)})`, cached, total("right", fmt)) : num(cached, total("right", fmt))
  const p = summary.pipeline
  b.line([
    has
      ? fxText(`"Totals · "&ROWS(${RANGE(C.address, r0, r1)})&" projects"`, `Totals · ${p.count} project${p.count === 1 ? "" : "s"}`, total("left"))
      : text("Totals · 0 projects", total("left")),
    text("", total("left")), text("", total("left")),
    sum(C.units, p.units, UNITS_FMT),
    text("", total("right")),
    sum(C.total, p.value, MONEY_FMT),
    text("", total("right")), text("", total("right")), text("", total("right")),
    sum(P.grossProfit, p.grossProfit, MONEY_FMT),
  ])
  b.skip()
}

function monthlySection(b: Sheet, src: ExportSource, summary: ProjectionSummary, a: Anchors): Anchors["monthlyNet"] {
  const COLS = 14
  const TOTAL_C = 13 // label in A, months B..M, Total in N
  const overhead = ABS(a.overhead.r, a.overhead.c)
  b.section("Monthly Summary", COLS, `Projected P&L vs actuals booked · overhead ${money(src.overheadMonthly)}/month`)
  b.line(
    [text("", headerLeftStyle), ...Array.from({ length: 12 }, (_, m) => text(shortMonth(m + 1), headerStyle)), text("Total", headerStyle)],
    18
  )

  const band = (label: string) => {
    b.line(Array.from({ length: COLS }, (_, i) => text(i === 0 ? label : "", bandStyle)))
    b.merge(b.r - 1, 0, COLS - 1)
  }
  let stripeIdx = 0
  /** One P&L line. `cells[m]` is a number (value), a `{ f, v }` formula, or
   *  null (not entered: an en dash). `sum` is the Total column, formula or
   *  number. Returns the sheet row it landed on. */
  type MCell = number | null | { f: string; v: number }
  const line = (label: string, cells: MCell[], sum: MCell, fmt: string, bold = false): number => {
    const stripe = stripeIdx++ % 2 === 1
    const L = body(stripe, "left", bold ? { font: inkFont({ bold: true }) } : {})
    const N = body(stripe, "right", { numFmt: fmt, ...(bold ? { font: inkFont({ bold: true }) } : {}) })
    const NB = { ...N, font: inkFont({ bold: true }) }
    const cell = (v: MCell, st: Style) =>
      v == null ? text("–", { ...st, font: { sz: 12, color: { rgb: MUTED } } }) : typeof v === "number" ? negAware(v, st) : fx(v.f, v.v, st)
    const r = b.r
    b.line([text(label, L), ...cells.map((v) => cell(v, N)), cell(sum, NB)])
    return r
  }
  /** Total column = SUM of the row's twelve months. */
  const rowSum = (r: number, cached: number): MCell => ({ f: `SUM(${A1(r, 1)}:${A1(r, 12)})`, v: cached })
  /** Running total along a row (cumulative lines). */
  const running = (srcRow: number, r: number, m: number, cached: number): MCell =>
    m === 0 ? { f: A1(srcRow, 1), v: cached } : { f: `${A1(r, m)}+${A1(srcRow, m + 1)}`, v: cached }

  const g = a.grid
  const projRow = (col: (m: number) => string, cached: number[]) =>
    cached.map((v, m) => (g ? ({ f: col(m), v } as MCell) : v))

  band("Projected")
  stripeIdx = 0
  // Per-month roll-ups straight off the project rows: units are a plain
  // SUM of the month column; revenue weights it by price; COGS by price
  // less the margin share. Same math as calc.ts, evaluated by Excel.
  const mcol = (m: number) => (g ? RANGE(C.month0 + m, g.r0, g.r1) : "")
  const price = g ? RANGE(C.price, g.r0, g.r1) : ""
  const margin = g ? RANGE(C.margin, g.r0, g.r1) : ""
  let r = b.r
  line(
    "Units",
    g ? projRow((m) => `SUM(${mcol(m)})`, summary.unitsByMonth) : summary.unitsByMonth.map((u) => (u === 0 ? null : u)),
    rowSum(r, summary.scheduledUnits),
    UNITS_FMT
  )
  r = b.r
  const revR = line("Revenue", projRow((m) => `SUMPRODUCT(${mcol(m)},${price})`, summary.revenueByMonth), rowSum(r, summary.scheduledRevenue), MONEY0_FMT)
  r = b.r
  const cogsR = line(
    "COGS",
    // units·price·(1-margin), written as two plain-range SUMPRODUCTs: array
    // arithmetic inside SUMPRODUCT is Excel-only, and this form evaluates
    // identically in Numbers, Sheets and LibreOffice.
    projRow((m) => `SUMPRODUCT(${mcol(m)},${price})-SUMPRODUCT(${mcol(m)},${price},${margin})`, summary.cogsByMonth),
    rowSum(r, summary.cogsByMonth.reduce((s, c) => s + c, 0)),
    MONEY0_FMT
  )
  r = b.r
  const ovhR = line("Overhead", Array.from({ length: 12 }, () => ({ f: overhead, v: src.overheadMonthly })), rowSum(r, src.overheadMonthly * 12), MONEY0_FMT)
  r = b.r
  const netR = line(
    "Net",
    summary.netByMonth.map((v, m) => ({ f: `${A1(revR, m + 1)}-${A1(cogsR, m + 1)}-${A1(ovhR, m + 1)}`, v })),
    rowSum(r, summary.scheduledNet),
    MONEY0_FMT,
    true
  )
  r = b.r
  line(
    "Cumulative",
    summary.cumulativeNet.map((v, m) => running(netR, r, m, v)),
    { f: A1(r, 12), v: summary.cumulativeNet[11] ?? 0 },
    MONEY0_FMT,
    true
  )

  const act: ExportActuals = src.bookedActuals ?? {
    revenue: summary.actuals.revenue,
    cogs: summary.actuals.cogs,
    overhead: summary.actuals.overhead,
    hasMonth: summary.actuals.hasMonth,
  }
  const net = act.revenue.map((v, m) => v - act.cogs[m] - act.overhead[m])
  const entered = (arr: number[]) => arr.reduce((s, v, m) => s + (act.hasMonth[m] ? v : 0), 0)
  const mask = (arr: number[]) => arr.map((v, m) => (act.hasMonth[m] ? v : null))
  /** Formula for an entered month, dash otherwise. */
  const masked = (f: (m: number) => string, cached: number[]): MCell[] => cached.map((v, m) => (act.hasMonth[m] ? { f: f(m), v } : null))

  band("Actual")
  stripeIdx = 0
  if (act.units) {
    r = b.r
    line("Units", act.units.map((u) => (u === 0 ? null : u)), rowSum(r, act.units.reduce((s, u) => s + u, 0)), UNITS_FMT)
  }
  r = b.r
  const aRevR = line("Revenue", mask(act.revenue), rowSum(r, entered(act.revenue)), MONEY0_FMT)
  r = b.r
  const aCogsR = line("COGS", mask(act.cogs), rowSum(r, entered(act.cogs)), MONEY0_FMT)
  r = b.r
  const aOvhR = line("Overhead", mask(act.overhead), rowSum(r, entered(act.overhead)), MONEY0_FMT)
  r = b.r
  const aNetR = line(
    "Net",
    masked((m) => `${A1(aRevR, m + 1)}-${A1(aCogsR, m + 1)}-${A1(aOvhR, m + 1)}`, net),
    rowSum(r, entered(net)),
    MONEY0_FMT,
    true
  )

  // Plan vs booked as its own block: monthly gap and the running gap.
  const diff = net.map((v, m) => (act.hasMonth[m] ? v - summary.netByMonth[m] : 0))
  const cumDiff: number[] = []
  diff.reduce((acc, v, m) => {
    cumDiff[m] = acc + v
    return cumDiff[m]
  }, 0)
  band("Net vs plan")
  stripeIdx = 0
  r = b.r
  const varR = line("Variance", masked((m) => `${A1(aNetR, m + 1)}-${A1(netR, m + 1)}`, diff), rowSum(r, entered(diff)), MONEY0_FMT, true)
  r = b.r
  // Running variance: each entered month adds its own gap to the previous
  // running figure (SUM over the variance row so far ignores the dashes).
  line(
    "Cumulative",
    masked((m) => `SUM(${A1(varR, 1)}:${A1(varR, m + 1)})`, cumDiff),
    { f: A1(varR, TOTAL_C), v: entered(diff) },
    MONEY0_FMT
  )

  return { r: netR, totalC: TOTAL_C }
}

/** Build and download the workbook. `filename` without extension. */
export function exportProjectionWorkbook(src: ExportSource, filename: string): void {
  const summary = computeSummary(src.rows, src.overheadMonthly, src.pipeline, src.actuals)
  const b = new Sheet()

  b.line([text("Projection Board", titleStyle)], 28)
  b.line([text(`Fiscal Year ${src.year}`, subtitleStyle)])
  if (src.versionLine) b.line([text(src.versionLine, subtitleStyle)])
  b.line([text(`Exported ${new Date().toLocaleDateString("en-US")}  ·  All amounts in USD`, subtitleStyle)])
  b.skip()

  const summaryRow = reserveSummary(b)
  const overhead = { r: summaryRow + 4, c: 1 }
  const grid = projectionSection(b, src, summary)
  pipelineSection(b, src, summary)
  const anchors: Anchors = { ...grid, overhead }
  anchors.monthlyNet = monthlySection(b, src, summary, anchors)
  fillSummary(b, src, summary, summaryRow, anchors)

  // Widths: identity columns wide, money columns comfortable, months narrow.
  // The Monthly Summary rides the same columns (label in A, months B..M).
  const widths = [24, 18, 22, 12, 15, 15, 12, 12, 12, 15, 15, ...Array(12).fill(11), 9, 9]
  const ws = b.finish(widths)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, `Projections ${src.year}`)
  // Cached values ride along, but ask Excel to recalculate on open so the
  // formulas own the numbers from the first look.
  // (CalcPr is written by SheetJS but missing from xlsx-js-style's WBProps
  // typing; spreading a variable sidesteps the excess-property check.)
  const calcPr = { CalcPr: { fullCalcOnLoad: true } }
  wb.Workbook = { ...(wb.Workbook ?? {}), ...calcPr }
  XLSX.writeFile(wb, `${filename}.xlsx`)
}
