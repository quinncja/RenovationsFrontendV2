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

/** Decorative stat — a large faux currency value */
function StatPlaceholder() {
  return (
    <div className="placeholder-illustration placeholder-illustration-stat">
      <span className="placeholder-stat-value">$0,000,000</span>
    </div>
  )
}

export function PlaceholderIllustration({ type }: { type: WidgetVisualType }) {
  switch (type) {
    case "line":
      return <LinePlaceholder />
    case "pie":
      return <PiePlaceholder />
    case "stat":
      return <StatPlaceholder />
  }
}
