import { DatabaseZap } from "lucide-react"
import { formatMoneyFull } from "../../utils/format"
import { usePageDisconnected } from "../../context/PageContext"

interface StatWidgetProps {
  title: string
  value: number | null
  loading?: boolean
  disconnected?: boolean
  format?: (v: number) => string
}

export function StatWidget({
  title,
  value,
  loading,
  disconnected,
  format = formatMoneyFull,
}: StatWidgetProps) {
  const pageDisconnected = usePageDisconnected()
  const isDisconnected = disconnected || pageDisconnected

  return (
    <div className="stat-widget card">
      <span className="stat-widget-title subheadline">{title}</span>
      {loading ? (
        <div className="stat-widget-skeleton" />
      ) : isDisconnected ? (
        <span className="stat-widget-disconnected body-text text-secondary">
          <DatabaseZap size={14} />
          Offline
        </span>
      ) : value === null ? (
        <span className="body-text text-secondary">—</span>
      ) : (
        <span className="stat-widget-value title1 emphasized">{format(value)}</span>
      )}
    </div>
  )
}
