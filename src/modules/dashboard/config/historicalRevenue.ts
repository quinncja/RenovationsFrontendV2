// Revenue for years before the database's 2018 cutoff. The backend
// getAnnualRevenueTrend query filters `t.postyr >= 2018`, so these figures —
// carried over verbatim from the legacy frontend, which hardcoded them because
// the source predates Sage — must be prepended to the trend and added to the
// all-time total.
export const PRE_2018_REVENUE: { year: number; revenue: number }[] = [
  { year: 2011, revenue: 385205.98 },
  { year: 2012, revenue: 1340984.17 },
  { year: 2013, revenue: 1166296.47 },
  { year: 2014, revenue: 2159028.55 },
  { year: 2015, revenue: 3705796.32 },
  { year: 2016, revenue: 4531084.74 },
  { year: 2017, revenue: 6999028.12 },
]

// Sum of the hardcoded pre-2018 years (≈ 20,287,424.35), added to the
// database's all-time total which only covers 2018 onward.
export const PRE_2018_REVENUE_TOTAL = PRE_2018_REVENUE.reduce(
  (sum, d) => sum + d.revenue,
  0
)
