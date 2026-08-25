/** Decorative colors on one cell — palette tokens (see cellStyles.ts), never raw CSS. */
export interface CellStyle {
  fill?: string
  ink?: string
}

export interface ProjectionRow {
  rowId: string
  address: string
  client: string
  name: string
  units: number
  avgUnitPrice: number
  /** Win probability 0–1 (the sheet's "% Win"). */
  pctWin: number
  /** Gross margin 0–1. COGS is derived (1 − grossMargin). */
  grossMargin: number
  /** Units scheduled Jan..Dec — always 12 entries. */
  months: number[]
  /** Sparse per-cell colors, keyed the same way edits address cells
   *  (`units`, `month:3`, …). Absent on unstyled rows. */
  styles?: Record<string, CellStyle>
  sortOrder: number
}

/** Per-row formula columns (computed, never stored). */
export interface RowComputed {
  total: number
  cogs: number
  grossRevenue: number
  grossProfit: number
  unitsScheduled: number
  unitsRemaining: number
}

/** Booked monthly actuals as stored — net is derived in the summary. */
export interface SheetActuals {
  revenue: number[]
  cogs: number[]
  overhead: number[]
}

export interface PipelineSummary {
  count: number
  units: number
  value: number
  grossProfit: number
}

export interface ActualsSummary {
  revenue: number[]
  cogs: number[]
  overhead: number[]
  net: number[]
  cumulativeNet: number[]
  /** false = month not entered yet (all three inputs are 0). */
  hasMonth: boolean[]
  totalRevenue: number
  totalCogs: number
  totalOverhead: number
  totalNet: number
}

export interface ProjectionSummary {
  totalUnits: number
  totalValue: number
  totalGrossRevenue: number
  totalGrossProfit: number
  blendedMargin: number
  unitsByMonth: number[]
  revenueByMonth: number[]
  cogsByMonth: number[]
  overheadMonthly: number
  netByMonth: number[]
  cumulativeNet: number[]
  scheduledUnits: number
  scheduledRevenue: number
  scheduledNet: number
  pipeline: PipelineSummary
  actuals: ActualsSummary
}

export interface UserStamp {
  uid: string
  email: string | null
  name: string | null
}

export interface ProjectionSheet {
  id: string
  year: number
  overheadMonthly: number
  revision: number
  updatedAt: string
  updatedBy: UserStamp | null
  rows: ProjectionRow[]
  /** Bidding-stage projects — excluded from the summary P&L. */
  pipeline: ProjectionRow[]
  actuals: SheetActuals
  summary: ProjectionSummary
}

/** Row input field, `month:0`..`month:11`, or the sheet-level `overheadMonthly`. */
export type EditableField = string

export interface CellEdit {
  /** null for sheet-level fields (overheadMonthly). */
  rowId: string | null
  field: EditableField
  value: string | number
}

export interface ProjectionEditEntry {
  id: string
  rowId: string | null
  rowLabel: string | null
  field: string
  oldValue: unknown
  newValue: unknown
  user: UserStamp
  at: string
  revision: number
}

export interface ProjectionSnapshotMeta {
  id: string
  label: string | null
  auto: boolean
  takenBy: UserStamp | null
  at: string
  revision: number
}

/** A stored version in full (GET /projections/snapshots/:id). */
export interface ProjectionSnapshot extends ProjectionSnapshotMeta {
  year: number
  overheadMonthly: number
  rows: ProjectionRow[]
  pipeline: ProjectionRow[]
  actuals: SheetActuals
  summary: ProjectionSummary
}
