import { useState, useMemo, useRef, useEffect } from "react"

// One selectable phase, flattened for the dropdown.
export interface JobOption {
  recnum: string
  jobName: string
  label: string
}

interface JobComboboxProps {
  options: JobOption[]
  value: JobOption | null
  onChange: (job: JobOption | null) => void
  id?: string
  placeholder?: string
  invalid?: boolean
}

// Searchable job/phase picker: type to narrow the list, arrow keys + Enter to
// pick, click-outside to dismiss. Mirrors the old react-dropdown-select UX
// without pulling in a dependency.
export function JobCombobox({ options, value, onChange, id, placeholder, invalid }: JobComboboxProps) {
  const [query, setQuery] = useState(() => (value ? value.label : ""))
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Close (and revert the text to the committed selection) on outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery(value ? value.label : "")
      }
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [value])

  const filtered = useMemo(() => {
    if (!open) return []
    const q = query.trim().toLowerCase()
    // No query, or query still equals the current selection → show everything.
    if (!q || (value && query === value.label)) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [open, query, options, value])

  function select(opt: JobOption) {
    onChange(opt)
    setQuery(opt.label)
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (!open) setOpen(true)
      setHighlight((h) => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === "Enter") {
      if (open && filtered[highlight]) {
        e.preventDefault()
        select(filtered[highlight])
      }
    } else if (e.key === "Escape") {
      setOpen(false)
      setQuery(value ? value.label : "")
    }
  }

  return (
    <div className="co-combobox" ref={wrapRef}>
      <input
        id={id}
        className="form-select co-combobox-input"
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-invalid={invalid}
        autoComplete="off"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setHighlight(0)
          if (value) onChange(null) // editing invalidates the prior pick
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {open && (
        <ul className="co-combobox-menu" role="listbox">
          {filtered.length === 0 ? (
            <li className="co-combobox-empty">No matching jobs</li>
          ) : (
            filtered.map((o, i) => (
              <li
                key={o.recnum}
                role="option"
                aria-selected={value?.recnum === o.recnum}
                className={`co-combobox-option${i === highlight ? " co-combobox-option-active" : ""}`}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => {
                  e.preventDefault() // keep focus; fire before blur
                  select(o)
                }}
              >
                <span>{o.jobName}</span>
                <span className="co-combobox-recnum">{o.recnum}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
