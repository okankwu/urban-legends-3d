import { useGame } from '../store/game'
import { rt } from '../engine/runtime'
import { carPositions } from '../traffic/Traffic'
import { banner, forceExit, teleportCar, teleportPlayer } from '../missions/actions'
import { failCurrent } from '../missions/manager'
import { GARAGES } from '../garage/garages'
import { sfx } from '../engine/audio'

/** Module state for the wanted system; the police cars themselves live in the traffic simulation. */
export const wantedState = {
  /** seconds since a police car last had eyes on the player */
  unseen: 0,
  /** seconds the player has been caught up with */
  cuffed: 0,
  /** per-reason star caps so a single mistake cannot max out the level */
  capped: { ped: 0, crash: 0 },
}

export function addWanted(n: number, reason: 'ped' | 'crash' | 'ram', max = 5) {
  const st = useGame.getState()
  const cap = reason === 'ped' ? 3 : reason === 'crash' ? 2 : 5
  if (reason !== 'ram' && st.wanted >= Math.min(cap, max)) {
    wantedState.unseen = 0
    return
  }
  const next = Math.min(5, st.wanted + n)
  if (next > st.wanted) {
    st.set({ wanted: next })
    banner('info', 'Wanted level ' + next, reason === 'ped' ? 'You hit a pedestrian' : reason === 'crash' ? 'Reckless driving' : 'Police are after you')
  }
  wantedState.unseen = 0
}

/** Called by the player's car when it slows suddenly: crashing into traffic is a crime. */
export function reportCrash(drop: number) {
  if (drop < 6) return
  for (const c of carPositions) {
    if (!c.act) continue
    if (Math.hypot(c.x - rt.vehiclePos.x, c.z - rt.vehiclePos.z) < 5.5) {
      addWanted(1, 'crash')
      return
    }
  }
}

interface PoliceCar {
  x: number
  z: number
  on?: boolean
}

export function policeProximity(): number {
  const st = useGame.getState()
  if (st.wanted <= 0) return 0
  let best = 1e9
  for (const c of carPositions) {
    if (c.police && c.on && c.act) best = Math.min(best, Math.hypot(c.x - rt.vehiclePos.x, c.z - rt.vehiclePos.z))
  }
  return Math.max(0, Math.min(1, 1 - best / 130))
}

function busted() {
  const st = useGame.getState()
  const fine = Math.min(st.money, 150 + 100 * st.wanted)
  st.set({ money: st.money - fine, wanted: 0, searching: false })
  wantedState.cuffed = 0
  wantedState.unseen = 0
  banner('fail', 'BUSTED', `Fined $${fine}. You were released at the Central Garage.`)
  sfx('deny')
  const g = GARAGES[0]
  forceExit(g.x, g.z)
  teleportPlayer(g.x, 1.5, g.z)
  teleportCar(g.exit.x, g.exit.z, g.exit.yaw)
  failCurrent('Arrested by the police')
}

/** Escape / arrest logic, run once per frame from the traffic simulation. */
export function updateWanted(dt: number, police: PoliceCar[], px: number, pz: number) {
  const st = useGame.getState()
  if (st.wanted <= 0) {
    wantedState.unseen = 0
    wantedState.cuffed = 0
    if (st.searching) st.set({ searching: false })
    return
  }
  const speed = st.inVehicle ? rt.vehicleSpeed : rt.walkSpeed
  let nearest = 1e9
  for (const c of police) if (c.on) nearest = Math.min(nearest, Math.hypot(c.x - px, c.z - pz))

  const hidden = !!st.inShop
  if (nearest < 70 && !hidden) wantedState.unseen = 0
  else wantedState.unseen += dt * (hidden ? 3 : 1)
  const searching = wantedState.unseen > 3
  if (searching !== st.searching) st.set({ searching })
  if (wantedState.unseen > 20) {
    // lost them: drop a star, keep looking for a while if still wanted
    const w = st.wanted - 1
    wantedState.unseen = 8
    st.set({ wanted: w })
    if (w === 0) {
      banner('info', 'Wanted level lost', 'You got away')
      st.set({ searching: false })
    }
  }

  const catchR = st.inVehicle ? 5.8 : 14
  if (nearest < catchR && speed < 6) wantedState.cuffed += dt
  else wantedState.cuffed = Math.max(0, wantedState.cuffed - dt * 2)
  if (wantedState.cuffed > 3) busted()
}
