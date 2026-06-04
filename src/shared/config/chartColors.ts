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

/** Curated muted bases for hashColor — the same family as the Treemap
 *  palette (terracotta / sage / teal / dusty rose ...), spread around the
 *  wheel so any subset still reads as one set. [hue, sat%, light%]. */
const HASH_BASES: ReadonlyArray<readonly [number, number, number]> = [
  [2, 45, 58],    // clay red
  [14, 48, 46],   // sienna
  [24, 58, 56],   // terracotta
  [28, 35, 38],   // coffee
  [36, 58, 62],   // saffron
  [45, 48, 50],   // mustard gold
  [70, 32, 52],   // olive
  [85, 32, 40],   // moss
  [108, 25, 56],  // sage
  [150, 30, 40],  // forest
  [162, 32, 52],  // eucalyptus
  [180, 42, 37],  // deep teal
  [198, 38, 54],  // mediterranean blue
  [214, 32, 60],  // slate blue
  [222, 36, 44],  // indigo
  [240, 36, 66],  // soft lavender
  [258, 30, 52],  // iris
  [272, 28, 60],  // plum
  [288, 30, 44],  // aubergine
  [306, 26, 60],  // mauve
  [320, 32, 62],  // rose lavender
  [333, 42, 48],  // berry
  [346, 45, 62],  // dusty rose
  [352, 48, 42],  // burgundy
]

/** Deterministic "random" color for an entity name: FNV-1a hash → one of the
 *  curated muted bases above, with spare hash bits nudging saturation and
 *  lightness so two names landing on the same base still differ. The same
 *  name always maps to the same color, on every render and every page. */
export function hashColor(name: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  h >>>= 0
  const [hue, sat, light] = HASH_BASES[h % HASH_BASES.length]
  const hh = hue + ((h >>> 25) % 17) - 8  // ±8° — stays within the family
  const s = sat + ((h >>> 9) % 11) - 5    // ±5%
  const l = light + ((h >>> 17) % 13) - 6 // ±6%
  return `hsl(${hh}, ${s}%, ${l}%)`
}

/** Per-family hue + drift used by the dashboard insight widgets. */
export const RAMP_SCHEMES = {
  orange: { hue: 28, drift: 16 },
  red:    { hue: 2,  drift: -14 },
  purple: { hue: 278, drift: 18 },
} as const
