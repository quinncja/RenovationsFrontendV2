import type { CSSProperties } from "react"

export interface FilterPillOption<T extends string | number> {
  key: T
  label: string
  color: string
}

/** Labeled row of single-select pill buttons: neutral outline until hovered
 *  (hinting the option color) and filled with it when active. Shared by the
 *  Invoices and Job Costing toolbars so the filters read identically. */
export function FilterPills<T extends string | number>({
  label, options, value, onChange,
}: {
  label: string
  options: FilterPillOption<T>[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="invoices-filter-group">
      <span className="invoices-filter-label">{label}</span>
      <div className="filter-pills">
        {options.map((opt) => (
          <button
            key={String(opt.key)}
            type="button"
            className={`filter-pill${value === opt.key ? " filter-pill--active" : ""}`}
            style={{ "--pill": opt.color } as CSSProperties}
            onClick={() => onChange(opt.key)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
