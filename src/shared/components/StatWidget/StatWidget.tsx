import { DatabaseZap } from "lucide-react"
import { formatMoneyFull, formatPercent, formatNumber } from "../../utils/format"
import { usePageDisconnected } from "../../context/PageContext"

type FormatPreset = "money" | "percent" | "number"

const FORMATTERS: Record<FormatPreset, (v: number) => string> = {
  money: formatMoneyFull,
  percent: formatPercent,
  number: formatNumber,
}

interface StatWidgetProps {
  title: string
  value: number | null | undefined
  loading?: boolean
  disconnected?: boolean
  format?: ((v: number) => string) | FormatPreset
}

export function StatWidget({
  title,
  value,
  loading,
  disconnected,
  format = "money",
}: StatWidgetProps) {
  const pageDisconnected = usePageDisconnected()
  const isDisconnected = disconnected || pageDisconnected
  const formatFn = typeof format === "function" ? format : FORMATTERS[format]

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
      ) : value == null ? (
        <span className="body-text text-secondary">—</span>
      ) : (
        <span className="stat-widget-value title1 emphasized">{formatFn(value)}</span>
      )}
    </div>
  )
}
