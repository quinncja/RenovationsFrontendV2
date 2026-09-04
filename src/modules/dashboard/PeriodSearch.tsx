import { useEffect, useRef, useState } from "react"
import { Search, X } from "lucide-react"
import { normalizeSearch } from "./overheadSearch"

/** Pause after the last keystroke before a period search applies. */
const SEARCH_DEBOUNCE_MS = 300

/**
 * Search box for period-card widgets (Monthly Spending, Invoices by week).
 * Owns the live text so keystrokes re-render only this input, not the whole
 * page; the parent hears the normalized query once typing pauses (clearing
 * reports at once).
 */
export function PeriodSearch({ onQuery, placeholder, ariaLabel }: { onQuery: (q: string) => void; placeholder: string; ariaLabel: string }) {
  const [text, setText] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const timer = useRef<number | null>(null)
  useEffect(() => () => { if (timer.current != null) window.clearTimeout(timer.current) }, [])
  function change(next: string) {
    setText(next)
    if (timer.current != null) window.clearTimeout(timer.current)
    const q = normalizeSearch(next)
    if (!q) {
      onQuery("")
      return
    }
    timer.current = window.setTimeout(() => onQuery(q), SEARCH_DEBOUNCE_MS)
  }
  function clear() {
    change("")
    inputRef.current?.focus()
  }
  return (
    <div className="ohr-search">
      <Search size={14} className="ohr-search-icon" aria-hidden />
      <input
        ref={inputRef}
        className="ohr-search-input"
        type="search"
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={text}
        onChange={(e) => change(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && text) {
            e.preventDefault()
            clear()
          }
        }}
      />
      <button
        type="button"
        className={`ohr-search-clear${text ? " ohr-search-clear-show" : ""}`}
        aria-label="Clear search"
        title="Clear search"
        tabIndex={text ? 0 : -1}
        onClick={clear}
      >
        <X size={13} />
      </button>
    </div>
  )
}

/** `text` with every case-insensitive occurrence of the (normalized) query wrapped in <mark>. */
export function Highlight({ text, query }: { text: string; query?: string }) {
  const needle = query ? normalizeSearch(query) : ""
  if (!needle) return <>{text}</>
  const lower = text.toLowerCase()
  let at = lower.indexOf(needle)
  if (at < 0) return <>{text}</>
  const parts: React.ReactNode[] = []
  let i = 0
  while (at >= 0) {
    if (at > i) parts.push(text.slice(i, at))
    parts.push(<mark key={at} className="ohr-mark">{text.slice(at, at + needle.length)}</mark>)
    i = at + needle.length
    at = lower.indexOf(needle, i)
  }
  if (i < text.length) parts.push(text.slice(i))
  return <>{parts}</>
}
