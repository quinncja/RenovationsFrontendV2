// Shared pieces of the Projection Board overlay on the executive trend charts.
// The `revenueProjection` dashboard query returns the projection sheet's
// revenue schedule (backend @projections/services/projections.service.js
// getRevenueProjection); the two revenue trend widgets render it as a dashed
// "Projected" series next to the solid actuals.

export const PROJECTED_SERIES_ID = "Projected"

// Palette blue (CHART_COLORS[2]) — a distinct calm hue so the plan line never
// reads as another year of actuals; the dash carries the "hypothetical" cue.
export const PROJECTED_COLOR = "#3b82f6"

export interface RevenueProjection {
  year: number
  /** Projected revenue per month, Jan–Dec (units × avg unit price). */
  monthly: number[]
  /** Running sum of `monthly`. */
  cumulative: number[]
  /** Full-year scheduled revenue — equals cumulative[11]. */
  total: number
  updatedAt?: string
}
