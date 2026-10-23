import { CELL, ROAD_W } from '../city/layout'
import { RNG } from '../city/roadnet'
import { GRID } from '../missions/Race'
import { curbPoint, describePlace, limit } from './roadGraph'
import type { Pt } from './roadGraph'
import { planRoute } from './gps'
import { MIN_LEVEL } from './rewards'
import type { JobDef, JobType, Place, Stage } from './types'

/**
 * MissionDefinition factory: builds taxi / delivery / long-distance / emergency / parking / race jobs on the
 * real road graph. Every definition carries a unique `uid`, which the reward system records once it pays out.
 */
const NAMES = ['Alex', 'Sam', 'Jordan', 'Riley', 'Casey', 'Morgan', 'Taylor', 'Jamie', 'Robin', 'Quinn', 'Avery', 'Noor']
const BAY_LAT = 6.2

let counter = 0
const newUid = (type: JobType) => `${type}-${Date.now().toString(36)}-${(counter++).toString(36)}`
const round10 = (v: number) => Math.round(v / 10) * 10
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/** Fixed landmarks (all on kerbs of open roads). */
export const LANDMARKS = {
  warehouses: [
    { ...curbPoint(-2, -3, false, 0.5, 1), label: 'Harbor Warehouse' },
    { ...curbPoint(2, -1, true, 0.5, -1), label: 'Eastside Depot' },
    { ...curbPoint(0, 2, false, 0.5, 1), label: 'Central Freight' },
  ] as Place[],
  hospital: { ...curbPoint(1, 0, true, 0.5, 1), label: 'City General Hospital' } as Place,
  fire: { ...curbPoint(-1, -1, false, 0.5, -1), label: 'Fire Station 7' } as Place,
}

function curbPlace(rng: () => number, avoid: Pt[] = [], minGap = 120): Place {
  const L = limit()
  for (let tries = 0; tries < 40; tries++) {
    const alongZ = rng() < 0.5
    const a = Math.floor(rng() * (2 * L + 1)) - L
    const b = Math.floor(rng() * (2 * L)) - L
    const t = 0.3 + rng() * 0.4
    const side: 1 | -1 = rng() < 0.5 ? 1 : -1
    const p = alongZ ? curbPoint(a, b, true, t, side) : curbPoint(b, a, false, t, side)
    if (avoid.every((q) => Math.hypot(q.x - p.x, q.z - p.z) > minGap)) return { ...p, label: describePlace(p.x, p.z) }
  }
  const p = curbPoint(0, 0, true, 0.5, 1)
  return { ...p, label: describePlace(p.x, p.z) }
}

const stage = (kind: Stage['kind'], at: Place, r: number, text: string): Stage => ({ kind, at, r, text })

function lenBetween(a: Pt, b: Pt): number {
  return planRoute(a, null, b)?.length ?? Math.hypot(a.x - b.x, a.z - b.z) * 1.3
}

export interface OfferCtx {
  /** where the player is (used to keep pickups and long trips sensible) */
  from: Pt
  seed: number
}

