import XLSX from "xlsx-js-style"
import type { ChangeOrderLineItem } from "../../../shared/api/mutationApi"

interface ParsedChangeOrder {
  name: string
  total: number
  material: number
  labor: number
  subs: number
  wtpm: number
  lineItems: ChangeOrderLineItem[]
}

export async function parseChangeOrderExcel(file: File): Promise<ParsedChangeOrder> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: "array" })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]

  if (!sheet) throw new Error("No worksheet found in Excel file")

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })

  if (rows.length < 3) throw new Error("Excel file must have at least 3 rows")

  // Parse header — name is usually in cell A1 or B1
  const name = String(rows[0]?.[0] ?? rows[0]?.[1] ?? "Unnamed Change Order")

  // Find the category row (Material, Labor, Subs, WTPM)
  let material = 0, labor = 0, subs = 0, wtpm = 0, total = 0
  const lineItems: ChangeOrderLineItem[] = []

  // Look for a summary row with category totals
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i]
    if (!row) continue
    const firstCell = String(row[0] ?? "").toLowerCase()
    if (firstCell.includes("total") || firstCell.includes("amount")) {
      total = Number(row[1]) || 0
    }
    if (firstCell.includes("material")) material = Number(row[1]) || 0
    if (firstCell.includes("labor")) labor = Number(row[1]) || 0
    if (firstCell.includes("sub")) subs = Number(row[1]) || 0
    if (firstCell.includes("wtpm") || firstCell.includes("equipment")) wtpm = Number(row[1]) || 0
  }

  // Parse line items — look for rows with description and amounts
  // Typically starts after header rows
  let headerRow = -1
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue
    const cells = row.map(c => String(c ?? "").toLowerCase())
    if (cells.some(c => c.includes("description") || c.includes("desc"))) {
      headerRow = i
      break
    }
  }

  if (headerRow >= 0) {
    for (let i = headerRow + 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row || !row[0]) continue
      const desc = String(row[0] ?? "")
      if (!desc || desc.toLowerCase() === "total") continue

      const item: ChangeOrderLineItem = {
        desc,
        unit: String(row[1] ?? ""),
        material: Number(row[2]) || 0,
        labor: Number(row[3]) || 0,
        subs: Number(row[4]) || 0,
        wtpm: Number(row[5]) || 0,
        total: Number(row[6]) || 0,
      }
      lineItems.push(item)
    }
  }

  // If no total found, sum from line items
  if (total === 0 && lineItems.length > 0) {
    total = lineItems.reduce((sum, li) => sum + li.total, 0)
  }
  if (material === 0) material = lineItems.reduce((sum, li) => sum + li.material, 0)
  if (labor === 0) labor = lineItems.reduce((sum, li) => sum + li.labor, 0)
  if (subs === 0) subs = lineItems.reduce((sum, li) => sum + li.subs, 0)
  if (wtpm === 0) wtpm = lineItems.reduce((sum, li) => sum + li.wtpm, 0)

  return { name, total, material, labor, subs, wtpm, lineItems }
}
