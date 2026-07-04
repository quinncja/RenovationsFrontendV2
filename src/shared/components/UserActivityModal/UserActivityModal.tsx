import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { X, ShieldCheck, Crown } from "lucide-react"
import { displayRole, isOwnerRole } from "../../../core/auth/roles"
import { motion, AnimatePresence } from "framer-motion"
import { auth } from "../../../core/auth/firebase"
import { Chart } from "../Chart/Chart"
import type { LineSeries } from "../Chart/chart.types"
import useIsMobile from "../../hooks/useIsMobile"
import { fetchUserEngagement, type UserEngagement } from "../../analytics/engagementApi"
import { sessionTrackingHeaders } from "../../analytics/analytics"
import { SectionEngagementList, WidgetEngagementList, PageEngagementList, ProjectEngagementList } from "../../analytics/EngagementInsights"
import { sectionLabel, pageLabel, formatCompactNumber } from "../../analytics/labels"
import { ModalSectionPager } from "./ModalSectionPager"
import { useModalLayer } from "../../hooks/useModalLayer"

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
  /** When true (analytics admin only), exposes the engagement insights section. */
  showEngagement?: boolean
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
  owner:     "Owner",
  executive: "Executive",
  admin:     "Admin",
  manager:   "Manager",
  waiting:   "Waiting Room",
}

const ROLE_CLASS: Record<string, string> = {
  owner:     "usr-role-badge--executive",
  executive: "usr-role-badge--executive",
  admin:     "usr-role-badge--admin",
  manager:   "usr-role-badge--manager",
  waiting:   "usr-role-badge--waiting",
}

// ─── Component ────────────────────────────────────────────────────────────────

