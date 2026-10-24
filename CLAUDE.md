# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
npm run dev        # Vite dev server, http://localhost:5173 (also configured in .claude/launch.json as "urban-legends")
npm run build      # tsc --noEmit && vite build -> dist/
npm run preview    # serve dist/
npx tsc --noEmit --noUnusedLocals   # stricter check used during bug sweeps
```

There is no test runner or linter. Verification is done in a browser (see "Testing in the browser").

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds and publishes `dist/` to GitHub Pages at https://okankwu.github.io/urban-legends-3d/ (repo `okankwu/urban-legends-3d`). The site is served from a sub-path, so `vite.config.ts` sets `base: './'` and every runtime asset URL must be built from `import.meta.env.BASE_URL` (see the three `models/*.glb` references), never a leading `/`.

## Architecture

Vite + React + TypeScript; R3F (`@react-three/fiber`/`drei`) renders, `@react-three/rapier` simulates physics, Zustand holds state. All sounds, the city, and most vehicles are generated in code; the only external assets are `public/models/{player,player2,subaru}.glb`.

**Two state layers — know which to use.**
- `src/store/game.ts` (Zustand): UI/save-level state (phase `menu|creator|playing|paused|shop|map|journal|garage`, money, mission, settings, appearance). React components subscribe to it. Use `useGameFields([...] as const)` for shallow multi-field subscriptions instead of `useGame()` on the whole store (HUD/Menus do this to avoid re-rendering on every change).
- `src/engine/runtime.ts` (`rt`): plain mutable object for per-frame data (player/vehicle positions, held keys, `pressed` timestamps consumed with `consumePressed`, sim time, rain/flash, touch stick, vehicle spawn/freeze requests). Read/write it inside `useFrame`; never put per-frame values in Zustand.

**Scene composition** is in `src/App.tsx`: `Canvas` → `Physics` (paused unless `phase === 'playing'`) containing `City`, `Districts`, `Player`, `Car`, `Traffic`, `Peds`, `RaceCars`, `Interior`, plus non-physics systems (`World`, `Weather`, `MissionSystem`, `AudioSystem`, `PerfProbe`). HTML UI (HUD, Menus, Creator, MapScreen, Journal, ShopUI, GarageUI, TouchControls) is mounted beside the Canvas.

**City** (`src/city/`): `layout.ts` generates a seeded grid (CELL 80, ROAD_W 16, BLOCK 64) of buildings/trees/lamps; `City.tsx` renders it with instanced meshes and shader-patched (`onBeforeCompile`) window/night materials; `roadnet.ts` exposes lanes, signal state (24 s cycle), pedestrian walk nodes and the dynamic world limit (`roadMax/setRoadLimit/inRoads`). `Districts.tsx` walls off the outer districts (bound 248) until `outer-districts` is unlocked or the `delivery` mission is done — the RigidBody stays mounted and only its colliders are conditional.

**Vehicles** (`src/vehicles/`): `specs.ts` defines 7 vehicles (procedural builders, plus the Subaru GLB); `Car.tsx` is one generic `Vehicle` using Rapier's `DynamicRayCastVehicleController`, with damage, lights, wet-road grip and a roll stabiliser for the bike. The Subaru GLB is simplified and merged (`prepareGLB` + `mergeStatic`) at load. Traffic, police and race AI cars (`src/traffic`, `src/missions/Race.tsx`) are kinematic bodies in fixed pools; the `act` flag marks which pooled cars are real, and `carPositions` exports them for others to query.

**Characters** (`src/player`, `src/characters`): the built-in Meshy model has a Mixamo skeleton with only Walk/Run clips; idle/crouch/jump/seated come from procedural pose clips (`poses.ts`). Colours are applied by a skin-weight region tint shader (`skinTint.ts`, which clones the material per instance — `CharacterModel` disposes it on unmount). Uploaded GLB/VRM files are validated, scaled and retargeted by bone name with `SkeletonUtils.retargetClip` in `customRig.ts`, and persisted in IndexedDB.

**Missions/progress** (`src/missions/`): data-driven definitions in `missions.ts` (5 missions + generated courier jobs) run by a state machine in `manager.ts` (`startMission`, `tickMissions`, `complete`, `fail`, `newGame`, `continueGame`, `saveGame`); save format is in `progress.ts`. `manager.newGame` must reset vehicles and runtime state too. Police/wanted logic is in `src/police/wanted.ts` and is called from the traffic update.

**Driver jobs + GPS** (`src/driver/`): `roadGraph.ts` (grid graph, `snapToRoad`, street names), `gps.ts` (A* `planRoute`, per-frame `tickGps`: progress, ETA, off-route and wrong-way re-plan, shared `gps` state), `drawMap.ts` (one canvas renderer used by the dashboard texture, `ui/GpsOverlay`, `ui/ExpandedCityMap`), `jobs.ts` (job factories), `manager.ts` (one active run, stage tracker, reward payout, fail/abandon), `rewards.ts` (levels, daily challenges, achievements, local leaderboard, `DriverData`), `DriverSystem.tsx` (per-frame tick + dev `__driver`). `DriverData` lives in the store (`driver`) and inside the normal progress save (`missions/progress.ts`); `complete()` in `manager.ts` pays once (uid in `driver.claimed`) then calls `saveGame()`. Driver jobs use their own store fields (`djJob`, `djMarkers`, `djPrompt`, `djResult`) so they never fight the story manager over `mission`/`markers`; story hooks reach them through `failHooks`/`resetHooks` in `missions/actions.ts`. The E key is shared: `rt.driverInteract` stops `Player.tsx` from treating E as "exit car" while a pickup prompt is showing.

**Cockpit + dashboard** (`vehicles/Dashboard.tsx`, `CameraRig.tsx`): `Prepared.cockpit` gives each vehicle its eye point and dash geometry; `camMode` (V) switches to a first-person camera driven by `rt.vehicleQuat` and head-look angles. The dash screen is a `CanvasTexture`; its buttons are raycast from the crosshair (pointer locked) or the cursor, and call `driver/dashActions.ts` (the same functions the keys use). The Subaru GLB has its own interior; procedural cars get a dark floor/dash slab from `Dashboard`.

**Input** (`src/engine/input.ts`, `bindings.ts`): keys go through a remap table built by `buildRemap`; pointer-lock requests must tolerate failure (e.g. in embedded preview panes).

## Testing in the browser

- In dev builds only (`import.meta.env.DEV`), the globals `__game` (store), `__rt`, `__cars`, `__peds`, `__step`, `__sim` are exposed for scripted checks via the browser tool.
- A hidden/background browser tab throttles `requestAnimationFrame` to ~1 fps; use `__step`/`DevStepper` (`src/engine/Perf.tsx`) to advance the simulation instead of waiting in real time.
- `window.__driver` (dev only) exposes the planner, `buildJob`, `acceptJob` and `drawGps`. `__step` runs with a small effective dt, so a timed stage (e.g. a 4 s hold) needs a few hundred steps.
- Missions 3–5 were tested by teleporting the car (`teleportCar` in `missions/actions.ts`), not by hand-driving.

**Touch / mobile** (`ui/TouchControls.tsx`, `engine/mobile.ts`, `mobile.css`, `ui/MobileExtras.tsx`): `isTouchUi()` (setting + `pointer: coarse`) decides the layout; `initMobile()` mirrors it on `<html data-touch>` so CSS can restyle the HUD. Touch buttons write into the same `rt.keys` / `rt.pressed` table as the keyboard; the joystick feeds `rt.stick` (analog steering in `Car.tsx`, movement in `Player.tsx`). Anything that is a key handler in `input.ts` (G, N, V, J) has no touch equivalent through `rt.pressed`, so touch buttons call the same functions directly (`driver/dashActions.ts`). `public/manifest.webmanifest` + icons make Add-to-Home-Screen fullscreen.

## Known limits (from README)

Audio has never been listened to; touch controls and the final "test everything" pass (shops, garage, mission chain, upload validation, touch Jump) are not fully verified on a real device; weather and wanted level are not saved; the `subaru.glb` and Meshy models are third-party assets whose licences should be checked since the repo is public.

## Shell notes (Windows)

Inline `node -e` / heredocs with mixed quotes were unreliable from the Bash tool; writing a throwaway script file into the project, running it, then deleting it worked. `gh` is installed portably at `%USERPROFILE%\tools\gh\bin\gh.exe` and is not on the Bash tool's PATH.
