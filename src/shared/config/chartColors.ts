/** Shared color palettes for pie/donut charts across the application. */

// Copper/amber palette for general use
export const PRIMARY_COLORS_5 = [
  "#8b4513", "#b5651d", "#c27c3e", "#d4922a", "#e6a84c",
]

export const PRIMARY_COLORS_10 = [
  "#8b4513", "#a0522d", "#b5651d", "#c27c3e", "#d4922a",
  "#e6a84c", "#f0c078", "#f5d6a0", "#fae8c8", "#fdf4e6",
]

// Entity-specific palettes
export const CLIENT_COLORS_5 = [
  "#1e3a5f", "#2a5a8a", "#3674a8", "#4a8ec4", "#6aaddb",
]

export const CLIENT_COLORS_10 = [
  "#1e3a5f", "#2a5a8a", "#3674a8", "#4a8ec4", "#6aaddb",
  "#8ec4e8", "#b0d8f0", "#d0e8f8", "#a8d4f0", "#c8e4f8",
]

export const SUPPLIER_COLORS_5 = [
  "#14532d", "#15803d", "#16a34a", "#22c55e", "#86efac",
]

export const SUPPLIER_COLORS_10 = [
  "#14532d", "#15803d", "#16a34a", "#22c55e", "#86efac",
  "#bbf7d0", "#dcfce7", "#4ade80", "#a7f3d0", "#d1fae5",
]

export const SUBCONTRACTOR_COLORS_5 = [
  "#7c2d12", "#c2410c", "#ea580c", "#f97316", "#fb923c",
]

export const SUBCONTRACTOR_COLORS_10 = [
  "#7c2d12", "#c2410c", "#ea580c", "#f97316", "#fb923c",
  "#fdba74", "#fed7aa", "#ffedd5", "#fbbf24", "#fde68a",
]

/** HSL ramp used by the dashboard "Top N" donut widgets. Slices go darkest
 *  (highest value) → lightest, with the hue drifting slightly so adjacent
 *  slices stay distinguishable. */
export function colorRamp(hue: number, drift: number, count: number): string[] {
  const n = Math.max(count, 1)
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0 : i / (n - 1)
    const light = Math.round(54 + t * 32) // 54% → 86%
    const sat = Math.round(85 - t * 22)   // 85% → 63%
    const h = Math.round(hue + t * drift)
    return `hsl(${h}, ${sat}%, ${light}%)`
  })
}

/** Per-family hue + drift used by the dashboard insight widgets. */
export const RAMP_SCHEMES = {
  orange: { hue: 28, drift: 16 },
  red:    { hue: 2,  drift: -14 },
  purple: { hue: 278, drift: 18 },
} as const
