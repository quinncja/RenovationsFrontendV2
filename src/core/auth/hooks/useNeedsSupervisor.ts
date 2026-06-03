import { useAuth } from '../AuthProvider'

/**
 * A manager (project manager) must select which supervisor they are before
 * using the app — their dashboard is scoped to that supervisor id (stored as
 * the `employeeId` custom claim). Until they pick, gate the app on
 * <SupervisorSelect/>. Executives/admins and DEV_BYPASS (role 'executive')
 * are never gated. Runs AFTER the role gate in App.tsx — a manager already has
 * a role, so they're "initialized" but not yet scoped.
 */
export default function useNeedsSupervisor() {
  const { user, claims } = useAuth()

  const needsSupervisor =
    !!user && claims['role'] === 'manager' && claims['employeeId'] == null

  return { needsSupervisor }
}
