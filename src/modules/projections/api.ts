import { apiGet, apiRequest } from "../../shared/api/mutationApi"
import type { CellEdit, ProjectionEditEntry, ProjectionSheet, ProjectionSnapshotMeta } from "./types"

export function fetchProjectionSheet(year: number) {
  return apiGet<{ sheet: ProjectionSheet; years: number[] }>(`projections/sheet?year=${year}`)
}

export function patchProjectionRows(year: number, revision: number, edits: CellEdit[]) {
  return apiRequest<{ sheet: ProjectionSheet }>("projections/rows", "PATCH", { year, revision, edits })
}

export function addProjectionRow(year: number, revision: number) {
  return apiRequest<{ sheet: ProjectionSheet }>("projections/rows", "POST", { year, revision })
}

export function deleteProjectionRow(year: number, revision: number, rowId: string) {
  return apiRequest<{ sheet: ProjectionSheet }>(
    `projections/rows/${rowId}?year=${year}`,
    "DELETE",
    { year, revision }
  )
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

export function restoreProjectionSnapshot(snapshotId: string) {
  return apiRequest<{ sheet: ProjectionSheet }>(`projections/snapshots/${snapshotId}/restore`, "POST")
}