export function UserActivityModal({ user, isAdmin, isExecutive = false, showEngagement = false, onClose, onRoleChange }: UserActivityModalProps) {
  const isMobile = useIsMobile()
  const { overlayZ, contentZ } = useModalLayer(!!user)
  // The engagement analytics are desktop-only context: on mobile we keep the
  // compact modal and skip them entirely (no fetch, no render).
  const engagementVisible = showEngagement && !isMobile

  const [activity, setActivity]     = useState<ActivityData | null>(null)
  const [isLoading, setIsLoading]   = useState(false)
  const [engagement, setEngagement] = useState<UserEngagement | null>(null)
  const [engLoading, setEngLoading] = useState(false)
  const [changingRole, setChangingRole] = useState(false)
  const [currentRole, setCurrentRole]   = useState<string>(user?.role ?? "waiting")
  const [roleOpen, setRoleOpen]         = useState(false)

  useEffect(() => {
    setCurrentRole(user?.role ?? "waiting")
    setRoleOpen(false)
  }, [user?.uid])

  // Close the role popover on Escape (the modal itself closes via overlay click).
  useEffect(() => {
    if (!roleOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setRoleOpen(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [roleOpen])

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
          { headers: { Authorization: `Bearer ${token}`, ...sessionTrackingHeaders() } }
        )
      )
      .then((r) => r.json())
      .then((data: ActivityData) => { if (!cancelled) { setActivity(data); setIsLoading(false) } })
      .catch(() => { if (!cancelled) setIsLoading(false) })

    return () => { cancelled = true }
  }, [user?.uid])

  useEffect(() => {
    if (!user || !engagementVisible) { setEngagement(null); return }

    let cancelled = false
    setEngLoading(true)
    setEngagement(null)

    fetchUserEngagement(user.uid, 30)
      .then((data) => { if (!cancelled) { setEngagement(data); setEngLoading(false) } })
      .catch(() => { if (!cancelled) setEngLoading(false) })

    return () => { cancelled = true }
  }, [user?.uid, engagementVisible])

  async function handleRoleChange(role: string) {
    if (!user || changingRole || role === currentRole) return
    setChangingRole(true)
    try {
      await onRoleChange(user.uid, role)
      setCurrentRole(role)
      setRoleOpen(false)
    } finally {
      setChangingRole(false)
    }
  }

  // Top-tier targets (executive/owner/tech) aren't editable from the UI.
  const isTargetTop = ["executive", "owner", "tech"].includes(currentRole)
  const isTargetAdmin = currentRole === "admin"
  const canChangeRole = isExecutive
    ? !isTargetTop
    : isAdmin && !isTargetAdmin && !isTargetTop

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

  // Headline takeaway for the overview strip.
  const engTopPage = engagement?.topPages[0]

  // Most-used *section*, rolled up from the user's top widgets by dwell time.
  const engTopSection = (() => {
    if (!engagement) return null
    const totals = new Map<string, number>()
    for (const w of engagement.topWidgets) {
      if (!w.section) continue
      totals.set(w.section, (totals.get(w.section) ?? 0) + w.totalDwellMs)
    }
    let best: string | null = null
    let bestMs = -1
    for (const [s, ms] of totals) if (ms > bestMs) { best = s; bestMs = ms }
    return best
  })()

  return createPortal(
    <AnimatePresence>
      {user && (
        <>
          <motion.div
            className="modal-overlay"
            style={{ zIndex: overlayZ }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <div className="modal-positioner" style={{ zIndex: contentZ }}>
            <motion.div
              className={`modal usr-activity-modal${engagementVisible ? " usr-activity-modal--full" : ""}`}
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
                      <span className="usr-activity-name">
                        {user.name}
                        {isOwnerRole(currentRole) && <Crown size={15} className="usr-crown" aria-label="Owner" />}
                      </span>
                      <span className={`usr-role-badge ${ROLE_CLASS[displayRole(currentRole)] ?? ""}`}>
                        {ROLE_LABEL[displayRole(currentRole)] ?? displayRole(currentRole)}
                      </span>
                    </div>
                    <span className="usr-activity-email">{user.email}</span>
                  </div>
                </div>

                <div className="usr-activity-header-actions">
                  {isAdmin && (
                    <div className="usr-role-menu">
                      <button
                        className={`usr-role-trigger${roleOpen ? " usr-role-trigger--open" : ""}`}
                        onClick={() => setRoleOpen((o) => !o)}
                        aria-expanded={roleOpen}
                      >
                        <ShieldCheck size={14} />
                        <span>Role</span>
                      </button>

                      {roleOpen && (
                        <>
                          <div className="usr-role-backdrop" onClick={() => setRoleOpen(false)} />
                          <div className="usr-role-popover">
                            <p className="usr-role-popover-title">Role Management</p>
                            {!canChangeRole ? (
                              <div className="usr-activity-admin-lock">
                                <ShieldCheck size={14} className="usr-activity-admin-lock-icon" />
                                <span>
                                  {isTargetTop
                                    ? "Top-level roles cannot be modified here."
                                    : "Admin roles cannot be modified by another admin."}
                                </span>
                              </div>
                            ) : (
                              <>
                                <span className="usr-role-popover-hint">Change role to</span>
                                <div className="usr-role-options">
                                  {isExecutive && (
                                    <button
                                      className={`usr-assign-btn usr-assign-executive${currentRole === "owner" ? " usr-assign-btn--active" : ""}`}
                                      disabled={changingRole || currentRole === "owner"}
                                      onClick={() => handleRoleChange("owner")}
                                    >
                                      Owner
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
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  <button className="button modal-close" onClick={onClose}><X size={16} /></button>
                </div>
              </div>

              {/* ── Body ── */}
              {(() => {
                // Overview: the KPI strip + activity chart. Always shown; it's the
                // first paged section when engagement is available, and the whole
                // body otherwise.
                const overviewContent = (
                  <>
                {/* Overview: metrics grouped into labeled cards (Requests,
                    Sessions, Focus) so each reads as a unit — total vs. last-30. */}
                <div className="usr-overview">
                  <div className="usr-stat-group">
                    <span className="usr-stat-group-label">Requests</span>
                    <div className="usr-stat-group-body">
                      <div className="usr-substat">
                        <span
                          className="usr-substat-value"
                          title={isLoading ? undefined : (activity?.total ?? 0).toLocaleString()}
                        >
                          {isLoading ? "—" : formatCompactNumber(activity?.total ?? 0)}
                        </span>
                        <span className="usr-substat-label">Total</span>
                      </div>
                      <div className="usr-substat">
                        <span
                          className="usr-substat-value usr-substat-value--accent"
                          title={isLoading ? undefined : (activity?.thisMonth ?? 0).toLocaleString()}
                        >
                          {isLoading ? "—" : formatCompactNumber(activity?.thisMonth ?? 0)}
                        </span>
                        <span className="usr-substat-label">Last 30 days</span>
                      </div>
                    </div>
                  </div>

                  {engagementVisible && (
                    <div className="usr-stat-group">
                      <span className="usr-stat-group-label">Sessions</span>
                      <div className="usr-stat-group-body">
                        <div className="usr-substat">
                          <span className="usr-substat-value">
                            {engLoading || engagement?.totalSessionCount == null ? "—" : formatCompactNumber(engagement.totalSessionCount)}
                          </span>
                          <span className="usr-substat-label">Total</span>
                        </div>
                        <div className="usr-substat">
                          <span className="usr-substat-value usr-substat-value--accent">
                            {engLoading || !engagement ? "—" : formatCompactNumber(engagement.sessionCount)}
                          </span>
                          <span className="usr-substat-label">Last 30 days</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {engagementVisible && (
                    <div className="usr-stat-group">
                      <span className="usr-stat-group-label">Focus · Last 30 days</span>
                      <div className="usr-stat-group-body">
                        <div className="usr-substat">
                          <span
                            className="usr-substat-value usr-substat-value--text"
                            title={engTopSection ? sectionLabel(engTopSection) : undefined}
                          >
                            {engTopSection ? sectionLabel(engTopSection) : "—"}
                          </span>
                          <span className="usr-substat-label">Top section</span>
                        </div>
                        <div className="usr-substat">
                          <span
                            className="usr-substat-value usr-substat-value--text"
                            title={engTopPage ? pageLabel(engTopPage.page) : undefined}
                          >
                            {engTopPage ? pageLabel(engTopPage.page) : "—"}
                          </span>
                          <span className="usr-substat-label">Most visited</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Chart */}
                <div className="usr-activity-chart-section">
                  <p className="invoice-modal-section-label">API Activity · Last 30 Days</p>
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
                  </>
                )

                // Reach (page 2): most-visited pages (left) + most-viewed projects (right).
                const reachContent = (
                  <div className="usr-activity-eng-lists">
                    {engLoading ? (
                      <div className="widget-skeleton" style={{ height: "16rem" }} />
                    ) : (
                      <div className="ceng-cols">
                        <PageEngagementList pages={engagement?.topPages ?? []} title="Most-visited pages" subtitle="By visits" />
                        <ProjectEngagementList projects={engagement?.topProjects ?? []} title="Most-viewed projects" subtitle="By views" />
                      </div>
                    )}
                  </div>
                )

                // Usage (page 3): most-used sections + most-used widgets together.
                const usageContent = (
                  <div className="usr-activity-eng-lists">
                    {engLoading ? (
                      <div className="widget-skeleton" style={{ height: "16rem" }} />
                    ) : (
                      <div className="ceng-cols">
                        <SectionEngagementList widgets={engagement?.topWidgets ?? []} title="Most-used sections" subtitle="By time spent" />
                        <WidgetEngagementList widgets={engagement?.topWidgets ?? []} title="Most-used widgets" subtitle="By time spent" />
                      </div>
                    )}
                  </div>
                )

                // With engagement: three snap sections (overview / pages+projects /
                // sections+widgets) navigated by the right-edge dot rail. Without
                // it, the overview alone is the body.
                return engagementVisible ? (
                  <ModalSectionPager
                    sections={[
                      { id: "overview", label: "Overview", content: overviewContent },
                      { id: "reach", label: "Pages & Projects", content: reachContent },
                      { id: "usage", label: "Sections & Widgets", content: usageContent },
                    ]}
                  />
                ) : (
                  <div className="invoice-modal-body">{overviewContent}</div>
                )
              })()}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
