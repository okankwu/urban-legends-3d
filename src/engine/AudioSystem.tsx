import { useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { initAudio, setVolume, sfx, updateAudio } from './audio'
import { consumePressed, rt } from './runtime'
import { useGame } from '../store/game'
import { nightFactor } from '../city/City'
import { pedInfos } from '../npc/pedData'
import { carPositions } from '../traffic/Traffic'
import { policeProximity } from '../police/wanted'
import { caption } from '../ui/captions'

let hornCool = 0
let toastSeen = ''
let sirenCap = 0

/** Bridges game state to the synthesised audio engine; also handles the horn and UI click sounds. */
export default function AudioSystem() {
  const volume = useGame((s) => s.volume)
  useEffect(() => setVolume(volume), [volume])

  useEffect(() => {
    const unlock = () => initAudio()
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    const click = (e: Event) => {
      if ((e.target as HTMLElement).closest?.('button')) sfx('click')
    }
    document.addEventListener('pointerdown', click, true)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      document.removeEventListener('pointerdown', click, true)
    }
  }, [])

  useFrame((_, dt) => {
    const st = useGame.getState()
    const playing = st.phase === 'playing'
    hornCool -= dt
    if (playing && st.inVehicle && rt.keys.KeyH && hornCool <= 0) {
      hornCool = 0.5
      rt.hornTime = rt.simTime
      sfx('horn')
      caption('[Horn]', 1200)
    }
    if (st.toast && st.toast !== toastSeen) sfx('toast')
    toastSeen = st.toast

    // nearest traffic -> ambient rumble
    let near = 0
    const px = rt.playerPos.x
    const pz = rt.playerPos.z
    for (const c of carPositions) {
      if (!c.act) continue
      const d = Math.hypot(c.x - px, c.z - pz)
      if (d < 40) near = Math.max(near, 1 - d / 40)
    }
    void pedInfos
    const k = rt.keys
    const siren = policeProximity()
    if (siren > 0.3 && performance.now() - sirenCap > 3000) {
      sirenCap = performance.now()
      caption('[Police siren nearby]', 2800)
    }
    updateAudio({
      dt: Math.min(dt, 0.1),
      playing,
      inCar: st.inVehicle,
      carSpeed: rt.vehicleSpeed,
      throttle: st.inVehicle ? (k.KeyW || k.ArrowUp ? 1 : 0) : 0,
      walkSpeed: rt.walkSpeed,
      grounded: rt.grounded,
      sprint: !!(k.ShiftLeft || k.ShiftRight),
      hour: st.hour,
      night: nightFactor(st.hour),
      nearTraffic: near,
      rain: rt.rain,
      siren,
      indoors: !!st.inShop,
      music: st.music,
    })
    void consumePressed
  })
  return null
}
