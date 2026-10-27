import { consumePressed, rt } from '../engine/runtime'
import { useGame } from '../store/game'
import { sfx } from '../engine/audio'
import { banner, failHooks, resetHooks } from '../missions/actions'
import { abandon as pauseStory, saveGame } from '../missions/manager'
import { CHECKPOINTS, race, raceMarkers, startRace, stopRace, tickRace } from '../missions/Race'
import type { Marker } from '../missions/types'
import { gps, resetRouteStats, setNavTarget } from './gps'
import { ACHIEVEMENTS, CHALLENGES, defaultDriver, levelOf, levelProgress, todayKey, withToday } from './rewards'
import type { DriverData, HistoryEntry } from './rewards'
import type { BonusLine, JobDef, JobHud, JobResult, Stage } from './types'

/**
 * DriverMissionManager + MissionProgressTracker.
 * One main driver job runs at a time. The tracker watches position, speed, damage, route adherence and the
 * clock; when the last stage finishes the reward is paid exactly once (`paid` flag + the claimed-uid list).
 */
interface Run {
  job: JobDef
  stage: number
  /** seconds since accepted */
  t: number
  /** seconds in the timed part of the job (after the pickup, when there is one) */
  tm: number
  /** first stage index that counts against the clock */
  timedFrom: number
  hits: number
  dmg: number
  lastHealth: number
  wantedSeen: boolean
  holdT: number
  parkT: number
  paid: boolean
  /** parking accuracy 0..100 measured at the moment the car settles in the bay */
  accuracy: number
  placed: number
}

let run: Run | null = null
let lastSig = ''
let hitCooldown = 0

export const getRun = () => run
export const activeJob = () => run?.job ?? null

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const st = () => useGame.getState()

// ---- accepting / ending ------------------------------------------------------------------------------------
export function canAccept(job: JobDef): string | null {
  const s = st()
  const lvl = levelOf(s.driver.xp).level
  if (lvl < job.minLevel) return `Requires driver level ${job.minLevel}`
  if (run) return 'Finish or abandon your current driver job first'
  if (s.vehicleHealth <= 0) return 'Your vehicle is wrecked. Repair it first'
  if (s.driver.claimed.includes(job.uid)) return 'This job was already completed'
  return null
}

export function acceptJob(job: JobDef): string | null {
  const why = canAccept(job)
  if (why) return why
  // a running story mission (or courier job) is set aside; its hub marker restarts it later
  const sm = st().mission
  if (sm && sm.id !== 'reputation') {
    pauseStory()
    banner('info', 'Story mission paused', 'Return to its marker to restart it')
  }
  run = { job, stage: 0, t: 0, tm: 0, timedFrom: Math.max(0, job.stages.findIndex((x) => x.kind === 'pickup') + 1), hits: 0, dmg: 0, lastHealth: st().vehicleHealth, wantedSeen: st().wanted > 0, holdT: 0, parkT: 0, paid: false, accuracy: 0, placed: 0 }
  resetRouteStats()
  hitCooldown = 0
  banner('info', 'Driver job accepted', job.title)
  sfx('toast')
  enterStage()
  return null
}

function clearRun() {
  if (run?.job.type === 'race') stopRace()
  run = null
  lastSig = ''
  rt.driverInteract = false
  setNavTarget(null)
  st().set({ djJob: null, djMarkers: [], djPrompt: '' })
}

export function abandonJob() {
  if (!run) return
  breakStreak()
  banner('fail', 'JOB ABANDONED', 'No points awarded')
  clearRun()
  saveGame()
}

function failJob(why: string) {
  if (!run) return
  breakStreak(true)
  banner('fail', 'JOB FAILED', `${why} — no points awarded`)
  sfx('deny')
  clearRun()
  saveGame()
}

function breakStreak(failed = false) {
  const d = st().driver
  st().set({ driver: { ...d, streak: 0, stats: { ...d.stats, failed: d.stats.failed + (failed ? 1 : 0) } } })
}

