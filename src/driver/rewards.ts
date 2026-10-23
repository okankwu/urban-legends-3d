import type { JobType } from './types'

/**
 * RewardPointsSystem + DriverLevelSystem + achievements + daily challenges + leaderboard.
 * Everything here is plain data and pure functions; the persistent copy lives in the game store (`driver`)
 * and is saved inside the normal progress save (see missions/progress.ts).
 */
export interface HistoryEntry {
  uid: string
  type: JobType
  title: string
  points: number
  xp: number
  score: number
  seconds: number
  day: string
  at: number
}
export interface DailyChallenge {
  id: string
  progress: number
  claimed: boolean
}
export interface DriverData {
  /** spendable reward points */
  points: number
  /** lifetime points earned from missions (never reduced by spending) */
  totalEarned: number
  /** driving experience; separate from points, drives the level */
  xp: number
  completed: number
  history: HistoryEntry[]
  /** consecutive completed jobs without a failure or abandon */
  streak: number
  bestScore: number
  /** ids of jobs whose reward has been paid (duplicate-claim guard) */
  claimed: string[]
  achievements: string[]
  stats: Record<JobType, number> & { safe: number; onTime: number; failed: number; recalcs: number }
  daily: { day: string; list: DailyChallenge[] }
  /** monotonically increasing counter used to make job ids unique across sessions */
  seq: number
}

export const emptyStats = (): DriverData['stats'] => ({ taxi: 0, delivery: 0, race: 0, emergency: 0, parking: 0, longdistance: 0, safe: 0, onTime: 0, failed: 0, recalcs: 0 })

export const defaultDriver = (): DriverData => ({
  points: 0,
  totalEarned: 0,
  xp: 0,
  completed: 0,
  history: [],
  streak: 0,
  bestScore: 0,
  claimed: [],
  achievements: [],
  stats: emptyStats(),
  daily: { day: '', list: [] },
  seq: 0,
})

/** Fills in anything an older save lacks. */
export function normalizeDriver(d: Partial<DriverData> | undefined | null): DriverData {
  const base = defaultDriver()
  if (!d) return base
  return { ...base, ...d, stats: { ...base.stats, ...(d.stats ?? {}) }, daily: d.daily ?? base.daily, history: d.history ?? [], claimed: d.claimed ?? [], achievements: d.achievements ?? [] }
}

// ---- levels ------------------------------------------------------------------------------------------------
export interface LevelDef {
  level: number
  name: string
  xp: number
  unlock: string
}
export const LEVELS: LevelDef[] = [
  { level: 1, name: 'Rookie', xp: 0, unlock: 'Taxi and parking missions' },
  { level: 2, name: 'City Driver', xp: 500, unlock: 'Package delivery' },
  { level: 3, name: 'Skilled Driver', xp: 1500, unlock: 'Long-distance jobs' },
  { level: 4, name: 'Professional', xp: 3000, unlock: 'Emergency driving' },
  { level: 5, name: 'Elite Driver', xp: 5000, unlock: 'Advanced racing and premium jobs' },
]
export const levelOf = (xp: number): LevelDef => [...LEVELS].reverse().find((l) => xp >= l.xp) ?? LEVELS[0]
export function levelProgress(xp: number) {
  const cur = levelOf(xp)
  const next = LEVELS.find((l) => l.level === cur.level + 1)
  if (!next) return { cur, next: null, frac: 1, into: xp - cur.xp, need: 0 }
  return { cur, next, frac: (xp - cur.xp) / (next.xp - cur.xp), into: xp - cur.xp, need: next.xp - cur.xp }
}

/** Minimum driver level for each job type. */
export const MIN_LEVEL: Record<JobType, number> = { taxi: 1, parking: 1, delivery: 2, longdistance: 3, emergency: 4, race: 5 }
export const TYPE_NAME: Record<JobType, string> = {
  taxi: 'Taxi',
  delivery: 'Delivery',
  race: 'Street race',
  emergency: 'Emergency',
  parking: 'Parking',
  longdistance: 'Long distance',
}

// ---- daily challenges -------------------------------------------------------------------------------------
export interface ChallengeDef {
  id: string
  text: string
  target: number
  bonus: number
  /** returns how much a finished job adds to this challenge */
  step: (r: { type: JobType; safe: boolean; onTime: boolean; points: number; routeLen: number }) => number
}
export const CHALLENGES: ChallengeDef[] = [
  { id: 'taxi3', text: 'Complete 3 taxi fares', target: 3, bonus: 250, step: (r) => (r.type === 'taxi' ? 1 : 0) },
  { id: 'deliver2', text: 'Complete 2 deliveries', target: 2, bonus: 200, step: (r) => (r.type === 'delivery' ? 1 : 0) },
  { id: 'safe2', text: 'Finish 2 jobs without damage', target: 2, bonus: 200, step: (r) => (r.safe ? 1 : 0) },
  { id: 'ontime3', text: 'Finish 3 jobs on time', target: 3, bonus: 250, step: (r) => (r.onTime ? 1 : 0) },
  { id: 'earn600', text: 'Earn 600 points from jobs', target: 600, bonus: 300, step: (r) => r.points },
  { id: 'drive2k', text: 'Drive 2 km on jobs', target: 2000, bonus: 250, step: (r) => r.routeLen },
  { id: 'park1', text: 'Complete a parking challenge', target: 1, bonus: 120, step: (r) => (r.type === 'parking' ? 1 : 0) },
  { id: 'any4', text: 'Complete 4 jobs of any kind', target: 4, bonus: 300, step: () => 1 },
]

