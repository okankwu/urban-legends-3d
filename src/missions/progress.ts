import { useGame } from '../store/game'
import { rt } from '../engine/runtime'

const KEY = 'ul3d.progress.v1'

export interface Progress {
  money: number
  health: number
  completed: string[]
  earnedTotal: number
  jobsDone: number
  reputation: number
  unlocks: string[]
  hour: number
  resume: { id: string; step: number } | null
  player: { x: number; y: number; z: number } | null
  car: { x: number; y: number; z: number; yaw: number } | null
  inShop: string | null
  ownedVehicles?: string[]
  currentVehicle?: string
  paint?: Record<string, string>
}

export function loadProgress(): Progress | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Progress) : null
  } catch {
    return null
  }
}

export function clearProgress() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* storage unavailable */
  }
}

/** Writes money, mission state, positions and time of day. Returns false if storage failed. */
export function saveProgress(resume: { id: string; step: number } | null): boolean {
  const s = useGame.getState()
  const p: Progress = {
    money: s.money,
    health: s.health,
    completed: s.completed,
    earnedTotal: s.earnedTotal,
    jobsDone: s.jobsDone,
    reputation: s.reputation,
    unlocks: s.unlocks,
    hour: s.hour,
    resume,
    // inside a shop the position is the shared interior; fall back to the spawn on load
    player: s.inShop ? null : { x: rt.playerPos.x, y: rt.playerPos.y + 0.6, z: rt.playerPos.z },
    car: { x: rt.vehiclePos.x, y: rt.vehiclePos.y + 0.3, z: rt.vehiclePos.z, yaw: rt.vehicleYaw },
    inShop: null,
    ownedVehicles: s.ownedVehicles,
    currentVehicle: s.currentVehicle,
    paint: s.paint,
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
    return true
  } catch {
    return false
  }
}
