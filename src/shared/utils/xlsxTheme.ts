/**
 * One palette for every Excel export — the board's muted dress: warm
 * off-white bands and headers with dark text, gold used only as accent
 * TEXT (titles, labels, KPI values), never as a solid fill. Keep exports
 * calm; do not reintroduce saturated brand fills.
 */
export const XLSX_GOLD = "C27C3E" // accent text only
export const XLSX_INK = "2B2622" // primary text
export const XLSX_INK_SOFT = "6F665E" // header / secondary text
export const XLSX_MUTED = "8A8177" // subtitles
export const XLSX_RULE = "E4DED6" // hairline borders
export const XLSX_HEAD_FILL = "F4F0EA" // section bands, column headers, label cells
export const XLSX_STRIPE = "FAF8F5" // zebra + totals
export const XLSX_NEG = "B42318"
export const XLSX_POS = "3F7F5A"

export const xlsxThinBorder = { style: "thin" as const, color: { rgb: XLSX_RULE } }
export const xlsxCellBorder = { top: xlsxThinBorder, bottom: xlsxThinBorder, left: xlsxThinBorder, right: xlsxThinBorder }
/** Totals rows: a medium rule on top in soft ink (not black). */
export const xlsxTotalBorder = {
  top: { style: "medium" as const, color: { rgb: XLSX_INK_SOFT } },
  bottom: xlsxThinBorder,
  left: xlsxThinBorder,
  right: xlsxThinBorder,
}
