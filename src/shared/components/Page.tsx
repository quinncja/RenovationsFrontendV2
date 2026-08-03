import type { ReactNode } from "react"

interface PageProps {
  /** Usually the page name; pages that resolve their title from fetched data
   *  can pass a SkelText shimmer while loading so the header doesn't reflow. */
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  stickyHeader?: boolean
  children?: ReactNode
}

export default function Page({ title, subtitle, actions, stickyHeader, children }: PageProps) {
  return (
    <div className="page">
      <header className={`page-header${stickyHeader ? " page-header-sticky" : ""}`}>
        <div className="page-header-text">
          <h1 className="title1">{title}</h1>
          {subtitle && <p className="page-subtitle body">{subtitle}</p>}
        </div>
        {actions && <div className="page-header-actions">{actions}</div>}
      </header>
      {children}
    </div>
  )
}
