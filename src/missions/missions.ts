import { rt } from '../engine/runtime'
import { shops } from '../shops/shops'
import { useGame } from '../store/game'
import type { GameState } from '../store/game'
import { banner, forceExit, pay, repairCar, teleportCar } from './actions'
import { CHECKPOINTS, GRID, START, race, raceMarkers, startRace, stopRace, tickRace } from './Race'
import type { Marker } from './types'

export interface Ctx {
  st: GameState
  /** position of whatever the player is controlling */
  x: number
  z: number
  veh: boolean
  vspeed: number
  dt: number
  /** true on the frame E was pressed (consumed) */
  pressE: () => boolean
}

export interface Step {
  text: string | (() => string)
  markers?: () => Marker[]
  /** pressing E within a few metres of this point completes the step (shows a prompt) */
  interactAt?: () => { x: number; z: number }
  interactLabel?: string
  /** seconds; the mission fails when it runs out */
  timer?: number
  /** completing this step makes it the restart point after a failure */
  checkpoint?: boolean
  enter?: () => void
  /** true = done, 'fail' = failed */
  check: (c: Ctx) => boolean | 'fail'
  failText?: string
}

export interface MissionDef {
  id: string
  title: string
  blurb: string
  reward: number
  hub: { x: number; z: number }
  steps: Step[]
  /** passive missions stay active while courier jobs run on top of them */
  passive?: boolean
  onComplete?: () => string | void
}

const dist = (c: Ctx, p: { x: number; z: number }) => Math.hypot(c.x - p.x, c.z - p.z)
const shop = (i: number) => shops[i % shops.length]

function reach(text: string, at: () => { x: number; z: number }, r: number, opts: { veh?: boolean; kind?: Marker['kind']; label?: string; slow?: boolean; checkpoint?: boolean; timer?: number; enter?: () => void; done?: () => void } = {}): Step {
  return {
    text,
    checkpoint: opts.checkpoint,
    timer: opts.timer,
    enter: opts.enter,
    markers: () => [{ ...at(), kind: opts.kind ?? 'goal', label: opts.label, r }],
    check: (c) => {
      if (c.st.vehicleHealth <= 0 && opts.veh) return 'fail'
      if (opts.veh && !c.veh) return false
      if (dist(c, at()) < r && (!opts.slow || c.vspeed < 7)) {
        opts.done?.()
        return true
      }
      return false
    },
  }
}

// ---- Mission 1: Welcome to the City ---------------------------------------------------------------
let walked = 0
let sprinted = 0
let crouched = 0
let prevSpace = false
const m1: MissionDef = {
  id: 'welcome',
  title: 'Welcome to the City',
  blurb: 'Learn the controls and explore the neighbourhood.',
  reward: 200,
  hub: { x: 0, z: 5 },
  steps: [
    {
      text: 'Move around with W A S D (mouse turns the camera)',
      enter: () => (walked = 0),
      check: (c) => ((walked += rt.walkSpeed * c.dt), walked > 15),
    },
    {
      text: 'Hold Shift while moving to sprint',
      enter: () => (sprinted = 0),
      check: (c) => {
        if ((rt.keys.ShiftLeft || rt.keys.ShiftRight) && rt.walkSpeed > 6) sprinted += c.dt
        return sprinted > 2
      },
    },
    {
      text: 'Press Space to jump',
      checkpoint: true,
      enter: () => (prevSpace = !!rt.keys.Space),
      check: () => {
        const down = !!rt.keys.Space
        const hit = down && !prevSpace && rt.grounded
        prevSpace = down
        return hit
      },
    },
    {
      text: 'Hold C to crouch for a moment',
      enter: () => (crouched = 0),
      check: (c) => {
        if (rt.keys.KeyC) crouched += c.dt
        return crouched > 0.8
      },
    },
    reach('Walk to the marker down the street', () => ({ x: 11.2, z: -52 }), 3, { checkpoint: true, label: 'Marker' }),
    {
      text: 'Visit a shop: walk up to a marked door and press E',
      markers: () => shops.slice(0, 4).map((s) => ({ x: s.door.x, z: s.door.z, kind: 'pickup' as const, label: s.name })),
      check: (c) => !!c.st.inShop,
    },
    { text: 'Step back to the door and press E to leave the shop', check: (c) => !c.st.inShop },
  ],
}