failHooks.push((why) => failJob(why))
resetHooks.push(() => {
  if (run) clearRun()
  st().set({ driver: defaultDriver(), djResult: null, gpsExpanded: false })
})

// ---- stages ---------------------------------------------------------------------------------------------------
function stageMarkers(r: Run): Marker[] {
  const s = r.job.stages[r.stage]
  if (s.kind === 'race') return raceMarkers()
  const out: Marker[] = []
  if (s.kind === 'checkpoint') {
    out.push({ x: s.at.x, z: s.at.z, kind: 'goal', label: 'Checkpoint', r: s.r })
    // preview the later checkpoints on the map
    for (let k = r.stage + 1; k < r.job.stages.length; k++) {
      const n = r.job.stages[k]
      out.push({ x: n.at.x, z: n.at.z, kind: n.kind === 'checkpoint' ? 'goal' : 'cp', label: n.kind === 'checkpoint' ? 'Checkpoint' : 'Destination', r: 3 })
    }
    return out
  }
  const kind = s.kind === 'pickup' ? 'pickup' : 'cp'
  const label = s.kind === 'pickup' ? 'Pickup' : s.kind === 'park' ? 'Parking bay' : 'Drop-off'
  out.push({ x: s.at.x, z: s.at.z, kind, label, r: Math.max(3, Math.min(s.r, 9)) })
  // while heading to a pickup, the drop-off is already on the map (red pickup pin, green drop-off pin)
  if (s.kind === 'pickup') {
    const drop = r.job.stages.find((q, k) => k > r.stage && (q.kind === 'dropoff' || q.kind === 'hold'))
    if (drop) out.push({ x: drop.at.x, z: drop.at.z, kind: 'cp', label: 'Drop-off', r: Math.max(3, Math.min(drop.r, 9)) })
  }
  return out
}

function enterStage() {
  const r = run
  if (!r) return
  const s = r.job.stages[r.stage]
  r.holdT = 0
  r.parkT = 0
  hudExtra = ''
  if (s.kind === 'race') {
    startRace()
    setNavTarget({ ...CHECKPOINTS[0], label: 'Checkpoint 1' })
  } else setNavTarget({ x: s.at.x, z: s.at.z, label: s.at.label })
  if (r.job.type === 'taxi' && s.kind === 'dropoff') st().set({ carrying: 'Passenger' })
  if (r.job.type === 'delivery' && s.kind === 'dropoff') st().set({ carrying: 'Package' })
  if (r.job.type === 'emergency' && s.kind !== 'pickup') st().set({ carrying: r.job.title.startsWith('Fire') ? 'Crew' : r.job.stages[0].text.includes('patient') ? 'Patient' : 'Supplies' })
  st().set({ djMarkers: stageMarkers(r) })
  sync(true)
}

function advance() {
  const r = run
  if (!r) return
  const s = r.job.stages[r.stage]
  if (s.kind === 'checkpoint') {
    banner('info', 'Checkpoint reached')
    sfx('toast')
  }
  r.stage++
  if (r.stage >= r.job.stages.length) return complete(r)
  enterStage()
}

function timerOf(r: Run): { v: number | null; label: string } {
  const lim = r.job.limitSec
  if (r.job.type === 'race' || r.stage < r.timedFrom) return { v: null, label: '' }
  if (lim != null) return { v: Math.max(0, Math.ceil(lim - r.tm)), label: 'TIME LEFT' }
  return { v: Math.max(0, Math.ceil(r.job.parSec - r.tm)), label: 'BONUS TIME' }
}

function hudText(r: Run, extra: string): string {
  const s = r.job.stages[r.stage]
  if (s.kind === 'race') {
    const rh = st().race
    return !rh ? s.text : rh.state === 'countdown' ? 'Get ready…' : `Race! Checkpoint ${Math.min(rh.cp + 1, rh.cps)}/${rh.cps} · Position ${rh.place}/${rh.total}`
  }
  return extra ? `${s.text} — ${extra}` : s.text
}

