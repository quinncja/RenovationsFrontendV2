import { useState, useEffect } from "react"
import Page from "../../shared/components/Page"
import { Widget } from "../../shared/components/Widget/Widget"
import { fetchPageData } from "../../shared/api/pageApi"
import { ChevronDown, ChevronRight, List, BarChart3 } from "lucide-react"

interface OrgItem {
  name: string
  category: string
  id: string
  timeBurden: number
}

interface OrgGroup {
  title: string
  items: OrgItem[]
  totalTimeBurden: number
}

interface Employee {
  name: string
  boardId: string
  groups: OrgGroup[]
  categories: Record<string, { color: string }>
}

type ViewMode = "list" | "bar"

export default function OrgChartPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("list")
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetchPageData({ module: "orgChart", queries: [], params: {} })
      .then(result => {
        const data = result as unknown
        if (Array.isArray(data)) setEmployees(data)
        else if (data && typeof data === "object") {
          const arr = Object.values(data as Record<string, unknown>).find(Array.isArray)
          if (arr) setEmployees(arr as Employee[])
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  function toggleGroup(key: string) {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function toggleAll(expand: boolean) {
    const newState: Record<string, boolean> = {}
    employees.forEach(emp => emp.groups.forEach(g => {
      newState[`${emp.name}-${g.title}`] = expand
    }))
    setExpandedGroups(newState)
  }

  return (
    <Page
      title="Org Chart"
      actions={
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <div className="toggle-group">
            <button className={`button toggle-button ${viewMode === "list" ? "active" : ""}`} onClick={() => setViewMode("list")}>
              <List size={14} /> List
            </button>
            <button className={`button toggle-button ${viewMode === "bar" ? "active" : ""}`} onClick={() => setViewMode("bar")}>
              <BarChart3 size={14} /> Bar
            </button>
          </div>
          <button className="button" onClick={() => toggleAll(true)}>Expand All</button>
          <button className="button" onClick={() => toggleAll(false)}>Collapse All</button>
        </div>
      }
    >
      <Widget loading={loading} noData={!loading && employees.length === 0}>
        {viewMode === "list" ? (
          <div className="org-chart-list">
            {employees.map(emp => (
              <div key={emp.name} className="org-card">
                <h3 className="title3">{emp.name}</h3>
                {emp.groups.map(group => {
                  const key = `${emp.name}-${group.title}`
                  const expanded = expandedGroups[key]
                  return (
                    <div key={group.title} className="org-group">
                      <button className="button org-group-header" onClick={() => toggleGroup(key)}>
                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span>{group.title}</span>
                        <span className="org-time-badge">{group.totalTimeBurden}h</span>
                      </button>
                      {expanded && (
                        <div className="org-group-items">
                          {group.items.map(item => (
                            <div key={item.id} className="org-item">
                              <span
                                className="org-category-dot"
                                style={{ background: emp.categories?.[item.category]?.color || "#6b7280" }}
                              />
                              <span>{item.name}</span>
                              {item.timeBurden > 0 && <span className="org-time">{item.timeBurden}h</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        ) : (
          <div className="org-chart-bar">
            {employees.map(emp => {
              const totalHours = emp.groups.reduce((sum, g) => sum + g.totalTimeBurden, 0)
              return (
                <div key={emp.name} className="org-bar-row">
                  <span className="org-bar-label">{emp.name}</span>
                  <div className="org-bar-track">
                    <div className="org-bar-fill" style={{ width: `${Math.min((totalHours / 40) * 100, 100)}%` }} />
                  </div>
                  <span className="org-bar-value">{totalHours}h</span>
                </div>
              )
            })}
          </div>
        )}
      </Widget>
    </Page>
  )
}
