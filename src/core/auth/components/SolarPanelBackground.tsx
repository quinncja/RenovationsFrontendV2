import { useEffect, useRef } from "react"

// ── Camera ────────────────────────────────────────────────────────────────────
const FOCAL      = 950
const CAM_HEIGHT = 85
const HORIZON_Y  = 0.42

// ── World panel dimensions ────────────────────────────────────────────────────
const WPW    = 75.0
const WPH    = 48.0
const WGX    = 3.0
const WGZ    = 3.0
const TILE_W = WPW + WGX  // 78.0
const TILE_Z = WPH + WGZ  // 51.0

const CELL_COLS = 6
const CELL_ROWS = 4

// ── Render range ──────────────────────────────────────────────────────────────
const Z_NEAR      = 50
const Z_FAR       = 900
const X_REACH_CAP = 520

// ── Spherical surface ─────────────────────────────────────────────────────────
const PLANET_RADIUS = 3500

type Pt = { x: number; y: number }

function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

function project(
  wx: number, wz: number,
  camX: number, camZ: number,
  w: number, h: number
): Pt | null {
  const depth = wz - camZ
  if (depth < 10) return null
  const scale = FOCAL / depth
  const dx = wx - camX
  const wy = (dx * dx + depth * depth) / (2 * PLANET_RADIUS)
  return {
    x: w / 2 + (wx - camX) * scale,
    y: h * HORIZON_Y + (CAM_HEIGHT + wy) * scale,
  }
}

function drawPanel(
  ctx: CanvasRenderingContext2D,
  wx: number, wz: number,
  camX: number, camZ: number,
  w: number, h: number
) {
  const depth = wz - camZ
  if (depth <= 0) return
  if ((WPH * FOCAL) / depth < 5) return

  const bl = project(wx,       wz,       camX, camZ, w, h)
  const br = project(wx + WPW, wz,       camX, camZ, w, h)
  const fl = project(wx,       wz + WPH, camX, camZ, w, h)
  const fr = project(wx + WPW, wz + WPH, camX, camZ, w, h)
  if (!bl || !br || !fl || !fr) return

  if (bl.y < 0 && br.y < 0) return
  if (fl.y > h && fr.y > h) return

  const depthRatio = Math.min(1, (depth - Z_NEAR) / (Z_FAR - Z_NEAR))
  // Smooth fade: fully opaque near, 20% at horizon — floor prevents invisible pop-in
  const opacity = +(0.20 + 0.80 * (1 - depthRatio)).toFixed(2)
  const projH   = bl.y - fl.y

  // ── Panel face ────────────────────────────────────────────────────────────
  ctx.beginPath()
  ctx.moveTo(bl.x, bl.y)
  ctx.lineTo(br.x, br.y)
  ctx.lineTo(fr.x, fr.y)
  ctx.lineTo(fl.x, fl.y)
  ctx.closePath()
  // Fill matches border hue so panels don't contrast harshly with surface
  ctx.fillStyle = `rgba(55,90,150,${+(opacity * 0.28).toFixed(2)})`
  ctx.fill()

  if (projH > 6) {
    // Cell dividers
    ctx.beginPath()
    for (let c = 1; c < CELL_COLS; c++) {
      const t   = c / CELL_COLS
      const top = lerp(fl, fr, t)
      const bot = lerp(bl, br, t)
      ctx.moveTo(top.x, top.y)
      ctx.lineTo(bot.x, bot.y)
    }
    for (let r = 1; r < CELL_ROWS; r++) {
      const t   = r / CELL_ROWS
      const lft = lerp(fl, bl, t)
      const rgt = lerp(fr, br, t)
      ctx.moveTo(lft.x, lft.y)
      ctx.lineTo(rgt.x, rgt.y)
    }
    ctx.strokeStyle = `rgba(100,150,220,${+(opacity * 0.18).toFixed(2)})`
    ctx.lineWidth   = 0.6
    ctx.stroke()

  }

  // Frame
  ctx.beginPath()
  ctx.moveTo(bl.x, bl.y)
  ctx.lineTo(br.x, br.y)
  ctx.lineTo(fr.x, fr.y)
  ctx.lineTo(fl.x, fl.y)
  ctx.closePath()
  ctx.strokeStyle = `rgba(60,100,160,${+(opacity * 0.6).toFixed(2)})`
  ctx.lineWidth   = 0.8
  ctx.stroke()
}

