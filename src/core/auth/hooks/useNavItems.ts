import { useAuth } from '../AuthProvider'
import { roles, isNavGroup, isNavDivider, type NavItem, type NavEntry, type AppRole } from '../roles'

export default function useNavItems(): NavEntry[] {
  const { claims } = useAuth()
  const userRole = claims['role'] as AppRole | undefined

  if (!userRole || !roles[userRole]) return []

  const seenPaths = new Set<string>()
  const result: NavEntry[] = []

  for (const item of roles[userRole].nav) {
    if (isNavDivider(item)) {
      // Keep dividers between sections; drop them at the start or if they'd
      // end up adjacent (e.g. an empty section between two dividers).
      if (result.length === 0 || isNavDivider(result[result.length - 1])) continue
      result.push(item)
    } else if (isNavGroup(item)) {
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

  // Trim a trailing divider if present.
  if (result.length > 0 && isNavDivider(result[result.length - 1])) result.pop()

  return result
}
