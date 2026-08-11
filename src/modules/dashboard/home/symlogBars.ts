// Symlog bar-chart scaling for margin charts — extracted from the two
// identical memo bodies in EmployeeDetailPage. Mirrors MarginWidget's symlog
// config so very negative outliers (a lost month/year) don't crush the rest
// of the bars to zero.

export interface SymlogBars {
  bars: { label: string; value: number }[]
  minValue: number
  maxValue: number
  scaleConstant: number
  ticks: number[]
}

export function computeSymlogBars(bars: { label: string; value: number }[]): SymlogBars {
  const values = bars.map((b) => b.value)
  const NICE = [10, 20, 30, 50, 100, 200, 300, 500, 1000]
  const niceMag = (v: number) => NICE.find((m) => m >= Math.abs(v)) ?? Math.ceil(Math.abs(v) / 1000) * 1000
  const dataMin = Math.min(0, ...values)
  const dataMax = Math.max(0, ...values)
  const minValue = dataMin < 0 ? -niceMag(dataMin) : 0
  const maxValue = dataMax > 0 ? niceMag(dataMax) : 10
  // Keep typical margins inside the symlog linear zone; only extremes compress.
  const absDesc = values.map((v) => Math.abs(v)).sort((a, b) => b - a)
  const inlier = absDesc[1] ?? absDesc[0] ?? 30
  const scaleConstant = Math.max(30, Math.ceil(inlier / 10) * 10)
  const candidates = [20, 50, 100, 200, 300, 500, 1000]
  const ticks = [0]
  for (const m of candidates) {
    if (-m >= minValue) ticks.push(-m)
    if (m <= maxValue) ticks.push(m)
  }
  ticks.sort((a, b) => a - b)
  return { bars, minValue, maxValue, scaleConstant, ticks }
}