let hudExtra = ''
function sync(force = false) {
  const r = run
  if (!r) return
  const tm = timerOf(r)
  const text = hudText(r, hudExtra)
  const prompt = st().djPrompt
  const sig = `${r.job.uid}|${r.stage}|${text}|${tm.v}|${prompt}`
  if (!force && sig === lastSig) return
  lastSig = sig
  const hud: JobHud = {
    uid: r.job.uid,
    type: r.job.type,
    title: r.job.title,
    text,
    stage: r.stage,
    stages: r.job.stages.length,
    timer: tm.v,
    timerLabel: tm.label,
    passenger: r.job.type === 'taxi' ? r.job.title.replace('Taxi fare: ', '') : '',
  }
  st().set({ djJob: hud })
}

// ---- per-frame tracker -------------------------------------------------------------------------------------
export function tickDriver(dt: number) {
  const r = run
  const s = st()
  if (!r) {
    if (rt.driverInteract) rt.driverInteract = false
    return
  }
  if (s.phase !== 'playing') return
  r.t += dt
  if (r.stage >= r.timedFrom) r.tm += dt
  hitCooldown -= dt
  if (s.wanted > 0) r.wantedSeen = true

  // damage accounting
  if (s.vehicleHealth < r.lastHealth - 0.5) {
    r.dmg += r.lastHealth - s.vehicleHealth
    if (hitCooldown <= 0) {
      r.hits++
      hitCooldown = 0.6
    }
  }
  r.lastHealth = s.vehicleHealth
  if (s.vehicleHealth <= 0) return failJob('Your vehicle was wrecked')
  if (r.job.limitSec != null && r.tm >= r.job.limitSec) return failJob('Time ran out')

  const inV = s.inVehicle
  const x = rt.vehiclePos.x
  const z = rt.vehiclePos.z
  const speed = rt.vehicleSpeed
  const stg: Stage = r.job.stages[r.stage]
  const d = Math.hypot(x - stg.at.x, z - stg.at.z)
  let prompt = ''
  let extra = ''
  let wantE = false

  switch (stg.kind) {
    case 'goto':
    case 'checkpoint':
      if (!inV) extra = 'get back in your vehicle'
      else if (d < stg.r) return advance()
      break
    case 'pickup':
      if (!inV) extra = 'get in your vehicle'
      else if (d < stg.r) {
        if (speed < 3) {
          wantE = true
          prompt = 'E  ' + (r.job.type === 'taxi' ? 'Pick up passenger' : r.job.type === 'delivery' ? 'Collect package' : r.job.stages[0].text.includes('patient') ? 'Load patient' : 'Load cargo')
          if (consumePressed('KeyE')) {
            sfx('door')
            return advance()
          }
        } else extra = 'stop the vehicle'
      }
      break
    case 'dropoff':
      if (!inV) extra = 'get back in your vehicle'
      else if (d < stg.r) {
        if (speed < 3.2) return advance()
        extra = 'slow down and stop'
        prompt = 'Stop here to drop off'
      }
      break
    case 'hold':
      if (!inV) extra = 'get back in your vehicle'
      else if (d < stg.r) {
        r.holdT += dt
        extra = `hold position ${Math.max(0, Math.ceil((r.job.holdSec ?? 4) - r.holdT))}s`
        if (r.holdT >= (r.job.holdSec ?? 4)) return advance()
      } else r.holdT = 0
      break
    case 'park':
      if (!inV) extra = 'get back in your vehicle'
      else if (r.job.bay) {
        const q = parkState(r.job.bay)
        if (q.inside) {
          extra = 'hold still to park'
          if (speed < 0.7) {
            r.parkT += dt
            if (r.parkT >= 1.2) {
              r.accuracy = q.accuracy
              return advance()
            }
          } else r.parkT = 0
        } else {
          r.parkT = 0
          extra = q.near ? 'line up inside the bay' : ''
        }
      }
      break
    case 'race': {
      const res = tickRace(dt, x, z)
      const cp = CHECKPOINTS[Math.min(race.cp, CHECKPOINTS.length - 1)]
      setNavTarget({ x: cp.x, z: cp.z, label: `Checkpoint ${Math.min(race.cp + 1, CHECKPOINTS.length)}` })
      if (res === 'done') {
        r.placed = race.finishPlace
        return advance()
      }
      if (res === 'fail') return failJob('Your car was wrecked')
      st().set({ djMarkers: raceMarkers() })
      break
    }
  }
  rt.driverInteract = wantE
  hudExtra = extra
  if (prompt !== s.djPrompt) s.set({ djPrompt: prompt })
  sync()
}