export function buildJob(type: JobType, ctx: OfferCtx, variant = 0): JobDef {
  const rng = RNG(ctx.seed * 7919 + variant * 104729 + type.length * 31)
  const uid = newUid(type)
  const base = { uid, type, minLevel: MIN_LEVEL[type] }

  if (type === 'taxi') {
    const who = NAMES[Math.floor(rng() * NAMES.length)]
    const pick = curbPlace(rng, [ctx.from], 70)
    let dest = curbPlace(rng, [pick], 280)
    let len = lenBetween(pick, dest)
    for (let k = 0; k < 6 && len < 260; k++) {
      dest = curbPlace(rng, [pick], 320)
      len = lenBetween(pick, dest)
    }
    const par = len / 10 + 28
    const pay = clamp(round10(70 + len * 0.17), 100, 300)
    return {
      ...base,
      title: `Taxi fare: ${who}`,
      desc: `${who} is waiting at ${pick.label} and needs a ride to ${dest.label}.`,
      start: pick,
      dest,
      stages: [stage('pickup', pick, 7, `Pick up ${who} (${pick.label})`), stage('dropoff', dest, 8, `Drive ${who} to ${dest.label}`)],
      routeLen: len,
      parSec: par,
      limitSec: null,
      base: pay,
      baseMin: 100,
      baseMax: 300,
      difficulty: len > 700 ? 2 : 1,
    }
  }

  if (type === 'delivery') {
    const wh = LANDMARKS.warehouses[Math.floor(rng() * LANDMARKS.warehouses.length)]
    let dest = curbPlace(rng, [wh], 260)
    let len = lenBetween(wh, dest)
    for (let k = 0; k < 6 && len < 300; k++) {
      dest = curbPlace(rng, [wh], 320)
      len = lenBetween(wh, dest)
    }
    const par = len / 11 + 32
    return {
      ...base,
      title: `Package from ${wh.label}`,
      desc: `Collect a package at ${wh.label} and deliver it to ${dest.label} before the timer runs out.`,
      start: wh,
      dest,
      stages: [stage('pickup', wh, 7, `Collect the package at ${wh.label}`), stage('dropoff', dest, 8, `Deliver the package to ${dest.label}`)],
      routeLen: len,
      parSec: par,
      limitSec: Math.round(par * 1.6),
      base: clamp(round10(110 + len * 0.28), 150, 400),
      baseMin: 150,
      baseMax: 400,
      difficulty: len > 650 ? 3 : 2,
    }
  }

  if (type === 'longdistance') {
    const pts: Place[] = []
    const first = curbPlace(rng, [ctx.from], 220)
    pts.push(first)
    for (let n = 0; n < 3; n++) pts.push(curbPlace(rng, pts, 260))
    let len = 0
    for (let k = 1; k < pts.length; k++) len += lenBetween(pts[k - 1], pts[k])
    const stages: Stage[] = [
      stage('checkpoint', pts[0], 14, `Head to the first checkpoint: ${pts[0].label}`),
      stage('checkpoint', pts[1], 14, `Checkpoint 2: ${pts[1].label}`),
      stage('checkpoint', pts[2], 14, `Checkpoint 3: ${pts[2].label}`),
      stage('dropoff', pts[3], 9, `Reach the destination: ${pts[3].label}`),
    ]
    // the clock starts at once, so the drive to the first checkpoint counts too
    const par = (len + lenBetween(ctx.from, pts[0])) / 12 + 40
    return {
      ...base,
      title: `Long haul to ${pts[3].label}`,
      desc: `A long trip across the city through three checkpoints, finishing at ${pts[3].label}.`,
      start: pts[0],
      dest: pts[3],
      stages,
      routeLen: len,
      parSec: par,
      limitSec: Math.round(par * 2),
      base: clamp(round10(120 + len * 0.2), 200, 600),
      baseMin: 200,
      baseMax: 600,
      difficulty: 3,
    }
  }

  if (type === 'emergency') {
    const kind = Math.floor(rng() * 3)
    let s: Stage[]
    let title: string
    let desc: string
    let start: Place
    let dest: Place
    let len: number
    if (kind === 0) {
      const p = curbPlace(rng, [ctx.from], 150)
      start = p
      dest = { ...LANDMARKS.hospital }
      len = lenBetween(p, dest)
      title = 'Ambulance run: patient to hospital'
      desc = `A patient needs urgent transport from ${p.label} to ${dest.label}. Drive fast but safe.`
      s = [stage('pickup', p, 7, `Pick up the patient (${p.label})`), stage('dropoff', dest, 9, `Rush the patient to ${dest.label}`)]
    } else if (kind === 1) {
      const depot = LANDMARKS.warehouses[Math.floor(rng() * LANDMARKS.warehouses.length)]
      const inc = curbPlace(rng, [depot], 300)
      start = depot
      dest = inc
      len = lenBetween(depot, inc)
      title = 'Emergency supplies'
      desc = `Collect medical supplies at ${depot.label} and deliver them to the incident at ${inc.label}.`
      s = [stage('pickup', depot, 7, `Collect emergency supplies (${depot.label})`), stage('dropoff', inc, 9, `Deliver supplies to ${inc.label}`)]
    } else {
      const inc = curbPlace(rng, [LANDMARKS.fire], 320)
      start = { ...LANDMARKS.fire }
      dest = inc
      len = lenBetween(LANDMARKS.fire, inc)
      title = 'Fire support'
      desc = `Pick up the crew at ${LANDMARKS.fire.label} and bring them to the fire at ${inc.label}.`
      s = [stage('pickup', LANDMARKS.fire, 7, `Load the fire crew (${LANDMARKS.fire.label})`), stage('hold', inc, 9, `Get to the fire at ${inc.label} and hold position`)]
    }
    const par = len / 13 + 18
    return {
      ...base,
      title,
      desc,
      start,
      dest,
      stages: s,
      routeLen: len,
      parSec: par,
      limitSec: Math.round(par * 1.5),
      base: clamp(round10(300 + len * 0.35), 300, 700),
      baseMin: 300,
      baseMax: 700,
      difficulty: 3,
      holdSec: 4,
    }
  }

  if (type === 'parking') {
    const diff = (1 + Math.floor(rng() * 3)) as 1 | 2 | 3
    const L = limit()
    const alongZ = rng() < 0.5
    const a = Math.floor(rng() * (2 * L + 1)) - L
    const b = Math.floor(rng() * (2 * L)) - L
    const side = rng() < 0.5 ? 1 : -1
    const t = 0.5
    const x = alongZ ? a * CELL + side * BAY_LAT : (b + t) * CELL
    const z = alongZ ? (b + t) * CELL : a * CELL + side * BAY_LAT
    const place: Place = { x, z, label: describePlace(x, z) }
    const len = [6.8, 6.0, 5.4][diff - 1]
    const wid = [3.0, 2.8, 2.6][diff - 1]
    // keep it a real drive away from the player
    const d = Math.hypot(x - ctx.from.x, z - ctx.from.z)
    const par = (d > 80 ? lenBetween(ctx.from, place) : 60) / 10 + 30
    return {
      ...base,
      title: ['Easy bay', 'Tight bay', 'Squeeze bay'][diff - 1] + ` on ${place.label}`,
      desc: `Drive to the marked bay on ${place.label} and park inside it, straight and without bumping anything.`,
      start: place,
      dest: place,
      stages: [stage('goto', place, 18, `Drive to the parking bay (${place.label})`), stage('park', place, 3, 'Park inside the bay and stop')],
      routeLen: d,
      parSec: par,
      limitSec: null,
      base: [90, 120, 135][diff - 1],
      baseMin: 50,
      baseMax: 200,
      difficulty: diff,
      bay: { x, z, yaw: alongZ ? 0 : Math.PI / 2, len, wid },
    }
  }

  // race (level 5)
  const place: Place = { ...GRID, label: 'Downtown ring start grid' }
  return {
    ...base,
    title: 'Downtown ring street race',
    desc: 'An organised street-circuit race against three AI drivers. Pass every checkpoint. 1st place pays 1,000 points.',
    start: place,
    dest: place,
    stages: [stage('goto', place, 9, 'Drive to the start grid'), stage('race', place, 0, 'Race!')],
    routeLen: 1400,
    parSec: 110,
    limitSec: null,
    base: 1000,
    baseMin: 300,
    baseMax: 1000,
    difficulty: 3,
  }
}

export const OFFER_TYPES: JobType[] = ['taxi', 'taxi', 'delivery', 'delivery', 'parking', 'longdistance', 'emergency', 'race']

export function makeOffers(from: Pt, seed: number): JobDef[] {
  return OFFER_TYPES.map((t, i) => buildJob(t, { from, seed }, i))
}

export const BAY_LAT_OFFSET = BAY_LAT
export const ROAD_HALF = ROAD_W / 2
