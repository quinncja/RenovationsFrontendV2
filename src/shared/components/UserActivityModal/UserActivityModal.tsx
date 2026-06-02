import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { X, ShieldCheck } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { auth } from "../../../core/auth/firebase"
import { Chart } from "../Chart/Chart"
import type { LineSeries } from "../Chart/chart.types"

// Trim trailing slash so `${API_BASE_URL}/users/...` never produces "//".
const API_BASE_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "")

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserRecord {
  uid: string
  email: string
  name: string
  role: string
  photoURL: string | null
}

interface ActivityData {
  total: number
  thisMonth: number
  last30Days: Array<{ date: string; count: number }>
}

interface UserActivityModalProps {
  user: UserRecord | null
  isAdmin: boolean
  isExecutive?: boolean
  onClose: () => void
  onRoleChange: (uid: string, role: string) => Promise<void>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?"
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const ROLE_LABEL: Record<string, string> = {
  executive: "Executive",
  admin:     "Admin",
  manager:   "Manager",
  waiting:   "Waiting Room",
}

const ROLE_CLASS: Record<string, string> = {
  executive: "usr-role-badge--executive",
  admin:     "usr-role-badge--admin",
  manager:   "usr-role-badge--manager",
  waiting:   "usr-role-badge--waiting",
}

// ─── Component ────────────────────────────────────────────────────────────────

export function UserActivityModal({ user, isAdmin, isExecutive = false, onClose, onRoleChange }: UserActivityModalProps) {
  const [activity, setActivity]     = useState<ActivityData | null>(null)
  const [isLoading, setIsLoading]   = useState(false)
  const [changingRole, setChangingRole] = useState(false)
  const [currentRole, setCurrentRole]   = useState<string>(user?.role ?? "waiting")

  useEffect(() => {
    setCurrentRole(user?.role ?? "waiting")
  }, [user?.uid])

  useEffect(() => {
    if (!user) { setActivity(null); return }

    let cancelled = false
    setIsLoading(true)
    setActivity(null)

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

    auth.currentUser?.getIdToken()
      .then((token) =>
        fetch(
          `${API_BASE_URL}/users/${user.uid}/activity?timezone=${encodeURIComponent(timezone)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
      )
      .then((r) => r.json())
      .then((data: ActivityData) => { if (!cancelled) { setActivity(data); setIsLoading(false) } })
      .catch(() => { if (!cancelled) setIsLoading(false) })

    return () => { cancelled = true }
  }, [user?.uid])

  async function handleRoleChange(role: string) {
    if (!user || changingRole || role === currentRole) return
    setChangingRole(true)
    try {
      await onRoleChange(user.uid, role)
      setCurrentRole(role)
    } finally {
      setChangingRole(false)
    }
  }

  const isTargetExecutive = currentRole === "executive"
  const isTargetAdmin = currentRole === "admin"
  const canChangeRole = isExecutive
    ? !isTargetExecutive
    : isAdmin && !isTargetAdmin && !isTargetExecutive

  const series: LineSeries[] = activity
    ? [{
        id: "API Calls",
        color: "var(--primary-color)",
        data: activity.last30Days.map((d) => {
          const date = new Date(d.date + "T12:00:00")
          return {
            x: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            y: d.count,
          }
        }),
      }]
    : []

  const tickValues = series[0]?.data
    .filter((_, i, arr) => i % 6 === 0 || i === arr.length - 1)
    .map((p) => p.x as string)

  return createPortal(
    <AnimatePresence>
      {user && (
        <>
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <div className="modal-positioner">
            <motion.div
              className="modal usr-activity-modal"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              {/* ── Header ── */}
              <div className="usr-activity-header">
                <div className="usr-activity-user-row">
                  {user.photoURL ? (
                    <img className="usr-avatar usr-avatar--lg" src={user.photoURL} alt={user.name} />
                  ) : (
                    <div className="usr-avatar usr-avatar-initials usr-avatar--lg">
                      {avatarInitials(user.name)}
                    </div>
                  )}
                  <div className="usr-activity-user-info">
                    <div className="usr-activity-name-row">
                      <span className="usr-activity-name">{user.name}</span>
                      <span className={`usr-role-badge ${ROLE_CLASS[currentRole] ?? ""}`}>
                        {ROLE_LABEL[currentRole] ?? currentRole}
                      </span>
                    </div>
                    <span className="usr-activity-email">{user.email}</span>
                  </div>
                </div>
                <button className="button modal-close" onClick={onClose}><X size={16} /></button>
              </div>

              {/* ── Body ── */}
              <div className="invoice-modal-body">

                {/* Stats */}
                <div className="usr-activity-stats">
                  <div className="usr-activity-stat">
                    <span className="usr-activity-stat-value">
                      {isLoading ? "—" : (activity?.total ?? 0).toLocaleString()}
                    </span>
                    <span className="usr-activity-stat-label">Total Requests</span>
                  </div>
                  <div className="usr-activity-stat-divider" />
                  <div className="usr-activity-stat">
                    <span className="usr-activity-stat-value usr-activity-stat-value--month">
                      {isLoading ? "—" : (activity?.thisMonth ?? 0).toLocaleString()}
                    </span>
                    <span className="usr-activity-stat-label">Last 30 Days</span>
                  </div>
                </div>

                {/* Chart */}
                <div className="usr-activity-chart-section">
                  <p className="invoice-modal-section-label">Last 30 Days</p>
                  {isLoading ? (
                    <div className="widget-skeleton" style={{ height: "10rem" }} />
                  ) : (
                    <div className="usr-activity-chart">
                      <Chart
                        config={{
                          type: "line",
                          series,
                          enableArea: true,
                          curve: "monotoneX",
                          yFormat: (v) => String(Math.round(v)),
                          axisBottomTickValues: tickValues,
                          disableGrowthTooltip: true,
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Role */}
                {isAdmin && (
                  <div className="usr-activity-role-section">
                    <p className="invoice-modal-section-label">Role Management</p>

                    {!canChangeRole ? (
                      <div className="usr-activity-admin-lock">
                        <ShieldCheck size={14} className="usr-activity-admin-lock-icon" />
                        <span>
                          {isTargetExecutive
                            ? "Executive roles cannot be modified."
                            : "Admin roles cannot be modified by another admin."}
                        </span>
                      </div>
                    ) : (
                      <div className="usr-activity-role-row">
                        <span className="usr-activity-role-hint">Change role to:</span>
                        <div className="usr-assign-row" style={{ width: isExecutive ? "20rem" : "14rem" }}>
                          {isExecutive && (
                            <button
                              className={`usr-assign-btn usr-assign-executive${currentRole === "executive" ? " usr-assign-btn--active" : ""}`}
                              disabled={changingRole || currentRole === "executive"}
                              onClick={() => handleRoleChange("executive")}
                            >
                              Executive
                            </button>
                          )}
                          <button
                            className={`usr-assign-btn usr-assign-admin${currentRole === "admin" ? " usr-assign-btn--active" : ""}`}
                            disabled={changingRole || currentRole === "admin"}
                            onClick={() => handleRoleChange("admin")}
                          >
                            Admin
                          </button>
                          <button
                            className={`usr-assign-btn usr-assign-manager${currentRole === "manager" ? " usr-assign-btn--active" : ""}`}
                            disabled={changingRole || currentRole === "manager"}
                            onClick={() => handleRoleChange("manager")}
                          >
                            Manager
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
