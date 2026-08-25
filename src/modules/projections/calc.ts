// Frontend mirror of the backend's projectionCalc.js — used to recompute the
// derived columns and summary block instantly on optimistic edits, without a
// round trip. If a formula changes, change BOTH files.
import type { ProjectionRow, ProjectionSummary, RowComputed, SheetActuals } from "./types"

const round2 = (n: number) => Math.round(n * 100) / 100
/** Unit counts may be fractional (lump jobs schedule 0.05/0.2-unit slices per
 *  month), so sums pick up float noise — round to 3 decimals wherever unit
 *  quantities are summed. */
const roundUnits = (n: number) => Math.round(n * 1000) / 1000

export function computeRow(row: ProjectionRow): RowComputed {
  const total = row.units * row.avgUnitPrice
  const grossRevenue = total * row.pctWin
  const grossProfit = grossRevenue * row.grossMargin
  const unitsScheduled = roundUnits(row.months.reduce((s, m) => s + (m || 0), 0))
  return {
    total: round2(total),
    cogs: round2(1 - row.grossMargin),
    grossRevenue: round2(grossRevenue),
    grossProfit: round2(grossProfit),
    unitsScheduled,
    unitsRemaining: roundUnits(row.units - unitsScheduled),
  }
}

export function computeSummary(
  rows: ProjectionRow[],
  overheadMonthly: number,
  pipeline: ProjectionRow[],
  actuals: SheetActuals
): ProjectionSummary {
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

  // Pipeline (bidding-stage) rows: value totals only — never in the P&L math.
  let pipelineUnits = 0
  let pipelineValue = 0
  let pipelineGrossProfit = 0
  for (const row of pipeline) {
    const value = row.units * row.avgUnitPrice
    pipelineUnits += row.units
    pipelineValue += value
    pipelineGrossProfit += value * row.pctWin * row.grossMargin
  }

  // Booked actuals: net derived; a month with all three inputs at 0 is
  // treated as not-yet-entered (hasMonth false) so the UI can blank it.
  const actualRevenue = Array.from({ length: 12 }, (_, m) => actuals.revenue[m] || 0)
  const actualCogs = Array.from({ length: 12 }, (_, m) => actuals.cogs[m] || 0)
  const actualOverhead = Array.from({ length: 12 }, (_, m) => actuals.overhead[m] || 0)
  const actualHasMonth = actualRevenue.map((r, m) => r !== 0 || actualCogs[m] !== 0 || actualOverhead[m] !== 0)
  const actualNet = actualRevenue.map((r, m) => r - actualCogs[m] - actualOverhead[m])
  const actualCumulative: number[] = []
  actualNet.reduce((acc, n, m) => {
    actualCumulative[m] = acc + (actualHasMonth[m] ? n : 0)
    return actualCumulative[m]
  }, 0)
  const sumEntered = (arr: number[]) => arr.reduce((s, v, m) => s + (actualHasMonth[m] ? v : 0), 0)

  return {
    totalUnits,
    totalValue: round2(totalValue),
    totalGrossRevenue: round2(totalGrossRevenue),
    totalGrossProfit: round2(totalGrossProfit),
    blendedMargin: totalGrossRevenue > 0 ? round2(totalGrossProfit / totalGrossRevenue) : 0,
    unitsByMonth: unitsByMonth.map(roundUnits),
    revenueByMonth: revenueByMonth.map(round2),
    cogsByMonth: cogsByMonth.map(round2),
    overheadMonthly,
    netByMonth: netByMonth.map(round2),
    cumulativeNet: cumulativeNet.map(round2),
    scheduledUnits: roundUnits(unitsByMonth.reduce((s, u) => s + u, 0)),
    scheduledRevenue: round2(scheduledRevenue),
    scheduledNet: round2(scheduledRevenue - scheduledCogs - overheadMonthly * 12),
    pipeline: {
      count: pipeline.length,
      units: roundUnits(pipelineUnits),
      value: round2(pipelineValue),
      grossProfit: round2(pipelineGrossProfit),
    },
    actuals: {
      revenue: actualRevenue.map(round2),
      cogs: actualCogs.map(round2),
      overhead: actualOverhead.map(round2),
      net: actualNet.map(round2),
      cumulativeNet: actualCumulative.map(round2),
      hasMonth: actualHasMonth,
      totalRevenue: round2(sumEntered(actualRevenue)),
      totalCogs: round2(sumEntered(actualCogs)),
      totalOverhead: round2(sumEntered(actualOverhead)),
      totalNet: round2(sumEntered(actualNet)),
    },
  }
}
