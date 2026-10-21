import { consumePressed, rt } from '../engine/runtime'
import { useGame } from '../store/game'
import { sfx } from '../engine/audio'
import { JOB_BOARD, MISSIONS, makeJob, mission } from './missions'
import type { Ctx, MissionDef } from './missions'
import { banner, repairCar, teleportCar, teleportPlayer } from './actions'
import { clearProgress, loadProgress, saveProgress } from './progress'
import { stopRace } from './Race'
import type { Marker } from './types'

interface Active {
  def: MissionDef
  kind: 'mission' | 'job'
  step: number
  cp: number
  timer: number | null
  parent: Active | null
}

let active: Active | null = null
let pendingResume: { id: string; step: number } | null = null
let pendingApplied = true
let autoStart = 0
let saveClock = 0
let cooldown = 0
let lastSig = ''
let lastText = ''
let lastTimer = -1

function sync(force = false) {
  const st = useGame.getState()
  const a = active
  const step = a?.def.steps[a.step]
  const text = step ? (typeof step.text === 'function' ? step.text() : step.text) : ''
  const timer = a?.timer != null ? Math.ceil(a.timer) : null
  const markers: Marker[] = step?.markers ? step.markers() : []
  // start markers: next mission + job board
  const starts: Marker[] = []
  if (!a || a.def.passive) {
    const next = MISSIONS.find((m) => !st.completed.includes(m.id))
    if (next && !a) starts.push({ ...next.hub, kind: 'start', label: next.title })
    if (st.completed.includes('delivery') && (!a || a.def.passive) && !(a?.kind === 'job')) starts.push({ ...JOB_BOARD, kind: 'job', label: 'Courier job' })
  }
  const wp: Marker[] = st.waypoint ? [{ ...st.waypoint, kind: 'waypoint', label: 'Waypoint' }] : []
  const sig =
    (a ? a.def.id + a.step : '-') + '|' + text + '|' + timer + '|' + [...markers, ...starts, ...wp].map((m) => `${m.kind}${Math.round(m.x)},${Math.round(m.z)}`).join(';')
  if (!force && sig === lastSig && text === lastText && timer === lastTimer) return
  lastSig = sig
  lastText = text
  lastTimer = timer ?? -1
  st.set({
    mission: a ? { kind: a.kind, id: a.def.id, title: a.def.title, step: a.step, steps: a.def.steps.length, text, timer } : null,
    markers: [...markers, ...wp],
    startMarkers: starts,
    objective: a ? text : st.completed.length >= MISSIONS.length ? 'You have completed every mission. Take courier jobs or explore.' : 'Walk to the yellow mission marker to start the next mission.',
  })
}

function save() {
  const main = active?.kind === 'mission' ? active : active?.parent
  saveProgress(main ? { id: main.def.id, step: main.cp } : null)
  useGame.getState().set({ hasProgress: true })
}

function enterStep(a: Active) {
  const step = a.def.steps[a.step]
  a.timer = step.timer ?? null
  step.enter?.()
  sync(true)
}

export function startMission(def: MissionDef, step = 0, kind: 'mission' | 'job' = def.id === 'job' ? 'job' : 'mission') {
  const parent = active && active.def.passive ? active : null
  active = { def, kind, step, cp: step, timer: null, parent }
  banner('info', kind === 'job' ? 'Courier job' : 'Mission: ' + def.title, def.blurb)
  sfx('toast')
  enterStep(active)
  if (kind === 'mission') save()
}

function complete(a: Active) {
  const st = useGame.getState()
  let extra = ''
  const bonus = a.def.onComplete?.()
  if (bonus) extra = bonus
  if (a.def.reward) {
    st.set({ money: useGame.getState().money + a.def.reward, earnedTotal: useGame.getState().earnedTotal + a.def.reward })
    sfx('buy')
  }
  if (a.kind === 'mission') st.set({ completed: [...useGame.getState().completed, a.def.id] })
  st.set({ carrying: '' })
  const sub = [a.def.reward ? `+$${a.def.reward}` : '', extra].filter(Boolean).join('  ·  ')
  if (a.def.id !== 'race') banner('pass', a.kind === 'job' ? 'JOB COMPLETE' : 'MISSION PASSED', sub || a.def.title)
  active = a.parent
  cooldown = 3
  lastSig = ''
  save()
  sync(true)
}

function fail(a: Active, why: string) {
  if (a.def.id === 'race') stopRace()
  banner('fail', a.kind === 'job' ? 'JOB FAILED' : 'MISSION FAILED', why)
  sfx('deny')
  useGame.getState().set({ carrying: '' })
  cooldown = 3
  if (a.kind === 'job') {
    active = a.parent
    lastSig = ''
    sync(true)
    return
  }
  // restart from the last checkpoint
  repairCar()
  a.step = a.cp
  enterStep(a)
}

