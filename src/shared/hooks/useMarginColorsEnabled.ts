import useLocalStorage from "./useLocalStorage"

// User preference: whether margin values render with their green/amber/red
// threshold coloring (via marginTextColor / marginColor / marginClass) or
// fall back to the default text color. Default ON. Toggled from
// SettingsModal; persisted in localStorage. useLocalStorage dispatches a
// storage event on write so every component reading this key re-renders
// in lockstep — no prop drilling required.
export const MARGIN_COLORS_KEY = "marginColorsEnabled"

export default function useMarginColorsEnabled(): boolean {
  const [enabled] = useLocalStorage<boolean>(MARGIN_COLORS_KEY, true)
  return enabled
}
