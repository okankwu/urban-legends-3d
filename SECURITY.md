# Security

## What this project is

Urban Legends 3D is a **static, client-side browser game**. There is no server, no database, no accounts and no network
API: it is built to plain files and served from GitHub Pages. That removes most of the usual attack surface (no server to
break into, no passwords or personal data to steal), and the protections below cover what remains.

## Protections in place

- **Content Security Policy** (production build, `vite.config.ts`): scripts only from this origin (plus WebAssembly for the
  physics engine and mesh decoders), no framing, no plugins, no forms, and the page can only talk to its own origin.
  `referrer` is `no-referrer`.
- **No third-party code at runtime**: no CDN scripts, fonts, analytics or trackers. The Draco decoder is bundled
  (`public/draco`).
- **Saved data is validated, never trusted** (`src/security.ts`): saved game, character and settings are read through
  whitelists with type checks, clamped ranges, length limits and `#rrggbb` colour checks; unknown keys are dropped. A
  corrupted or edited save cannot crash the game, inject markup or pollute prototypes.
- **Uploaded character models are inspected before parsing** (`src/characters/customRig.ts`): the glTF JSON is checked for
  external URIs (rejected), structural limits (nodes, meshes, textures, bones, triangles) and a size cap; the loader is
  given a manager that refuses every URL except `data:` and `blob:`.
- **Rewards cannot be claimed twice** within the game: each job has a unique id that is recorded when paid.
- **No dynamic code execution or HTML injection** anywhere in the source (`eval`, `innerHTML`, `dangerouslySetInnerHTML` are not used).
- **Supply chain**: dependencies are audited in CI (`npm audit`, fails on high/critical), installed with `--ignore-scripts`,
  Dependabot proposes weekly updates, and GitHub Actions are pinned to commit SHAs with least-privilege permissions.

## Known limits (be honest about them)

- **Cheating is possible.** The whole game runs in the player's browser, so a player can edit their own save or use the
  developer tools to change money, points or progress. Validation keeps a tampered save from breaking the game, but it
  cannot stop someone from giving themselves rewards. That only matters locally: the leaderboard is local and its rivals are
  fictional.
- **If you ever add an online backend** (shared leaderboards, accounts, cloud saves, multiplayer) you must not trust the
  client: use authenticated accounts, validate every submitted score and reward on the server (re-derive them from the
  recorded actions rather than accepting totals), rate-limit, and keep secrets on the server only.
- A meta-tag CSP cannot set `frame-ancestors` (clickjacking protection) or other response headers; GitHub Pages does not let
  a project set headers. Put the site behind a host or CDN that can send headers if that matters.

## Reporting a vulnerability

Please open a private security advisory on the GitHub repository (Security → Report a vulnerability) rather than a public
issue.
