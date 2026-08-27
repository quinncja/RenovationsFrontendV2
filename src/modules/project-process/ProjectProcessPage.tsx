import Page from "../../shared/components/Page"
import { useProcessCanvas, roundedPath as rounded } from "../../shared/components/ProcessCanvas/ProcessCanvas"

/* ------------------------------------------------------------------
   Project Process: a Figma-style canvas (pan + zoom) holding the two
   process diagrams laid out to match the source PDFs. Coordinates are
   in PDF pixel units; the canvas scales them.
   ------------------------------------------------------------------ */

type Owner = "aaron" | "morgan" | "rich" | "yhana" | "gzim" | "pm" | "stage" | "during" | "post"

const COLORS: Record<Owner, string> = {
  aaron: "#22a447",
  morgan: "#48ac6e",
  rich: "#2f63c8",
  yhana: "#2b8dd6",
  gzim: "#d1332f",
  pm: "#d1332f",
  stage: "#d9a679",
  during: "#e8862a",
  post: "#d9a679",
}
const NAMES: Partial<Record<Owner, string>> = { aaron: "Aaron", morgan: "Morgan", rich: "Rich", yhana: "Yhana", gzim: "Gzim", pm: "PM" }

/* ---------------- Data ownership ---------------- */

interface OwnCard {
  owner: Owner
  x: number
  groups: { title: string; clusters: string[][] }[]
}
const OWN_Y = 44
const OWN_W = 110
const OWN_GAP = 22
const OWNERSHIP: OwnCard[] = [
  { owner: "aaron", x: 33 + 0 * (OWN_W + OWN_GAP), groups: [
    { title: "Project Information", clusters: [["Start Date", "Est. Completion Date", "Contract", "Budget"], ["Address", "Client", "PM"], ["Unit Count", "Completion Date"]] },
    { title: "Project Costs & Billing", clusters: [["Project Invoicing"]] },
  ] },
  { owner: "morgan", x: 33 + 1 * (OWN_W + OWN_GAP), groups: [
    { title: "Project Information", clusters: [] },
    { title: "Project Costs & Billing", clusters: [["Subcontract Entry", "Subcontract Invoicing"]] },
  ] },
  { owner: "rich", x: 33 + 2 * (OWN_W + OWN_GAP), groups: [
    { title: "Project Information", clusters: [["Project Name", "Project Number"], ["Parent Project", "isOneOff"]] },
    { title: "Project Costs & Billing", clusters: [["Purchase Order Entry"]] },
  ] },
  { owner: "yhana", x: 33 + 3 * (OWN_W + OWN_GAP), groups: [
    { title: "Project Information", clusters: [] },
    { title: "Project Costs & Billing", clusters: [["Purchase Order Invoicing", "Receipt Entry"]] },
  ] },
  { owner: "gzim", x: 33 + 4 * (OWN_W + OWN_GAP), groups: [
    { title: "Project Information", clusters: [["Change Orders", "(Via Dashboard upload)"]] },
    { title: "Project Costs & Billing", clusters: [] },
  ] },
]

/* ---------------- Lifecycle ---------------- */

const LC_Y = 275 // lifecycle title top; Aaron card (tallest) ends at 225, so 50 of air between sections

interface Node {
  id: string
  owner: Owner
  /** Header text. For step nodes this is the owner name; stages get a phase label. */
  head?: string
  /** Second owner rendered as a split header ("Gzim or Aaron"). */
  alt?: Owner
  x: number
  y: number
  w: number
  h: number
  lines: string[]
}

const NW = 80
const NH = 62
const SW = 100
const SH = 46

const LC_SHIFT = 33 - 183 // Phase 1 stage flush with the section titles

