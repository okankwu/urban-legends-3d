import { useFrame } from '@react-three/fiber'
import { consumePressed, rt } from '../engine/runtime'
import { useGame } from '../store/game'
import { INTERIOR, shops } from './shops'
import { dialogueFor, pedInfos } from '../npc/pedData'
import { sfx } from '../engine/audio'
import { activeGarages } from '../garage/garages'

let dialogueUntil = 0

/** Contextual interactions on foot: enter/exit shops, browse the counter, talk to pedestrians. */
export default function Interactions() {
  useFrame(() => {
    const st = useGame.getState()
    if (st.phase !== 'playing') return
    const set = (prompt: string) => prompt !== st.prompt && st.set({ prompt })
    if (st.dialogue && performance.now() > dialogueUntil) st.set({ dialogue: null })
    // garages work on foot or in a vehicle (G)
    if (!st.inShop) {
      const fx = st.inVehicle ? rt.vehiclePos.x : rt.playerPos.x
      const fz = st.inVehicle ? rt.vehiclePos.z : rt.playerPos.z
      const g = activeGarages(st.unlocks).find((q) => Math.hypot(q.x - fx, q.z - fz) < 5.5)
      rt.nearGarage = !!g
      if (g) {
        set('G  Open ' + g.name)
        if (consumePressed('KeyG')) {
          st.set({ phase: 'garage', garageId: g.id, prompt: '' })
          document.exitPointerLock?.()
          sfx('door')
        }
        return
      }
    }
    if (st.inVehicle || st.nearVehicle) return set('')

    const body = rt.playerBody
    if (!body) return
    const p = rt.playerPos
    // a mission interaction (asking for clues) takes priority over shops and pedestrians
    if (st.mprompt && !st.inShop) return set(st.mprompt)

    if (st.inShop) {
      const shop = shops.find((s) => s.id === st.inShop)!
      const lz = p.z - INTERIOR.z
      const lx = p.x - INTERIOR.x
      if (lz > INTERIOR.d / 2 - 2.6) {
        set('E  Exit shop')
        if (consumePressed('KeyE')) {
          body.setTranslation({ x: shop.out.x + shop.n.x * 1.5, y: 1.2, z: shop.out.z + shop.n.z * 1.5 }, true)
          body.setLinvel({ x: 0, y: 0, z: 0 }, true)
          rt.camYaw = Math.atan2(shop.n.x, shop.n.z)
          st.set({ inShop: null, prompt: '' })
          sfx('door')
        }
      } else if (Math.abs(lx) < 3.8 && lz > -3.4 && lz < 0.4) {
        set(shop.kind === 'clothes' ? 'E  Try on outfits' : 'E  Browse')
        if (consumePressed('KeyE')) {
          sfx('click')
          if (shop.kind === 'clothes') {
            st.set({ phase: 'creator', creatorReturn: 'paused', creatorCost: 60, prompt: '' })
            document.exitPointerLock?.()
          } else {
            st.set({ phase: 'shop', prompt: '' })
            document.exitPointerLock?.()
          }
        }
      } else set('')
      return
    }

    // outdoors: shop doors first, then pedestrians
    let best: (typeof shops)[number] | null = null
    let bd = 3.4 * 3.4
    for (const s of shops) {
      const d = (s.door.x - p.x) ** 2 + (s.door.z - p.z) ** 2
      if (d < bd) {
        bd = d
        best = s
      }
    }
    if (best) {
      set(`E  Enter ${best.name}`)
      if (consumePressed('KeyE')) {
        body.setTranslation({ x: INTERIOR.x, y: 1.2, z: INTERIOR.z + INTERIOR.d / 2 - 2.4 }, true)
        body.setLinvel({ x: 0, y: 0, z: 0 }, true)
        rt.camYaw = 0
        rt.camPitch = 0.25
        st.set({ inShop: best.id, prompt: '' })
        sfx('door')
      }
      return
    }

    let ped: (typeof pedInfos)[number] | null = null
    let pd = 2.8 * 2.8
    for (const q of pedInfos) {
      if (!q.active) continue
      const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2
      if (d < pd) {
        pd = d
        ped = q
      }
    }
    if (ped) {
      set(`E  Talk to ${ped.name}`)
      if (consumePressed('KeyE')) {
        ped.talkUntil = performance.now() + 5000
        dialogueUntil = performance.now() + 5000
        st.set({ dialogue: { name: ped.name, text: dialogueFor(ped, st.hour, Math.random) } })
        sfx('talk')
      }
    } else set('')
  })
  return null
}
