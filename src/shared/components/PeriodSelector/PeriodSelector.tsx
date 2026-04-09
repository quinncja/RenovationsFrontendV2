export type Period = "annual" | "Q1" | "Q2" | "Q3" | "Q4"

const PERIODS: { key: Period; label: string }[] = [
  { key: "annual", label: "Annual" },
  { key: "Q1", label: "Q1" },
  { key: "Q2", label: "Q2" },
  { key: "Q3", label: "Q3" },
  { key: "Q4", label: "Q4" },
]

export function periodToParams(period: Period): { startMonth?: number; endMonth?: number } {
  switch (period) {
    case "Q1": return { startMonth: 1, endMonth: 3 }
    case "Q2": return { startMonth: 4, endMonth: 6 }
    case "Q3": return { startMonth: 7, endMonth: 9 }
    case "Q4": return { startMonth: 10, endMonth: 12 }
    default: return {}
  }
}

export function periodLabel(year: number | null, period: Period): string {
  if (year === null) return "All Time"
  if (period === "annual") return String(year)
  return `${period} ${year}`
}

interface PeriodSelectorProps {
  value: Period
  onChange: (period: Period) => void
  disabled?: boolean
}

export function PeriodSelector({ value, onChange, disabled }: PeriodSelectorProps) {
  return (
    <div className="period-selector" role="radiogroup" aria-label="Select period">
      {PERIODS.map(({ key, label }) => (
        <button
          key={key}
          className={`period-selector-btn${value === key ? " period-selector-btn--active" : ""}`}
          onClick={() => onChange(key)}
          disabled={disabled}
          role="radio"
          aria-checked={value === key}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
