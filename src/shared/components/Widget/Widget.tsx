import { useState, type ReactNode } from "react"
import { ChevronRight, ChevronDown, ChartNoAxesColumn, DatabaseZap } from "lucide-react"
import { usePageDisconnected } from "../../context/PageContext"

interface WidgetProps {
  title?: string
  description?: string
  loading?: boolean
  noData?: boolean
  disconnected?: boolean
  expandable?: boolean
  onExpand?: () => void
  collapsible?: boolean
  defaultOpen?: boolean
  className?: string
  children?: ReactNode
}

export function Widget({
  title,
  description,
  loading,
  noData,
  disconnected,
  expandable,
  onExpand,
  collapsible,
  defaultOpen = false,
  className,
  children,
}: WidgetProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const pageDisconnected = usePageDisconnected()
  const isDisconnected = disconnected || pageDisconnected

  const body = loading ? (
    <div className="widget-skeleton" />
  ) : isDisconnected ? (
    <div className="widget-no-data widget-disconnected">
      <DatabaseZap size={24} className="widget-no-data-icon" />
      <span className="body-text">Data source offline</span>
    </div>
  ) : noData ? (
    <div className="widget-no-data">
      <ChartNoAxesColumn size={24} className="widget-no-data-icon" />
      <span className="body-text">No data available</span>
    </div>
  ) : (
    <div className="widget-body">{children}</div>
  )

  return (
    <div
      className={`widget card${expandable ? " widget-expandable" : ""}${collapsible ? " widget-collapsible" : ""}${className ? ` ${className}` : ""}`}
      onClick={expandable && !noData ? onExpand : undefined}
      role={expandable && !noData ? "button" : undefined}
    >
      {(title || description || expandable || collapsible) && (
        <div
          className={`widget-header${collapsible ? " widget-header-toggle" : ""}`}
          onClick={collapsible ? () => setIsOpen((o) => !o) : undefined}
          role={collapsible ? "button" : undefined}
          tabIndex={collapsible ? 0 : undefined}
          onKeyDown={collapsible ? (e) => e.key === "Enter" && setIsOpen((o) => !o) : undefined}
        >
          <div className="widget-header-text">
            {title && <span className="widget-title headline">{title}</span>}
            {description && <span className="widget-description">{description}</span>}
          </div>
          {collapsible && (
            <span className={`widget-chevron${isOpen ? " open" : ""}`}>
              <ChevronDown size={15} />
            </span>
          )}
          {expandable && !noData && (
            <span className="widget-see-all">
              See all <ChevronRight size={12} />
            </span>
          )}
        </div>
      )}

      {collapsible ? (
        <div className={`widget-collapse-body${isOpen ? " open" : ""}`}>
          <div className="widget-collapse-body-inner">{body}</div>
        </div>
      ) : (
        body
      )}
    </div>
  )
}
