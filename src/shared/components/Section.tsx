import type { ReactNode } from "react"

interface PageProps {
  title: string
  subtitle?: string
  classname?: string
  children?: ReactNode
}

function Section({ title, subtitle, classname, children }: PageProps){

    return(
        <div className={`section`}>
            <header className="section-header">
                <h2 className="title2">{title}</h2>
                {subtitle && <p className="section-subtitle body">{subtitle}</p>}
            </header>
            <div className={`section-content ${classname || ""}`}>
            {children}
            </div>
        </div>  
    )
}

export default Section;