/** Fails whatever is active (used when the player is arrested). */
export function failCurrent(reason: string) {
  if (active) fail(active, reason)
}

export function abandon() {
  if (active) {
    if (active.def.id === 'race') stopRace()
    active = active.parent
    lastSig = ''
    sync(true)
  }
}

export function continueGame() {
  const p = loadProgress()
  pendingResume = p?.resume ?? null
  pendingApplied = false
  rt.pendingSpawn = p ? { player: p.player, car: p.car } : null
}

export function newGame() {
  clearProgress()
  active = null
  pendingResume = null
  pendingApplied = true
  autoStart = 0
  rt.pendingSpawn = null
  stopRace()
  lastSig = ''
  useGame.getState().set({
    money: 500,
    health: 100,
    stamina: 100,
    completed: [],
    earnedTotal: 0,
    jobsDone: 0,
    reputation: 0,
    unlocks: [],
    carrying: '',
    mission: null,
    markers: [],
    hasProgress: false,
    waypoint: null,
    vehicleHealth: 100,
    wanted: 0,
    searching: false,
    ownedVehicles: ['subaru'],
    currentVehicle: 'subaru',
    paint: {},
    inShop: null,
  })
  teleportPlayer(0, 1.5, 5)
  teleportCar(12, -3, Math.PI / 2)
}

export function saveGame(): boolean {
  const main = active?.kind === 'mission' ? active : active?.parent
  const ok = saveProgress(main ? { id: main.def.id, step: main.cp } : null)
  if (ok) useGame.getState().set({ hasProgress: true })
  return ok
}

function applyPending() {
  if (pendingApplied) return
  pendingApplied = true
  const sp = rt.pendingSpawn
  if (sp?.player) teleportPlayer(sp.player.x, sp.player.y, sp.player.z)
  if (sp?.car) teleportCar(sp.car.x, sp.car.z, sp.car.yaw)
  rt.pendingSpawn = null
  if (pendingResume) {
    const def = mission(pendingResume.id)
    if (def) startMission(def, pendingResume.step, 'mission')
    pendingResume = null
  }
}

/** Evaluates the current objective and start triggers. Called once per frame while playing. */
export function tickMissions(dt: number) {
  const st = useGame.getState()
  if (st.phase !== 'playing') return
  applyPending()

  const veh = st.inVehicle
  const inside = !!st.inShop
  const x = inside ? 1e9 : veh ? rt.vehiclePos.x : rt.playerPos.x
  const z = inside ? 1e9 : veh ? rt.vehiclePos.z : rt.playerPos.z
  const ctx: Ctx = { st, x, z, veh, vspeed: rt.vehicleSpeed, dt, pressE: () => consumePressed('KeyE') }

  saveClock += dt
  cooldown -= dt
  if (saveClock > 20 && !st.inShop) {
    saveClock = 0
    if (st.completed.length || active) save()
  }

  let mprompt = ''
  if (!active) {
    // first mission starts by itself on a fresh game
    if (!st.completed.length && !st.hasProgress) {
      autoStart += dt
      if (autoStart > 2) {
        autoStart = -1e9
        startMission(MISSIONS[0])
      }
    }
    const next = MISSIONS.find((m) => !st.completed.includes(m.id))
    if (cooldown > 0) {
      /* just finished something: do not retrigger the marker you are standing on */
    } else if (next && !inside && Math.hypot(x - next.hub.x, z - next.hub.z) < 3.4) startMission(next)
    else if (st.completed.includes('delivery') && st.vehicleHealth > 0 && !inside && Math.hypot(x - JOB_BOARD.x, z - JOB_BOARD.z) < 3.4) startMission(makeJob())
  } else {
    const a = active
    // courier jobs can be taken while a passive mission (reputation) is running
    if (a.def.passive && cooldown <= 0 && st.vehicleHealth > 0 && !inside && st.completed.includes('delivery') && Math.hypot(x - JOB_BOARD.x, z - JOB_BOARD.z) < 3.4) {
      startMission(makeJob())
      return
    }
    const step = a.def.steps[a.step]
    if (a.timer != null) {
      a.timer -= dt
      if (a.timer <= 0) return fail(a, 'Time ran out')
    }
    if (step.interactAt && !inside && Math.hypot(x - step.interactAt().x, z - step.interactAt().z) < 3.2) mprompt = step.interactLabel ?? 'Interact'
    const r = step.check(ctx)
    if (r === 'fail') return fail(a, step.failText ?? 'Your car was wrecked')
    if (r === true) {
      if (step.checkpoint) {
        a.cp = a.step + 1
        if (a.kind === 'mission') {
          banner('info', 'Checkpoint reached')
          save()
        }
      }
      a.step++
      if (a.step >= a.def.steps.length) complete(a)
      else enterStep(a)
    }
  }
  if (mprompt !== st.mprompt) st.set({ mprompt })
  sync()
}
