# Urban Legends 3D

An original GTA-inspired third-person open-world city game that runs in the browser.
Built with Vite, React, TypeScript, Three.js (React Three Fiber + Drei), Rapier physics and Zustand.
All city geometry, vehicles (except the supplied Subaru), characters (except the supplied Meshy model), sounds and music are original / procedurally generated.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build locally
```

Click **Start Game** (this also captures the mouse). **Esc** pauses; click **Resume** to recapture the mouse.
Requirements: a current Chrome, Edge, Firefox or Safari with WebGL2/WebGL; a desktop GPU for 60 fps at High.

### Deploy
`npm run build`, then upload `dist/` to any static host (Netlify, Vercel, GitHub Pages, S3, itch.io HTML5). No server is needed. Models are loaded from `/models/` so serve the folder from the site root.

## Controls (all rebindable in Controls)

| Key | Action |
|---|---|
| W A S D | Move / drive |
| Mouse | Camera |
| Shift | Sprint (uses stamina) |
| Space | Jump (handbrake in a vehicle) |
| C | Crouch |
| E | Interact: enter vehicle, shops, talk, ask for clues |
| F | Exit vehicle |
| G | Open garage (blue pads) |
| H / L / Z X | Horn / headlights / indicators |
| R | Reset a flipped vehicle |
| M | Map (click = waypoint, right-click = clear) |
| Tab | Journal |
| Esc | Pause |

Touch screens get an on-screen joystick (drag the right side to look) and buttons automatically; see Accessibility for options.

## What is in the game

- **City** – procedural 9×9-road, 8×8-block city: downtown towers, commercial and residential blocks, parks, crosswalks, streetlights, trees; instanced buildings with lit windows at night; day/night cycle.
- **Character** – character creator on first launch (name, height, head size, skin tone, hair colour/style, outfits, glasses, cap, headphones, backpack), saved in the browser. Upload your own rigged `.glb`/`.gltf`/`.vrm`: it is validated, scaled, and the walk/run/idle/crouch/jump/seated animations are retargeted onto it.
- **Vehicles** – seven drivable vehicles (Impreza STi, sedan, SUV, pickup, van, motorcycle, Apex GT) with suspension, damage, headlights, brake lights, indicators.
- **Living city** – traffic that obeys signals, pedestrians that cross at lights, enter shops and react to you, enterable shops (health/stamina, clothing store), synthesised audio, rain/storm/fog weather with wet roads.
- **Missions** – five missions (tutorial, delivery, missing car, street race with AI, reputation) plus repeatable courier jobs, checkpoints, timers, rewards, map markers.
- **Economy** – cash from missions/jobs/races; spend on vehicles, repairs, paint, outfits and supplies; garages; districts unlock with progress.
- **Police** – wanted level from running people over and crashing; pursuit, escape and arrest (fine) mechanics.
- **Save/load** – character (localStorage + IndexedDB for uploaded models), settings, money, health, missions, unlocks, owned vehicles, paint, time of day and positions (Save Game in the pause menu; autosaves on mission checkpoints).

## Performance

- Instancing for buildings, trees, streetlights, road markings and traffic lights; the player's Subaru (about 160 meshes and 1M triangles originally) is simplified and merged at load (47 MB source to a 2.9 MB GLB with meshopt + WebP textures).
- Pre-allocated pools for traffic cars, police and pedestrians; counts scale with quality (cars 12/24/36, pedestrians 18/32/48) and far ones are hidden by distance.
- Low / Medium / High presets (resolution, shadows, view distance, entity counts) and **adaptive resolution** that lowers the render scale when FPS drops. *Settings → Show FPS* shows fps, draw calls and triangles.
- Measured in the development browser (hardware GL, small pane): 60 fps with about 220–360 draw calls and 0.4–0.55 M triangles at High near spawn and downtown. Other hardware will differ.
- Not implemented: per-chunk streaming/LOD of the city (the whole city is built at startup and instanced), texture compression beyond WebP, worker-thread physics.

## Accessibility

Key rebinding · reduce motion (no lightning flashes, lighter rain, no UI animation; follows the OS setting by default) · high-contrast HUD · colour-blind-safe markers and traffic lights · sound captions (siren, horn, thunder) · interface size 80–150 % · visible focus outlines, labelled controls, keyboard-operable menus · touch controls.

## Project layout

```
src/
  engine/     input, key bindings, audio synth, perf, shared runtime state
  store/      Zustand game store
  city/       procedural layout, rendering, sky, weather, signals, district barricades
  player/     character model, controller, camera
  characters/ creator, appearance tint shader, accessories, upload + retargeting
  vehicles/   specs + physics vehicle
  traffic/    AI traffic and police cars
  npc/        pedestrians
  shops/      shop fronts, interior, interactions, shop UI
  garage/     garages and garage UI
  missions/   manager, mission definitions, race, markers, save/load
  police/     wanted level, arrest
  ui/         HUD, minimap, map, journal, menus, touch controls
public/models/  player.glb, player2.glb, subaru.glb
```

## Assets
- `player.glb` / `player2.glb` – supplied Meshy character (Mixamo skeleton; walk/run clips only; idle/crouch/jump/seated are generated procedurally and retargeted).
- `subaru.glb` – supplied Sketchfab Subaru Impreza WRX STI, optimised with `gltf-transform` (meshopt, WebP 512 px, mesh simplification). Check its licence/attribution before publishing.
- Everything else is generated in code. No audio files are used.

## What was tested

Verified in a browser while building (desktop, keyboard): game loads without console errors; movement, sprint, jump, crouch, camera follow; building collision; entering/driving/exiting vehicles (all seven classes driven); character creator, save/restore across refresh, upload validation (rejects static meshes and unrecognised rigs, accepts Mixamo- and VRM-style skeletons); traffic obeying signals and pedestrian crossing (numeric sampling); shops, purchases, garage UI; all five missions through their state machine, race, courier jobs, fail/checkpoint, save/continue; district barricade blocks then opens; weather; wanted level, pursuit and arrest; key rebinding; production build.

Not verified / known limits:
- Audio was confirmed to initialise and fire events, but was never listened to.
- The touch controls compile and the joystick state updates, but I could not drive the character with them (the preview pane was hidden and throttled) and did not test on a real phone. No gamepad support.
- Only one body is supplied (male); "Model A/B" are two outfits of it. Colour tinting, hair styles and accessories only apply to the built-in models. Face shape comes from the texture.
- Police are cars only (no officers on foot or weapons); traffic and police cars are kinematic (they bump but do not deform); vehicle bodies do not deform; paint works on the procedural vehicles only; the motorcycle is a simple model.
- Missions 3–5 were exercised by moving the car with code for long drives, not by hand-driving each route.
- Weather and wanted level are not saved. Uploaded `.gltf` files must embed their data; Draco-compressed uploads load a decoder from gstatic.com.
