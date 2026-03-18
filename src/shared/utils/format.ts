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
  if (typeof raw === "string" || raw instanceof Date) {
    const d = new Date(raw as string)
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })
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
