import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const bundle = await build({
  stdin: { contents: 'export * from "./src/modules/dashboard/marginReport.ts"; export * from "./src/modules/dashboard/utils/homeYearRevenue.ts";', resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'esm', write: false,
})
const { homeYearRevenue, normalizeJob, normalizeProjectJob, totalsOf, inScope } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)

const annual = [{ year: 2025, revenue: 90000 }, { year: 2026, revenue: 100000 }]
const open = { openMonthYear: 2026, openMonthIncome: 20000, openMonthOverUnder: 15000 }
const row = { recnum: '25426312', jobName: '5110 Biscayne Ave P12 2025', closed: true,
  contract: 23315, revenue: 0, cost: 4565, overUnder: 0, oneoff: 0 }

test('homepage and report target include open income once and company WIP only when enabled', () => {
  assert.equal(homeYearRevenue(2026, annual, open, true), 135000)
  assert.equal(homeYearRevenue(2026, annual, open, false), 120000)
  assert.equal(homeYearRevenue(2025, annual, open, true), 90000)
  assert.equal(homeYearRevenue(2026, null, open, true), null)
  assert.equal(homeYearRevenue(2026, annual, null, true), null)
})

test('prior-year job contributes only current-year activity but keeps its lifetime financials', () => {
  const yearly = normalizeJob(row, true)
  const lifetime = normalizeProjectJob({ ...row, cost: 37036 })
  assert.equal(yearly.revenue, 0)
  assert.equal(yearly.cost, 4565)
  assert.equal(lifetime.contract, 23315)
  assert.equal(lifetime.cost, 37036)
  assert.equal(lifetime.grossProfit, -13721)
  assert.equal(lifetime.margin, -13721 / 23315 * 100)
})

test('phase + one-off + filtered jobs + explicit reconciliation equals homepage with WIP on or off', () => {
  for (const includeWip of [true, false]) {
    const jobs = [normalizeJob({ ...row, revenue: 30000 }, includeWip),
      normalizeJob({ ...row, recnum: '26555500', oneoff: 1, closed: false, revenue: 50000, overUnder: 10000 }, includeWip)]
    const all = totalsOf(jobs)
    const target = homeYearRevenue(2026, annual, open, includeWip)
    const reconciliation = target - all.revenue
    for (const scope of ['all', 'closed']) {
      const scoped = jobs.filter(j => inScope(j, scope))
      const phase = totalsOf(scoped.filter(j => j.kind === 'phase')).revenue
      const oneoff = totalsOf(scoped.filter(j => j.kind === 'oneoff')).revenue
      const filtered = all.revenue - totalsOf(scoped).revenue
      assert.equal(phase + oneoff + filtered + reconciliation, target)
    }
  }
})
