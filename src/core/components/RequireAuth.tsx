import { Navigate, Outlet } from "react-router-dom"
import { useAuth } from "../auth/AuthProvider"
import { allRoles, type AppRole } from "../auth/roles"
import WaitingRoom from "../auth/pages/WaitingRoom"

export default function RequireAuth() {
  const { user, claims, loading } = useAuth()

  if (loading) return null

  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Authenticated but no assigned role yet → pending admin approval.
  const role = claims["role"] as AppRole | undefined
  if (!role || !allRoles.includes(role)) {
    return <WaitingRoom />
  }

  return <Outlet />
}

export function RequireRole({ allowed, children }: { allowed: AppRole[]; children: React.ReactNode }) {
  const { claims } = useAuth()
  const role = claims["role"] as AppRole | undefined

  if (!role || !allowed.includes(role)) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
