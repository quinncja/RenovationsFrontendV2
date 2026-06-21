import type { WidgetVisualType } from "../config/widgetRegistry"

/** Decorative line chart — a smooth upward-trending polyline with a filled area beneath */
function LinePlaceholder() {
  return (
    <svg viewBox="0 0 200 80" preserveAspectRatio="none" className="placeholder-illustration">
      <defs>
        <linearGradient id="line-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary-color)" stopOpacity="0.15" />
          <stop offset="100%" stopColor="var(--primary-color)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M0,60 C20,55 30,50 50,40 C70,30 80,45 100,35 C120,25 140,15 160,20 C180,25 190,10 200,8"
        fill="none"
        stroke="var(--primary-color)"
        strokeWidth="2"
        strokeOpacity="0.4"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M0,60 C20,55 30,50 50,40 C70,30 80,45 100,35 C120,25 140,15 160,20 C180,25 190,10 200,8 L200,80 L0,80 Z"
        fill="url(#line-fill)"
      />
    </svg>
  )
}

/** Decorative bar chart — a row of varying-height bars */
function BarPlaceholder() {
  const heights = [0.5, 0.8, 0.35, 0.65]
  return (
    <svg viewBox="0 0 200 80" preserveAspectRatio="none" className="placeholder-illustration">
      {heights.map((h, i) => {
        const barW = 32
        const gap = (200 - heights.length * barW) / (heights.length + 1)
        const x = gap + i * (barW + gap)
        const barH = h * 70
        return (
          <rect
            key={i}
            x={x}
            y={80 - barH}
            width={barW}
            height={barH}
            rx="3"
            fill="var(--primary-color)"
            fillOpacity="0.35"
          />
        )
      })}
    </svg>
  )
}

/** Decorative donut chart with skeleton list — mimics the pie-with-list layout */
function PiePlaceholder() {
  return (
    <div className="placeholder-illustration placeholder-illustration-pie">
      <svg viewBox="0 0 100 100" className="placeholder-pie-svg">
        <circle cx="50" cy="50" r="38" fill="none" stroke="var(--border-color)" strokeWidth="12" />
        <circle
          cx="50" cy="50" r="38"
          fill="none"
          stroke="var(--primary-color)"
          strokeWidth="12"
          strokeOpacity="0.35"
          strokeDasharray="90 149"
          strokeDashoffset="0"
          transform="rotate(-90 50 50)"
        />
        <circle
          cx="50" cy="50" r="38"
          fill="none"
          stroke="var(--primary-color)"
          strokeWidth="12"
          strokeOpacity="0.2"
          strokeDasharray="50 189"
          strokeDashoffset="-95"
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div className="placeholder-pie-list">
        {[0.75, 0.6, 0.5, 0.45, 0.35].map((w, i) => (
          <div key={i} className="placeholder-pie-list-item">
            <div className="placeholder-pie-dot" />
            <div className="placeholder-pie-bar" style={{ width: `${w * 100}%` }} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Decorative table — stacked skeleton rows */
function TablePlaceholder() {
  return (
    <div className="placeholder-illustration placeholder-illustration-table">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="placeholder-table-row">
          <div className="placeholder-table-cell" style={{ width: "55%" }} />
          <div className="placeholder-table-cell" style={{ width: "20%" }} />
        </div>
      ))}
    </div>
  )
}

/** Decorative stat — a large faux currency value */
function StatPlaceholder() {
  return (
    <div className="placeholder-illustration placeholder-illustration-stat">
      <span className="placeholder-stat-value">$0,000,000</span>
    </div>
  )
}

/** Decorative summary — two equal-height sections (mirroring the real
 * card's Period + Year snapshots). Each section has a short headline bar
 * near its top (standing in for "May 2026 / OPEN", "2026 / YEAR TO DATE")
 * and a 4-tile row pinned to its bottom, so the layout reads at the same
 * proportional positions as the rendered widget. */
function SummaryPlaceholder() {
  return (
    <div className="placeholder-illustration placeholder-illustration-summary">
      {[0, 1].map((row) => (
        <div key={row} className="placeholder-summary-section">
          <div className="placeholder-summary-headline" />
          <div className="placeholder-summary-row">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="placeholder-summary-tile" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Decorative Banking & Overdue — two side-by-side cards mirroring the real
 * widget: Banking (Cash stat + Line-of-Credit meter) beside Overdue (AR + AP
 * lines + a net-position footer). */
function BankingPairPlaceholder() {
  return (
    <div className="placeholder-illustration placeholder-illustration-banking">
      {/* Banking: cash value + credit meter */}
      <div className="placeholder-bank-card">
        <div className="placeholder-bank-headline" />
        <div className="placeholder-bank-stat" />
        <div className="placeholder-bank-meter" />
      </div>
      {/* Overdue: AR / AP lines + net footer */}
      <div className="placeholder-bank-card">
        <div className="placeholder-bank-headline" />
        <div className="placeholder-bank-line" style={{ width: "80%" }} />
        <div className="placeholder-bank-line" style={{ width: "62%" }} />
        <div className="placeholder-bank-footer" />
      </div>
    </div>
  )
}

/** Decorative billings forecast — two diverging lines about a zero axis: AR
 * (money in) riding above, AP (money out) dipping below, matching the real
 * Upcoming Billings line chart. */
function ForecastPlaceholder() {
  return (
    <svg viewBox="0 0 200 80" preserveAspectRatio="none" className="placeholder-illustration">
      <line x1="0" y1="40" x2="200" y2="40" stroke="var(--border-color)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      {/* AR — above zero (green, money in) */}
      <path
        d="M0,32 C30,28 50,20 80,24 C110,28 140,14 170,18 C185,20 195,15 200,14"
        fill="none"
        stroke="#22c55e"
        strokeWidth="2"
        strokeOpacity="0.45"
        vectorEffect="non-scaling-stroke"
      />
      {/* AP — below zero (brand, money out) */}
      <path
        d="M0,48 C30,52 50,60 80,56 C110,52 140,66 170,62 C185,60 195,65 200,66"
        fill="none"
        stroke="var(--primary-color)"
        strokeWidth="2"
        strokeOpacity="0.45"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/** Decorative Progress Billings — a net-position stat column (hero figure +
 * two sub-tiles) beside the top-variance project table, mirroring the real
 * full-width widget. */
function ProgressBillingsPlaceholder() {
  return (
    <div className="placeholder-illustration placeholder-illustration-progress">
      <div className="placeholder-progress-stat">
        <div className="placeholder-progress-hero" />
        <div className="placeholder-progress-sub">
          <div className="placeholder-progress-subtile" />
          <div className="placeholder-progress-subtile" />
        </div>
      </div>
      <div className="placeholder-progress-table">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="placeholder-table-row">
            <div className="placeholder-table-cell" style={{ width: "55%" }} />
            <div className="placeholder-table-cell" style={{ width: "20%" }} />
          </div>
        ))}
      </div>
    </div>
  )
}

export function PlaceholderIllustration({ type }: { type: WidgetVisualType }) {
  switch (type) {
    case "line":
      return <LinePlaceholder />
    case "bar":
      return <BarPlaceholder />
    case "pie":
      return <PiePlaceholder />
    case "table":
      return <TablePlaceholder />
    case "stat":
      return <StatPlaceholder />
    case "summary":
      return <SummaryPlaceholder />
    case "bankingPair":
      return <BankingPairPlaceholder />
    case "forecast":
      return <ForecastPlaceholder />
    case "progressBillings":
      return <ProgressBillingsPlaceholder />
  }
}
