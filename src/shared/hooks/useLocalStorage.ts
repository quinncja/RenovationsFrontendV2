import { useState, useEffect, useCallback } from "react"

export default function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    const item = localStorage.getItem(key)
    return item !== null ? (JSON.parse(item) as T) : initialValue
  })

  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    setStoredValue((prev) => {
      const valueToStore = value instanceof Function ? value(prev) : value
      localStorage.setItem(key, JSON.stringify(valueToStore))
      // Dispatch a storage event so other components using the same key re-render
      window.dispatchEvent(new StorageEvent("storage", { key, newValue: JSON.stringify(valueToStore) }))
      return valueToStore
    })
  }, [key])

  // Listen for changes from other components in the same tab
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === key) {
        setStoredValue(e.newValue !== null ? (JSON.parse(e.newValue) as T) : initialValue)
      }
    }
    window.addEventListener("storage", handler)
    return () => window.removeEventListener("storage", handler)
  }, [key, initialValue])

  return [storedValue, setValue] as const
}
