import { useState } from 'react'
import { useGame, useGameFields } from '../store/game'
import { PAINTS, SPECS, spec as specOf } from '../vehicles/specs'
import { lockPointer } from '../engine/input'
import { sfx } from '../engine/audio'
import { rt } from '../engine/runtime'
import { forceExit, teleportCar, teleportPlayer } from '../missions/actions'
import { toast } from '../shops/ShopUI'
import { garage as garageById } from './garages'

type Tab = 'mine' | 'repair' | 'paint' | 'buy'

/** Garage overlay: store and swap vehicles, repair, repaint, buy new ones. */
export default function GarageUI() {
  const s = useGameFields(['phase', 'garageId', 'currentVehicle', 'vehicleHealth', 'money', 'ownedVehicles', 'paint', 'unlocks', 'set'] as const)
  const [tab, setTab] = useState<Tab>('mine')
  if (s.phase !== 'garage') return null
  const gar = garageById(s.garageId)
  if (!gar) return null
  const cur = specOf(s.currentVehicle)
  const repairCost = Math.ceil((100 - s.vehicleHealth) * 3)

  const close = () => {
    s.set({ phase: 'playing' })
    lockPointer()
  }

  /** Puts the chosen vehicle on the road outside and the player on the kerb beside the pad. */
  const bring = (id: string) => {
    forceExit(gar.x, gar.z)
    teleportPlayer(gar.x, 1.5, gar.z)
    if (id === s.currentVehicle) {
      teleportCar(gar.exit.x, gar.exit.z, gar.exit.yaw)
    } else {
      rt.vehicleSpawn = gar.exit
      s.set({ currentVehicle: id, vehicleHealth: id === 'subaru' ? s.vehicleHealth : 100 })
    }
  }

  const buy = (id: string) => {
    const sp = specOf(id)
    const st = useGame.getState()
    if (sp.locked && !st.unlocks.includes(sp.locked)) return toast('Locked — finish "Build Your Reputation"')
    if (st.money < sp.price) {
      sfx('deny')
      return toast('Not enough money')
    }
    st.set({ money: st.money - sp.price, ownedVehicles: [...st.ownedVehicles, id] })
    sfx('buy')
    toast(`Purchased ${sp.name}`)
  }

  return (
    <div className="menu shop-ui" role="dialog" aria-label={gar.name}>
      <div className="menu-card" style={{ width: 'min(560px, 94vw)' }}>
        <h1 style={{ fontSize: 28 }}>{gar.name}</h1>
        <p className="sub">Cash ${s.money} · Current: {cur.name} ({Math.round(s.vehicleHealth)}% condition)</p>
        <div className="panel">
          <div className="tabs" role="tablist">
            {(
              [
                ['mine', 'My vehicles'],
                ['repair', 'Repair'],
                ['paint', 'Paint'],
                ['buy', 'Dealership'],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'mine' &&
            SPECS.filter((v) => s.ownedVehicles.includes(v.id)).map((v) => (
              <button key={v.id} className="shop-line" onClick={() => { bring(v.id); close() }}>
                <span>
                  {v.name} <small style={{ color: 'var(--muted)' }}>· {v.cls}{v.id === s.currentVehicle ? ' · in use' : ''}</small>
                </span>
                <b>Take out</b>
              </button>
            ))}

          {tab === 'repair' && (
            <>
              <div className="shop-money">Condition {Math.round(s.vehicleHealth)}% — full repair costs <b>${repairCost}</b></div>
              <button
                className="shop-line"
                disabled={repairCost === 0}
                onClick={() => {
                  if (s.money < repairCost) return toast('Not enough money')
                  s.set({ money: s.money - repairCost, vehicleHealth: 100 })
                  sfx('buy')
                  toast('Vehicle repaired')
                }}
              >
                <span>Repair {cur.name}</span>
                <b>${repairCost}</b>
              </button>
            </>
          )}

          {tab === 'paint' &&
            (s.currentVehicle === 'subaru' ? (
              <div className="shop-money">The Impreza keeps its factory blue (its model has a baked paint job). Paint the other vehicles here.</div>
            ) : (
              <>
                <div className="shop-money">Respray {cur.name} — $300 (the vehicle is taken out afterwards)</div>
                <div className="swatches">
                  {PAINTS.map((c) => (
                    <button
                      key={c}
                      className={'swatch' + ((s.paint[s.currentVehicle] ?? cur.defaultColor) === c ? ' on' : '')}
                      style={{ background: c }}
                      aria-label={'Paint ' + c}
                      onClick={() => {
                        if (s.money < 300) return toast('Not enough money')
                        rt.vehicleSpawn = gar.exit
                        forceExit(gar.x, gar.z)
                        teleportPlayer(gar.x, 1.5, gar.z)
                        s.set({ money: s.money - 300, paint: { ...s.paint, [s.currentVehicle]: c } })
                        sfx('buy')
                        close()
                      }}
                    />
                  ))}
                </div>
              </>
            ))}

          {tab === 'buy' &&
            SPECS.filter((v) => !s.ownedVehicles.includes(v.id)).map((v) => {
              const locked = !!v.locked && !s.unlocks.includes(v.locked)
              return (
                <button key={v.id} className="shop-line" onClick={() => buy(v.id)} disabled={locked}>
                  <span>
                    {v.name} <small style={{ color: 'var(--muted)' }}>· {v.cls} · {v.blurb}</small>
                  </span>
                  <b>{locked ? 'Locked' : `$${v.price.toLocaleString()}`}</b>
                </button>
              )
            })}
          {tab === 'buy' && SPECS.every((v) => s.ownedVehicles.includes(v.id)) && <div className="shop-money">You own every vehicle.</div>}

          <button className="primary" onClick={close}>Leave garage</button>
        </div>
      </div>
    </div>
  )
}
