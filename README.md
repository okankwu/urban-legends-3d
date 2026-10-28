# Urban Legends 3D

An original GTA-inspired third-person open-world city game that runs in the browser.
Built with Vite, React, TypeScript, Three.js (React Three Fiber + Drei), Rapier physics and Zustand.
All city geometry, vehicles (except the supplied Subaru and Desert Titan), characters (except the supplied Meshy model), sounds and music are original / procedurally generated.

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
`npm run build`, then upload `dist/` to any static host (Netlify, Vercel, GitHub Pages, S3, itch.io HTML5). No server is needed. Asset URLs are relative (`base: ./`), so it also works from a sub-path such as GitHub Pages.

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
| G | Open garage (blue pads); in a vehicle anywhere else: toggle the dashboard GPS |
| H / L / Z X | Horn / headlights / indicators |
| R | Reset a flipped vehicle |
| M | Full-screen city map with the GPS route (click = waypoint, right-click = clear) |
| J | Driver Jobs menu |
| V | Cockpit (first-person) / chase camera |
| N | Expand / close the large GPS overlay (Esc also closes it) |
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

## Driver jobs, points and GPS

Press **J** (or Pause → Driver Jobs, or the JOBS button on the dashboard) to take a driver job. One job runs at a time; a story mission that is running is set aside and restarts from its marker.

| Job | Level | What you do | Base points |
|---|---|---|---|
| Taxi | 1 | stop at the passenger, **E**, drive to the drop-off | 100–300 |
| Parking | 1 | park inside a marked bay (score from accuracy, damage, time) | 50–200 |
| Delivery | 2 | collect a package at a warehouse (**E**), deliver before the timer ends | 150–400 |
| Long distance | 3 | three checkpoints, then the destination | 200–600 |
| Emergency | 4 | patient to hospital, emergency supplies, or fire support (hold position) | 300–700 |
| Street race | 5 | the downtown ring race against three AI drivers | 1st 1,000 · 2nd 600 · 3rd 300 · 4th 100 |

- **Rewards:** bonuses for no damage, finishing on time/early, following the route, a clean police record and consecutive completions; daily challenges (3 a day) and achievements. Failed or abandoned jobs pay nothing and break the streak. Every job has a unique id that is stored once paid, so a reward cannot be claimed twice.
- **Levels** (XP is separate from the spendable points balance): Rookie 0 · City Driver 500 · Skilled 1,500 · Professional 3,000 · Elite 5,000. Spendable points can be redeemed in the Rewards tab (vehicle repair, cash).
- **Saving:** points, XP, history, streak, achievements and daily progress are part of the normal progress save and are written the moment a job pays out.
- **Leaderboard:** local only. The other drivers are fictional characters for comparison, not real players.
- **GPS:** A* routing over the real road grid (the same one the city and traffic use), turn-by-turn instructions with street names, distance and ETA, re-routing when you leave the route or drive it the wrong way. It is drawn in the dashboard screen of every car-type vehicle (cockpit view, **V**), as a floating overlay in the chase camera, and in an expanded overlay (**N**). The MAP / GPS / EXPAND / JOBS buttons on the dashboard are real 3D objects: look at one with the crosshair (or point with the cursor), it highlights, and a click presses it. The motorcycle has a first-person view but no dashboard screen (use the floating overlay).

## Phones and tablets

The game detects touch screens (or use Accessibility → Touch controls → Always on) and switches to a touch layout:

- **On foot:** joystick (left), drag the right side of the screen to look, Jump / Run / Duck / Use buttons. A yellow "Tap: …" button appears when something can be interacted with (shop door, pickup, pedestrian).
- **Driving:** the joystick steers (analog, left/right); **Gas** and **Brake** pedals sit under the right thumb, with Handbrake, Horn, Exit, Use, GPS, Big map, View (cockpit/chase) and Garage buttons above them. Top row: Map, Log, Jobs, Fullscreen, Pause. In the cockpit view, drag to look around and tap a dashboard button to press it.
- **Layout:** built for landscape; in portrait phones show a "turn your phone sideways" notice (dismissible). The HUD, menus, Driver Jobs, creator and expanded GPS are resized for short screens and respect notches / safe areas.
- **Performance:** a first run on a touch device starts on Low quality with adaptive resolution. The game pauses when the app goes to the background and keeps the screen awake while playing (where the browser supports it).
- **Full screen:** Start Game requests fullscreen + landscape on Android Chrome and tablets (also a button in the top row and in Settings). iPhone Safari has no fullscreen for web pages: use Share → Add to Home Screen and launch it from the icon to get a full-screen, landscape app.
- The pinch / double-tap page zoom and the long-press menu are disabled on the game surface.

## Security

The game is a static client-side app (no server, database or accounts), so the protections focus on what it does have: a Content Security Policy in the production build, no third-party runtime code, validation of everything read back from storage and of uploaded character files, and a hardened build pipeline (pinned actions, dependency audit, Dependabot). Players can still edit their own local save to cheat; see [SECURITY.md](SECURITY.md) for the details, the limits and what to do if an online backend is ever added.

## Music

