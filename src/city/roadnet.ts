import { CELL, ROAD_W } from './layout'
import { rt } from '../engine/runtime'

/** Distance of a lane centre from the road centre line. */
export const LANE = 4
/** Pedestrian sidewalk line: distance from a block centre. Corner nodes sit this far from the intersection. */
export const WALK = 28.8
export const CORNER = CELL / 2 - WALK // 11.2 from the intersection centre
export const STOP_DIST = ROAD_W / 2 + 3 // stop line distance before an intersection centre

export type LightColor = 'green' | 'yellow' | 'red'

const CYCLE = 24

/** Signal for traffic travelling along `axis` ('x' = east/west road) at intersection (a, b). */
export function lightState(axis: 'x' | 'z', a: number, b: number, t = rt.simTime): LightColor {
  const off = (((a * 7 + b * 13) % CYCLE) + CYCLE) % CYCLE
  let p = (t + off) % CYCLE
  if (axis === 'z') p = (p + 12) % CYCLE
  if (p < 9) return 'green'
  if (p < 11) return 'yellow'
  return 'red'
}

/** Highest road index traffic and pedestrians may use: 3 while the outer districts are locked, 4 once open. */
let roadLimit = 3
export const setRoadLimit = (v: number) => {
  roadLimit = v
}
export const roadMax = () => roadLimit
export const inRoads = (i: number) => i >= -roadLimit && i <= roadLimit
export const inBlocks = (i: number) => i >= -roadLimit && i < roadLimit

/** Shared positions of people in the road so traffic can yield. */
export const pedSpots: { x: number; z: number; active: boolean }[] = []

export const RNG = (seed: number) => {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Seconds of red left for `axis` at intersection (a, b); 0 when not red. */
export function redRemaining(axis: 'x' | 'z', a: number, b: number, t = rt.simTime): number {
  const off = (((a * 7 + b * 13) % CYCLE) + CYCLE) % CYCLE
  let p = (t + off) % CYCLE
  if (axis === 'z') p = (p + 12) % CYCLE
  return p < 11 ? 0 : CYCLE - p
}
