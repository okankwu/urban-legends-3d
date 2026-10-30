import { useEffect } from 'react'
import { useGame, useGameFields } from '../store/game'
import { SPECS, spec as specOf } from '../vehicles/specs'
import { turntable } from '../vehicles/VehicleStage'
import { rt } from '../engine/runtime'
import { sfx } from '../engine/audio'
import { forceExit } from '../missions/actions'
import { saveGame } from '../missions/manager'

const bar = (v: number) => (
  <span className="veh-bar" aria-hidden="true">
    <i style={{ width: `${Math.round(Math.max(0.05, Math.min(1, v)) * 100)}%` }} />
  </span>
)

/** Vehicle selection screen: pick, preview (turntable) and buy vehicles from the main or pause menu. */
export default function VehicleSelect() {
  const s = useGameFields(['phase', 'vehicleReturn', 'previewVehicle', 'currentVehicle', 'ownedVehicles', 'money', 'unlocks', 'set'] as const)
  const open = s.phase === 'vehicles'

  useEffect(() => {
    if (!open) return
    const st = useGame.getState()
    st.set({ previewVehicle: st.currentVehicle })
    turntable.yaw = 0.6
    turntable.drag = false
    // drag anywhere outside the panels to spin the vehicle
    let last: number | null = null
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('.creator-panel, .creator-bar')) return
      last = e.clientX
      turntable.drag = true
    }
    const move = (e: PointerEvent) => {
      if (last == null) return
      turntable.yaw += (e.clientX - last) * 0.01
      last = e.clientX
    }
    const up = () => {
      last = null
      turntable.drag = false
    }
    window.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      turntable.drag = false
    }
  }, [open])

  const idx = Math.max(0, SPECS.findIndex((v) => v.id === s.previewVehicle))
  const step = (d: number) => s.set({ previewVehicle: SPECS[(idx + d + SPECS.length) % SPECS.length].id })

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'ArrowRight' || e.code === 'ArrowDown') step(1)
      else if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') step(-1)
      else if (e.code === 'Escape') back()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!open) return null
  const v = specOf(s.previewVehicle)
  const owned = s.ownedVehicles.includes(v.id)
  const locked = !!v.locked && !s.unlocks.includes(v.locked)
  const inUse = v.id === s.currentVehicle
  const inGame = s.vehicleReturn === 'paused'

  const back = () => useGame.getState().set({ phase: useGame.getState().vehicleReturn })

  const choose = () => {
    const st = useGame.getState()
    if (v.id !== st.currentVehicle) {
      if (inGame) {
        // swap in place: the new vehicle takes the spot of the old one and the player is put on foot beside it
        const bx = rt.vehiclePos.x
        const bz = rt.vehiclePos.z
        // stand on the driver's side, clear of the car body (left = +x in chassis space)
        forceExit(bx + Math.cos(rt.vehicleYaw) * 2.8, bz - Math.sin(rt.vehicleYaw) * 2.8)
        rt.vehicleSpawn = { x: bx, z: bz, yaw: rt.vehicleYaw }
        st.set({ currentVehicle: v.id, vehicleHealth: 100 })
        saveGame()
      } else {
        st.set({ currentVehicle: v.id, vehicleHealth: 100 })
      }
      sfx('buy')
    }
    back()
  }

  const buy = () => {
    const st = useGame.getState()
    if (locked || st.money < v.price) return sfx('deny')
    st.set({ money: st.money - v.price, ownedVehicles: [...st.ownedVehicles, v.id] })
    sfx('buy')
  }

  const accel = v.engine / v.mass

  return (
    <>
      <div className="creator-panel veh-panel" role="listbox" aria-label="Vehicles">
        <h2>Choose vehicle</h2>
        <div className="veh-list">
          {SPECS.map((x) => {
            const own = s.ownedVehicles.includes(x.id)
            return (
              <button
                key={x.id}
                role="option"
                aria-selected={x.id === v.id}
                className={'shop-line' + (x.id === v.id ? ' on' : '')}
                onClick={() => s.set({ previewVehicle: x.id })}
              >
                <span>
                  {x.name} <small style={{ color: 'var(--muted)' }}>· {x.cls}</small>
                </span>
                <b>{x.id === s.currentVehicle ? 'In use' : own ? 'Owned' : !!x.locked && !s.unlocks.includes(x.locked) ? 'Locked' : `$${x.price.toLocaleString()}`}</b>
              </button>
            )
          })}
        </div>
        <div className="veh-stats">
          <p className="veh-blurb">{v.blurb}</p>
          <div className="veh-row"><span>Top speed</span>{bar(v.maxSpeed / 72)}<b>{Math.round(v.maxSpeed * 3.6)} km/h</b></div>
          <div className="veh-row"><span>Acceleration</span>{bar(accel / 4.8)}</div>
          <div className="veh-row"><span>Handling</span>{bar(v.grip / 13.5)}</div>
          <div className="veh-row"><span>Weight</span>{bar(v.mass / 2500)}<b>{v.mass} kg</b></div>
          {v.glb && <small className="hint">Keeps its factory paint.</small>}
        </div>
      </div>

      <div className="creator-bar">
        <div className="seg">
          <button onClick={() => step(-1)} aria-label="Previous vehicle">&lt;</button>
          <button onClick={() => step(1)} aria-label="Next vehicle">&gt;</button>
        </div>
        <span className="hint">Drag to rotate · arrow keys or &lt; &gt; to browse · cash ${s.money.toLocaleString()}</span>
        <div className="seg">
          <button onClick={back}>Back</button>
          {owned ? (
            <button className="primary" onClick={choose}>
              {inUse ? 'Keep this one' : inGame ? 'Drive this one' : 'Select'}
            </button>
          ) : (
            <button className="primary" onClick={buy} disabled={locked || s.money < v.price}>
              {locked ? 'Locked' : `Buy $${v.price.toLocaleString()}`}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