/** Where the vehicle sits relative to a parking bay. */
export function parkState(bay: NonNullable<JobDef['bay']>) {
  const dx = rt.vehiclePos.x - bay.x
  const dz = rt.vehiclePos.z - bay.z
  const ax = Math.sin(bay.yaw)
  const az = Math.cos(bay.yaw)
  const lon = dx * ax + dz * az
  const lat = dx * az - dz * ax
  // angle between the car's axis and the bay axis (either driving direction is fine), 0..π/2
  const diff = Math.abs(((rt.vehicleYaw - bay.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
  const yawErr = Math.min(diff, Math.PI - diff)
  const { l, w } = rt.vehicleDims
  // extent of the car's oriented box along the bay axes
  const cy = Math.cos(yawErr)
  const sy = Math.sin(yawErr)
  const ext = l * cy + w * sy
  const lat2 = l * sy + w * cy
  const slackL = bay.len / 2 - ext + 0.1
  const slackW = bay.wid / 2 - lat2 + 0.1
  const inside = Math.abs(lon) <= Math.max(0.1, slackL) && Math.abs(lat) <= Math.max(0.05, slackW) && yawErr < 0.35
  const near = Math.hypot(dx, dz) < 12
  const accuracy = clamp(100 - Math.abs(lat) * 22 - Math.abs(lon) * 9 - (yawErr * 180) / Math.PI * 1.4, 0, 100)
  return { inside, near, lon, lat, yawErr, accuracy }
}

// ---- reward ------------------------------------------------------------------------------------------------------
function drivingScore(r: Run): number {
  let sc = 100 - r.hits * 7 - Math.min(20, r.dmg * 0.5) - (r.wantedSeen ? 15 : 0)
  const routed = r.job.type === 'taxi' || r.job.type === 'delivery' || r.job.type === 'longdistance' || r.job.type === 'emergency'
  if (routed && gps.routeSeconds > 5) sc -= Math.min(15, (gps.offRouteSeconds / gps.routeSeconds) * 30)
  if (r.tm > r.job.parSec) sc -= Math.min(15, ((r.tm - r.job.parSec) / r.job.parSec) * 30)
  if (r.job.type === 'parking') sc = r.accuracy * 0.6 + clamp(100 - r.hits * 12 - r.dmg, 0, 100) * 0.2 + clamp(100 - Math.max(0, r.tm - r.job.parSec) * 1.5, 0, 100) * 0.2
  return Math.round(clamp(sc, 0, 100))
}

function complete(r: Run) {
  // duplicate-claim guard: a job pays out once, and only while it is the active run
  const s = st()
  if (r.paid || s.driver.claimed.includes(r.job.uid) || run !== r) return
  r.paid = true
  const job = r.job
  const secs = Math.round(r.tm || r.t)
  const score = drivingScore(r)
  const safe = r.dmg < 0.5 && r.hits === 0
  const onTime = r.tm <= job.parSec
  const lines: BonusLine[] = []
  let base = job.base

  if (job.type === 'parking') base = clamp(Math.round((job.base * (0.5 + score / 100)) / 10) * 10, 50, 200)
  if (job.type === 'race') base = [1000, 600, 300, 100][Math.max(0, Math.min(3, r.placed - 1))] ?? 100

  if (job.type !== 'race') {
    if (safe) lines.push({ label: 'Safe driving bonus', points: 50 })
    if (onTime) {
      const early = clamp((job.parSec - r.tm) / job.parSec, 0, 1)
      lines.push({ label: job.type === 'delivery' ? 'Early delivery bonus' : 'On-time bonus', points: Math.round((base * 0.25 + base * 0.25 * early) / 5) * 5 })
    }
    if (job.type !== 'parking' && gps.routeSeconds > 5 && gps.offRouteSeconds / gps.routeSeconds < 0.08 && gps.recalcs <= 1) lines.push({ label: 'Followed the route', points: 25 })
    if (!r.wantedSeen && r.hits <= 1) lines.push({ label: 'Clean record (no police)', points: 25 })
  }
  const streak = s.driver.streak + 1
  if (streak >= 2) lines.push({ label: `Streak x${streak}`, points: Math.min(50, (streak - 1) * 10) })

  // daily challenges
  let d: DriverData = withToday(s.driver)
  const day = todayKey()
  const step = { type: job.type, safe, onTime, points: 0, routeLen: job.routeLen }
  const preTotal = base + lines.reduce((a, b) => a + b.points, 0)
  step.points = preTotal
  const achievedChallenges: BonusLine[] = []
  d = {
    ...d,
    daily: {
      day,
      list: d.daily.list.map((c) => {
        const def = CHALLENGES.find((q) => q.id === c.id)
        if (!def || c.claimed) return c
        const progress = Math.min(def.target, c.progress + def.step(step))
        const done = progress >= def.target
        if (done) achievedChallenges.push({ label: `Daily challenge: ${def.text}`, points: def.bonus })
        return { ...c, progress, claimed: done }
      }),
    },
  }
  lines.push(...achievedChallenges)

  const total = base + lines.reduce((a, b) => a + b.points, 0)
  const xp = Math.round(total * 0.7)
  const before = levelOf(d.xp)
  const entry: HistoryEntry = { uid: job.uid, type: job.type, title: job.title, points: total, xp, score, seconds: secs, day, at: Date.now() }
  d = {
    ...d,
    points: d.points + total,
    totalEarned: d.totalEarned + total,
    xp: d.xp + xp,
    completed: d.completed + 1,
    streak,
    bestScore: Math.max(d.bestScore, score),
    claimed: [...d.claimed, job.uid].slice(-400),
    history: [entry, ...d.history].slice(0, 60),
    stats: { ...d.stats, [job.type]: d.stats[job.type] + 1, safe: d.stats.safe + (safe ? 1 : 0), onTime: d.stats.onTime + (onTime ? 1 : 0), recalcs: d.stats.recalcs + gps.recalcs },
  }
  const fresh = ACHIEVEMENTS.filter((a) => !d.achievements.includes(a.id) && a.test(d))
  d = { ...d, achievements: [...d.achievements, ...fresh.map((a) => a.id)] }
  const after = levelOf(d.xp)
  const prog = levelProgress(d.xp)

  const result: JobResult = {
    uid: job.uid,
    title: job.title,
    type: job.type,
    subtitle: completionText(job),
    base,
    bonuses: lines,
    total,
    xp,
    score,
    seconds: secs,
    level: after.level,
    levelName: after.name,
    levelUp: after.level > before.level,
    unlocked: after.level > before.level ? after.unlock : '',
    xpNow: d.xp,
    xpInto: prog.into,
    xpNeed: prog.need,
    nextName: prog.next?.name ?? '',
    pointsBalance: d.points,
    achievements: fresh.map((a) => a.name),
  }
  s.set({ driver: d, djResult: result, carrying: '' })
  clearRun()
  saveGame()
  sfx('buy')
  // show the results with the game paused so the buttons are usable
  s.set({ phase: 'jobs' })
  document.exitPointerLock?.()
}

function completionText(j: JobDef): string {
  switch (j.type) {
    case 'taxi':
      return 'Passenger delivered'
    case 'delivery':
      return 'Package delivered'
    case 'longdistance':
      return 'Long-distance trip completed'
    case 'emergency':
      return 'Emergency response completed'
    case 'parking':
      return 'Parked in the bay'
    case 'race':
      return 'Race finished'
  }
}

