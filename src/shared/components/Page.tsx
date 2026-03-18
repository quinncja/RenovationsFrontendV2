import type { ReactNode } from "react"

interface PageProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  children?: ReactNode
}

export default function Page({ title, subtitle, actions, children }: PageProps) {
  return (
    <div className="page">
      <header className="page-header">
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
