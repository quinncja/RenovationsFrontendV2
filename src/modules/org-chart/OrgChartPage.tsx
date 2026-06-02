import { useState, useEffect, useMemo } from "react"
import Page from "../../shared/components/Page"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { fetchPageData } from "../../shared/api/pageApi"
import { ChevronDown } from "lucide-react"

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

// Canonical group order (Monday boards may omit some).
const ALL_GROUPS = ["Daily", "Weekly/Bi-Weekly", "Monthly", "Annually", "Special Projects"]

const AVATAR_COLORS = ["#c27c3e", "#2563eb", "#22c55e", "#eab308", "#8b5cf6", "#06b6d4", "#ec4899", "#f97316"]
const FALLBACK_CATEGORY_COLORS = [
  "#f97316", "#2563eb", "#22c55e", "#eab308", "#8b5cf6",
  "#06b6d4", "#ec4899", "#14b8a6", "#f59e0b", "#ef4444",
]

function initials(name: string): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?"
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function hashIndex(str: string, mod: number): number {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h + str.charCodeAt(i)) % mod
  return h
}

export default function OrgChartPage() {
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

  // Consistent category → color map across all employees.
  const colorMap = useMemo(() => {
    const cats = [...new Set(employees.flatMap(e => Object.keys(e.categories || {})))].filter(Boolean)
    const map: Record<string, string> = {}
    let fallback = 0
    cats.forEach(cat => {
      const fromApi = employees.find(e => e.categories?.[cat]?.color)?.categories[cat].color
      map[cat] = fromApi || FALLBACK_CATEGORY_COLORS[fallback++ % FALLBACK_CATEGORY_COLORS.length]
    })
    return map
  }, [employees])

  function toggleGroup(key: string) {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function toggleAll(expand: boolean) {
    const next: Record<string, boolean> = {}
    employees.forEach(emp => emp.groups.forEach(g => { next[`${emp.boardId}-${g.title}`] = expand }))
    setExpandedGroups(next)
  }

  return (
    <Page
      title="Org Chart"
      subtitle="Visualize employee responsibilities"
      actions={
        <div className="toggle-group">
          <button className="button toggle-button" onClick={() => toggleAll(true)}>Expand all</button>
          <button className="button toggle-button" onClick={() => toggleAll(false)}>Collapse all</button>
        </div>
      }
    >
      {loading ? (
        <div className="card widget-skeleton" style={{ height: 320 }} />
      ) : employees.length === 0 ? (
        <div className="table-empty">No process boards found.</div>
      ) : (
        <MotionList className="org-grid">
          {employees.map(emp => {
            return (
              <MotionItem key={emp.boardId} className="card org-emp-card">
                <div className="org-emp-head">
                  <span className="org-avatar" style={{ background: AVATAR_COLORS[hashIndex(emp.name, AVATAR_COLORS.length)] }}>
                    {initials(emp.name)}
                  </span>
                  <div className="org-emp-meta">
                    <span className="org-emp-name">{emp.name}</span>
                  </div>
                </div>

                <div className="org-groups">
                  {ALL_GROUPS.map(title => {
                    const group = emp.groups.find(g => g.title === title) ?? { title, items: [], totalTimeBurden: 0 }
                    const key = `${emp.boardId}-${title}`
                    const expanded = !!expandedGroups[key]
                    const hasItems = group.items.length > 0
                    return (
                      <div key={title} className={`org-group${expanded ? " org-group-open" : ""}`}>
                        <button
                          className="org-group-header"
                          onClick={() => hasItems && toggleGroup(key)}
                          disabled={!hasItems}
                        >
                          <ChevronDown size={14} className="org-group-chevron" />
                          <span className="org-group-title">{title}</span>
                          <span className="org-group-count">{group.items.length}</span>
                          <span className="org-group-hours">{group.totalTimeBurden.toFixed(1)}h</span>
                        </button>
                        {expanded && hasItems && (
                          <div className="org-group-items">
                            {group.items.map(item => (
                              <div key={item.id} className="org-item">
                                <span className="org-item-name">{item.name}</span>
                                {item.category && (
                                  <span
                                    className="org-cat-pill"
                                    style={{
                                      color: colorMap[item.category] ?? "var(--secondary-text)",
                                      background: `color-mix(in srgb, ${colorMap[item.category] ?? "#888"} 15%, transparent)`,
                                    }}
                                  >
                                    {item.category}
                                  </span>
                                )}
                                <span className="org-item-hours">{item.timeBurden ? `${item.timeBurden}h` : "—"}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </MotionItem>
            )
          })}
        </MotionList>
      )}
    </Page>
  )
}
