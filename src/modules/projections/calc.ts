// Frontend mirror of the backend's projectionCalc.js — used to recompute the
// derived columns and summary block instantly on optimistic edits, without a
// round trip. If a formula changes, change BOTH files.
import type { ProjectionRow, ProjectionSummary, RowComputed } from "./types"

const round2 = (n: number) => Math.round(n * 100) / 100

export function computeRow(row: ProjectionRow): RowComputed {
  const total = row.units * row.avgUnitPrice
  const grossRevenue = total * row.pctWin
  const grossProfit = grossRevenue * row.grossMargin
  const unitsScheduled = row.months.reduce((s, m) => s + (m || 0), 0)
  return {
    total: round2(total),
    cogs: round2(1 - row.grossMargin),
    grossRevenue: round2(grossRevenue),
    grossProfit: round2(grossProfit),
    unitsScheduled,
    unitsRemaining: row.units - unitsScheduled,
  }
}

export function computeSummary(rows: ProjectionRow[], overheadMonthly: number): ProjectionSummary {
  const unitsByMonth = Array(12).fill(0) as number[]
  const revenueByMonth = Array(12).fill(0) as number[]
  const cogsByMonth = Array(12).fill(0) as number[]

  let totalUnits = 0
  let totalValue = 0
  let totalGrossRevenue = 0
  let totalGrossProfit = 0

  for (const row of rows) {
    const c = computeRow(row)
    totalUnits += row.units
    totalValue += c.total
    totalGrossRevenue += c.grossRevenue
    totalGrossProfit += c.grossProfit
    for (let m = 0; m < 12; m++) {
      const u = row.months[m] || 0
      unitsByMonth[m] += u
      revenueByMonth[m] += u * row.avgUnitPrice
      cogsByMonth[m] += u * row.avgUnitPrice * (1 - row.grossMargin)
    }
  }

  const netByMonth = revenueByMonth.map((rev, m) => rev - cogsByMonth[m] - overheadMonthly)
  const cumulativeNet: number[] = []
  netByMonth.reduce((acc, n, m) => {
    cumulativeNet[m] = acc + n
    return cumulativeNet[m]
  }, 0)

  const scheduledRevenue = revenueByMonth.reduce((s, r) => s + r, 0)
  const scheduledCogs = cogsByMonth.reduce((s, c) => s + c, 0)

  return {
    totalUnits,
    totalValue: round2(totalValue),
    totalGrossRevenue: round2(totalGrossRevenue),
    totalGrossProfit: round2(totalGrossProfit),
    blendedMargin: totalGrossRevenue > 0 ? round2(totalGrossProfit / totalGrossRevenue) : 0,
    unitsByMonth,
    revenueByMonth: revenueByMonth.map(round2),
    cogsByMonth: cogsByMonth.map(round2),
    overheadMonthly,
    netByMonth: netByMonth.map(round2),
    cumulativeNet: cumulativeNet.map(round2),
    scheduledUnits: unitsByMonth.reduce((s, u) => s + u, 0),
    scheduledRevenue: round2(scheduledRevenue),
    scheduledNet: round2(scheduledRevenue - scheduledCogs - overheadMonthly * 12),
  }
}
