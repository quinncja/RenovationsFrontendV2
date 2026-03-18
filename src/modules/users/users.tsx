import { useEffect, useState, useRef } from "react"
import { Wifi, WifiOff } from "lucide-react"
import { auth } from "../../core/auth/firebase"
import { useAuth } from "../../core/auth/AuthProvider"
import Page from "../../shared/components/Page"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { UserActivityModal } from "../../shared/components/UserActivityModal/UserActivityModal"

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api"

interface UserRecord {
  uid: string
  email: string
  name: string
  role: string
  photoURL: string | null
}

function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?"
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function UserCard({
  user,
  isAdmin,
  onAssignRole,
  assigning,
  onClick,
}: {
  user: UserRecord
  isAdmin: boolean
  onAssignRole?: (uid: string, role: string) => void
  assigning: boolean
  onClick: () => void
}) {
  return (
    <div className="usr-card" onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onClick()}>
      <div className="usr-card-header">
        {user.photoURL ? (
          <img className="usr-avatar" src={user.photoURL} alt={user.name} />
        ) : (
          <div className="usr-avatar usr-avatar-initials">{avatarInitials(user.name)}</div>
        )}
        <div className="usr-card-info">
          <span className="usr-card-name">{user.name}</span>
          <span className="usr-card-email">{user.email}</span>
        </div>
      </div>
      {isAdmin && user.role === "waiting" && onAssignRole && (
        <div className="usr-assign-row">
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
  const isAdmin = claims["role"] === "admin"

  const [users, setUsers] = useState<UserRecord[]>([])
  const [connected, setConnected] = useState(false)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null)
  const esRef = useRef<EventSource | null>(null)

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

  const admins = users.filter((u) => u.role === "admin")
  const managers = users.filter((u) => u.role === "manager")
  const waiting = users.filter((u) => u.role === "waiting" || !["admin", "manager"].includes(u.role))

  return (
    <>
    <Page
      title="Users"
      actions={
        <div className={`usr-connection-status${connected ? " usr-connection-status--connected" : ""}`}>
          {connected
            ? <><Wifi size={13} /><span>Live</span></>
            : <><WifiOff size={13} /><span>Connecting…</span></>
          }
        </div>
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
                onAssignRole={handleAssignRole}
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
      onClose={() => setSelectedUser(null)}
      onRoleChange={handleAssignRole}
    />
    </>
  )
}
