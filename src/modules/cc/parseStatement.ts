// Reads the bank's transaction download (Capital One .csv, or the weekly .xlsx
// built from it) into plain rows for /cc/statements. Finds the header row by
// name, so a title row above it or extra columns (Receipts, Sage, Job) are
// fine. The spreadsheet library loads only when a file is chosen.
export interface StatementRow {
  date: string;
  posted: string;
  card: string;
  description: string;
  category: string;
  debit: string;
  credit: string;
}

const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, "");

function isoDate(v: unknown, ssf: { parse_date_code: (n: number) => { y: number; m: number; d: number } }) {
  if (typeof v === "number") {
    const d = ssf.parse_date_code(v);
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v ?? "").trim();
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (us) {
    const y = us[3].length === 2 ? `20${us[3]}` : us[3];
    return `${y}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  }
  return s.slice(0, 10);
}

const money = (v: unknown) => {
  if (v === null || v === undefined || v === "") return "";
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n !== 0 ? n.toFixed(2) : "";
};

export async function parseStatement(file: File): Promise<StatementRow[]> {
  const XLSX = (await import("xlsx-js-style")).default;
  const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = book.Sheets[book.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });
  const at = grid.findIndex((row) => {
    const names = row.map(norm);
    return names.includes("transactiondate") && names.some((n) => n.startsWith("card"));
  });
  if (at < 0)
    throw new Error("This doesn't look like a transaction download: no Transaction Date and Card No. columns.");
  const names = grid[at].map(norm);
  const col = (...keys: string[]) => names.findIndex((n) => keys.some((k) => n.startsWith(k)));
  const c = {
    date: col("transactiondate"),
    posted: col("posteddate"),
    card: col("cardno", "card"),
    description: col("description"),
    category: col("category"),
    debit: col("debit"),
    credit: col("credit"),
  };
  const rows: StatementRow[] = [];
  for (const row of grid.slice(at + 1)) {
    const date = isoDate(row[c.date], XLSX.SSF);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    rows.push({
      date,
      posted: c.posted >= 0 ? isoDate(row[c.posted], XLSX.SSF) : date,
      card: String(row[c.card] ?? "").replace(/\D/g, "").slice(-4),
      description: String(row[c.description] ?? "").trim(),
      category: c.category >= 0 ? String(row[c.category] ?? "") : "",
      debit: c.debit >= 0 ? money(row[c.debit]) : "",
      credit: c.credit >= 0 ? money(row[c.credit]) : "",
    });
  }
  if (!rows.length) throw new Error("The file has no transactions.");
  return rows;
}
