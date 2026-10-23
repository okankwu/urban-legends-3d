import * as THREE from 'three'
import { useGame } from '../store/game'
import { rt } from '../engine/runtime'
import { sfx } from '../engine/audio'
import type { Banner } from './types'

/** Other systems (driver jobs) register here so story-level events reach them without circular imports. */
export const failHooks: ((why: string) => void)[] = []
export const resetHooks: (() => void)[] = []

let bannerTimer = 0
let bannerId = 1

export function banner(kind: Banner['kind'], title: string, sub?: string) {
  useGame.getState().set({ banner: { id: bannerId++, kind, title, sub } })
  window.clearTimeout(bannerTimer)
  bannerTimer = window.setTimeout(() => useGame.getState().set({ banner: null }), kind === 'info' ? 3000 : 4500)
}

export function pay(amount: number) {
  const st = useGame.getState()
  st.set({ money: st.money + amount, earnedTotal: st.earnedTotal + amount })
  sfx('buy')
}

export function teleportCar(x: number, z: number, yaw: number) {
  const b = rt.carBody
  if (!b) return
  b.setTranslation({ x, y: 1.2, z }, true)
  b.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), true)
  b.setLinvel({ x: 0, y: 0, z: 0 }, true)
  b.setAngvel({ x: 0, y: 0, z: 0 }, true)
}

export function teleportPlayer(x: number, y: number, z: number) {
  const b = rt.playerBody
  if (!b) return
  b.setTranslation({ x, y, z }, true)
  b.setLinvel({ x: 0, y: 0, z: 0 }, true)
}

export function repairCar() {
  useGame.getState().set({ vehicleHealth: 100 })
}

/** Puts the player on foot beside the given point (used when a mission moves the car away). */
export function forceExit(x: number, z: number) {
  const st = useGame.getState()
  if (!st.inVehicle) return
  st.set({ inVehicle: false })
  const b = rt.playerBody
  if (b) {
    b.setEnabled(true)
    b.setTranslation({ x, y: 1.5, z }, true)
    b.setLinvel({ x: 0, y: 0, z: 0 }, true)
  }
}
