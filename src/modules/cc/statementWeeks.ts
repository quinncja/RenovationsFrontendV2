// Calendar helpers for the Monday-to-Sunday statement weeks (local dates).
export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + n);
  return iso(d);
};
export function mondayOf(date: string) {
  const d = new Date(`${date}T12:00:00`);
  return addDays(date, -((d.getDay() + 6) % 7));
}
export const short = (date: string, withMonth = true) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(
    "en-US",
    withMonth ? { month: "short", day: "numeric" } : { day: "numeric" },
  );
// "Oct 12 – 18", or "Sep 28 – Oct 4" across a month.
export function weekRange(start: string) {
  const end = addDays(start, 6);
  return `${short(start)} – ${short(end, end.slice(5, 7) !== start.slice(5, 7))}`;
}
// "Oct week 2": the month and ordinal of the week's Monday, as the receipts
// table names its week headers (and as the weekly spreadsheets are named).
export function weekName(start: string) {
  const d = new Date(`${start}T12:00:00`);
  return `${d.toLocaleDateString("en-US", { month: "short" })} week ${Math.ceil(d.getDate() / 7)}`;
}
