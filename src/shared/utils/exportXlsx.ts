import XLSX from "xlsx-js-style"

export type CellValue = string | number | null
export interface StyledCell {
  v: CellValue
  s?: XLSX.CellStyle
  t?: string
}

export type SheetRow = (CellValue | StyledCell)[]

export interface XlsxOptions {
  autoFilterRow?: number
  autoFilterCols?: number
}

function isStyledCell(cell: CellValue | StyledCell): cell is StyledCell {
  return cell !== null && typeof cell === "object" && "v" in cell
}

function cellDisplayWidth(cell: CellValue | StyledCell): number {
  let raw: CellValue
  let fmt: string | undefined
  if (isStyledCell(cell)) {
    raw = cell.v
    fmt = cell.s?.numFmt as string | undefined
  } else {
    raw = cell
  }
  if (raw === null || raw === undefined || raw === "") return 0
  if (typeof raw === "number") {
    // Estimate formatted width from numFmt
    if (fmt?.includes("%")) return (raw * 100).toFixed(1).length + 1 // e.g. "25.6%"
    if (fmt?.includes("#") || fmt?.includes("0")) return raw.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).length
    return String(raw).length
  }
  return String(raw).length
}

function calcColWidths(rows: SheetRow[]): number[] {
  const widths: number[] = []
  for (const row of rows) {
    for (let c = 0; c < row.length; c++) {
      const w = cellDisplayWidth(row[c])
      if (w > (widths[c] ?? 0)) widths[c] = w
    }
  }
  // Add padding (2 chars) and enforce a minimum of 8
  return widths.map((w) => Math.max(w + 3, 8))
}

export function downloadXlsx(rows: SheetRow[], filename: string, sheetName = "Report", options?: Partial<XlsxOptions>): void {
  const ws: XLSX.WorkSheet = {}
  let maxCol = 0

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    if (row.length > maxCol) maxCol = row.length

    for (let c = 0; c < row.length; c++) {
      const cell = row[c]
      const ref = XLSX.utils.encode_cell({ r, c })

      if (cell === null || cell === undefined) {
        ws[ref] = { v: "", t: "s" }
        continue
      }

      if (isStyledCell(cell)) {
        ws[ref] = {
          v: cell.v ?? "",
          t: cell.t ?? (typeof cell.v === "number" ? "n" : "s"),
          s: cell.s,
        }
      } else if (typeof cell === "number") {
        ws[ref] = { v: cell, t: "n" }
      } else {
        ws[ref] = { v: cell, t: "s" }
      }
    }
  }

  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: maxCol - 1 } })

  // Auto-filter on a specific header row (e.g. transaction detail headers)
  if (options?.autoFilterRow !== undefined) {
    const cols = options.autoFilterCols ?? maxCol
    ws["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: options.autoFilterRow, c: 0 },
        e: { r: rows.length - 1, c: cols - 1 },
      }),
    }
  }

  // Auto-fit column widths from content
  ws["!cols"] = calcColWidths(rows).map((w) => ({ wch: w }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))

  XLSX.writeFile(wb, filename)
}
