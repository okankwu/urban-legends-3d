import { useGame } from '../store/game'
import type { MarkerKind } from '../missions/types'

const NORMAL: Record<MarkerKind, string> = {
  goal: '#ffd24a',
  pickup: '#ff3b3b',
  clue: '#ff9bd0',
  cp: '#3dff8a',
  finish: '#ffffff',
  start: '#ffcf33',
  job: '#7cf0b0',
  search: '#ff6b6b',
  waypoint: '#7aa2ff',
}
/** Okabe–Ito based set that stays distinguishable with red/green colour-vision deficiency. */
const SAFE: Record<MarkerKind, string> = {
  goal: '#E69F00',
  pickup: '#CC79A7',
  clue: '#CC79A7',
  cp: '#F0E442',
  finish: '#ffffff',
  start: '#F0E442',
  job: '#0072B2',
  search: '#D55E00',
  waypoint: '#56B4E9',
}

export const markerColor = (k: MarkerKind) => (useGame.getState().colorblind ? SAFE : NORMAL)[k]

export const signalColors = () =>
  useGame.getState().colorblind
    ? { green: '#2ad4ff', yellow: '#ffe600', red: '#ff5a00' }
    : { green: '#3dff6a', yellow: '#ffc928', red: '#ff3030' }
