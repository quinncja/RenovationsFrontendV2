import { Navigate, Outlet } from "react-router-dom"
import { useAuth } from "../auth/AuthProvider"
import { effectiveRole, type AppRole } from "../auth/roles"

export default function RequireAuth() {
  const { user, loading } = useAuth()

  if (loading) return null

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

export function RequireRole({ allowed, children }: { allowed: AppRole[]; children: React.ReactNode }) {
  const { claims } = useAuth()
  // owner/tech collapse to executive, so executive-gated routes accept them.
  const role = effectiveRole(claims["role"] as string | undefined)

  if (!role || !allowed.includes(role)) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