// ---- Mission 2: First Delivery ------------------------------------------------------------------------
const m2: MissionDef = {
  id: 'delivery',
  title: 'First Delivery',
  blurb: 'Borrow the Subaru, collect a package and deliver it on time.',
  reward: 400,
  hub: { x: 11.2, z: -11.2 },
  onComplete: () => {
    const cur = useGame.getState().unlocks
    useGame.getState().set({ unlocks: [...new Set([...cur, 'outer-districts'])] })
    return 'Outer districts unlocked'
  },
  steps: [
    {
      text: 'Get into the blue Subaru (E)',
      markers: () => [{ x: rt.vehiclePos.x, z: rt.vehiclePos.z, kind: 'goal', label: 'Subaru' }],
      check: (c) => c.veh,
      enter: () => {
        repairCar()
        useGame.getState().set({ carrying: '' })
      },
    },
    reach(`Drive to ${shop(3).name} and pick up the package`, () => shop(3).out, 6, {
      veh: true,
      kind: 'pickup',
      checkpoint: true,
      label: 'Pickup',
      done: () => {
        useGame.getState().set({ carrying: 'Package' })
        banner('info', 'Package collected', 'Now deliver it before the timer runs out')
      },
    }),
    reach(`Deliver the package to ${shop(7).name}`, () => shop(7).out, 6, {
      veh: true,
      slow: true,
      timer: 210,
      label: 'Drop-off',
      done: () => useGame.getState().set({ carrying: '' }),
    }),
  ],
}

// ---- Mission 3: The Missing Vehicle -----------------------------------------------------------------
const HIDDEN = { x: -286, z: 164 }
const OWNER = { x: 40, z: 252 }
const clue = (n: number, text: string, at: () => { x: number; z: number }, radius: number): Step => ({
  text,
  markers: () => [
    { ...at(), kind: 'clue', label: 'Ask around', r: 3 },
    { x: HIDDEN.x + (n % 2 ? 18 : -22), z: HIDDEN.z + (n === 1 ? -30 : 20), kind: 'search', r: radius, label: 'Last seen around here' },
  ],
  interactAt: at,
  interactLabel: 'Ask around',
  check: (c) => {
    // standing at the clue and pressing E counts as asking
    if (dist(c, at()) < 3.2 && c.pressE()) {
      banner('info', 'Clue found', n < 3 ? 'The search area is smaller now' : 'The car is parked on the west edge of town')
      return true
    }
    return false
  },
})
const m3: MissionDef = {
  id: 'missing',
  title: 'The Missing Vehicle',
  blurb: "Someone moved Maria's Subaru. Follow the clues on the map and bring it back.",
  reward: 600,
  hub: { x: -11.2, z: -11.2 },
  steps: [
    {
      text: 'Check the map (M). Question the clerk at ' + shop(5).name,
      enter: () => {
        repairCar()
        forceExit(-11.2, -11.2)
        teleportCar(HIDDEN.x, HIDDEN.z, Math.PI / 2)
        banner('info', 'The Subaru is gone', 'Follow the clues shown on the map')
      },
      interactAt: () => shop(5).out,
      interactLabel: 'Ask around',
      markers: () => [{ ...shop(5).out, kind: 'clue', label: 'Clue 1', r: 3 }, { ...HIDDEN, kind: 'search', r: 260, label: 'Last seen' }],
      check: (c) => {
        if (dist(c, shop(5).out) < 3.2 && c.pressE()) {
          banner('info', 'Clue found', 'Seen heading west. Next: ' + shop(4).name)
          return true
        }
        return false
      },
    },
    clue(2, 'Ask the staff at ' + shop(4).name, () => shop(4).out, 150),
    clue(3, 'Ask around at ' + shop(2).name, () => shop(2).out, 55),
    {
      text: 'Find the Subaru and get in',
      checkpoint: true,
      markers: () => [{ ...HIDDEN, kind: 'goal', label: 'Subaru' }],
      check: (c) => c.veh,
    },
    reach("Drive the Subaru back to its owner's house", () => OWNER, 7, { veh: true, slow: true, label: 'Owner' }),
  ],
}

