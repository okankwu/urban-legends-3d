import { useFrame } from '@react-three/fiber'
import { rt } from '../engine/runtime'
import { useGame } from '../store/game'
import { gps, planRoute, setNavTarget, tickGps } from './gps'
import { abandonJob, acceptJob, getRun, tickDriver } from './manager'
import { buildJob, makeOffers } from './jobs'
import { snapToRoad } from './roadGraph'
import { drawGps } from './drawMap'

if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__driver = { gps, planRoute, setNavTarget, acceptJob, abandonJob, getRun, buildJob, makeOffers, snapToRoad, drawGps }

const GOAL_KINDS = new Set(['goal', 'pickup', 'cp', 'clue'])

/** Runs the GPS tracker and the driver-job tracker once per frame while playing. */
export default function DriverSystem() {
  useFrame((_, rawDt) => {
    const st = useGame.getState()
    if (st.phase !== 'playing') return
    const dt = Math.min(rawDt, 0.1)
    const inV = st.inVehicle
    const pos = inV ? rt.vehiclePos : rt.playerPos

    // with no driver job, the GPS follows the map waypoint, then the story objective (when driving)
    if (!st.djJob) {
      const wp = st.waypoint
      const m = inV ? st.markers.find((k) => GOAL_KINDS.has(k.kind) && k.label !== 'Subaru') : undefined
      setNavTarget(wp ? { x: wp.x, z: wp.z, label: 'Waypoint' } : m ? { x: m.x, z: m.z, label: m.label ?? 'Objective' } : null)
    }
    tickGps(dt, pos, inV ? rt.vehicleYaw : null, inV ? rt.vehicleSpeed : 0)
    tickDriver(dt)

    // reaching a waypoint clears it
    if (!st.djJob && st.waypoint && gps.target?.label === 'Waypoint' && Math.hypot(pos.x - st.waypoint.x, pos.z - st.waypoint.z) < 14) st.set({ waypoint: null })
  })
  return null
}
