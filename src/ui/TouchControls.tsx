import { useEffect, useRef } from 'react'
import { useGame } from '../store/game'
import { rt } from '../engine/runtime'
import { isTouchUi } from '../engine/input'
import { setExpanded, toggleGps } from '../driver/dashActions'
import { FullscreenButton } from './MobileExtras'


function press(code: string, down: boolean) {
  rt.keys[code] = down
  if (down) rt.pressed[code] = performance.now()
}

/** A hold-able on-screen button that feeds the same key table as the keyboard. */
function Btn({ code, label, cls = '', tap = false }: { code: string; label: string; cls?: string; tap?: boolean }) {
  return (
    <button
      className={'tbtn ' + cls}
      aria-label={label}
      onPointerDown={(e) => {
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          /* synthetic or already-released pointers cannot be captured */
        }
        press(code, true)
        if (tap) window.setTimeout(() => press(code, false), 90)
      }}
      onPointerUp={() => !tap && press(code, false)}
      onPointerCancel={() => !tap && press(code, false)}
      onLostPointerCapture={() => !tap && press(code, false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  )
}

/** A plain tap button that runs an action directly (used for the GPS controls, which are not key-table based). */
function Do({ label, run, cls = '' }: { label: string; run: () => void; cls?: string }) {
  return (
    <button className={'tbtn ' + cls} aria-label={label} onClick={run} onContextMenu={(e) => e.preventDefault()}>
      {label}
    </button>
  )
}

/**
 * On-screen controls. On foot: a joystick (left), drag-to-look (right half) and action buttons. In a vehicle the
 * joystick steers (analog, left/right only) and Gas / Brake pedals sit under the right thumb.
 */
export default function TouchControls() {
  const phase = useGame((s) => s.phase)
  const inCar = useGame((s) => s.inVehicle)
  const near = useGame((s) => s.nearVehicle)
  const touch = useGame((s) => s.touch)
  const prompt = useGame((s) => s.djPrompt || s.mprompt || s.prompt)
  const mapOpen = useGame((s) => s.gpsExpanded)
  const base = useRef<HTMLDivElement>(null)
  const knob = useRef<HTMLDivElement>(null)
  const stickId = useRef<number | null>(null)
  const lookId = useRef<{ id: number; x: number; y: number } | null>(null)

  const show = isTouchUi() && phase === 'playing'
  void touch

  useEffect(() => {
    if (!show) {
      rt.stick.active = false
      return
    }
    const move = (e: PointerEvent) => {
      if (stickId.current === e.pointerId && base.current && knob.current) {
        const r = base.current.getBoundingClientRect()
        let dx = e.clientX - (r.left + r.width / 2)
        let dy = e.clientY - (r.top + r.height / 2)
        const max = r.width / 2
        const len = Math.hypot(dx, dy)
        if (len > max) {
          dx = (dx / len) * max
          dy = (dy / len) * max
        }
        knob.current.style.transform = `translate(${dx}px, ${dy}px)`
        rt.stick.x = dx / max
        rt.stick.y = -dy / max
        rt.stick.active = Math.hypot(rt.stick.x, rt.stick.y) > 0.12
      } else if (lookId.current && lookId.current.id === e.pointerId) {
        const g = useGame.getState()
        const s = g.sensitivity * 0.005
        const ddx = e.clientX - lookId.current.x
        const ddy = e.clientY - lookId.current.y
        rt.lastMouse = performance.now()
        if (g.inVehicle && g.camMode === 'cockpit') {
          // cockpit view: dragging turns the driver's head
          rt.headYaw = Math.max(-2.4, Math.min(2.4, rt.headYaw - ddx * s))
          rt.headPitch = Math.max(-0.95, Math.min(0.55, rt.headPitch - ddy * s))
        } else {
          rt.camYaw -= ddx * s
          rt.camPitch = Math.max(-0.35, Math.min(1.2, rt.camPitch + ddy * s))
        }
        lookId.current.x = e.clientX
        lookId.current.y = e.clientY
      }
    }
    const end = (e: PointerEvent) => {
      if (stickId.current === e.pointerId) {
        stickId.current = null
        rt.stick.active = false
        rt.stick.x = rt.stick.y = 0
        if (knob.current) knob.current.style.transform = 'translate(0,0)'
      }
      if (lookId.current?.id === e.pointerId) lookId.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      rt.stick.active = false
      rt.stick.x = rt.stick.y = 0
      stickId.current = null
      lookId.current = null
    }
  }, [show])

  // letting go of every control when the touch UI hides (pause, menus) must not leave a key stuck down
  useEffect(() => {
    if (show) return
    for (const k of ['KeyW', 'KeyS', 'Space', 'KeyH', 'ShiftLeft', 'KeyC']) rt.keys[k] = false
  }, [show])

  if (!show) return null
  const set = useGame.getState().set
  // a prompt such as "E  Enter Luna Diner" or "G  Open Central Garage" becomes a tap button for that key; plain hints get no button
  const pm = /^([A-Z])\s\s(.+)$/.exec(prompt)
  const promKey = pm ? 'Key' + pm[1] : ''
  const prom = pm ? pm[2] : ''
  return (
    <div className={'touch' + (mapOpen ? ' gps-open' : '')} onContextMenu={(e) => e.preventDefault()}>
      {/* right part of the screen: drag to look */}
      <div
        className="touch-look"
        onPointerDown={(e) => {
          if (lookId.current) return
          lookId.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
        }}
      />
      <div
        ref={base}
        className="touch-stick"
        onPointerDown={(e) => {
          if (stickId.current !== null) return
          stickId.current = e.pointerId
        }}
      >
        <div ref={knob} className="touch-knob" />
      </div>
      <div className="touch-top">
        <button className="tbtn small" aria-label="Map" onClick={() => set({ phase: 'map' })}>Map</button>
        <button className="tbtn small" aria-label="Journal" onClick={() => set({ phase: 'journal' })}>Log</button>
        <button className="tbtn small" aria-label="Driver jobs" onClick={() => set({ phase: 'jobs', gpsExpanded: false })}>Jobs</button>
        <FullscreenButton />
        <button className="tbtn small" aria-label="Pause" onClick={() => set({ phase: 'paused' })}>Ⅱ</button>
      </div>
      {prom && (
        <button className="touch-prompt" onClick={() => (rt.pressed[promKey] = performance.now())}>
          Tap: {prom}
        </button>
      )}
      {inCar ? (
        <>
          <div className="touch-pedals">
            <Btn code="KeyS" label="Brake" cls="pedal brake" />
            <Btn code="KeyW" label="Gas" cls="pedal gas" />
          </div>
          <div className="touch-misc">
            <Btn code="Space" label="Hand" cls="small" />
            <Btn code="KeyH" label="Horn" cls="small" />
            <Btn code="KeyF" label="Exit" cls="small" tap />
            <Btn code="KeyE" label="Use" cls="small primary" tap />
            <Do label="GPS" cls="small" run={toggleGps} />
            <Do label="Big map" cls="small" run={() => setExpanded(!useGame.getState().gpsExpanded)} />
            <Do label="View" cls="small" run={() => set({ camMode: useGame.getState().camMode === 'chase' ? 'cockpit' : 'chase' })} />
            <Btn code="KeyG" label="Garage" cls="small" tap />
          </div>
        </>
      ) : (
        <div className="touch-actions">
          <Btn code="Space" label="Jump" />
          <Btn code="ShiftLeft" label="Run" />
          <Btn code="KeyC" label="Duck" />
          <Btn code="KeyE" label={near ? 'Enter' : 'Use'} cls="primary" tap />
          <Btn code="KeyG" label="Garage" cls="small" tap />
        </div>
      )}
    </div>
  )
}
