import { formatMoneyFull } from "../../utils/format"

interface StatWidgetProps {
  title: string
  value: number | null
  loading?: boolean
  format?: (v: number) => string
}

export function StatWidget({
  title,
  value,
  loading,
  format = formatMoneyFull,
}: StatWidgetProps) {
  return (
    <div className="stat-widget card">
      <span className="stat-widget-title subheadline">{title}</span>
      {loading ? (
        <div className="stat-widget-skeleton" />
      ) : value === null ? (
        <span className="body-text text-secondary">—</span>
      ) : (
        <span className="stat-widget-value title1 emphasized">{format(value)}</span>
      )}
    </div>
  )
}
