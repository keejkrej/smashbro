# SMASHBRO polish plan

Feel first, then art. Original fighters and sounds only — no Nintendo IP.

## Done (MVP)

- 2-player room (`/r/CODE`), host-authoritative snapshots
- vgpu arena (sky, capsules, platform, hit sparks)
- Jab, special projectile, stocks, blast zones
- Same-keyboard + training dummy

## Pass 1 — feel (done)

Synth SFX in `src/lib/audio/sfx.ts`, procedural body/arm motion in `engine.ts`, events on `match.sfx`.

## Pass 2 — moves, identity, lobby (this workflow)

Owned files are exclusive so two agents can work in parallel.

### 1. Audio (CC0 / original)

Do **not** download random itch packs. Generate a tiny Web Audio synth so the repo stays license-clean and small.

| Event | Sound |
|---|---|
| Jump / double jump | short rising blip; double jump higher |
| Land | low thud, scaled by impact |
| Jab | whoosh + click |
| Special | charge zap |
| Hit | noisy slap, pitch down with percent |
| KO / blast | descending fall + impact |
| Countdown / GO | UI ticks then a sting |
| Win | short fanfare |

**Owner:** `src/lib/audio/sfx.ts` only in the audio agent. Unlock `AudioContext` on first pointer/key. Expose `initSfx()`, `play(name, opts?)`, `setMuted()`, `isMuted()`.

### 2. Character motion (procedural, on the existing meshes)

No sprite sheets this pass. Animate Ember / Volt in `engine.ts` from live fighter state.

| State | Motion |
|---|---|
| Idle | vertical breath, slight head drift |
| Run | stride, body lean into `vx`, opposite-arm swing |
| Jump / fall | stretch on leave, squash on land (already has `squash`) |
| Jab | punch fist + torso twist + opposite arm back |
| Special | wind-up then forward lean |
| Hitstun | flash already exists; add recoil tilt |
| KO | spin / shrink as they leave blast |

**Owner:** `src/lib/render/engine.ts` only in the character agent.

### 3. Wire-up

- Add `sfx: string[]` on `Match` / `Snapshot`. Host pushes event names in `sim.ts`, includes them in snapshots, then clears. Guest plays from the snapshot.
- `GameView` inits audio, drains `sfx` into `play()`.
- HUD mute toggle.

**Owner:** `src/lib/game/types.ts`, `src/lib/game/sim.ts`, `src/components/GameView.tsx`, `src/components/HUD.tsx`.

Owned files stay exclusive for parallel agents.

### 1. Moves

| Move | Input | Rules |
|---|---|---|
| Smash | Hold J (or P2 `.`) ≥ 12 frames | `attackKind = 3`, more damage/knockback with charge (cap ~45 frames) |
| Shield | Hold L or Shift | Cuts knockback (~0.35x), drains on hit, regenerates off-shield, break = long stun |
| Dodge | Shield press + direction | ~12 frames invuln, brief inaction, one air-dodge until land |

Add `IN.SHIELD`. Fighter fields: `smashCharge`, `shielding`, `shieldHp`, `dodge`, `airDodge`. Push sfx names `smash`, `smashcharge`, `shield`, `dodge`, `shieldbreak`.

**Owner:** `src/lib/game/types.ts`, `src/lib/game/sim.ts`, `src/lib/game/input.ts`. Dummy AI may shield/dodge occasionally.

### 2. Fighter identity (still procedural, no gltf)

Ember: flame crest + warmer emissive. Volt: visor fins + cooler emissive. Shield = translucent bubble. Smash charge = pulse/glow. Dodge = stretch/slide.

**Owner:** `src/lib/render/engine.ts` only. Keep swapchain rules (no surface `compile()`, `autoResize: false`, `configureSwapchain`).

### 3. Lobby + rematch

- Name field on the home screen, persist `sessionStorage smashbro.playerName`
- Join/create sends that name; HUD shows `Name · Ember/Volt`
- Online: both players Ready before countdown (`{ type: "ready" }` on the socket)
- Rematch waits for **both** clicks; show waiting state
- SFX voices for smash/shield/dodge if missing

**Owner:** `src/components/Lobby.tsx`, `GameView.tsx`, `HUD.tsx`, `src/lib/net/protocol.ts`, `src/lib/net/client.ts`, `src/lib/audio/sfx.ts` (new voices only).

## Pass 3 — later

- Kenney / Quaternius CC0 meshes only if capsules still fail to read as characters
- Mixamo only on meshes we own
- Delay-based netcode (2-frame input delay)
- Smash-hold visual UI, shield HP bar

## Asset sources (when Pass 2 happens)

| Need | Source | License |
|---|---|---|
| SFX alternative | Kenney audio, Freesound CC0, jsfxr | CC0 |
| Blocky characters | Kenney, Quaternius | CC0 |
| HDRI / textures | Poly Haven | CC0 |
| Music | itch.io CC0, Incompetech (credit) | check page |

Never use Smash / Mario / “fan fighter” packs.
