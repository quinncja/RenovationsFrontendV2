import { useState, useEffect } from "react"
import Page from "../../shared/components/Page"
import { Widget } from "../../shared/components/Widget/Widget"
import { UserActivityModal } from "../../shared/components/UserActivityModal/UserActivityModal"
import { fetchPageData } from "../../shared/api/pageApi"
import { changeUserRole } from "../../shared/api/mutationApi"
import { useAuth } from "../../core/auth/AuthProvider"
import type { AppRole } from "../../core/auth/roles"
import { Shield, ShieldCheck, User } from "lucide-react"

interface AppUser {
  uid: string
  email: string
  name: string
  role: string
  lastActive?: string
}

const ROLE_ICONS: Record<string, typeof Shield> = {
  executive: ShieldCheck,
  admin: Shield,
  pm: User,
}

export default function Users() {
  const { claims } = useAuth()
  const currentRole = claims["role"] as AppRole
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null)

  const isExecutive = currentRole === "executive"
  const isAdmin = currentRole === "executive" || currentRole === "admin"

  useEffect(() => {
    fetchPageData({ module: "users", queries: [], params: {} })
      .then(result => {
        const data = result as unknown
        if (Array.isArray(data)) setUsers(data)
        else if (data && typeof data === "object") {
          const arr = Object.values(data as Record<string, unknown>).find(Array.isArray)
          if (arr) setUsers(arr as AppUser[])
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  async function handleRoleChange(userId: string, newRole: string) {
    try {
      await changeUserRole(userId, newRole)
      setUsers(prev => prev.map(u => u.uid === userId ? { ...u, role: newRole } : u))
    } catch {
      alert("Failed to change role")
    }
  }

  const grouped = {
    executive: users.filter(u => u.role === "executive"),
    admin: users.filter(u => u.role === "admin"),
    pm: users.filter(u => u.role === "pm" || u.role === "manager"),
    waiting: users.filter(u => !u.role || u.role === "waiting"),
  }

  return (
    <Page title="Users">
      <div className="users-grid">
        {(["executive", "admin", "pm", "waiting"] as const).map(group => (
          <Widget key={group} title={`${group.charAt(0).toUpperCase() + group.slice(1)}s`} loading={loading}>
            <div className="user-list">
              {grouped[group].map(user => {
                const RoleIcon = ROLE_ICONS[user.role] || User
                return (
                  <div key={user.uid} className="user-card">
                    <div
                      className="user-card-info"
                      style={{ cursor: "pointer" }}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedUser(user)}
                      onKeyDown={(e) => e.key === "Enter" && setSelectedUser(user)}
                    >
                      <RoleIcon size={16} />
                      <div>
                        <div className="cell-primary">{user.name || user.email}</div>
                        {user.name && <div className="cell-secondary">{user.email}</div>}
                      </div>
                    </div>
                    {currentRole === "executive" && group === "waiting" && (
                      <div className="user-card-actions">
                        <button className="button small" onClick={() => handleRoleChange(user.uid, "pm")}>Make PM</button>
                        <button className="button small" onClick={() => handleRoleChange(user.uid, "admin")}>Make Admin</button>
                      </div>
                    )}
                    {currentRole === "executive" && group !== "waiting" && group !== "executive" && (
                      <select
                        className="form-select small"
                        value={user.role}
                        onChange={e => handleRoleChange(user.uid, e.target.value)}
                      >
                        <option value="admin">Admin</option>
                        <option value="pm">PM</option>
                      </select>
                    )}
                  </div>
                )
              })}
              {grouped[group].length === 0 && !loading && (
                <p className="empty-state">No users</p>
              )}
            </div>
          </Widget>
        ))}
      </div>

      <UserActivityModal
        user={selectedUser && {
          uid: selectedUser.uid,
          email: selectedUser.email,
          name: selectedUser.name,
          role: selectedUser.role,
          photoURL: null,
        }}
        isAdmin={isAdmin}
        isExecutive={isExecutive}
        onClose={() => setSelectedUser(null)}
        onRoleChange={handleRoleChange}
      />
    </Page>
  )
}
