// Shared pieces of the Projection Board overlay on the executive trend charts.
// The `revenueProjection` dashboard query returns the projection sheet's
// revenue schedule (backend @projections/services/projections.service.js
// getRevenueProjection); the two revenue trend widgets render it as a dashed
// "Projected" series next to the solid actuals.

export const PROJECTED_SERIES_ID = "Projected"

// Muted copper — the brand copper desaturated and lifted, so the plan reads
// as a quiet echo of the revenue line rather than a new hue entering the
// system; the dash carries the "hypothetical" cue.
export const PROJECTED_COLOR = "#c39c79"

export interface RevenueProjection {
  year: number
  /** Projected revenue per month, Jan–Dec (units × avg unit price). */
  monthly: number[]
  /** Running sum of `monthly`. */
  cumulative: number[]
  /** Full-year projected contract (win-adjusted units × price, all rows) —
   *  the board's "Projected Contract" card. Not the schedule sum. */
  total: number
  /** Revenue scheduled into months — equals cumulative[11]. */
  scheduledTotal?: number
  updatedAt?: string
}