const NODES: Node[] = [
  // Pre-construction phase 1
  { id: "s1", owner: "stage", head: "Pre-Construction (Phase 1)", x: 183, y: 28, w: SW, h: 80, lines: ["Client Approves Project", "↓ B.D ↓", "Units On Schedule"] },
  { id: "gzim1", owner: "gzim", x: 133, y: 158, w: NW, h: NH, lines: ["Updates PM Board & Sub Board"] },
  { id: "rich1", owner: "rich", x: 253, y: 158, w: NW, h: 76, lines: ["Creates Project in Sage (Name, Number, Parent Project, isOneOff, one off name)"] },
  { id: "pmIntro", owner: "pm", x: 40, y: 248, w: NW, h: NH, lines: ["Client Introduction (If necessary)"] },
  { id: "pmScope", owner: "pm", x: 133, y: 248, w: NW, h: NH, lines: ["Completes scope sheet & schedule, uploads to Monday.com"] },
  { id: "aaronDoc", owner: "aaron", x: 133, y: 332, w: NW, h: NH, lines: ["Sends client Docusign scope sheet / matrix"] },
  { id: "aaronSage", owner: "aaron", x: 253, y: 332, w: NW, h: 76, lines: ["Updates project in Sage (Contract, Budget, Client, PM, Address, Unit Count, Timeline)"] },
  // Phase 2
  { id: "s2", owner: "stage", head: "Pre-Construction (Phase 2)", x: 450, y: 28, w: SW, h: SH, lines: ["Client Approves Scope sheet / Matrix"] },
  { id: "pmWO", owner: "pm", x: 400, y: 108, w: NW, h: NH, lines: ["Creates Work Orders, uploads to Monday.com"] },
  { id: "pmMat", owner: "pm", x: 522, y: 108, w: NW, h: NH, lines: ["Completes Material Order Sheet, uploads to Monday.com"] },
  { id: "aaronSub", owner: "aaron", x: 400, y: 195, w: NW, h: NH, lines: ["Sends subcontractors work order Docusign"] },
  { id: "richPO", owner: "rich", x: 522, y: 195, w: NW, h: NH, lines: ["Enters Purchase Orders"] },
  { id: "morganSub", owner: "morgan", x: 400, y: 282, w: NW, h: NH, lines: ["Enters subcontracts into Sage"] },
  // Weekly
  { id: "s3", owner: "during", head: "During Construction", x: 718, y: 28, w: SW, h: SH, lines: ["On a weekly basis"] },
  { id: "morganCsv", owner: "morgan", x: 665, y: 108, w: NW, h: NH, lines: ["Downloads Capital One spending .csv"] },
  { id: "richInv", owner: "rich", x: 790, y: 108, w: NW, h: NH, lines: ["Receives PO invoicing from vendors"] },
  { id: "yhanaR", owner: "yhana", x: 665, y: 195, w: NW, h: NH, lines: ["Enters receipt spending"] },
  { id: "yhanaPO", owner: "yhana", x: 790, y: 195, w: NW, h: NH, lines: ["Enters PO spending & creates PO packet ready for invoicing"] },
  // Change orders / unit changes (conditional)
  { id: "sCO", owner: "during", head: "During Construction", x: 925, y: 28, w: SW, h: SH, lines: ["Change Orders"] },
  { id: "pmCO", owner: "pm", x: 935, y: 99, w: NW, h: NH, lines: ["Completes Change Order form & uploads to Monday.com"] },
  { id: "confirm", owner: "gzim", alt: "aaron", x: 935, y: 186, w: NW, h: NH, lines: ["Confirm Change Order math"] },
  { id: "upload", owner: "gzim", alt: "aaron", x: 935, y: 273, w: NW, h: NH, lines: ["Upload Change Order to Dashboard"] },
  { id: "aaronCO", owner: "aaron", x: 1030, y: 273, w: NW, h: NH, lines: ["Sends Change Order Docusign to Client"] },
  { id: "sUnit", owner: "during", head: "During Construction", x: 1105, y: 28, w: SW, h: SH, lines: ["Unit Changes"] },
  { id: "pmNot", owner: "pm", x: 1115, y: 99, w: NW, h: 44, lines: ["Notifies Aaron"] },
  { id: "aaronUnit", owner: "aaron", x: 1115, y: 168, w: NW, h: NH, lines: ["Updates Project Contract Amount & Unit Amount in Sage"] },
  // Post construction
  { id: "sPost1", owner: "post", head: "Post Construction", x: 1305, y: 28, w: SW, h: SH, lines: ["After Subcontract work is complete"] },
  { id: "pmSubInv", owner: "pm", x: 1315, y: 108, w: NW, h: NH, lines: ["Uploads subcontract invoice to Monday.com & marks ready to invoice"] },
  { id: "morganInv", owner: "morgan", x: 1315, y: 195, w: NW, h: NH, lines: ["Begins Subcontractor invoicing"] },
  { id: "sPost2", owner: "post", head: "Post Construction", x: 1420, y: 28, w: SW, h: SH, lines: ["After Punchwalk"] },
  { id: "pmReady", owner: "pm", x: 1430, y: 108, w: NW, h: NH, lines: ["Marks project as Ready to invoice on Monday.com"] },
  { id: "aaronDone", owner: "aaron", x: 1430, y: 195, w: NW, h: NH, lines: ["Enters completion date in Sage, and begins project invoicing"] },
]

