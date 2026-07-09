import { formatMoney, formatMoneyFull } from "../../../shared/utils/format"
import type { RecentKind } from "../widgets/recent/recentTypes"
import type { MetricValue, ReportMetricKey, ReportSummary } from "./reportTypes"

// ─── Metric presentation ─────────────────────────────────────────────────────
// One definition per report metric: label, which feed kinds it drills into,
// and how its tile reads. Money metrics lead with the amount; New Projects
// leads with the count (a project's contract value is context, not headline).

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

// Daily figures fit full ($12,450); month-scale figures compact ($2.4M) so a
// busy window doesn't blow the tile out.
function tileMoney(amount: number): string {
  return Math.abs(amount) >= 1_000_000 ? formatMoney(amount) : formatMoneyFull(amount)
}

export interface MetricTileParts {
  /** Headline figure — the money for money metrics, the count for projects. */
  value: string
  /** Supporting line under the figure. Empty string renders no secondary line. */
  meta: string
  /** Count-aware label override for the tile (projects only). */
  label?: string
}

/** The two logs the recap separates: job/site activity and money movement. */
export type MetricSection = "operations" | "financials"

export const SECTIONS: Array<{ key: MetricSection; title: string }> = [
  { key: "operations", title: "Job Activity" },
  { key: "financials", title: "Billing & Cash" },
]

export interface MetricDef {
  key: ReportMetricKey
  label: string
  /** Which log the tile belongs to — drives the sectioned layout. */
  section: MetricSection
  /** Feed kinds behind the tile — the drill-down list filter. */
  kinds: RecentKind[]
  /** Category badge text (matches the feed's .rcnt-pill vocabulary). */
  pill: string
  /** Drives the pill's color via `.rcnt-pill--${pillKind}`. Committed spans
   *  POs and subs, so it borrows the purchaseOrder (commitment blue) tint. */
  pillKind: RecentKind
  parts(summary: ReportSummary): MetricTileParts
}

// Order is the tile order. Row two leads with cash in (Checks Received), then
// what was billed out, then what we owe vendors.
export const METRIC_DEFS: MetricDef[] = [
  {
    key: "projects",
    label: "Projects Created",
    section: "operations",
    kinds: ["project"],
    pill: "New",
    pillKind: "project",
    // Just the count and a count-aware label — no contract-value secondary.
    parts: ({ projects }) => ({
      value: String(projects.count),
      label: plural(projects.count, "Project Created", "Projects Created"),
      meta: "",
    }),
  },
  {
    key: "committed",
    label: "Costs Committed",
    section: "operations",
    kinds: ["purchaseOrder", "subcontract"],
    pill: "PO · Sub",
    pillKind: "purchaseOrder",
    // POs often carry no dollar amount, so the count is the headline and the
    // dollar figure is a secondary detail — shown only when one was entered.
    parts: ({ committed }) => {
      const total = committed.pos.count + committed.subs.count
      const bits: string[] = []
      if (committed.pos.count) bits.push(`${committed.pos.count} ${plural(committed.pos.count, "PO", "POs")}`)
      if (committed.subs.count) bits.push(`${committed.subs.count} ${plural(committed.subs.count, "sub", "subs")}`)
      if (committed.amount) bits.push(tileMoney(committed.amount))
      return {
        value: String(total),
        meta: bits.length ? bits.join(" · ") : "no new commitments",
      }
    },
  },
  {
    key: "costs",
    label: "Costs Posted",
    section: "operations",
    kinds: ["cost"],
    pill: "Cost",
    pillKind: "cost",
    parts: ({ costs }) => ({
      value: tileMoney(costs.amount),
      meta: `${costs.count} ${plural(costs.count, "posting", "postings")}`,
    }),
  },
  {
    key: "arReceived",
    label: "Checks Received",
    section: "financials",
    kinds: ["payment"],
    pill: "Payment",
    pillKind: "payment",
    parts: ({ arReceived }) => ({
      value: tileMoney(arReceived?.amount ?? 0),
      meta: `${arReceived?.count ?? 0} ${plural(arReceived?.count ?? 0, "payment", "payments")}`,
    }),
  },
  {
    key: "arInvoices",
    label: "AR Billed",
    section: "financials",
    kinds: ["arInvoice"],
    pill: "AR",
    pillKind: "arInvoice",
    parts: ({ arInvoices }) => ({
      value: tileMoney(arInvoices?.amount ?? 0),
      meta: `${arInvoices?.count ?? 0} ${plural(arInvoices?.count ?? 0, "invoice sent", "invoices sent")}`,
    }),
  },
  {
    key: "apBills",
    label: "AP Received",
    section: "financials",
    kinds: ["apInvoice"],
    pill: "AP",
    pillKind: "apInvoice",
    parts: ({ apBills }) => ({
      value: tileMoney(apBills.amount),
      meta: `${apBills.count} ${plural(apBills.count, "bill received", "bills received")}`,
    }),
  },
]

