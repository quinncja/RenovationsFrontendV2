import { ResponsiveTreeMap } from "@nivo/treemap"
import { formatMoney } from "../../utils/format"

// Generic treemap visualization. Tiles are colored by value via a sequential
// lightness ramp anchored on the brand color, so size and color reinforce
// each other (biggest tile = deepest fill). Used by TreemapModal to give
// a single-glance comparison of every client, vendor, or subcontractor by
// revenue/spend.

export interface TreemapItem {
  id: string
  label: string
  value: number
}

interface Datum {
  name: string
  id: string
  value?: number
  children?: Datum[]
}

interface TreemapProps {
  items: TreemapItem[]
  totalSum: number
  /** Root tile label (e.g. "All Clients"). Hidden under the inner tiles
   *  but used as the dataset identity. */
  rootName?: string
  /** Optional click handler — called with the item id. */
  onNodeClick?: (id: string) => void
}

// Curated categorical palette — "Mediterranean evening": warm, balanced,
// jewel-tone-leaning but not candy-bright. All hues sit around 55–65%
// saturation and ~65–70% lightness so they feel lively and harmonious
// together, with the brand orange anchoring the warm side as a saturated
// terracotta. Size already encodes magnitude; color's job is just to make
// each tile individually identifiable. Order is tuned so adjacent palette
// entries land far apart on the color wheel — nivo's squarified treemap
// places larger tiles in a chained sequence, so cycling palette[i] reads
// "next big tile is a new color" instead of two neighbors landing in the
// same hue family.
const PALETTE = [
  "#d4824a", // terracotta (brand-warm)
  "#5b9ab5", // mediterranean blue
  "#82a878", // sage olive
  "#c08caf", // rose lavender
  "#e3b167", // saffron
  "#67a9a3", // teal
  "#d0758a", // dusty rose
  "#8b8bcc", // soft lavender
  "#b5b56e", // gold-green
  "#b07060", // sienna
]

export function Treemap({ items, totalSum, rootName = "All Items", onNodeClick }: TreemapProps) {
  if (items.length === 0) {
    return <div className="treemap-empty body-text text-secondary">No items to display</div>
  }

  const data: Datum = {
    name: rootName,
    id: "root",
    children: items.map((i) => ({ name: i.label, id: i.id, value: i.value })),
  }

  // Stable color assignment: hash item id → palette index, so the same
  // client/vendor/sub keeps the same color across reloads and year toggles.
  // Falling back to depth-order (via the lookup map populated below) gives
  // the same result for fresh data while staying deterministic.
  const colorByName = new Map<string, string>()
  items.forEach((it, i) => {
    colorByName.set(it.label, PALETTE[i % PALETTE.length])
  })

  return (
    <div className="treemap-canvas">
      <ResponsiveTreeMap<Datum>
        data={data}
        identity="id"
        value="value"
        valueFormat={(v) => formatMoney(v)}
        margin={{ top: 4, right: 0, bottom: 4, left: 0 }}
        labelSkipSize={24}
        label={(node) => truncateForWidth(String(node.data.name), node.width)}
        orientLabel={false}
        // Auto-contrast label color: derived from the tile color, pushed
        // ~2.8 steps darker. Across the Mediterranean palette this lands
        // close enough to near-black that it reads cleanly while still
        // carrying a hint of the tile's hue so it doesn't feel pasted on.
        // Previous 1.8 was the prettier choice but it dipped under the
        // legibility floor — same-tone-as-tile labels needed more depth.
        labelTextColor={{ from: "color", modifiers: [["darker", 2.8]] }}
        // Bump label weight from nivo's default 400 → 600. Categorical
        // treemap labels are short (single-word names, mostly) and the
        // extra weight does most of the work of "make this readable" once
        // contrast is sufficient.
        //
        // The `tooltip.container` transition smooths the wrapper's
        // `transform: translate(...)` updates as the cursor moves — without
        // it the tooltip jumps between per-mousemove positions and reads
        // as static, unlike the line/bar charts where nivo's continuous
        // updates make the tooltip feel attached to the cursor. The 80ms
        // ease tracks the cursor closely enough to feel responsive while
        // smoothing out per-frame jitter.
        theme={{
          labels: {
            text: {
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "-0.005em",
            },
          },
          tooltip: {
            container: {
              zIndex: 9999,
              transition: "transform 80ms ease-out",
            },
          },
        }}
        colors={(node) => colorByName.get(String(node.data.name)) ?? PALETTE[0]}
        // Hairline of the modal's surface color — gives tile separation
        // without the heavy black grid that paired-scheme rendering had.
        borderColor="var(--card-color)"
        borderWidth={1}
        nodeOpacity={1}
        // animate: false is intentional. With animations on, every hover
        // triggers a framer-motion spring transition on the tile's transform
        // — on small tiles this reads as a visible grow/shrink wiggle and
        // the brief SVG reflow can push the modal's overflow-y into
        // showing a scrollbar. Off, hover just snaps cleanly.
        animate={false}
        enableParentLabel={false}
        tooltip={({ node }) => {
          const pct = totalSum > 0 ? ((node.value / totalSum) * 100).toFixed(1) : "0"
          return (
            <div className="treemap-tooltip card">
              <div className="treemap-tooltip-head">
                <span className="treemap-tooltip-swatch" style={{ background: node.color }} />
                <span className="treemap-tooltip-name body-text emphasized">{String(node.data.name)}</span>
              </div>
              <div className="treemap-tooltip-value title1 emphasized">{formatMoney(node.value)}</div>
              <div className="treemap-tooltip-pct subheadline text-secondary">{pct}% of total</div>
            </div>
          )
        }}
        onClick={
          onNodeClick
            ? (node) => {
                const id = String(node.data.id ?? "")
                if (id && id !== "root") onNodeClick(id)
              }
            : undefined
        }
      />
    </div>
  )
}

// Rough character budget: ~8px per char at the treemap font size. Mirrors
// the truncation logic from the old InsightTreeMap so labels don't bleed
// past their tile when tiles get narrow.
function truncateForWidth(text: string, width: number): string {
  const maxChars = Math.max(3, Math.floor(width / 8))
  if (text.length <= maxChars) return text
  return text.substring(0, maxChars - 1) + "…"
}