**"Neon Boulevard"** is an original instrumental written for this game (`src/engine/music.ts`): 100 BPM, A minor, 32 bars (about 77 s) that loop through an intro, a groove, a lift with the main melody, and a break. It is composed and synthesised entirely in code (no samples, recordings or borrowed melodies), so it contains nothing third-party; you can use, change and share it freely, including in commercial projects. It plays by default and can be turned off in Settings; it gets mellower at night. **Settings → Download the soundtrack (WAV)** renders the loop to a 22.05 kHz stereo file (about 7 MB, takes up to half a minute) for use elsewhere.

## Performance

- Lighting: the street-lamp and headlight lights are removed from the lighting pass by day / with the headlights off (a light with zero intensity still costs every pixel). Clouds are a single instanced mesh; distant traffic and pedestrians draw fewer parts. Medium renders at pixel ratio 1.0 (High 1.5, Low 0.75), and adaptive resolution now steps down as soon as the game cannot hold about 60 fps.
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
public/models/  player.glb, player2.glb, subaru.glb, titan.glb
```

## Assets
- `player.glb` / `player2.glb` – supplied Meshy character (Mixamo skeleton; walk/run clips only; idle/crouch/jump/seated are generated procedurally and retargeted).
- `subaru.glb` – supplied Sketchfab Subaru Impreza WRX STI, optimised with `gltf-transform` (meshopt, WebP 512 px, mesh simplification). Check its licence/attribution before publishing.
- `titan.glb` – supplied Meshy AI model ("Desert Titan" off-road SUV). It was a single-mesh model; they were welded, simplified, WebP-textured (1024 px), the four wheels split into `WHEEL_LF/RF/LR/RR` nodes and meshopt-compressed (about 0.9 MB and 0.7 MB). Check the Meshy licence for your plan before publishing.

**Vehicle selection** – "Choose Vehicle" on the main and pause menus opens a showroom with a turntable preview, stats and owned/price state. Subaru and Desert Titan are owned from the start; other vehicles can be bought there. From the pause menu the chosen vehicle replaces the current one where it stands.
- Everything else is generated in code. No audio files are used.

## What was tested

Verified in a browser while building (desktop, keyboard): game loads without console errors; movement, sprint, jump, crouch, camera follow; building collision; entering/driving/exiting vehicles (all seven classes driven); character creator, save/restore across refresh, upload validation (rejects static meshes and unrecognised rigs, accepts Mixamo- and VRM-style skeletons); traffic obeying signals and pedestrian crossing (numeric sampling); shops, purchases, garage UI; all five missions through their state machine, race, courier jobs, fail/checkpoint, save/continue; district barricade blocks then opens; weather; wanted level, pursuit and arrest; key rebinding; production build.

Driver jobs and GPS (tested in the dev browser with scripted input and car teleports): all six job types completed and paid, parking rejects crooked or off-centre cars, timer / wreck / abandon failures pay nothing, a paid job cannot be re-accepted, points and history survive a reload, New Game resets them, the route stays on the road grid (200 random routes checked against the grid), leaving the route triggers a re-plan, dashboard buttons respond to the crosshair ray and a click, Esc closes the expanded GPS without pausing, and the cockpit view works in the Subaru, sedan, SUV, pickup, van, Apex and motorcycle.

Phones and tablets (tested only by emulating screen sizes in a desktop browser with synthetic touch events: 812×375, 390×780, 1024×768): the touch layout, joystick steering, Gas pedal, tap-to-press dashboard buttons, expanded GPS, Driver Jobs menu and character creator fit and work at those sizes.

Not verified / known limits:
- **No real phone or tablet was used.** Not checked on hardware: real multi-touch (steering while holding Gas), frame rate on a phone GPU, the Low-quality default on a first run (it needs a real coarse pointer), Android fullscreen / orientation lock, the wake lock, iOS Safari quirks and Add to Home Screen. The city, Rapier physics and 10+ MB of models are heavy for older phones; expect to need a recent device.
- The music and the horn were checked by measuring the rendered audio (levels, clipping, structure), not by listening; how it sounds is untested.
- Pinch zoom in the character creator is untested. There is no gyroscope steering and no offline mode (no service worker).
- Dashboard buttons were pressed with a synthesized click while aiming by script; I did not use a real mouse with pointer lock. The driver-job and GPS touch buttons (Jobs, GPS, Big map, View) were not tried on a touch device.
- There is no ambulance or fire-truck model: emergency jobs use whichever vehicle you drive. Vehicle upgrades are not part of the rewards (points buy repairs and cash only). No GPS voice guidance, and the dashboard has no sound of its own.
- The in-car screen was checked at the small size of the preview pane, not on a large monitor.
- Audio was confirmed to initialise and fire events, but was never listened to.
- The touch controls compile and the joystick state updates, but I could not drive the character with them (the preview pane was hidden and throttled) and did not test on a real phone. No gamepad support.
- Only one body is supplied (male); "Model A/B" are two outfits of it. Colour tinting, hair styles and accessories only apply to the built-in models. Face shape comes from the texture.
- Police are cars only (no officers on foot or weapons); traffic and police cars are kinematic (they bump but do not deform); vehicle bodies do not deform; paint works on the procedural vehicles only; the motorcycle is a simple model.
- Missions 3–5 were exercised by moving the car with code for long drives, not by hand-driving each route.
- Weather and wanted level are not saved. Uploaded `.gltf` files must embed their data; Draco-compressed uploads load a decoder from gstatic.com.
