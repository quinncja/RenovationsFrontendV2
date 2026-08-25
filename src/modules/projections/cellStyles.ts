import type { CellStyle } from "./types"

/**
 * The board's curated cell-color palette — decorative annotation only, no
 * semantics. Tokens are what's stored and audited; their actual colors live
 * in App.css (`--pj-c-*` for fills/swatches) so the palette can be retuned
 * without touching data. The backend validates edits against the same token
 * lists (projections.service.js). Text color (ink) is retired from the UI;
 * the wire format still carries ink tokens so the backend and old data are
 * untouched.
 *
 * Wire format: a style edit is `{ rowId, field: "style:<cellField>", value }`
 * where value is `"<fill>|<ink>"` — the FULL desired state for the cell, so
 * undo can replay the old token verbatim. `""` clears both facets.
 */

export type StyleFacet = "fill" | "ink"

export interface SwatchDef {
  token: string
  label: string
}

export const FILL_SWATCHES: SwatchDef[] = [
  { token: "red", label: "Red" },
  { token: "amber", label: "Amber" },
  { token: "green", label: "Green" },
  { token: "blue", label: "Blue" },
  { token: "purple", label: "Purple" },
  { token: "gray", label: "Gray" },
]
// "copper" is no longer offered (the accent is reserved for active state);
// its pj-fill-copper / ink classes stay so cells painted earlier still render.

/** Canonical `"fill|ink"` token for a cell's style (`""` = unstyled). */
export function styleToken(s: CellStyle | undefined): string {
  const fill = s?.fill ?? ""
  const ink = s?.ink ?? ""
  return fill || ink ? `${fill}|${ink}` : ""
}

/** Inverse of styleToken — `undefined` when the token clears the cell. */
export function parseStyleToken(value: string): CellStyle | undefined {
  const [fill = "", ink = ""] = value.split("|")
  if (!fill && !ink) return undefined
  return { ...(fill ? { fill } : {}), ...(ink ? { ink } : {}) }
}

/** The token a cell should hold after setting one facet, keeping the other. */
export function withFacet(s: CellStyle | undefined, facet: StyleFacet, token: string): string {
  const next: CellStyle = { ...(s ?? {}) }
  if (token) next[facet] = token
  else delete next[facet]
  return styleToken(next)
}

/** Class fragment (leading-spaced) rendering a cell's colors. Ink is retired
 *  from the UI — stored ink tokens round-trip in the wire format (so old data
 *  and undo stay intact) but no longer render. */
export function styleClass(s: CellStyle | undefined): string {
  if (!s?.fill) return ""
  return ` pj-fill-${s.fill}`
}

/** Human phrase for a `"fill|ink"` token, for history entries ("amber fill, red text"). */
export function describeStyleToken(value: unknown): string {
  if (!value || typeof value !== "string") return "no color"
  const [fill = "", ink = ""] = value.split("|")
  const parts: string[] = []
  if (fill) parts.push(`${fill} fill`)
  if (ink) parts.push(`${ink} text`)
  return parts.join(", ") || "no color"
}
