import { useGame } from '../store/game'
import { rt } from '../engine/runtime'
import { normalizeDriver } from '../driver/rewards'
import type { DriverData } from '../driver/rewards'
import { SPECS } from '../vehicles/specs'
import { hexColor, int, isObj, num, parseStored, point, str, strArr } from '../security'

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
  driver?: DriverData
}

const VEHICLE_IDS = SPECS.map((s) => s.id as string)

/** Validates a saved game (localStorage is editable): returns a clean Progress with every field bounded, or null. */
export function sanitizeProgress(r: Record<string, unknown> | null): Progress | null {
  if (!r) return null
  const owned = strArr(r.ownedVehicles, 12, 20).filter((id) => VEHICLE_IDS.includes(id))
  if (!owned.includes('subaru')) owned.unshift('subaru')
  const paint: Record<string, string> = {}
  if (isObj(r.paint)) for (const id of VEHICLE_IDS) if (hexColor(r.paint[id])) paint[id] = r.paint[id] as string
  const car = point(r.car)
  const player = point(r.player)
  return {
    money: int(r.money, 0, 1_000_000_000, 500),
    health: num(r.health, 1, 100, 100),
    completed: strArr(r.completed, 40, 40),
    earnedTotal: int(r.earnedTotal, 0, 10_000_000_000, 0),
    jobsDone: int(r.jobsDone, 0, 1_000_000, 0),
    reputation: int(r.reputation, 0, 1_000_000, 0),
    unlocks: strArr(r.unlocks, 30, 40),
    hour: num(r.hour, 0, 24, 9),
    resume: isObj(r.resume) && typeof r.resume.id === 'string' ? { id: str(r.resume.id, 40), step: int(r.resume.step, 0, 100, 0) } : null,
    player,
    car: car ? { ...car, yaw: num(isObj(r.car) ? r.car.yaw : 0, -10, 10, 0) } : null,
    inShop: null,
    ownedVehicles: owned,
    currentVehicle: VEHICLE_IDS.includes(r.currentVehicle as string) && owned.includes(r.currentVehicle as string) ? (r.currentVehicle as string) : 'subaru',
    paint,
    driver: normalizeDriver(r.driver),
  }
}

export function loadProgress(): Progress | null {
  try {
    return sanitizeProgress(parseStored(localStorage.getItem(KEY)))
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
    driver: s.driver,
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
    return true
  } catch {
    return false
  }
}
