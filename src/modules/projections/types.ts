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
