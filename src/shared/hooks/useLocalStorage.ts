import { useState, useEffect, useCallback, useRef } from "react"

// JSON.parse can throw on legacy raw values stored under a key the hook later
// adopted (e.g. a bare `grouped` string) — treat those as unset.
function readStored<T>(key: string, fallback: T): T {
  const item = localStorage.getItem(key)
  if (item === null) return fallback
  try {
    return JSON.parse(item) as T
  } catch {
    return fallback
  }
}

export default function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => readStored(key, initialValue))

  // No side effects inside the updater: React re-enters and replays updaters
  // (StrictMode double-invoke, render-phase updates), and a side-effectful
  // updater re-runs functional updates against already-updated state — a
  // toggle pushed through here could apply twice and cancel itself out.
  // Persistence happens after commit, in the effect below.
  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    setStoredValue((prev) => (value instanceof Function ? value(prev) : value))
  }, [])

  // initialValue rides in a ref — an inline default like [] is a fresh
  // reference every render and would re-wire the effects each time.
  const initialRef = useRef(initialValue)

  // Persist + notify other hook instances on the same key. The getItem guard
  // breaks the echo loop (a listener update lands here already persisted). An
  // absent key still holding the default is left absent — materializing it
  // would undo removeItem from another tab and erase the unset/default
  // distinction other code reads via getItem === null.
  const keyRef = useRef(key)
  useEffect(() => {
    if (keyRef.current !== key) {
      // Key switched: adopt the new key's stored value rather than writing the
      // old key's in-memory value over it.
      keyRef.current = key
      setStoredValue(readStored(key, initialRef.current))
      return
    }
    const json = JSON.stringify(storedValue)
    const existing = localStorage.getItem(key)
    if (existing === json) return
    if (existing === null && json === JSON.stringify(initialRef.current)) return
    try {
      localStorage.setItem(key, json)
      window.dispatchEvent(new StorageEvent("storage", { key, newValue: json }))
    } catch {
      // Storage-restricted context (Safari private mode quota) — in-memory
      // state still works, persistence is best-effort.
    }
  }, [key, storedValue])

  // Listen for changes from other components in the same tab (and other tabs).
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== key) return
      if (e.newValue === null) {
        setStoredValue(initialRef.current)
        return
      }
      try {
        setStoredValue(JSON.parse(e.newValue) as T)
      } catch {
        setStoredValue(initialRef.current)
      }
    }
    window.addEventListener("storage", handler)
    return () => window.removeEventListener("storage", handler)
  }, [key])

  return [storedValue, setValue] as const
}