const CONDITIONAL = { x: 897 + LC_SHIFT, y: 12, w: 340, h: 352 }

type Edge = [string, string, "v" | "h"]
const EDGES: Edge[] = [
  ["s1", "gzim1", "v"], ["s1", "rich1", "v"],
  ["gzim1", "pmIntro", "v"], ["gzim1", "pmScope", "v"],
  ["pmScope", "aaronDoc", "v"], ["aaronDoc", "aaronSage", "h"], ["rich1", "aaronSage", "v"],
  ["s1", "s2", "h"],
  ["s2", "pmWO", "v"], ["s2", "pmMat", "v"], ["pmWO", "aaronSub", "v"], ["aaronSub", "morganSub", "v"], ["pmMat", "richPO", "v"],
  ["s2", "s3", "h"],
  ["s3", "morganCsv", "v"], ["s3", "richInv", "v"], ["morganCsv", "yhanaR", "v"], ["richInv", "yhanaPO", "v"],
  ["sCO", "pmCO", "v"], ["pmCO", "confirm", "v"], ["confirm", "upload", "v"], ["confirm", "aaronCO", "v"],
  ["sUnit", "pmNot", "v"], ["pmNot", "aaronUnit", "v"],
  ["sPost1", "pmSubInv", "v"], ["pmSubInv", "morganInv", "v"],
  ["sPost2", "pmReady", "v"], ["pmReady", "aaronDone", "v"],
]

for (const n of NODES) n.x += LC_SHIFT

const byId = Object.fromEntries(NODES.map(n => [n.id, n]))

/** Breathing room between a connector's ends and the nodes it joins. */
const GAP = 3

function edgePath([a, b, dir]: Edge): string {
  const A = byId[a], B = byId[b]
  if (dir === "h") {
    // leave A's right edge at B's centre line so the run is perfectly horizontal
    const y = B.y + B.h / 2
    return B.x >= A.x + A.w
      ? rounded([[A.x + A.w + GAP, y], [B.x - GAP, y]])
      : rounded([[A.x - GAP, y], [B.x + B.w + GAP, y]])
  }
  const x1 = A.x + A.w / 2, y1 = A.y + A.h + GAP
  const x2 = B.x + B.w / 2, y2 = B.y - GAP
  if (Math.abs(x1 - x2) < 1) return rounded([[x1, y1], [x2, y2]])
  const my = (y1 + y2) / 2
  return rounded([[x1, y1], [x1, my], [x2, my], [x2, y2]])
}

/** Weekly loop arcs: one above the stage, one below its steps, both circling clockwise. */
function loopArcs(): [string, string] {
  const S = byId.s3, cx = S.x + S.w / 2
  const bottom = byId.yhanaPO.y + byId.yhanaPO.h
  // Each arc ends in a short straight stub so the arrowhead sits on a straight run.
  const yT = S.y - 6, yB = bottom + 8
  return [
    `M ${cx - 26} ${yT} A 26 14 0 0 1 ${cx + 26} ${yT - 4} L ${cx + 26} ${yT + 4}`,
    `M ${cx + 26} ${yB} A 26 14 0 0 1 ${cx - 26} ${yB + 4} L ${cx - 26} ${yB - 4}`,
  ]
}

/* ---------------- Canvas ---------------- */

