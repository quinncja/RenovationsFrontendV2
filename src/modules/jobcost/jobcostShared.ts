// Plain (non-component) helpers shared across the jobcost module. Kept out of
// the component files so react-refresh can hot-reload those cleanly.

// Fallback when the actr_u row is missing: the recnum's last two digits are
// the phase month (01–12); 00 or >12 marks a one-off (see tools/
// SAGE_PARENT_ONEOFF_NOTES.md).
export function oneoffFromRecnum(recnum: string): boolean {
  const suffix = Number(recnum.slice(-2))
  return !(suffix >= 1 && suffix <= 12)
}

// Sage stores unset dates as null (or a pre-2000 sentinel on old rows) — treat
// both as "no date".
export function parseValidDate(raw: string | null | undefined): Date | null {
  if (!raw) return null
  const d = new Date(raw)
  if (isNaN(d.getTime()) || d.getFullYear() < 2000) return null
  return d
}

export function fmtLongDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

// URL slug for a property's parent key ("1 Wheaton" → "1-Wheaton") — parent
// strings are free text, and raw spaces read as %20 in the address bar. The
// slug is matched by re-slugging candidates (not reversed), so it only needs
// to be deterministic, not losslessly invertible.
export function propertySlug(parent: string): string {
  return parent.trim().replace(/[\s/]+/g, "-")
}
