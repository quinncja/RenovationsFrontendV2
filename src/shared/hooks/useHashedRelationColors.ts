import useLocalStorage from "./useLocalStorage"

// User preference: whether business-relation charts (clients, subcontractors,
// material suppliers) color each entity by a hash of its name (hashColor) —
// stable per entity, "random" across the wheel — instead of the per-family
// shade ramp (all-orange clients, all-purple suppliers, ...). Default OFF.
// Toggled from SettingsModal; persisted in localStorage. useLocalStorage
// dispatches a storage event on write so every component reading this key
// re-renders in lockstep — no prop drilling required.
export const HASHED_RELATION_COLORS_KEY = "hashedRelationColorsEnabled"

export default function useHashedRelationColors(): boolean {
  const [enabled] = useLocalStorage<boolean>(HASHED_RELATION_COLORS_KEY, false)
  return enabled
}
