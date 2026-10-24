export type JobType = 'taxi' | 'delivery' | 'race' | 'emergency' | 'parking' | 'longdistance'

export interface Place {
  x: number
  z: number
  label: string
}

/** One step of a driver job. */
export interface Stage {
  kind: 'goto' | 'pickup' | 'dropoff' | 'checkpoint' | 'hold' | 'park' | 'race'
  at: Place
  /** radius in metres within which the stage is satisfied */
  r: number
  /** HUD text */
  text: string
  /** the GPS route target for this stage (defaults to `at`) */
  nav?: boolean
}

/** MissionDefinition: everything needed to run, display and reward a job. */
export interface JobDef {
  /** unique per offer; a paid job id is stored so it can never be claimed twice */
  uid: string
  type: JobType
  title: string
  desc: string
  start: Place
  dest: Place
  stages: Stage[]
  /** driving distance from the first pickup to the destination (m) */
  routeLen: number
  /** target time for the whole job in seconds (on-time bonus) */
  parSec: number
  /** hard limit in seconds; the job fails when it runs out */
  limitSec: number | null
  base: number
  baseMin: number
  baseMax: number
  difficulty: 1 | 2 | 3
  minLevel: number
  /** parking bay for parking jobs */
  bay?: { x: number; z: number; yaw: number; len: number; wid: number }
  /** hold time in seconds for 'hold' stages */
  holdSec?: number
}

export interface JobHud {
  uid: string
  type: JobType
  title: string
  text: string
  stage: number
  stages: number
  /** seconds left on the hard limit, or elapsed seconds against par when there is none */
  timer: number | null
  timerLabel: string
  passenger: string
}

export interface BonusLine {
  label: string
  points: number
}
export interface JobResult {
  uid: string
  title: string
  type: JobType
  subtitle: string
  base: number
  bonuses: BonusLine[]
  total: number
  xp: number
  score: number
  seconds: number
  level: number
  levelName: string
  levelUp: boolean
  unlocked: string
  xpNow: number
  xpInto: number
  xpNeed: number
  nextName: string
  pointsBalance: number
  achievements: string[]
}

