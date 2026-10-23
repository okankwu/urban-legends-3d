import { useEffect, useRef, useState } from 'react'
import { useGame } from '../store/game'
import { drawGps } from '../driver/drawMap'
import { fmtDist, fmtEta, gps } from '../driver/gps'
import type { Turn } from '../driver/gps'
import { setExpanded } from '../driver/dashActions'

const TURN: Record<Turn, string> = { left: '← Turn left', right: 'Turn right →', straight: '↑ Continue', uturn: '↶ U-turn', arrive: '◉ Arrive' }

/**
 * The expanded GPS: a large, readable navigation overlay. The game keeps running underneath, so driving
 * controls still work; Escape (or the Close button) returns to the normal view.
 */
export default function ExpandedCityMap() {
  const ref = useRef<HTMLCanvasElement>(null)
  const job = useGame((s) => s.djJob)
  const [mode, setMode] = useState<'track' | 'north'>('north')
  const [zoom, setZoom] = useState(1)
  const [, tick] = useState(0)
  const iw = window.innerWidth
  const size = { w: iw < 760 ? Math.max(240, iw - 64) : Math.min(720, Math.round(iw * 0.56)), h: Math.max(170, Math.min(640, window.innerHeight - 190)) }

  useEffect(() => {
    const cv = ref.current!
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    cv.width = size.w * dpr
    cv.height = size.h * dpr
    const g = cv.getContext('2d')!
    let raf = 0
    let last = 0
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw)
      if (t - last < 33) return
      last = t
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      drawGps(g, { w: size.w, h: size.h, scale: (size.w / 420) * zoom, mode, ui: 1.45, hud: true })
      if (Math.floor(t / 500) !== Math.floor((t - 33) / 500)) tick((v) => v + 1)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [size.w, size.h, mode, zoom])

  const route = gps.route
  const upcoming = route ? route.maneuvers.filter((m) => m.at > gps.along - 2).slice(0, 5) : []
  const noFocus = (e: React.MouseEvent) => e.preventDefault() // keep keyboard focus on the game so Space still brakes
  return (
    <div className="gps-expanded" role="dialog" aria-label="Expanded GPS" onMouseDown={noFocus}>
      <header>
        <b>NAVIGATION</b>
        <div className="seg">
          <button tabIndex={-1} className={mode === 'north' ? 'on' : ''} onClick={() => setMode('north')}>
            North up
          </button>
          <button tabIndex={-1} className={mode === 'track' ? 'on' : ''} onClick={() => setMode('track')}>
            Heading up
          </button>
          <button tabIndex={-1} aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))}>
            −
          </button>
          <button tabIndex={-1} aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(3, z * 1.25))}>
            +
          </button>
          <button tabIndex={-1} onClick={() => setExpanded(false)}>
            Close (Esc)
          </button>
        </div>
      </header>
      <canvas ref={ref} style={{ width: size.w, height: size.h }} aria-label="Live city map with route" />
      <footer>
        {job ? (
          <div className="gps-job">
            <b>{job.title}</b>
            <span>{job.text}</span>
          </div>
        ) : (
          <div className="gps-job">
            <b>No active job</b>
            <span>Press J for driver jobs, or set a waypoint on the map (M).</span>
          </div>
        )}
        {gps.target && route ? (
          <div className="gps-eta">
            <b>{fmtDist(gps.remaining)}</b>
            <span>ETA {fmtEta(gps.etaSec)}</span>
            {gps.recalcs > 0 && <small>re-routed {gps.recalcs}×</small>}
          </div>
        ) : null}
      </footer>
      {upcoming.length > 0 && (
        <ol className="gps-turns">
          {upcoming.map((m, i) => (
            <li key={i}>
              <span>{TURN[m.turn]}</span>
              <em>{m.turn === 'arrive' ? gps.target?.label : m.street}</em>
              <b>{fmtDist(m.at - gps.along)}</b>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