// ─── PM-only split of "Costs Committed" ──────────────────────────────────────
// Admins keep the single combined tile (their grid is already six tiles). PMs,
// who live in commitments, get it broken in two: Orders Placed (POs) and
// Subcontracts. Both read the same summary.committed.pos/subs the combined tile
// already carries — no payload change — and both keep the parent's amber pill
// (purchaseOrder/subcontract share `.rcnt-pill--*`), so the split reads as two
// halves of one orange category rather than two unrelated metrics.
//
// Each leads with the COUNT (matching the combined tile: a PO/sub often carries
// no dollar yet), with the committed dollars as the secondary line. Meta is
// always one line so the tile height never reflows (— when a count exists but no
// amount was entered; ZERO_SUMMARY's zero count shows the "no new …" copy).
const ORDERS_DEF: MetricDef = {
  key: "orders",
  label: "Orders Placed",
  section: "operations",
  kinds: ["purchaseOrder"],
  pill: "PO",
  pillKind: "purchaseOrder",
  parts: ({ committed }) => {
    const { count, amount } = committed.pos
    return {
      value: String(count),
      label: plural(count, "Order Placed", "Orders Placed"),
      // Nothing entered → no meta line at all (no "none" filler).
      meta: count === 0 ? "" : amount ? tileMoney(amount) : "—",
    }
  },
}

const SUBCONTRACTS_DEF: MetricDef = {
  key: "subcontracts",
  label: "Subcontracts Entered",
  section: "operations",
  kinds: ["subcontract"],
  pill: "Sub",
  pillKind: "subcontract",
  parts: ({ committed }) => {
    const { count, amount } = committed.subs
    return {
      value: String(count),
      label: plural(count, "Subcontract Entered", "Subcontracts Entered"),
      // Nothing entered → no meta line at all (no "none" filler).
      meta: count === 0 ? "" : amount ? tileMoney(amount) : "—",
    }
  },
}

// PM-only relabel of the projects tile: to a PM those rows read as work handed
// to them, not company records they created, so the tile says "Projects
// Assigned". Same key/data as the admin "Projects Created" def — only the copy
// differs — and it's swapped in solely for PM-scoped grids (see metricsFor).
const PROJECTS_ASSIGNED_DEF: MetricDef = {
  ...METRIC_DEFS[0],
  label: "Projects Assigned",
  parts: (summary) => ({
    ...METRIC_DEFS[0].parts(summary),
    label: plural(summary.projects.count, "Project Assigned", "Projects Assigned"),
  }),
}

/** Every def that can be resolved by key — the admin canon plus the PM-only
 *  split tiles, which never appear in METRIC_DEFS but must resolve for the
 *  drill-down modal (metricDef) and filter chips. */
const ALL_DEFS: MetricDef[] = [...METRIC_DEFS, ORDERS_DEF, SUBCONTRACTS_DEF]

/** The ordered tile list for a report, PM-scoped or not. Admins get the full
 *  six (combined commitments). PMs get the Job Activity section only, with
 *  "Costs Committed" swapped for the Orders Placed + Subcontracts pair — a
 *  single row of four. Drives both the live grid and the loading skeleton so
 *  they match exactly. */
export function metricsFor(pmScoped: boolean): MetricDef[] {
  if (!pmScoped) return METRIC_DEFS
  const ops = METRIC_DEFS.filter((m) => m.section === "operations")
  return ops.flatMap((m) => {
    if (m.key === "committed") return [ORDERS_DEF, SUBCONTRACTS_DEF]
    if (m.key === "projects") return [PROJECTS_ASSIGNED_DEF]
    return [m]
  })
}

/** The metrics present in a payload: all six on admin reports; PM-scoped reports
 *  (no arInvoices/arReceived) see only Job Activity, with commitments split. */
export function visibleMetrics(summary: ReportSummary): MetricDef[] {
  const hasBilling = summary.arInvoices !== undefined || summary.arReceived !== undefined
  return metricsFor(!hasBilling)
}

export function metricDef(key: ReportMetricKey): MetricDef {
  return ALL_DEFS.find((m) => m.key === key)!
}

// An all-zero summary the tiles render from BEFORE a payload lands. It drives the
// real tile markup (via each metric's own `parts`), so every tile is laid out at
// its exact final height — same line count, same meta presence (committed still
// reads "no new commitments", projects still has no meta line) as any real
// summary. Only the text changes once data arrives; the layout never moves.
const ZERO_MV: MetricValue = { count: 0, amount: 0 }
export const ZERO_SUMMARY: ReportSummary = {
  projects: ZERO_MV,
  committed: { count: 0, amount: 0, pos: ZERO_MV, subs: ZERO_MV },
  costs: ZERO_MV,
  apBills: ZERO_MV,
  arInvoices: ZERO_MV,
  arReceived: ZERO_MV,
}
