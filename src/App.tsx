import { Suspense, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { Loader } from '@react-three/drei'
import City from './city/City'
import World from './city/World'
import Player from './player/Player'
import CameraRig from './player/CameraRig'
import Car from './vehicles/Car'
import Traffic from './traffic/Traffic'
import TrafficLights from './city/TrafficLights'
import Peds from './npc/Peds'
import ShopFronts from './shops/ShopFronts'
import Interior from './shops/Interior'
import Interactions from './shops/Interactions'
import ShopUI from './shops/ShopUI'
import AudioSystem from './engine/AudioSystem'
import MapScreen from './ui/MapScreen'
import TouchControls from './ui/TouchControls'
import { ErrorBoundary, Notice, webglSupported } from './ErrorBoundary'
import GarageUI from './garage/GarageUI'
import Weather from './city/Weather'
import { PerfProbe, FpsMeter, DevStepper } from './engine/Perf'
import Districts from './city/Districts'
import Garages3D from './garage/Garages3D'
import Journal from './ui/Journal'
import SkyDetails from './city/Sky'
import MissionSystem from './missions/MissionSystem'
import Markers3D from './missions/Markers3D'
import { RaceCars } from './missions/Race'
import HUD from './ui/HUD'
import Menus from './ui/Menus'
import { installInput } from './engine/input'
import DriverSystem from './driver/DriverSystem'
import DriverScene3D from './driver/DriverScene3D'
import DriverJobsMenu from './ui/DriverJobsMenu'
import { useGame } from './store/game'
import Creator from './characters/Creator'
import CreatorStage from './characters/CreatorStage'
import VehicleStage from './vehicles/VehicleStage'
import VehicleSelect from './ui/VehicleSelect'
import { initMobile } from './engine/mobile'
import { RotateHint } from './ui/MobileExtras'
import { buildCustomRig, loadCustomFile, setCustomRig } from './characters/customRig'

export default function App() {
  if (!webglSupported()) {
    return (
      <Notice title="WebGL is not available">
        <p>Urban Legends 3D needs WebGL to draw the 3D city, and this browser or device does not provide it.</p>
        <p>Try a current version of Chrome, Edge, Firefox or Safari, make sure hardware acceleration is enabled, and reload.</p>
      </Notice>
    )
  }
  return (
    <ErrorBoundary>
      <Game />
    </ErrorBoundary>
  )
}

function Game() {
  const phase = useGame((s) => s.phase)
  const quality = useGame((s) => s.quality)
  const showFps = useGame((s) => s.showFps)
  const contrast = useGame((s) => s.highContrast)
  const reduce = useGame((s) => s.reduceMotion)
  const uiScale = useGame((s) => s.uiScale)

  useEffect(() => {
    const d = document.documentElement
    d.dataset.contrast = contrast ? 'high' : 'normal'
    d.dataset.motion = reduce ? 'reduce' : 'normal'
    d.style.setProperty('--ui', String(uiScale))
  }, [contrast, reduce, uiScale])

  useEffect(() => {
    installInput(() => document.querySelector('canvas'))
    initMobile()
    // restore a previously uploaded character
    const st = useGame.getState()
    if (st.appearance.base === 'custom') {
      loadCustomFile()
        .then((f) => (f ? buildCustomRig(f.buffer, f.fileName) : Promise.reject(new Error('missing'))))
        .then((rig) => {
          setCustomRig(rig)
          useGame.getState().set({ customVersion: useGame.getState().customVersion + 1 })
        })
        .catch(() => useGame.getState().set({ appearance: { ...useGame.getState().appearance, base: 'meshy-a' } }))
    }
  }, [])


  return (
    <>
      <Canvas
        shadows
        camera={{ fov: 62, near: 0.1, far: 6000, position: [0, 30, 60] }}
        gl={{ antialias: quality !== 'low', powerPreference: 'high-performance' }}
      >
        <World />
        <TrafficLights />
        <SkyDetails />
        <Markers3D />
        <Garages3D />
        <Weather />
        <PerfProbe />
        <DevStepper />
        <MissionSystem />
        <DriverSystem />
        <DriverScene3D />
        <ShopFronts />
        <AudioSystem />
        <Suspense fallback={null}>
          <Physics gravity={[0, -20, 0]} paused={phase !== 'playing'} timeStep="vary" updatePriority={-50}>
            <City />
            <Districts />
            <Player />
            <Car />
            <Traffic />
            <Peds />
            <RaceCars />
            <Interior />
            <Interactions />
            <CameraRig />
            {phase === 'creator' && <CreatorStage />}
            {phase === 'vehicles' && <VehicleStage />}
          </Physics>
        </Suspense>
      </Canvas>
      <Loader />
      {showFps && <FpsMeter />}
      {(phase === 'playing' || phase === 'paused' || phase === 'shop' || phase === 'map' || phase === 'journal' || phase === 'garage' || phase === 'jobs') && <HUD />}
      {phase === 'jobs' && <DriverJobsMenu />}
      {phase === 'creator' && <Creator />}
      <VehicleSelect />
      {phase === 'map' && <MapScreen />}
      {phase === 'journal' && <Journal />}
      <TouchControls />
      <RotateHint />
      <GarageUI />
      <ShopUI />
      <Menus />
    </>
  )
}