export default function SolarPanelBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true })
    if (!ctx) return

    let animId: number
    let time = 0
    let w = 0, h = 0
    let vigGrad: CanvasGradient
    let skyGrad: CanvasGradient
    let horizGrad: CanvasGradient

    const resize = () => {
      w = canvas.width  = window.innerWidth
      h = canvas.height = window.innerHeight

      const hy = h * HORIZON_Y

      // Sky: deep space fading down to match surface color exactly at horizon
      skyGrad = ctx.createLinearGradient(0, 0, 0, hy)
      skyGrad.addColorStop(0,   "#020408")
      skyGrad.addColorStop(0.7, "#060d1a")
      skyGrad.addColorStop(1,   "#0b1628")   // matches surface fill

      // Soft atmospheric glow centered on the horizon line
      horizGrad = ctx.createLinearGradient(0, hy - 80, 0, hy + 50)
      horizGrad.addColorStop(0,    "rgba(40,90,180,0)")
      horizGrad.addColorStop(0.45, "rgba(40,90,180,0.10)")
      horizGrad.addColorStop(0.55, "rgba(60,120,210,0.14)")
      horizGrad.addColorStop(1,    "rgba(40,90,180,0)")

      // Vignette
      vigGrad = ctx.createRadialGradient(w / 2, h / 2, h * 0.15, w / 2, h / 2, h * 0.9)
      vigGrad.addColorStop(0, "rgba(0,0,0,0)")
      vigGrad.addColorStop(1, "rgba(0,0,0,0.6)")
    }
    resize()
    window.addEventListener("resize", resize)

    function draw() {
      if (!ctx) return
      time++

      const camX    = Math.sin(time * 0.0008) * 55
      const camZ    = time * 0.18
      const horizonY = h * HORIZON_Y

      // ── Sky ───────────────────────────────────────────────────────────────
      ctx.fillStyle = skyGrad
      ctx.fillRect(0, 0, w, horizonY)

      // ── Surface below horizon ─────────────────────────────────────────────
      ctx.fillStyle = "#0b1628"
      ctx.fillRect(0, horizonY, w, h - horizonY)

      // ── Panels — far to near ──────────────────────────────────────────────
      const startZi = Math.ceil ((camZ + Z_NEAR) / TILE_Z)
      const endZi   = Math.floor((camZ + Z_FAR)  / TILE_Z)

      for (let zi = endZi; zi >= startZi; zi--) {
        const wz    = zi * TILE_Z
        const depth = wz - camZ
        if (depth <= 0) continue
        const xReach  = Math.min((w / 2) * (depth / FOCAL) + TILE_W * 2, X_REACH_CAP)
        const startXi = Math.floor((camX - xReach) / TILE_W)
        const endXi   = Math.ceil ((camX + xReach) / TILE_W)
        for (let xi = startXi; xi <= endXi; xi++) {
          drawPanel(ctx, xi * TILE_W, wz, camX, camZ, w, h)
        }
      }

      // ── Horizon atmospheric glow ──────────────────────────────────────────
      ctx.fillStyle = horizGrad
      ctx.fillRect(0, horizonY - 80, w, 130)

      // ── Vignette ─────────────────────────────────────────────────────────
      ctx.fillStyle = vigGrad
      ctx.fillRect(0, 0, w, h)

      animId = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener("resize", resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute", inset: 0, width: "100%", height: "100%",
        transform: "translateZ(0)",
        willChange: "transform",
      }}
    />
  )
}