export const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Three challenges picked deterministically from the date, so everyone sees the same set on a given day. */
export function pickChallenges(day: string): DailyChallenge[] {
  let h = 0
  for (let i = 0; i < day.length; i++) h = (h * 31 + day.charCodeAt(i)) | 0
  const pool = [...CHALLENGES]
  const out: DailyChallenge[] = []
  for (let n = 0; n < 3; n++) {
    h = (Math.imul(h, 1103515245) + 12345) | 0
    const k = Math.abs(h) % pool.length
    out.push({ id: pool.splice(k, 1)[0].id, progress: 0, claimed: false })
  }
  return out
}

/** Ensures the daily list belongs to today (rolls over at local midnight). */
export function withToday(d: DriverData, day = todayKey()): DriverData {
  return d.daily.day === day && d.daily.list.length ? d : { ...d, daily: { day, list: pickChallenges(day) } }
}

// ---- achievements -----------------------------------------------------------------------------------------
export interface AchievementDef {
  id: string
  name: string
  text: string
  test: (d: DriverData) => boolean
}
const totalType = (d: DriverData) => d.stats.taxi + d.stats.delivery + d.stats.race + d.stats.emergency + d.stats.parking + d.stats.longdistance
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first', name: 'First Fare', text: 'Complete your first driver job', test: (d) => d.completed >= 1 },
  { id: 'ten', name: 'Regular', text: 'Complete 10 driver jobs', test: (d) => d.completed >= 10 },
  { id: 'twentyfive', name: 'Road Veteran', text: 'Complete 25 driver jobs', test: (d) => d.completed >= 25 },
  { id: 'streak5', name: 'On a Roll', text: 'Complete 5 jobs in a row', test: (d) => d.streak >= 5 },
  { id: 'clean', name: 'Clean Driver', text: 'Finish 5 jobs without a scratch', test: (d) => d.stats.safe >= 5 },
  { id: 'punctual', name: 'Punctual', text: 'Finish 5 jobs on time', test: (d) => d.stats.onTime >= 5 },
  { id: 'perfect', name: 'Perfect Run', text: 'Reach a driving score of 100', test: (d) => d.bestScore >= 100 },
  { id: 'taxi5', name: 'Cab Regular', text: 'Complete 5 taxi fares', test: (d) => d.stats.taxi >= 5 },
  { id: 'parker', name: 'Parallel Pro', text: 'Complete 3 parking challenges', test: (d) => d.stats.parking >= 3 },
  { id: 'winner', name: 'Podium Finish', text: 'Win a street race', test: (d) => d.stats.race >= 1 },
  { id: 'allround', name: 'All-Rounder', text: 'Complete a job in four different categories', test: (d) => (['taxi', 'delivery', 'race', 'emergency', 'parking', 'longdistance'] as JobType[]).filter((t) => d.stats[t] > 0).length >= 4 },
  { id: 'elite', name: 'Elite', text: 'Reach driver level 5', test: (d) => d.xp >= 5000 },
  { id: 'thousand', name: 'Four Figures', text: 'Earn 1,000 mission points', test: (d) => d.totalEarned >= 1000 },
  { id: 'busy', name: 'Full Schedule', text: 'Finish 40 jobs', test: (d) => totalType(d) >= 40 },
]

// ---- local leaderboard ------------------------------------------------------------------------------------
export interface BoardRow {
  name: string
  level: number
  points: number
  missions: number
  best: number
  you: boolean
}
/** Fictional rivals so a single-player board has something to compare against. They are not real players. */
const NPC_DRIVERS: Omit<BoardRow, 'you'>[] = [
  { name: 'Marta "Midnight" Vega', level: 5, points: 14200, missions: 188, best: 98 },
  { name: 'Dex Okoro', level: 4, points: 8650, missions: 121, best: 94 },
  { name: 'Priya Nandakumar', level: 4, points: 6100, missions: 96, best: 91 },
  { name: 'Theo Lindqvist', level: 3, points: 3400, missions: 58, best: 88 },
  { name: 'June Castellano', level: 3, points: 2100, missions: 37, best: 84 },
  { name: 'Bo Whitfield', level: 2, points: 950, missions: 19, best: 79 },
  { name: 'Ana Ferreira', level: 2, points: 520, missions: 11, best: 73 },
  { name: 'Kit Marlowe', level: 1, points: 180, missions: 4, best: 66 },
]

export function leaderboard(d: DriverData, name: string): BoardRow[] {
  const you: BoardRow = { name: name || 'You', level: levelOf(d.xp).level, points: d.totalEarned, missions: d.completed, best: d.bestScore, you: true }
  return [...NPC_DRIVERS.map((r) => ({ ...r, you: false })), you].sort((a, b) => b.points - a.points)
}
