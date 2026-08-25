import { apiGet, apiRequest } from "../../shared/api/mutationApi"
import type { CellEdit, ProjectionEditEntry, ProjectionSheet, ProjectionSnapshot, ProjectionSnapshotMeta } from "./types"

export function fetchProjectionSheet(year: number) {
  return apiGet<{ sheet: ProjectionSheet; years: number[] }>(`projections/sheet?year=${year}`)
}

export function patchProjectionRows(year: number, revision: number, edits: CellEdit[]) {
  return apiRequest<{ sheet: ProjectionSheet }>("projections/rows", "PATCH", { year, revision, edits })
}

/** `rowId`: a client-minted UUID the server adopts, so the caller can show
 *  the row optimistically under its final id (no re-key on response). */
export function addProjectionRow(year: number, revision: number, section?: "pipeline", rowId?: string) {
  return apiRequest<{ sheet: ProjectionSheet }>("projections/rows", "POST", { year, revision, section, rowId })
}

export function deleteProjectionRow(year: number, revision: number, rowId: string) {
  return apiRequest<{ sheet: ProjectionSheet }>(
    `projections/rows/${rowId}?year=${year}`,
    "DELETE",
    { year, revision }
  )
}

export function reorderProjectionRows(
  year: number,
  revision: number,
  section: "rows" | "pipeline",
  order: string[],
  movedRowId: string
) {
  return apiRequest<{ sheet: ProjectionSheet }>("projections/rows/order", "PUT", {
    year,
    revision,
    section,
    order,
    movedRowId,
  })
}

/** Move a row between sections: `to: "rows"` awards a pipeline project
 *  (it lands at the bottom of the projection grid), `to: "pipeline"`
 *  returns it (the undo of an award). */
export function moveProjectionRow(year: number, revision: number, rowId: string, to: "rows" | "pipeline") {
  return apiRequest<{ sheet: ProjectionSheet }>(`projections/rows/${rowId}/move`, "POST", { year, revision, to })
}

export function fetchProjectionHistory(year: number, limit = 150) {
  return apiGet<{ history: ProjectionEditEntry[] }>(`projections/history?year=${year}&limit=${limit}`)
}

export function fetchProjectionSnapshots(year: number) {
  return apiGet<{ snapshots: ProjectionSnapshotMeta[] }>(`projections/snapshots?year=${year}`)
}

export function createProjectionSnapshot(year: number, label: string) {
  return apiRequest<{ id: string }>("projections/snapshots", "POST", { year, label })
}

/** Full stored version (rows, pipeline, actuals) — for export. */
export function fetchProjectionSnapshot(snapshotId: string) {
  return apiGet<ProjectionSnapshot>(`projections/snapshots/${snapshotId}`)
}

export function restoreProjectionSnapshot(snapshotId: string) {
  return apiRequest<{ sheet: ProjectionSheet }>(`projections/snapshots/${snapshotId}/restore`, "POST")
}
