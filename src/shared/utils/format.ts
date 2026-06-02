export function shortMonth(month: number): string {
  return new Date(2000, month - 1, 1).toLocaleString("en-US", { month: "short" })
}

export function fullMonth(month: number): string {
  return new Date(2000, month - 1, 1).toLocaleString("en-US", { month: "long" })
}

export function formatMoney(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value.toFixed(0)}`
}

// Handles both SQL Server DATE (returned as ISO string by mssql) and
// Sage/Timberline integer dates stored as YYYYMMDD (e.g. 20240315).
export function formatDate(raw: unknown): string {
  if (raw === null || raw === undefined || raw === 0 || raw === "") return "—"
  if (typeof raw === "number") {
    const s = String(raw)
    if (s.length === 8) return `${s.slice(4, 6)}/${s.slice(6, 8)}/${s.slice(0, 4)}`
    return s
  }
  if (typeof raw === "string") {
    // ISO date-only strings (e.g. "2026-03-31" or "2026-03-31T00:00:00.000Z") are parsed
    // as UTC midnight by `new Date()`, which shifts them back a day in US timezones.
    // Extract the date parts directly to avoid the UTC offset.
    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (isoMatch) {
      return `${isoMatch[2]}/${isoMatch[3]}/${isoMatch[1]}`
    }
    const d = new Date(raw)
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })
    }
  }
  if (raw instanceof Date) {
    if (!isNaN(raw.getTime())) {
      return raw.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })
    }
  }
  return String(raw)
}

export function formatMoneyFull(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

// Accepts either a ratio (0.18 → "18.0%") or a whole percentage (18 → "18.0%").
export function formatPercent(value: number): string {
  const pct = Math.abs(value) <= 1 ? value * 100 : value
  return `${pct.toFixed(1)}%`
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value)
}

// Color for a margin percentage (0–100 scale): green at/above 20%, red below.
export function marginTextColor(pct: number): string {
  if (pct >= 20) return "#22c55e" // green
  if (pct >= 15) return "#eab308" // yellow
  return "#ef4444" // red
}
