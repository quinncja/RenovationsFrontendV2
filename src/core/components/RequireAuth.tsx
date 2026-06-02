import { Navigate, Outlet } from "react-router-dom"
import { useAuth } from "../auth/AuthProvider"
import type { AppRole } from "../auth/roles"

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
  const role = claims["role"] as AppRole | undefined

  if (!role || !allowed.includes(role)) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
