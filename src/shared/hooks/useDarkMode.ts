import { useState, useEffect } from "react"

function readDark(): boolean {
  const scheme = document.documentElement.style.colorScheme
  if (scheme === "light") return false
  if (scheme === "dark") return true
  // colorScheme not yet set — read localStorage (may be JSON-stringified)
  const stored = localStorage.getItem("theme")
  if (!stored) return false // app default is light
  try { return JSON.parse(stored) === "dark" } catch { return stored === "dark" }
}

export function useDarkMode(): boolean {
  const [dark, setDark] = useState(readDark)

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const scheme = document.documentElement.style.colorScheme
      setDark(scheme !== "light")
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] })
    return () => observer.disconnect()
  }, [])

  return dark
}
