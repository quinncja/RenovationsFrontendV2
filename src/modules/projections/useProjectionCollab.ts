import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react"
import { auth } from "../../core/auth/firebase"
import { hashColor } from "../../shared/config/chartColors"
import type { ProjectionSheet } from "./types"

// Live collaboration for the Projection Board: one WebSocket to
// /projections/ws carrying presence (who holds which cell), throttled draft
// previews while a peer types, and full-sheet pushes after every save. The
// Pi redeploys drop every socket roughly every push, so reconnect-with-backoff
// is part of the contract, and the welcome frame's revision tells us whether
// commits were missed while offline.

export interface PeerCell {
  rowId: string | null
  field: string
}

export interface PresencePeer {
  connId: string
  uid: string
  email: string | null
  name: string | null
  /** Google sign-in profile photo (the account's `picture` claim). */
  picture: string | null
  cell: PeerCell | null
}

/** What a cell needs to render a remote holder: the peer, their stable color,
 *  and (while they type) their live draft text. */
export interface RemoteCellState {
  peer: PresencePeer
  color: string
  /** Additional peers on the same cell beyond `peer`. */
  others: number
  preview?: string
}

export interface ProjectionCollab {
  connected: boolean
  /** Everyone else in the room (other tabs of this account included). */
  peers: PresencePeer[]
  /** `rowId|field` → remote holder state, for cell halos and previews. */
  remoteCells: Map<string, RemoteCellState>
  focusCell: (rowId: string | null, field: string) => void
  blurCell: () => void
  previewCell: (rowId: string | null, field: string, text: string) => void
}

/** Null outside the Projections page (and in the static visual harness), so
 *  EditableCell can consume it unconditionally. */
export const CollabContext = createContext<ProjectionCollab | null>(null)
export const useCollab = () => useContext(CollabContext)

export function peerLabel(p: PresencePeer): string {
  return p.name || p.email || "Someone"
}
export function peerColor(p: PresencePeer): string {
  return hashColor(p.name || p.email || p.uid)
}

export const cellKey = (rowId: string | null, field: string) => `${rowId ?? "sheet"}|${field}`

const PREVIEW_THROTTLE_MS = 120
const MAX_BACKOFF_MS = 30_000

interface CollabCallbacks {
  /** Committed sheet pushed by another editor — adopt if newer. */
  onSheet: (sheet: ProjectionSheet) => void
  /** The room's revision is ahead of ours (we reconnected mid-stream). */
  onStale: () => void
}

