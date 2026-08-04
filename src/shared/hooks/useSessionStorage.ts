import { useCallback, useEffect, useRef, useState } from "react"

// sessionStorage twin of useLocalStorage, for controls that should live as
// long as the TAB — survive route changes and refreshes — but start fresh next
// session (the Job Costing "when" pair). Same replay-safe setter, and the same
// "never materialize the default" rule: a value still sitting at its default
// leaves the key absent, so hasSessionValue can tell an untouched control from
// a deliberate pick. No cross-instance sync — a session-scoped control has a
// single owner.

export function hasSessionValue(key: string): boolean {
  try {
    return sessionStorage.getItem(key) !== null
  } catch {
    return false
  }
}

export function readSessionStored<T>(key: string, fallback: T): T {
  try {
    const item = sessionStorage.getItem(key)
    if (item === null) return fallback
    return JSON.parse(item) as T
  } catch {
    return fallback
  }
}

export default function useSessionStorage<T>(key: string, initialValue: T | (() => T)) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    const init = initialValue instanceof Function ? initialValue() : initialValue
    return readSessionStored(key, init)
  })

  // initialValue rides in a ref — an inline default (or arrow initializer) is
  // a fresh reference every render and would re-wire the effect each time.
  const initialRef = useRef(initialValue)

  // No side effects inside the updater (see useLocalStorage for the replay
  // rationale) — persistence happens after commit, in the effect below.
  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    setStoredValue((prev) => (value instanceof Function ? value(prev) : value))
  }, [])

  useEffect(() => {
    // A function initializer re-resolves here so the "still at the default"
    // guard tracks the CURRENT default (e.g. after the open-period cache was
    // refreshed) — a value the default caught up with stays unmaterialized.
    const iv = initialRef.current
    const init = iv instanceof Function ? iv() : iv
    const json = JSON.stringify(storedValue)
    try {
      const existing = sessionStorage.getItem(key)
      if (existing === json) return
      if (existing === null && json === JSON.stringify(init)) return
      sessionStorage.setItem(key, json)
    } catch {
      // Storage-restricted context — in-memory state still works, persistence
      // is best-effort.
    }
  }, [key, storedValue])

  return [storedValue, setValue] as const
}
