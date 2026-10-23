import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { rt } from '../engine/runtime'
import { useGame } from '../store/game'
import { drawGps, drawOff, dashScale } from '../driver/drawMap'
import { pressDash } from '../driver/dashActions'
import type { DashButton } from '../driver/dashActions'
import type { Prepared } from './specs'

/**
 * The in-car cockpit: dash slab, steering wheel, digital speedometer and the infotainment unit with the live
 * GPS map. The map is a CanvasTexture painted by the same renderer the overlay and expanded map use, from the
 * real road graph and the vehicle's physics position. The four buttons beneath it are real 3D objects: the
 * crosshair (or the free mouse cursor) picks them with a raycast, they light up on hover and respond to a click.
 */
const BUTTONS: { id: DashButton; label: string }[] = [
  { id: 'gps', label: 'GPS' },
  { id: 'map', label: 'MAP' },
  { id: 'expand', label: 'EXPAND' },
  { id: 'jobs', label: 'JOBS' },
]
const SCREEN_W = 640
const SCREEN_H = 400

function labelTexture(text: string) {
  const c = document.createElement('canvas')
  c.width = 192
  c.height = 96
  const g = c.getContext('2d')!
  g.clearRect(0, 0, 192, 96)
  g.fillStyle = '#ffffff'
  g.font = '700 ' + (text.length > 4 ? 30 : 38) + 'px "Segoe UI", system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, 96, 50)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

export default function Dashboard({ prep }: { prep: Prepared }) {
  const cp = prep.cockpit
  const root = useRef<THREE.Group>(null)
  const wheel = useRef<THREE.Group>(null)
  const { camera, pointer } = useThree()

  const screen = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = SCREEN_W
    canvas.height = SCREEN_H
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    return { canvas, tex, g: canvas.getContext('2d')! }
  }, [])
  const speedo = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 96
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return { canvas, tex, g: canvas.getContext('2d')! }
  }, [])
  const labels = useMemo(() => BUTTONS.map((b) => labelTexture(b.label)), [])
  const mats = useMemo(() => BUTTONS.map(() => new THREE.MeshStandardMaterial({ color: '#1d2330', roughness: 0.5, metalness: 0.2, emissive: '#000000' })), [])
  const labelMats = useMemo(() => labels.map((t) => new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false, depthWrite: false })), [labels])
  const btnMeshes = useRef<THREE.Mesh[]>([])
  const btnGroups = useRef<THREE.Group[]>([])
  const hover = useRef(-1)
  const pressedAt = useRef<number[]>(BUTTONS.map(() => -10))
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const centre = useMemo(() => new THREE.Vector2(0, 0), [])
  const nextDraw = useRef(0)
  const nextSpeedo = useRef(0)
  const lastDrawn = useRef('')

  useEffect(
    () => () => {
      screen.tex.dispose()
      speedo.tex.dispose()
      labels.forEach((t) => t.dispose())
      mats.forEach((m) => m.dispose())
      labelMats.forEach((m) => m.dispose())
    },
    [screen, speedo, labels, mats, labelMats],
  )

  // click: the hovered 3D button is activated by the mouse
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0 || hover.current < 0) return
      const s = useGame.getState()
      if (s.phase !== 'playing' || s.camMode !== 'cockpit' || !s.inVehicle) return
      pressedAt.current[hover.current] = performance.now()
      pressDash(BUTTONS[hover.current].id)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [])

  useFrame(() => {
    const g3 = root.current
    if (!g3 || !cp) return
    const s = useGame.getState()
    const show = s.camMode === 'cockpit' && s.inVehicle
    g3.visible = show
    if (!show) {
      if (hover.current !== -1) {
        hover.current = -1
        if (s.dashHover) s.set({ dashHover: '' })
      }
      return
    }

    // steering wheel follows the steering input
    if (wheel.current) wheel.current.rotation.z = -rt.steer * 3.2

    // pick a button with the crosshair (pointer locked) or the mouse cursor
    const locked = !!document.pointerLockElement
    raycaster.setFromCamera(locked ? centre : pointer, camera)
    raycaster.far = 2.4
    g3.updateWorldMatrix(true, true)
    const hits = raycaster.intersectObjects(btnMeshes.current, false)
    const idx = hits.length ? btnMeshes.current.indexOf(hits[0].object as THREE.Mesh) : -1
    if (idx !== hover.current) {
      hover.current = idx
      s.set({ dashHover: idx >= 0 ? BUTTONS[idx].label : '' })
    }

    // button colours: hover, active state, press flash
    const now = performance.now()
    BUTTONS.forEach((b, i) => {
      const on = b.id === 'gps' ? s.gpsOn : b.id === 'map' ? s.gpsOn && s.gpsView === 'map' : b.id === 'expand' ? s.gpsExpanded : false
      const flash = now - pressedAt.current[i] < 180
      const m = mats[i]
      if (flash) m.emissive.set('#ffffff')
      else if (i === hover.current) m.emissive.set('#2f80ff')
      else m.emissive.set(on ? '#0c5a2c' : '#000000')
      m.emissiveIntensity = flash ? 0.9 : i === hover.current ? 1.1 : on ? 0.9 : 0
      labelMats[i].color.set(i === hover.current || flash ? '#ffffff' : on ? '#9dffc4' : '#aeb9d1')
      const grp = btnGroups.current[i]
      if (grp) grp.position.z = 0.026 - (flash ? 0.006 : i === hover.current ? 0.002 : 0)
    })

    // repaint the map screen at about 15 fps (a signature check skips redundant work when it is off)
    if (now >= nextDraw.current) {
      nextDraw.current = now + 66
      const sig = s.gpsOn ? 'on' : 'off'
      if (s.gpsOn) {
        drawGps(screen.g, { w: SCREEN_W, h: SCREEN_H, scale: dashScale(SCREEN_W) * 1.05, mode: 'track', ui: 1.25, hud: true, view: s.gpsView })
        screen.tex.needsUpdate = true
        lastDrawn.current = sig
      } else if (lastDrawn.current !== 'off') {
        drawOff(screen.g, SCREEN_W, SCREEN_H, 1.6)
        screen.tex.needsUpdate = true
        lastDrawn.current = 'off'
      }
    }
    if (now >= nextSpeedo.current) {
      nextSpeedo.current = now + 120
      const g = speedo.g
      g.fillStyle = '#05080e'
      g.fillRect(0, 0, 256, 96)
      g.fillStyle = '#e9f2ff'
      g.font = '700 54px "Segoe UI", system-ui, sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(String(s.speedKmh), 112, 46)
      g.fillStyle = '#6d7f9f'
      g.font = '600 20px "Segoe UI", system-ui, sans-serif'
      g.fillText('km/h', 214, 54)
      g.fillStyle = s.vehicleHealth < 35 ? '#ff5a4a' : '#3dd68c'
      g.fillRect(10, 84, Math.max(2, (s.vehicleHealth / 100) * 236), 6)
      speedo.tex.needsUpdate = true
    }
  })

  if (!cp || cp.noDash) return null
  const [ex, ey, ez] = cp.eye
  const drvX = ex
  const belt = cp.belt
  const zf = cp.zFront
  const width = Math.max(1.0, prep.halfW * 2 - 0.2)
  return (
    <group ref={root} visible={false}>
      {/* dark interior floor over the body's top face, so the cabin does not look like a painted lid */}
      {cp.zBack != null && (
        <mesh position={[0, belt + 0.004, (zf + cp.zBack) / 2]}>
          <boxGeometry args={[Math.max(0.8, prep.halfW * 2 - 0.22), 0.008, zf - cp.zBack]} />
          <meshStandardMaterial color="#15171c" roughness={0.95} />
        </mesh>
      )}
      {/* dash slab and cowl */}
      <mesh position={[0, belt - 0.11, zf - 0.27]}>
        <boxGeometry args={[width, 0.22, 0.54]} />
        <meshStandardMaterial color="#14171d" roughness={0.75} />
      </mesh>
      <mesh position={[0, belt + 0.008, zf - 0.27]}>
        <boxGeometry args={[width - 0.04, 0.018, 0.5]} />
        <meshStandardMaterial color="#1c2028" roughness={0.9} />
      </mesh>
      {/* instrument binnacle behind the wheel */}
      <group position={[drvX, belt + 0.085, zf - 0.37]} rotation={[0, Math.PI, 0]}>
        <mesh>
          <boxGeometry args={[0.36, 0.13, 0.1]} />
          <meshStandardMaterial color="#0b0d12" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0, 0.0505]}>
          <planeGeometry args={[0.32, 0.12]} />
          <meshBasicMaterial map={speedo.tex} toneMapped={false} />
        </mesh>
      </group>
      {/* steering column + wheel */}
      <group position={[drvX, ey - 0.3, ez + 0.5]} rotation={[0.42, 0, 0]}>
        <group ref={wheel}>
          <mesh>
            <torusGeometry args={[0.175, 0.019, 10, 28]} />
            <meshStandardMaterial color="#0e1014" roughness={0.6} />
          </mesh>
          <mesh>
            <cylinderGeometry args={[0.04, 0.04, 0.03, 14]} />
            <meshStandardMaterial color="#20242c" />
          </mesh>
          <mesh rotation={[0, 0, 0]}>
            <boxGeometry args={[0.32, 0.026, 0.014]} />
            <meshStandardMaterial color="#0e1014" />
          </mesh>
          <mesh position={[0, -0.085, 0]}>
            <boxGeometry args={[0.026, 0.17, 0.014]} />
            <meshStandardMaterial color="#0e1014" />
          </mesh>
          <mesh position={[0, 0.172, 0.002]}>
            <boxGeometry args={[0.03, 0.022, 0.02]} />
            <meshStandardMaterial color="#ffd24a" emissive="#ffd24a" emissiveIntensity={0.5} />
          </mesh>
        </group>
      </group>
      {/* infotainment unit */}
      <group position={[0.0, belt + 0.16, zf - 0.45]} rotation={[0, Math.PI - 0.22, 0]}>
        <group rotation={[-0.2, 0, 0]}>
          <mesh>
            <boxGeometry args={[0.37, 0.29, 0.04]} />
            <meshStandardMaterial color="#07090d" roughness={0.3} metalness={0.5} />
          </mesh>
          <mesh position={[0, 0.026, 0.0206]}>
            <planeGeometry args={[0.33, 0.206]} />
            <meshBasicMaterial map={screen.tex} toneMapped={false} />
          </mesh>
          {BUTTONS.map((b, i) => (
            <group
              key={b.id}
              position={[-0.1275 + i * 0.085, -0.113, 0.026]}
              ref={(g) => {
                if (g) btnGroups.current[i] = g
              }}
            >
              <mesh
                material={mats[i]}
                ref={(m) => {
                  if (m) {
                    btnMeshes.current[i] = m
                    m.userData.id = b.id
                  }
                }}
              >
                <boxGeometry args={[0.074, 0.036, 0.014]} />
              </mesh>
              <mesh position={[0, 0, 0.0075]} material={labelMats[i]}>
                <planeGeometry args={[0.07, 0.035]} />
              </mesh>
            </group>
          ))}
        </group>
      </group>
    </group>
  )
}
