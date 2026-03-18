import { useAuth } from '../AuthProvider'
import { allRoles } from '../roles'

export default function useIsInitialized() {
  const { user, claims } = useAuth()

  const isInitialized =
    !!user && allRoles.some((role) => claims['role'] === role)

  return { isInitialized }
}
