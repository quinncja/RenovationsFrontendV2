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
// NOTE: this guesses by magnitude (|v| <= 1 → ratio), so a *ratio* whose
// magnitude exceeds 1 (e.g. a 150%+ margin = 1.5) is misread as already-percent
// and shown 100x too small. When the unit is known, prefer the explicit
// formatters below instead of relying on the guess.
export function formatPercent(value: number): string {
  const pct = Math.abs(value) <= 1 ? value * 100 : value
  return `${pct.toFixed(1)}%`
}

// Unambiguous: input is always a ratio (0.18 → "18.0%", 1.5 → "150.0%").
export function formatRatioPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value)
}

// Parse a backend datetime into a Date treated as LOCAL wall-clock time.
// Sage timestamps come back as naive server-local (Central) datetimes that
// mssql serializes with a Z/offset; stripping the zone and reading the parts
// as local keeps "3h ago" labels sane for users in the company's timezone.
function parseWallClock(raw: unknown): Date | null {
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw
  if (typeof raw !== "string") return null
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/)
  if (m) {
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0))
  }
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnly) return new Date(+dateOnly[1], +dateOnly[2] - 1, +dateOnly[3])
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

// Coarse relative label for activity feeds: "just now", "35m ago", "3h ago",
// "Yesterday", a weekday name inside the last week, then falls back to
// formatDate. Timestamps are wall-clock (see parseWallClock) so precision is
// deliberately coarse.
export function formatRelativeTime(raw: unknown): string {
  const d = parseWallClock(raw)
  if (!d) return formatDate(raw)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  if (diffMs < 60_000) return "just now"
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (d >= startOfToday) return `${Math.floor(diffMs / 3_600_000)}h ago`
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  if (d >= startOfYesterday) return "Yesterday"
  const weekAgo = new Date(startOfToday)
  weekAgo.setDate(weekAgo.getDate() - 6)
  if (d >= weekAgo) return d.toLocaleDateString("en-US", { weekday: "long" })
  return formatDate(raw)
}

// Label for a "since …" window cutoff: "yesterday" when the cutoff is the
// previous calendar day, else the cutoff's weekday name ("Friday" on a
// Monday). Used by the Recent Changes cards' subtitle and empty state.
export function sinceLabel(cutoffIso: string): string {
  const d = parseWallClock(cutoffIso)
  if (!d) return "yesterday"
  const now = new Date()
  const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (d >= startOfYesterday) return "yesterday"
  return d.toLocaleDateString("en-US", { weekday: "long" })
}

// Color for a margin percentage (0–100 scale): green at/above 20%, red below.
export function marginTextColor(pct: number): string {
  if (pct >= 20) return "#22c55e" // green
  if (pct >= 15) return "#eab308" // yellow
  return "#ef4444" // red
}
