import { CELL, ROAD_MAX, ROAD_MIN, ROAD_W } from '../city/layout'
import { roadMax } from '../city/roadnet'

/**
 * CityRoadGraph: the city's streets as a graph. Intersections sit at (i * CELL, j * CELL) and every pair of
 * neighbouring intersections is joined by one two-way road segment (the same grid City.tsx renders and the
 * traffic AI drives on). Districts that are still locked are excluded, so routes never leave the open city.
 */
export interface Pt {
  x: number
  z: number
}
export interface GridNode {
  i: number
  j: number
}
/** A point on a road segment: the segment runs between nodes a and b (a = lower index) and t is 0..1 along it. */
export interface RoadPoint extends Pt {
  a: GridNode
  b: GridNode
  t: number
  /** true when the segment runs along the z axis (a north-south street) */
  alongZ: boolean
  /** distance from the original query position to this point */
  off: number
}

export const NS_NAMES = ['Birch', 'Cedar', 'Elm', 'Maple', 'Oak', 'Pine', 'Spruce', 'Willow', 'Aspen']
export const EW_NAMES = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']

/** Highest usable road index right now (3 while the outer districts are locked). */
export const limit = () => Math.min(roadMax(), ROAD_MAX)
export const nodePos = (i: number, j: number): Pt => ({ x: i * CELL, z: j * CELL })
export const inGraph = (i: number, j: number) => Math.abs(i) <= limit() && Math.abs(j) <= limit()

/** Name of the street that runs through grid line index k. alongZ = a north-south street (constant x). */
export const streetName = (alongZ: boolean, k: number) =>
  alongZ ? `${NS_NAMES[k - ROAD_MIN] ?? 'Birch'} Ave` : `${EW_NAMES[k - ROAD_MIN] ?? '1st'} St`

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Snaps a world position onto the closest drivable road centre line. */
export function snapToRoad(x: number, z: number): RoadPoint {
  const L = limit()
  // candidate on the north-south road nearest in x, and the east-west road nearest in z
  const iv = clamp(Math.round(x / CELL), -L, L)
  const jh = clamp(Math.round(z / CELL), -L, L)
  const vz = clamp(z, -L * CELL, L * CELL)
  const hx = clamp(x, -L * CELL, L * CELL)
  const dv = Math.hypot(x - iv * CELL, z - vz)
  const dh = Math.hypot(x - hx, z - jh * CELL)
  if (dv <= dh) {
    const k = clamp(Math.floor(vz / CELL), -L, L - 1)
    return { x: iv * CELL, z: vz, a: { i: iv, j: k }, b: { i: iv, j: k + 1 }, t: (vz - k * CELL) / CELL, alongZ: true, off: dv }
  }
  const k = clamp(Math.floor(hx / CELL), -L, L - 1)
  return { x: hx, z: jh * CELL, a: { i: k, j: jh }, b: { i: k + 1, j: jh }, t: (hx - k * CELL) / CELL, alongZ: false, off: dh }
}

/** Cross-street description such as "Oak Ave near 3rd St" for the nearest road to a position. */
export function describePlace(x: number, z: number): string {
  const L = limit()
  const p = snapToRoad(x, z)
  const road = p.alongZ ? streetName(true, p.a.i) : streetName(false, p.a.j)
  const cross = p.alongZ ? clamp(Math.round(p.z / CELL), -L, L) : clamp(Math.round(p.x / CELL), -L, L)
  const crossName = p.alongZ ? streetName(false, cross) : streetName(true, cross)
  return `${road} near ${crossName}`
}

/** A kerbside point on the right-hand side of a road segment (where passengers and parcels wait). */
export function curbPoint(i: number, j: number, alongZ: boolean, t: number, side: 1 | -1): Pt {
  const lat = ROAD_W / 2 - 1.6
  if (alongZ) return { x: i * CELL + side * lat, z: (j + t) * CELL }
  return { x: (i + t) * CELL, z: j * CELL + side * lat }
}

export const graph = { limit, snapToRoad, nodePos, streetName }
