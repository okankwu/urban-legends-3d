import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { rt } from './runtime'
import { useGame } from '../store/game'

const BASE_DPR = { low: 0.75, medium: 1.25, high: 1.75 } as const

/** Inside the Canvas: records frame stats and (optionally) adapts the render resolution to hold the frame rate. */
export function PerfProbe() {
  const gl = useThree((s) => s.gl)
  const setDpr = useThree((s) => s.setDpr)
  const acc = useRef({ t: 0, frames: 0, scale: 1, lastAdapt: 0 })

  useEffect(() => {
    // reset the scale whenever quality changes
    acc.current.scale = 1
    setDpr(Math.min(window.devicePixelRatio || 1, BASE_DPR[useGame.getState().quality]))
  }, [setDpr])

  const quality = useGame((s) => s.quality)
  useEffect(() => {
    acc.current.scale = 1
    setDpr(Math.min(window.devicePixelRatio || 1, BASE_DPR[quality]))
  }, [quality, setDpr])

  useFrame((_, dt) => {
    const a = acc.current
    a.t += dt
    a.frames++
    if (a.t >= 1) {
      const fps = a.frames / a.t
      rt.perf.fps = Math.round(fps)
      rt.perf.calls = gl.info.render.calls
      rt.perf.tris = gl.info.render.triangles
      a.t = 0
      a.frames = 0
      const st = useGame.getState()
      // dynamic resolution: step the pixel ratio down when slow, back up when comfortable
      if (st.autoQuality && st.phase === 'playing') {
        a.lastAdapt += 1
        if (a.lastAdapt >= 3) {
          a.lastAdapt = 0
          let next = a.scale
          if (fps < 26 && a.scale > 0.55) next = Math.max(0.55, a.scale - 0.15)
          else if (fps > 54 && a.scale < 1) next = Math.min(1, a.scale + 0.1)
          if (next !== a.scale) {
            a.scale = next
            setDpr(Math.min(window.devicePixelRatio || 1, BASE_DPR[st.quality]) * next)
            rt.perf.scale = next
          }
        }
      }
    }
  })
  return null
}

/** Small HTML readout toggled from Settings. */
export function FpsMeter() {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 500)
    return () => window.clearInterval(id)
  }, [])
  const p = rt.perf
  return (
    <div className="fps-meter" aria-hidden="true">
      {p.fps} fps · {p.calls} calls · {(p.tris / 1000).toFixed(0)}k tris · res {Math.round(p.scale * 100)}%
    </div>
  )
}

/** Dev only: window.__step(frames, dt) advances the simulation without needing a visible tab (used for automated testing). */
export function DevStepper() {
  const advance = useThree((s) => s.advance)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    let t = performance.now()
    ;(window as unknown as Record<string, unknown>).__step = (n = 60, dt = 1 / 60) => {
      for (let i = 0; i < n; i++) {
        t += dt * 1000
        advance(t)
      }
    }
  }, [advance])
  return null
}
