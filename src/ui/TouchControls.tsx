import { useEffect, useRef } from 'react'
import { useGame } from '../store/game'
import { rt } from '../engine/runtime'
import { isTouchUi } from '../engine/input'

const STICK = 120 // joystick diameter in CSS px

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
        e.currentTarget.setPointerCapture(e.pointerId)
        press(code, true)
        if (tap) window.setTimeout(() => press(code, false), 90)
      }}
      onPointerUp={() => !tap && press(code, false)}
      onPointerCancel={() => !tap && press(code, false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  )
}

/** Virtual joystick (left), camera drag (right half of the screen) and action buttons. */
export default function TouchControls() {
  const phase = useGame((s) => s.phase)
  const inCar = useGame((s) => s.inVehicle)
  const near = useGame((s) => s.nearVehicle)
  const touch = useGame((s) => s.touch)
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
        const max = STICK / 2
        const len = Math.hypot(dx, dy)
        if (len > max) {
          dx = (dx / len) * max
          dy = (dy / len) * max
        }
        knob.current.style.transform = `translate(${dx}px, ${dy}px)`
        rt.stick.x = dx / max
        rt.stick.y = -dy / max
        rt.stick.active = Math.hypot(rt.stick.x, rt.stick.y) > 0.12
        // vehicles read the keyboard table: map the stick onto it
        const st = useGame.getState()
        if (st.inVehicle) {
          rt.keys.KeyW = rt.stick.y > 0.35
          rt.keys.KeyS = rt.stick.y < -0.35
          rt.keys.KeyA = rt.stick.x < -0.3
          rt.keys.KeyD = rt.stick.x > 0.3
        }
      } else if (lookId.current && lookId.current.id === e.pointerId) {
        const s = useGame.getState().sensitivity * 0.005
        rt.lastMouse = performance.now()
        rt.camYaw -= (e.clientX - lookId.current.x) * s
        rt.camPitch = Math.max(-0.35, Math.min(1.2, rt.camPitch + (e.clientY - lookId.current.y) * s))
        lookId.current.x = e.clientX
        lookId.current.y = e.clientY
      }
    }
    const end = (e: PointerEvent) => {
      if (stickId.current === e.pointerId) {
        stickId.current = null
        rt.stick.active = false
        rt.stick.x = rt.stick.y = 0
        rt.keys.KeyW = rt.keys.KeyS = rt.keys.KeyA = rt.keys.KeyD = false
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
    }
  }, [show])

  if (!show) return null
  const set = useGame.getState().set
  return (
    <div className="touch" onContextMenu={(e) => e.preventDefault()}>
      {/* right half: drag to look */}
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
        <button className="tbtn small" aria-label="Pause" onClick={() => set({ phase: 'paused' })}>Ⅱ</button>
      </div>
      <div className="touch-actions">
        {inCar ? (
          <>
            <Btn code="Space" label="Brake" cls="wide" />
            <Btn code="KeyH" label="Horn" />
            <Btn code="KeyF" label="Exit" tap />
          </>
        ) : (
          <>
            <Btn code="Space" label="Jump" />
            <Btn code="ShiftLeft" label="Run" />
            <Btn code="KeyC" label="Duck" />
          </>
        )}
        <Btn code={inCar ? 'KeyG' : 'KeyE'} label={inCar ? 'Garage' : near ? 'Enter' : 'Use'} cls="primary" tap />
        {!inCar && <Btn code="KeyG" label="Garage" tap />}
      </div>
    </div>
  )
}
