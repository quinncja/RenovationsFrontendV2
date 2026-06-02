import XLSX from "xlsx-js-style"
import type {
  ChangeOrderLineItem,
  ChangeOrderRowObject,
  ChangeOrderCostType,
} from "../../../shared/api/mutationApi"

interface ParsedChangeOrder {
  name: string
  total: number
  material: number
  labor: number
  subs: number
  wtpm: number
  lineItems: ChangeOrderLineItem[]
  rowObjects: ChangeOrderRowObject[]
}

// The change-order template stamps this UUID into cell QS5 so we can reject
// files that aren't actually exported from it.
const EXCEL_UUID = "d25beb3e-821d-4b92-8c1f-3ba23a00cd73"

// Fixed column layout of the change-order template (zero-based).
const COL = { desc: 0, unit: 9, labor: 13, material: 14, subs: 15, wtpm: 16 }
// Summary rows (zero-based): category totals on row 7, grand total on row 8.
const SUMMARY_ROW = 6
const TOTAL_ROW = 7
const TOTAL_COL = 20
// Line items begin on row 14 (zero-based 13).
const LINE_ITEMS_START = 13

const num = (v: unknown): number => Number(v) || 0
const isBlankRow = (row: unknown[]): boolean =>
  !row || row.every((c) => c === undefined || c === null || c === "")

export async function parseChangeOrderExcel(file: File): Promise<ParsedChangeOrder> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: "array" })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]

  if (!sheet) throw new Error("No worksheet found in Excel file")

  // Validate this is a real change-order template.
  const uuid = (sheet["QS5"] as { v?: unknown } | undefined)?.v
  if (uuid !== EXCEL_UUID) {
    throw new Error("This file isn't a recognized change order template.")
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })

  // Category totals from the summary rows.
  const summary = (rows[SUMMARY_ROW] ?? []) as unknown[]
  const totalRow = (rows[TOTAL_ROW] ?? []) as unknown[]
  const labor = num(summary[COL.labor])
  const material = num(summary[COL.material])
  const subs = num(summary[COL.subs])
  const wtpm = num(summary[COL.wtpm])
  let total = num(totalRow[TOTAL_COL])

  // Line items — stop at the first fully-blank row. rowObjects flatten each
  // line item into one row per non-zero cost type (what the backend inserts).
  const lineItems: ChangeOrderLineItem[] = []
  const rowObjects: ChangeOrderRowObject[] = []
  for (let i = LINE_ITEMS_START; i < rows.length; i++) {
    const row = rows[i]
    if (isBlankRow(row)) break

    const desc = String(row[COL.desc] ?? "")
    const unit = String(row[COL.unit] ?? "")
    if (!desc || !unit) continue

    const liLabor = num(row[COL.labor])
    const liMaterial = num(row[COL.material])
    const liSubs = num(row[COL.subs])
    const liWtpm = num(row[COL.wtpm])

    lineItems.push({
      desc,
      unit,
      labor: liLabor,
      material: liMaterial,
      subs: liSubs,
      wtpm: liWtpm,
      total: liLabor + liMaterial + liSubs + liWtpm,
    })

    const byType: [ChangeOrderCostType, number][] = [
      ["labor", liLabor],
      ["material", liMaterial],
      ["subs", liSubs],
      ["wtpm", liWtpm],
    ]
    for (const [type, price] of byType) {
      if (price !== 0) rowObjects.push({ desc, unit, type, price })
    }
  }

  // Fall back to summing line items if the template totals are missing.
  if (total === 0 && lineItems.length > 0) {
    total = lineItems.reduce((sum, li) => sum + li.total, 0)
  }

  // The change-order name is the file name without its extension.
  const name = file.name.replace(/\.(xlsx|xls)$/i, "")

  return { name, total, material, labor, subs, wtpm, lineItems, rowObjects }
}