export function useProjectionCollab(
  year: number,
  revision: number | null,
  callbacks: CollabCallbacks
): ProjectionCollab {
  const [connected, setConnected] = useState(false)
  const [peers, setPeers] = useState<PresencePeer[]>([])
  const [previews, setPreviews] = useState<Map<string, { cell: PeerCell; text: string }>>(new Map())

  const wsRef = useRef<WebSocket | null>(null)
  const selfConnId = useRef<string | null>(null)
  const heldCell = useRef<PeerCell | null>(null)
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingPreview = useRef<{ cell: PeerCell; text: string } | null>(null)

  // Latest revision + callbacks without re-running the connection effect.
  const revisionRef = useRef(revision)
  revisionRef.current = revision
  const cbRef = useRef(callbacks)
  cbRef.current = callbacks

  useEffect(() => {
    // Dev bypass has no Firebase token to offer the socket; the page still
    // works, just solo (same as the REST endpoints, which 401 against prod).
    if (import.meta.env.VITE_DEV_BYPASS_AUTH === "true") return

    let disposed = false
    let attempts = 0
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const connect = async () => {
      const token = await auth.currentUser?.getIdToken()
      if (disposed || !token) return
      const url = new URL("projections/ws", import.meta.env.VITE_API_URL || "http://localhost:8080/")
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
      url.searchParams.set("token", token)
      url.searchParams.set("year", String(year))

      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        attempts = 0
        setConnected(true)
        // Re-announce a cell held across a reconnect (deploys drop sockets).
        if (heldCell.current) {
          ws.send(JSON.stringify({ type: "focus", ...heldCell.current }))
        }
      }

      ws.onmessage = (event) => {
        let msg: {
          type: string
          connId?: string
          peers?: PresencePeer[]
          revision?: number | null
          sheet?: ProjectionSheet
          rowId?: string | null
          field?: string
          text?: string
        }
        try {
          msg = JSON.parse(event.data as string)
        } catch {
          return
        }
        if (msg.type === "welcome") {
          selfConnId.current = msg.connId ?? null
          setPeers((msg.peers ?? []).filter((p) => p.connId !== msg.connId))
          const local = revisionRef.current
          if (typeof msg.revision === "number" && local != null && msg.revision > local) {
            cbRef.current.onStale()
          }
        } else if (msg.type === "presence") {
          const others = (msg.peers ?? []).filter((p) => p.connId !== selfConnId.current)
          setPeers(others)
          // A preview is only valid while its sender still holds that cell.
          setPreviews((prev) => {
            let changed = false
            const next = new Map(prev)
            for (const [connId, p] of next) {
              const peer = others.find((o) => o.connId === connId)
              if (!peer || !peer.cell || peer.cell.rowId !== p.cell.rowId || peer.cell.field !== p.cell.field) {
                next.delete(connId)
                changed = true
              }
            }
            return changed ? next : prev
          })
        } else if (msg.type === "preview") {
          if (!msg.connId || !msg.field) return
          const cell = { rowId: msg.rowId ?? null, field: msg.field }
          setPreviews((prev) => new Map(prev).set(msg.connId!, { cell, text: msg.text ?? "" }))
        } else if (msg.type === "sheet" && msg.sheet) {
          cbRef.current.onSheet(msg.sheet)
        }
      }

      ws.onclose = () => {
        setConnected(false)
        setPeers([])
        setPreviews(new Map())
        if (disposed) return
        attempts += 1
        retryTimer = setTimeout(connect, Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempts))
      }
      ws.onerror = () => ws.close()
    }

    const start = () =>
      connect().catch(() => {
        if (disposed) return
        attempts += 1
        retryTimer = setTimeout(start, Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempts))
      })
    start()
    return () => {
      disposed = true
      if (retryTimer) clearTimeout(retryTimer)
      if (previewTimer.current) clearTimeout(previewTimer.current)
      wsRef.current?.close()
      wsRef.current = null
      setConnected(false)
      setPeers([])
      setPreviews(new Map())
    }
  }, [year])

  const send = (frame: object) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame))
  }

  const api = useMemo<Omit<ProjectionCollab, "connected" | "peers" | "remoteCells">>(
    () => ({
      focusCell: (rowId, field) => {
        heldCell.current = { rowId, field }
        send({ type: "focus", rowId, field })
      },
      blurCell: () => {
        heldCell.current = null
        pendingPreview.current = null
        send({ type: "blur" })
      },
      previewCell: (rowId, field, text) => {
        pendingPreview.current = { cell: { rowId, field }, text }
        if (previewTimer.current) return
        previewTimer.current = setTimeout(() => {
          previewTimer.current = null
          const p = pendingPreview.current
          if (p) send({ type: "preview", rowId: p.cell.rowId, field: p.cell.field, text: p.text })
        }, PREVIEW_THROTTLE_MS)
      },
    }),
    []
  )

  const remoteCells = useMemo(() => {
    const map = new Map<string, RemoteCellState>()
    for (const peer of peers) {
      if (!peer.cell) continue
      const key = cellKey(peer.cell.rowId, peer.cell.field)
      const existing = map.get(key)
      if (existing) {
        existing.others += 1
        continue
      }
      map.set(key, {
        peer,
        color: peerColor(peer),
        others: 0,
        preview: previews.get(peer.connId)?.text,
      })
    }
    return map
  }, [peers, previews])

  // Memoized: this object is a context value, so a fresh identity would
  // re-render every cell on every render of the page.
  return useMemo(() => ({ connected, peers, remoteCells, ...api }), [connected, peers, remoteCells, api])
}
