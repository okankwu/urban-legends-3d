import { useEffect, useRef } from 'react'
import { drawGps, dashScale } from '../driver/drawMap'

const W = 300
const H = 200

/** Floating GPS for the third-person chase camera (the cockpit view uses the dashboard screen instead). */
export default function GpsOverlay() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current!
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    cv.width = W * dpr
    cv.height = H * dpr
    const g = cv.getContext('2d')!
    let raf = 0
    let last = 0
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw)
      if (t - last < 50) return
      last = t
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      drawGps(g, { w: W, h: H, scale: dashScale(W) * 1.2, mode: 'track', ui: 0.85, hud: true })
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <canvas ref={ref} className="gps-float" style={{ width: W, height: H }} role="img" aria-label="GPS navigation map" />
}
