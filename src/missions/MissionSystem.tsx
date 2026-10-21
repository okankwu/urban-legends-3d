import { useFrame } from '@react-three/fiber'
import { tickMissions } from './manager'

/** Drives the mission manager once per frame. */
export default function MissionSystem() {
  useFrame((_, dt) => tickMissions(Math.min(dt, 0.1)))
  return null
}
