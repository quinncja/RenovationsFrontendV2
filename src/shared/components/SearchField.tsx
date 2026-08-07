import { Search } from "lucide-react"

// Icon + input search field — the same 6-line "wrapper div, positioned
// Search icon, bare input" block was copy-pasted across 9 call sites
// (Vendors/Clients/Subcontractors/ChangeOrders/ProgressBillings pages, both
// of Jobcost's searches, Employees, Invoices). `variant` selects the CSS
// class family so each surface (dark command bar vs light pill) keeps its
// exact original look — no visual change, just one JSX implementation.
export function SearchField({
  variant,
  value,
  onChange,
  placeholder,
}: {
  variant: "co" | "jc" | "invoices"
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  if (variant === "invoices") {
    return (
      <div className="invoices-search">
        <Search size={14} />
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    )
  }

  const isJc = variant === "jc"
  return (
    <div className={isJc ? "jc-cb-search" : "co-search-wrapper"}>
      <Search size={isJc ? 14 : 13} className={isJc ? "jc-cb-search-icon" : "co-search-icon"} />
      <input
        className={isJc ? "jc-cb-search-input" : "co-search-input"}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