// ---- Mission 4: Street Race ----------------------------------------------------------------------------
const m4: MissionDef = {
  id: 'race',
  title: 'Street Race',
  blurb: 'Beat three drivers around the downtown ring. Pass every checkpoint.',
  reward: 0,
  hub: { x: -11.2, z: 11.2 },
  steps: [
    {
      text: 'Get into the blue Subaru (E)',
      markers: () => [{ x: rt.vehiclePos.x, z: rt.vehiclePos.z, kind: 'goal', label: 'Subaru' }],
      check: (c) => c.veh,
      enter: () => repairCar(),
    },
    reach('Drive to the start grid', () => GRID, 9, { veh: true, label: 'Start', checkpoint: true }),
    {
      text: () => {
        const r = useGame.getState().race
        if (!r) return 'Get ready'
        return r.state === 'countdown' ? 'Get ready…' : `Race! Checkpoint ${Math.min(r.cp + 1, r.cps)}/${r.cps}  ·  Position ${r.place}/${r.total}`
      },
      enter: () => startRace(),
      markers: () => raceMarkers(),
      check: (c) => {
        const res = tickRace(c.dt, c.x, c.z)
        if (res === 'done') {
          const prize = [1000, 600, 300, 100][race.finishPlace - 1] ?? 100
          pay(prize)
          banner('pass', race.finishPlace === 1 ? 'You won the race!' : `Finished ${race.finishPlace} of 4`, `Prize money $${prize}`)
          stopRace()
          return true
        }
        if (res === 'fail') {
          stopRace()
          return 'fail'
        }
        return false
      },
      failText: 'Your car was wrecked',
    },
  ],
}

// ---- Mission 5: Build Your Reputation ---------------------------------------------------------------
let jobsBase = 0
const m5: MissionDef = {
  id: 'reputation',
  title: 'Build Your Reputation',
  blurb: 'Take courier jobs from the job board, earn money and become known around town.',
  reward: 1500,
  passive: true,
  hub: { x: 11.2, z: 11.2 },
  steps: [
    {
      text: () => {
        const s = useGame.getState()
        return `Courier jobs ${Math.min(3, s.jobsDone - jobsBase)}/3 · Earn $${Math.min(2500, s.earnedTotal)}/2500 (use the job board marker)`
      },
      enter: () => (jobsBase = Math.max(0, useGame.getState().jobsDone - 0)),
      markers: () => [{ ...JOB_BOARD, kind: 'job', label: 'Job board' }],
      check: (c) => c.st.jobsDone - jobsBase >= 3 && c.st.earnedTotal >= 2500,
    },
  ],
  onComplete: () => {
    const cur = useGame.getState().unlocks
    useGame.getState().set({ unlocks: [...new Set([...cur, 'sports-vehicles', 'garages'])] })
    return 'Unlocked: sports vehicles, 2 more garages'
  },
}

export const JOB_BOARD = { x: -30, z: 10.4 }
export const MISSIONS: MissionDef[] = [m1, m2, m3, m4, m5]
export const mission = (id: string) => MISSIONS.find((m) => m.id === id)

// ---- repeatable courier jobs ------------------------------------------------------------------------------
let jobSeed = 11
export function makeJob(): MissionDef {
  jobSeed = (jobSeed * 48271) % 2147483647
  const a = shop(jobSeed % shops.length)
  const b = shop(Math.floor(jobSeed / 7) % shops.length === jobSeed % shops.length ? (jobSeed + 3) % shops.length : Math.floor(jobSeed / 7) % shops.length)
  const d = Math.hypot(a.out.x - b.out.x, a.out.z - b.out.z)
  const reward = Math.round(100 + d * 0.6)
  return {
    id: 'job',
    title: 'Courier Job',
    blurb: `${a.name} → ${b.name}`,
    reward,
    hub: JOB_BOARD,
    steps: [
      reach(`Pick up the parcel at ${a.name}`, () => a.out, 6, {
        veh: true,
        kind: 'pickup',
        label: 'Pickup',
        done: () => useGame.getState().set({ carrying: 'Parcel' }),
      }),
      reach(`Deliver to ${b.name}`, () => b.out, 6, {
        veh: true,
        slow: true,
        timer: Math.round(30 + d / 9),
        label: 'Drop-off',
        done: () => useGame.getState().set({ carrying: '' }),
      }),
    ],
    onComplete: () => {
      const s = useGame.getState()
      s.set({ jobsDone: s.jobsDone + 1, reputation: s.reputation + 10 })
      return `+10 reputation`
    },
  }
}

export { CHECKPOINTS, START }
