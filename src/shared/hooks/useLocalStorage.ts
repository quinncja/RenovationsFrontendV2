import { useState, useEffect, useCallback, useRef } from "react"

export default function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    const item = localStorage.getItem(key)
    return item !== null ? (JSON.parse(item) as T) : initialValue
  })

  // No side effects inside the updater: React re-enters and replays updaters
  // (StrictMode double-invoke, render-phase updates), and a side-effectful
  // updater re-runs functional updates against already-updated state — a
  // toggle pushed through here could apply twice and cancel itself out.
  // Persistence happens after commit, in the effect below.
  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    setStoredValue((prev) => (value instanceof Function ? value(prev) : value))
  }, [])

  // Persist + notify other hook instances on the same key. The getItem guard
  // breaks the echo loop (a listener update lands here already persisted) and
  // skips the no-op write on mount.
  useEffect(() => {
    const json = JSON.stringify(storedValue)
    if (localStorage.getItem(key) !== json) {
      localStorage.setItem(key, json)
      window.dispatchEvent(new StorageEvent("storage", { key, newValue: json }))
    }
  }, [key, storedValue])

  // Listen for changes from other components in the same tab (and other tabs).
  // initialValue rides in a ref — an inline default like [] is a fresh
  // reference every render and would re-wire the listener each time.
  const initialRef = useRef(initialValue)
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === key) {
        setStoredValue(e.newValue !== null ? (JSON.parse(e.newValue) as T) : initialRef.current)
      }
    }
    window.addEventListener("storage", handler)
    return () => window.removeEventListener("storage", handler)
  }, [key])

  return [storedValue, setValue] as const
}