const WORLD_W = 1560
const LC_BODY = 0 // nodes start at y=28 inside the body, so the title (13 tall) gets the same 15 gap as ownership
/** Tight content bounds used by fit(): leftmost/rightmost node and the bottom-most node. */
const WORLD_X0 = Math.min(0, ...NODES.map(n => n.x)) - 12
const CONTENT_X1 = Math.max(...NODES.map(n => n.x + n.w), CONDITIONAL.x + CONDITIONAL.w) + 12
const CONTENT_Y1 = LC_Y + LC_BODY + Math.max(...NODES.map(n => n.y + n.h), CONDITIONAL.y + CONDITIONAL.h) + 12
const WORLD_H = LC_Y + LC_BODY + 400
export default function ProjectProcessPage() {
  const { controls, canvas } = useProcessCanvas({
    worldW: WORLD_W,
    worldH: WORLD_H,
    bounds: { x0: WORLD_X0, y0: 0, x1: CONTENT_X1, y1: CONTENT_Y1 },
  })

  return (
    <Page
      title="Project Process"
      subtitle="Data ownership and the RD project lifecycle. Scroll to pan, pinch or ⌘+scroll to zoom, drag to move."
      actions={controls}
    >
      {canvas(
        <>
          {/* ---- Data ownership ---- */}
          <h2 className="pp-title" style={{ left: 33, top: 16 }}>Project Data Ownership</h2>
          {OWNERSHIP.map(c => (
            <div key={c.owner} className="pp-own" style={{ left: c.x, top: OWN_Y, width: OWN_W }}>
              <div className="pp-node-head" style={{ background: COLORS[c.owner] }}>{NAMES[c.owner]}</div>
              {c.groups.map((g, gi) => (
                <div key={g.title} className={`pp-own-group${gi > 0 ? " pp-own-group--rule" : ""}`}>
                  <span className="pp-own-group-title" style={{ color: COLORS[c.owner] }}>{g.title}</span>
                  {g.clusters.map((cl, i) => (
                    <div key={i} className="pp-own-cluster">
                      {cl.map(f => <span key={f}>{f}</span>)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}

          {/* ---- Lifecycle ---- */}
          <div className="pp-lc" style={{ top: LC_Y }}>
            <h2 className="pp-title" style={{ left: 33, top: 0 }}>RD Project Lifecycle</h2>
            <div className="pp-lc-body" style={{ top: LC_BODY }}>
            <div className="pp-conditional" style={{ left: CONDITIONAL.x, top: CONDITIONAL.y, width: CONDITIONAL.w, height: CONDITIONAL.h }}>
              <span>If Applicable</span>
            </div>
            <svg className="pp-edges" width={WORLD_W} height={WORLD_H - LC_Y - LC_BODY}>
              <defs>
                <marker id="pp-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto">
                  <path className="pp-arrowhead" d="M 0 0.5 L 7.5 4 L 0 7.5 z" />
                </marker>
              </defs>
              {EDGES.map(e => <path key={e[0] + e[1]} d={edgePath(e)} markerEnd="url(#pp-arrow)" />)}
              {/* weekly loop back into "During Construction" */}
              {loopArcs().map(d => <path key={d} d={d} markerEnd="url(#pp-arrow)" />)}
              {/* handoff from the weekly loop into the "If Applicable" region */}
              <path d={rounded([[byId.s3.x + byId.s3.w + GAP, byId.s3.y + byId.s3.h / 2], [CONDITIONAL.x - GAP, byId.s3.y + byId.s3.h / 2]])} markerEnd="url(#pp-arrow)" />
              {/* handoff into post construction */}
              <path d={rounded([[CONDITIONAL.x + CONDITIONAL.w + GAP, byId.sPost1.y + byId.sPost1.h / 2], [byId.sPost1.x - GAP, byId.sPost1.y + byId.sPost1.h / 2]])} markerEnd="url(#pp-arrow)" />
            </svg>
            {NODES.map(n => {
              const isStage = n.owner === "stage" || n.owner === "during" || n.owner === "post"
              return (
                <div key={n.id} className={`pp-node${isStage ? " pp-node--stage" : ""}`} style={{ left: n.x, top: n.y, width: n.w, height: n.h }}>
                  {n.alt ? (
                    <div className="pp-node-head" style={{ background: `linear-gradient(90deg, ${COLORS[n.owner]} 0 42%, ${COLORS[n.alt]} 58% 100%)` }}>
                      {NAMES[n.owner]}<span className="pp-node-or">or</span>{NAMES[n.alt]}
                    </div>
                  ) : (
                    <div className="pp-node-head" style={{ background: COLORS[n.owner] }}>{n.head ?? NAMES[n.owner]}</div>
                  )}
                  <div className="pp-node-body">
                    {n.lines.map((l, i) => <span key={i} className={l.includes("B.D") ? "pp-node-bd" : undefined}>{l}</span>)}
                  </div>
                </div>
              )
            })}
            </div>
          </div>
        </>
      )}
    </Page>
  )
}
