import { useAuth } from '../AuthProvider'
import { roles, isNavGroup, type NavItem, type NavGroup, type AppRole } from '../roles'

export default function useNavItems(): (NavItem | NavGroup)[] {
  const { claims } = useAuth()
  const userRole = claims['role'] as AppRole | undefined

  if (!userRole || !roles[userRole]) return []

  const seenPaths = new Set<string>()
  const result: (NavItem | NavGroup)[] = []

  for (const item of roles[userRole].nav) {
    if (isNavGroup(item)) {
      const dedupedItems: NavItem[] = []
      for (const child of item.items) {
        if (!seenPaths.has(child.path)) {
          seenPaths.add(child.path)
          dedupedItems.push(child)
        }
      }
      if (dedupedItems.length > 0) result.push({ ...item, items: dedupedItems })
    } else {
      if (!seenPaths.has(item.path)) {
        seenPaths.add(item.path)
        result.push(item)
      }
    }
  }

  return result
}
