export type MarkerKind = 'goal' | 'pickup' | 'clue' | 'cp' | 'start' | 'job' | 'search' | 'waypoint' | 'finish'

export interface Marker {
  x: number
  z: number
  kind: MarkerKind
  label?: string
  /** radius in metres (search areas) */
  r?: number
}

export interface ActiveMission {
  kind: 'mission' | 'job'
  id: string
  title: string
  step: number
  steps: number
  text: string
  /** seconds remaining, if the step is timed */
  timer: number | null
}

export interface RaceHud {
  state: 'countdown' | 'running' | 'done'
  count: number
  place: number
  total: number
  cp: number
  cps: number
}

export interface Banner {
  id: number
  kind: 'pass' | 'fail' | 'info'
  title: string
  sub?: string
}
