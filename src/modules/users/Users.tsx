import { useEffect, useState, useRef } from "react"
import { Wifi, WifiOff, X, BarChart3, Crown } from "lucide-react"
import { auth } from "../../core/auth/firebase"
import { useAuth } from "../../core/auth/AuthProvider"
import { effectiveRole, isOwnerRole } from "../../core/auth/roles"
import Page from "../../shared/components/Page"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { UserActivityModal } from "../../shared/components/UserActivityModal/UserActivityModal"
import useIsMobile from "../../shared/hooks/useIsMobile"
import { fetchAnalyticsAccess } from "../../shared/analytics/engagementApi"
import { CompanyEngagementModal } from "../../shared/analytics/CompanyEngagementModal"

// Trim trailing slash so `${API_BASE_URL}/users/...` never produces "//".
const API_BASE_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "")

interface UserRecord {
  uid: string
  email: string
  name: string
  role: string
  photoURL: string | null
  lastSeenAt?: string | null
}

function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?"
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Soft, compact "last seen" label (e.g. "Just now", "3h", "2d", "Mar 4"). Returns
// null when we've never seen the user, so the card can drop the chip entirely.
function lastSeenLabel(iso?: string | null): string | null {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (isNaN(then)) return null
  const mins = Math.floor((Date.now() - then) / 60000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d`
  return new Date(then).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function UserCard({
  user,
  isAdmin,
  isExecutive,
  onAssignRole,
  onReject,
  assigning,
  onClick,
}: {
  user: UserRecord
  isAdmin: boolean
  isExecutive?: boolean
  onAssignRole?: (uid: string, role: string) => void
  onReject?: (uid: string) => void
  assigning: boolean
  onClick: () => void
}) {
  const lastSeen = lastSeenLabel(user.lastSeenAt)
  return (
    <div className="usr-card" onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onClick()}>
      <div className="usr-card-header">
        {user.photoURL ? (
          <img className="usr-avatar" src={user.photoURL} alt={user.name} />
        ) : (
          <div className="usr-avatar usr-avatar-initials">{avatarInitials(user.name)}</div>
        )}
        <div className="usr-card-info">
          <span className="usr-card-name">
            {user.name}
            {isOwnerRole(user.role) && <Crown size={14} className="usr-crown" aria-label="Owner" />}
          </span>
          <span className="usr-card-email">{user.email}</span>
        </div>
        {lastSeen && (
          <span className="usr-card-lastseen" title={`Last seen ${new Date(user.lastSeenAt as string).toLocaleString()}`}>
            {lastSeen}
          </span>
        )}
      </div>
      {isAdmin && user.role === "waiting" && onAssignRole && (
        <div className="usr-assign-row">
          {isExecutive && (
            <button
              className="usr-assign-btn usr-assign-executive"
              disabled={assigning}
              onClick={(e) => { e.stopPropagation(); onAssignRole(user.uid, "owner") }}
            >
              Owner
            </button>
          )}
          <button
            className="usr-assign-btn usr-assign-admin"
            disabled={assigning}
            onClick={(e) => { e.stopPropagation(); onAssignRole(user.uid, "admin") }}
          >
            Admin
          </button>
          <button
            className="usr-assign-btn usr-assign-manager"
            disabled={assigning}
            onClick={(e) => { e.stopPropagation(); onAssignRole(user.uid, "manager") }}
          >
            Manager
          </button>
          {onReject && (
            <button
              className="usr-assign-btn usr-assign-reject"
              disabled={assigning}
              onClick={(e) => { e.stopPropagation(); onReject(user.uid) }}
              title="Reject user"
            >
              <X size={14} strokeWidth={3} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Column({
  title,
  badge,
  children,
}: {
  title: string
  badge?: number
  children: React.ReactNode
}) {
  return (
    <div className="usr-column">
      <div className="usr-column-header">
        <h2 className="usr-column-title">{title}</h2>
        {badge !== undefined && (
          <span className="usr-column-badge">{badge}</span>
        )}
      </div>
      <div className="usr-column-body">{children}</div>
    </div>
  )
}

export default function Users() {
  const { user, claims } = useAuth()
  const isMobile = useIsMobile()
  const rawRole = claims["role"] as string | undefined
  const effRole = effectiveRole(rawRole)
  const isExecutive = effRole === "executive"   // true for executive/owner/tech
  const isAdmin = effRole === "executive" || effRole === "admin"

  const [users, setUsers] = useState<UserRecord[]>([])
  const [connected, setConnected] = useState(false)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null)
  const [isAnalyticsAdmin, setIsAnalyticsAdmin] = useState(false)
  const [engOpen, setEngOpen] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchAnalyticsAccess()
      .then((r) => { if (!cancelled) setIsAnalyticsAdmin(r.isAnalyticsAdmin) })
      .catch(() => { if (!cancelled) setIsAnalyticsAdmin(false) })
    return () => { cancelled = true }
  }, [user])

  useEffect(() => {
    let es: EventSource | null = null
    let closed = false

    async function connect() {
      const token = await auth.currentUser?.getIdToken()
      if (!token || closed) return

      es = new EventSource(`${API_BASE_URL}/users/sse?token=${encodeURIComponent(token)}`)
      esRef.current = es

      es.onopen = () => setConnected(true)

      es.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as { type: string; users?: UserRecord[] }
          if (msg.type === "userList" && msg.users) {
            setUsers(msg.users)
          }
        } catch {
          // ignore malformed messages
        }
      }

      es.onerror = () => {
        setConnected(false)
        es?.close()
        esRef.current = null
        // Reconnect after 5 s
        if (!closed) {
          setTimeout(connect, 5000)
        }
      }
    }

    connect()

    return () => {
      closed = true
      es?.close()
      esRef.current = null
    }
  }, [user])

  async function handleRejectUser(uid: string) {
    if (assigning) return
    setAssigning(uid)
    // Optimistically remove from the list
    setUsers((prev) => prev.filter((u) => u.uid !== uid))
    try {
      const token = await auth.currentUser?.getIdToken()
      await fetch(`${API_BASE_URL}/users/${uid}`, {
        method: "DELETE",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
    } finally {
      setAssigning(null)
    }
  }

  async function handleAssignRole(uid: string, role: string) {
    if (assigning) return
    setAssigning(uid)
    try {
      const token = await auth.currentUser?.getIdToken()
      await fetch(`${API_BASE_URL}/users/${uid}/role`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ role }),
      })
    } finally {
      setAssigning(null)
    }
  }

  // No separate Executives column: owner/tech (and any executive) all live in the
  // Admins column — owner shows a crown, tech blends in as a plain admin card.
  // Anything not admin-or-above / manager falls into the waiting room.
  const isExecLike = (r: string) => effectiveRole(r) === "executive"
  const admins = users.filter((u) => isExecLike(u.role) || u.role === "admin")
  const managers = users.filter((u) => u.role === "manager")
  const waiting = users.filter((u) => !isExecLike(u.role) && u.role !== "admin" && u.role !== "manager")

  return (
    <>
    <Page
      title="Users"
      actions={
        <>
          {isAnalyticsAdmin && !isMobile && (
            <button className="usr-eng-trigger" onClick={() => setEngOpen(true)}>
              <BarChart3 size={14} />
              <span>Company Engagement</span>
            </button>
          )}
          <div className={`usr-connection-status${connected ? " usr-connection-status--connected" : ""}`}>
            {connected
              ? <><Wifi size={13} /><span>Live</span></>
              : <><WifiOff size={13} /><span>Connecting…</span></>
            }
          </div>
        </>
      }
    >
      <MotionList><MotionItem>
      <div className="usr-board">
        <Column title="Admins" badge={admins.length}>
          {admins.length === 0 ? (
            <p className="usr-empty">No admins</p>
          ) : (
            admins.map((u) => (
              <UserCard key={u.uid} user={u} isAdmin={isAdmin} assigning={assigning === u.uid} onClick={() => setSelectedUser(u)} />
            ))
          )}
        </Column>

        <Column title="Managers" badge={managers.length}>
          {managers.length === 0 ? (
            <p className="usr-empty">No managers</p>
          ) : (
            managers.map((u) => (
              <UserCard key={u.uid} user={u} isAdmin={isAdmin} assigning={assigning === u.uid} onClick={() => setSelectedUser(u)} />
            ))
          )}
        </Column>

        <Column title="Waiting Room" badge={waiting.length}>
          {waiting.length === 0 ? (
            <p className="usr-empty">No one waiting</p>
          ) : (
            waiting.map((u) => (
              <UserCard
                key={u.uid}
                user={u}
                isAdmin={isAdmin}
                isExecutive={isExecutive}
                onAssignRole={handleAssignRole}
                onReject={handleRejectUser}
                assigning={assigning === u.uid}
                onClick={() => setSelectedUser(u)}
              />
            ))
          )}
        </Column>
      </div>
      </MotionItem></MotionList>
    </Page>

    <UserActivityModal
      user={selectedUser}
      isAdmin={isAdmin}
      isExecutive={isExecutive}
      showEngagement={isAnalyticsAdmin}
      onClose={() => setSelectedUser(null)}
      onRoleChange={handleAssignRole}
    />

    {isAnalyticsAdmin && (
      <CompanyEngagementModal open={engOpen} onClose={() => setEngOpen(false)} />
    )}
    </>
  )
}
