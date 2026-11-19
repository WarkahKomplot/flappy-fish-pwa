# Flappy Fish — Cinematic WebGL Visual Upgrade — Design

- **Date:** 2026-11-19 (rev. 2, after independent renderer review)
- **Status:** Draft — for owner approval (not approved, not started)
- **Owner:** Arief
- **Base:** `flappy-fish-pwa` working tree **after** the pending five-fix commit (see `HANDOFF.md`)
- **Target:** PWA on iOS Safari 15+, Android Chrome, desktop; offline; same side-on one-tap gameplay
- **Proposed branch:** `feat/cinematic-webgl`

> **Revision note.** An independent renderer engineer reviewed rev. 1. This
> revision fixes the capture path, failure containment, colour pipeline, the
> degrade ladder, effect/state contract, 9:16 mapping, readability checks and
> QA plan. The owner settled the emergency FX switch as a small, discoverable
> in-game control (§7.10).

---

## 1. Intent & Why

The game is mechanically finished and clean, but its look is a flat Canvas 2D
scene: gradients, vector shapes, `shadowBlur`. The owner wants the same
side-on, one-tap game with a dramatically more cinematic presentation — an
"Unreal-ish" underwater atmosphere — while staying a small, offline PWA that
runs at 60 fps on mid-range phones.

"Unreal-like" here means **cinematic light and depth**, not photoreal 3D:
volumetric light shafts, bloom, caustics, depth fog, colour grading, glowing
collectibles, a full-bleed animated background, and impact effects. It does not
mean Lumen, Nanite, 3D models, ray tracing, or HDR.

The visual upgrade must not change physics, hitboxes, scoring, combo rules, or
the instant-retry loop. The player should feel the same game in a richer world.

---

## 2. Current State (what the design builds on)

- `GameEngine` owns simulation **and** Canvas 2D rendering:
  - `render(ctx, w, h, dpr)` → `drawBackground`, `particles.render`,
    `drawPersonalBestRibbon`, `drawObstacles`, `drawPearls`, `renderFish`.
  - The rAF loop calls `update(dt)` then `render(...)` and schedules the next
    frame **after** render.
  - `resize(w, h, dpr)` sets the canvas buffer.
- `GameCanvas` owns the single canvas, `computeStageSize()` (9:16 letterbox),
  DPR, input, and a stage-container listener set.
- `computeStageSize()` returns **width/height only**; centering is CSS flex.
- Rendering is decoupled from rules: fish/obstacles/pearls/particles are plain
  data in public fields; `ComboManager` and `physics.ts` are pure.
- 345 tests pass; `tsc` clean; production bundle ≈234 KB raw / ≈68 KB gzip.
- The state is 360×640 logical, letterboxed on non-9:16 screens.
- The legacy navigation app is no longer in the bundle (pending fix commit).

This shape makes an additive compositor possible without rewriting gameplay.

---

## 3. Goals, Non-Goals, Anti-Goals

### Goals
- A visibly different, cinematic underwater look: full-bleed background,
  bloom, god rays, animated caustics, depth fog, grading, grain, subtle
  chromatic aberration, glowing pearls/jellyfish/shield, impact shockwave.
- Same 360×640 gameplay and one-tap feel; no physics/scoring changes.
- 60 fps (p95 ≤16.7 ms) on a 2019+ mid-range phone at Medium/High; graceful
  degradation through a Low-GL tier to the current Canvas 2D renderer.
- Edge-to-edge background on 19.5:9/20:9 phones; gameplay in a 9:16 safe area.
- Zero new network/assets; shaders procedural; offline unchanged.
- Canvas 2D remains a complete fallback; a device without WebGL2 still plays
  the current game, unbroken.
- Keep the existing test suite green and add tests for the new pure logic.

### Non-Goals
- Full 3D, 3D models/rigs, real-time shadows, ray tracing, HDR output.
- Per-sprite normal-mapped rim lighting (deferred; see Approach C).
- Changing gameplay, difficulty, skins, audio, or progression.
- A settings-heavy options screen or accounts/leaderboards.
- WebGPU-only rendering.

### Anti-Goals (failure even if it "works")
- Effects that hurt readability: obstacles/pearls harder to see; bloom washing
  out the gap; fog over the play area.
- Input latency from the extra compositing step; dropped taps.
- A 5 MB bundle or a multi-second shader warm-up.
- 60 fps only on flagships; older phones stutter instead of downgrading.
- A WebGL-only path that leaves some devices with a black canvas.
- Added flashing/motion that ignores `prefers-reduced-motion`.

---

## 4. Constraints

- **PWA:** offline-first, installable, no runtime fetch, service-worker bump on
  release. The current shell is cache-first; the cache name must change.
- **Performance:** 360×640 logical, 60 fps target, frame budget 16.6 ms.
  Budgets are set from a measured baseline (§8), not asserted.
- **Mobile GPU:** WebGL2; no float render targets guaranteed on iOS; no
  compute shaders; fill-rate is the scarce resource, not vertex count.
- **Bundle:** +≤30 KB raw (~10 KB gzip); stay under the original 100 KB gzip
  budget.
- **Resolution:** DPR cap 2; total post-buffer pixels capped; capture buffer
  capped separately.
- **Tests:** 345 existing tests must pass unchanged where they cover gameplay;
  rendering-specific tests may be added.
- **Rollout:** must not be mixed into the pending five-fix publish; branches
  from it. An installed PWA has no URL bar, so the device-specific escape
  hatch is the in-game FX control (§7.10), not `?fx=off` alone.

---

## 5. Approaches Considered

### A. Canvas 2D "cinematic polish" (rejected)
Cached background layers, parallax, fake light shafts via gradients,
composite-mode glow, vignette/grain overlays, richer particles.
**Why rejected:** cheap and safe, but no real bloom, depth of field,
refraction or per-pixel light. It raises polish, not the ceiling; it cannot
deliver the requested jump.

### B. WebGL2 compositor over the existing Canvas 2D scene (**selected**)
Keep the current 2D scene renderer; add an in-DOM 2D canvas, upload it as a
texture each frame, and composite it inside a WebGL2 pipeline: full-bleed
procedural background, bloom, ACES tonemap, grading, god rays, caustics, fog,
GPU foreground particles, screen-space glows, shield ring, impact shockwave,
camera shake.
**Why selected:** the most look per day of work, with contained risk. It
preserves the existing art, tests and gameplay; needs no new assets; degrades
to the current renderer; and is small enough to ship. It is **not** the highest
ceiling — the 1× capture limits crispness and per-sprite lighting — but it is
the right first project.

### C. Full WebGL2 sprite renderer with baked atlas + per-sprite lighting (deferred)
Move fish/kelp/jellyfish/pearls into WebGL; bake art into an atlas at startup;
light sprites with faux-normal maps, rim/specular and local lights; no
per-frame upload.
**Why deferred:** the best long-term renderer and a higher ceiling, but it is a
second project: it rewrites the render tests, maintains two complete renderers,
and needs per-obstacle handling. It is **cheaper than rev. 1 implied**: the
fish and pearls can be baked at boot from the existing `drawNeonTetra` /
`drawPearls` functions; only kelp and jellyfish are genuinely procedural.
Revisit after the compositor ships.

### D. Three.js full 3D side-on scene (rejected)
3D fish, camera, lights, depth of field, post.
**Why rejected:** a 3D asset/rig pipeline, bigger bundle, and a changed
readability/feel for a one-tap game. It works against the request to keep the
same side-on game.

**Decision:** B for this project. C is explicitly out of scope until the
compositor has shipped and been judged.

---

## 6. Visual Target

**Mood:** bioluminescent deep-sea, *Abzû* / *Ori* rather than photoreal.
Keep the existing palette (deep teal/indigo water, cyan fish glow, warm gold
pearls, magenta jellyfish) and push it with light.

- **Background:** full-bleed; distant trench silhouettes, surface glow, slow
  volumetric shafts, animated caustics, marine snow, depth fog. Above the
  world's surface line (y<0) show the bright underside of the surface; below
  the seabed (y>640) show dark rock/silt.
- **Playfield:** the existing 2D scene, now lit by a top key light, with
  emissive pearls/jellyfish/shield blooming.
- **Foreground:** out-of-focus silt/bokeh and bubbles, slightly faster than the
  playfield, to create depth.
- **Post:** ACES tonemap, exposure ~1.0–1.2, teal shadows/warm highlights,
  bloom threshold high enough that only emissive elements glow, vignette,
  fine grain, very subtle chromatic aberration.
- **Impacts:** 80–120 ms shockwave ring + 2–3 px camera shake + a **bloom
  swell** (no luminance flash); shield pop = cyan ring/ripple; pearl = sparkle
  bloom; personal best = golden pulse.
- **Readability guardrail:** the 140 px gap, kelp/jellyfish edges and pearl
  centres must stay at least as legible as today. Bloom/fog are tuned on the
  playfield, not just on a pretty screenshot. A top/bottom CSS scrim sits
  behind the HUD so the score stays legible over the bright surface.

The look is a design decision; the owner can veto the mood and ask for a
darker/horror or neon/synthwave treatment after seeing the first build.

---

## 7. Architecture

### 7.1 Canvases and frame flow

Two canvases inside the existing stage container:

1. **Scene canvas** — a `<canvas>` with a 2D context, 360×640 aspect, sized to
   the 9:16 stage rect × `captureDpr` (0.75–1.5). It stays **in the DOM** at
   all times: positioned exactly over the game rect, `opacity:0;
   pointer-events:none` while GL is active, `opacity:1` in fallback. Do **not**
   use `display:none`: iOS may discard its backing store, and it is needed for
   the exact current look on fallback.
2. **FX canvas** — the only visible canvas on the GL path, full stage size
   × `postDpr` (≤2, pixel-capped), `pointer-events:none`.

Frame flow (the engine keeps owning the loop):

```
rAF → GameEngine.update(dt)
    → GameEngine.render(sceneCtx, gameW, gameH, captureDpr)   // 2D scene
    → afterRender(snapshot)                                    // new hook
        → WebGLPostFX.render(sceneCanvas, snapshot)
            → background pass (full stage)
            → scene texture pass (9:16 rect, alpha)
            → foreground particles / light glows / shield ring
            → bloom chain → composite/tonemap/grade → default framebuffer
```

- `GameEngine` gains:
  - `backgroundVisible` (default `true`) so the 2D background is skipped when
    the GL background shows through. Fallback keeps today's look.
  - `afterRender?: (snapshot: SceneSnapshot) => void`, called at the end of
    `loop`, **inside a try/catch** so a renderer error can never stop the
    frame loop. The loop must schedule the next rAF in a `finally` block.
  - A small `events: RenderEvent[]` queue for one-shot moments.
  - `getSceneSnapshot()` building the read-only per-frame contract (§7.4);
    `drawPearls` and the snapshot share one `resolvePearlY()` helper so the
    bob formula cannot drift.
- `GameCanvas` gains: a second canvas, GL init, `postFX.resize`, the
  `afterRender` hook, show/hide logic, cleanup.
- **Effect split:** the GL init/resize lives in a **mount-only** effect
  (`[engine]`, StrictMode-guarded) and input lives in a separate effect whose
  handler is held in a ref. The current `[engine, onTap]` dependency would
  recompile shaders and reallocate FBOs on idle→playing and gameover→retry —
  exactly when the game must feel instant. Cleanup clears `afterRender`.
- `GameEngine.render` remains the Canvas 2D path; existing engine render tests
  are unchanged.

### 7.2 Full-bleed background and coordinate mapping

- `computeStageSize(stageW, stageH)` returns the 9:16 game rect size
  (`gameW`, `gameH`). **It does not return an origin.**
- Compute the origin as **unrounded floats** in JS:
  `gameX = (stageW - gameW) / 2`, `gameY = (stageH - gameH) / 2`.
  Position the scene canvas with the same fractional `translate3d(gameX,
  gameY, 0)`, and pass the same floats to the shader. Do **not** feed
  `getBoundingClientRect()` into the shader: on 390×844 the origin is 75.5 px,
  and rounding to 75 shifts the scene quad one device pixel, producing a seam
  where kelp meets the surface line.
- The FX canvas covers the full stage. The background shader is evaluated in
  **world coordinates**:
  `worldX = (stageX - gameX) / gameW * 360`,
  `worldY = (stageY - gameY) / gameH * 640`.
  In the bars, `worldY` is <0 or >640, so the shader naturally shows water above
  the surface and rock below the seabed. Surface/shafts anchor at y=0; seabed
  anchors at y=640.
- A pure `worldToStage(worldX, worldY, rect)` helper is unit-tested at
  390×844 (origin 75.5), 448×900 (52), and landscape.
- HUD/start/game-over stay DOM and full-stage; they may sit in the bars.
- No coordinate mapping is needed for input: taps anywhere flap.

### 7.3 Post pipeline and colour contract

Passes, all at capped resolutions:

1. **Background** — full-screen triangle; procedural gradient, caustics,
   shafts, fog, marine snow; uniforms `time`, `gameRect`, `worldSize`,
   `scroll`.
2. **Scene** — upload `sceneCanvas`, draw a quad into the game rect,
   alpha-blended over the background. The scene canvas is transparent (2D
   background skipped), so the background shows through the playfield.
3. **Bright pass** — threshold in linear space, downsample to 1/2.
4. **Bloom** — 2–3 mip downsample + separable Gaussian blur (H/V) +
   additive upsample. Quarter/half res.
5. **God rays (High only)** — radial blur of the bright buffer from the
   surface light point, additive.
6. **Composite** — scene + bloom + rays; ACES tonemap, exposure, colour grade,
   caustic overlay, chromatic aberration, vignette, grain, and screen-space
   effects (hit ring, light glows, shield ring).
7. **Present** — to the default framebuffer.

**Colour pipeline (pinned):**
- Upload the scene texture as **`SRGB8_ALPHA8`**, so sampling decodes sRGB to
  linear. Do not treat the 8-bit texture as already linear.
- Composite/light/bloom in linear. The final pass explicitly encodes
  linear→sRGB.
- iOS is assumed **RGBA8** for FBOs. The bright pass stores headroom with a
  fixed scale (e.g. `min(color, 4.0) / 4.0`) and the composite multiplies it
  back; use `RGBA16F` only when `EXT_color_buffer_half_float` (or float) is
  confirmed at boot. Document both paths.
- Alpha is handled **premultiplied end to end**:
  `UNPACK_PREMULTIPLY_ALPHA_WEBGL = true`, blend
  `ONE / ONE_MINUS_SRC_ALPHA`, never toggled between uploads. Do not
  unpremultiply in the shader: the playfield is mostly transparent
  `shadowBlur` art and 8-bit unpremultiply makes halos.
- A known-colour test (50% grey, saturated cyan, transparent edge) runs
  through the pipeline on iOS and Android before visual sign-off.

### 7.4 Scene snapshot, events, and effects

`afterRender` receives a read-only `SceneSnapshot`, not the engine and not only
events:

```
SceneSnapshot {
  time, status, world: {width:360,height:640},
  fish: {x,y,rotation,skin,invulnerableTime,isDead},
  obstacles: [{x,width,topHeight,bottomY,pearl?:{x,y,visualY,radius,
              collected,missed}}],
  shield: {active, activeTime},
  ribbon: {x, target, crossed},
  gameRect: {x,y,width,height}
}
```

`visualY` is the resolved pearl bob (`sin(time*3.5 + seed)*4`), computed once
per frame by the shared helper. The compositor must not re-implement
`getEntitySeed` or the bob formula.

`RenderEvent = { type, x, y, t }` is for one-shots only: pearl collect,
shield activate/pop, hit, personal best. The renderer drains it each frame;
events expire after ~500 ms. Continuous effects (pearl/jellyfish glow) read the
snapshot.

| Effect | Trigger | Implementation |
|---|---|---|
| Full-bleed background | always | background shader; time + world mapping |
| Caustics / shafts | always | procedural noise in background/composite |
| Bloom | always | bright + blur chain |
| Pearl glow | always (spawn) | additive radial light at `pearl.visualY` |
| Jellyfish bioluminescence | always | additive pulse at `bottomY` |
| Shield | `shield.active` | rim glow + outer ripple ring; **no full-screen lens warp** (it would warp the fish sprite) |
| Hit shockwave | `hit` event | 100 ms ring distortion + 2–3 px shake + bloom swell |
| Shield pop | `shield-pop` | cyan ring/ripple + bloom pulse |
| Personal best | `best` | gold bloom pulse |
| Foreground particles | ambient + swim | GPU instanced quads, depth-layered, additive |
| Idle ambience | idle | slower shafts, drifting motes |
| Game over | status change | slow bloom decay, vignette push |

**Readability rule:** glows are additive and thresholded; no full-screen fog
over the playfield; the composite keeps the scene's contrast in the gameplay
rect. **No luminance flash**; impacts use a bloom swell only. No added
flashing beyond the existing 10 Hz invulnerability blink.

### 7.5 Scene capture and resolution

- `captureDpr` = 1 on Medium, 1.25–1.5 on High, 0.75 on Low-GL; never the
  device DPR. The 2D scene is vector art; a 1× capture at 390 px wide is 1.08×
  the logical width and is visually close. Bloom/grade mask the upscale.
- `postDpr` = `min(devicePixelRatio, 2)` on High, 1.5 on Medium, 1 on Low-GL;
  additionally cap `postW * postH` at ~2.2 MP.
- The scene canvas buffer is `gameW × captureDpr` by `gameH × captureDpr`;
  `engine.resize` already supports a DPR argument, so no engine change.
- Upload cost at 390×693×1×4 B ≈ 1.1 MB/frame (~65 MB/s at 60 fps); at
  capture 1.5 ≈ 2.4 MB/frame. **This is not asserted as safe:** Phase 0 ends
  with a zero-effect 1:1 carry-through measured on a real iPhone SE and a mid
  Android, and the measured upload+2D cost replaces the budget in §8. If it
  fails the gate, stop and reconsider B vs C before Phase 1.
- The scene canvas remains in the DOM at `opacity:0` (not `display:none`) so
  the fallback can show it instantly. On fallback, set `opacity:1`, restore its
  CSS size to the game rect, and re-run `engine.resize(gameW, gameH,
  visibleDpr)` so the fallback is not a blurry 1× buffer.

### 7.6 Quality tiers and adaptation

| Tier | Post | Capture | Bloom | Rays/CA/Grain | Particles | Shake |
|---|---|---|---|---|---|---|
| High | DPR ≤2, ≤2.2 MP | 1.25–1.5 | 1/4 | on | ~180 | full |
| Medium | DPR ≤1.5 | 1.0 | 1/8 | — | ~90 | reduced (0.5×) |
| Low (GL) | DPR 1 | 0.75 | — | — | ~40 | — |
| Off | — | 1.0 | — | — | — | — |

- **Low is a real GL tier**, not a synonym for Off: background + scene
  composite only, no bloom/rays/CA/grain, capture 0.75, postDpr 1. It keeps
  the full-bleed look on a warm phone. **Off** is the Canvas 2D fallback.
- God rays are **High-only** (§7.3); the earlier "rays only" Medium wording in
  this table was a typo. `QualityProfile.shake` is a boolean gate; the effect
  scales amplitude by tier (High 1×, Medium 0.5×).
- Selection at boot: WebGL2 present + required extensions; `hardwareConcurrency`
  and `deviceMemory` heuristics; desktop → High, mid mobile → Medium, weak →
  Low; `prefers-reduced-motion` keeps the tier but disables shake/CA/grain.
- **Adaptive:** p95 frame time over a ~5 s window; if >20 ms, drop one tier
  (High → Medium → Low → Off). Hysteresis, one downgrade per run, **never
  upgrade automatically**. Re-evaluate at boot and at each retry/new run, not
  mid-run.
- Manual override: the in-game FX control (§7.10) plus
  `?fx=high|medium|low|off` for QA. Precedence: URL param for the session,
  else the persisted setting, else Auto.
- The adaptive ladder must be testable as a pure function
  (`nextTier(current, p95)`) with fixture timings.

### 7.7 Failure containment and context loss

- **Init:** wrap context creation, shader compilation, program linking, FBO
  allocation and the first frame in `try/catch`. Reject a context that lacks
  `createShader`/`createProgram` (important: the current `tests/ui.test.tsx`
  stubs `getContext` to return a 2D mock for **every** context type, so a null
  check alone would pass and then throw).
- **Frame:** wrap `render` + `afterRender` in `try/catch`; on throw, disable FX,
  set `backgroundVisible=true`, show the scene canvas, and keep scheduling
  rAF. The loop must never die from a renderer error.
- **Feature detection:** `canvas.getContext('webgl2')` plus a shader-compile
  smoke test at boot. Any failure → Off (Canvas 2D), not a black canvas.
- **Context loss:** `preventDefault()` on `webglcontextlost`, switch to the
  scene canvas immediately, keep the run/score, try one restore on
  `webglcontextrestored`, otherwise stay on Canvas 2D.
- **Tests:** update the `getContext` stub to return `null` for `webgl2`, and
  add a fallback test that asserts the game still renders, accepts input and
  keeps the score.

### 7.8 HUD, overlays, safe areas

- Input stays on the stage container; the FX canvas is `pointer-events:none`.
- HUD/start/game-over remain DOM, above FX.
- **Contrast:** add top/bottom CSS scrims behind the HUD; the score/combo must
  stay legible over the bright surface, and the 9:16 bars are only ~75 px on a
  390×844 screen. The score gets a subtle dark plate if needed.
- **Ribbon label:** the 11 px `★ BEST: n ★` text is the only in-canvas text and
  is a capture-upscale casualty. Render it as a DOM label in GL mode (position
  derived from `ribbon.x` and `worldToStage`), and skip it in the 2D renderer
  while GL is active. Keep it in the 2D fallback.
- `env(safe-area-inset-*)` padding for the HUD in standalone iOS.
- **Game-over backdrop:** `backdrop-filter: blur()` over a continuously
  animating GL canvas is a full-stage blur every frame at the "slow bloom
  decay" moment. In GL mode use a static gradient panel instead.
- Landscape phones: keep the centered stage; a rotate prompt is optional.
- `prefers-reduced-motion`: no shake, no CA, no grain, slower shafts.

### 7.9 PWA / offline

- Shaders are inline/`?raw` strings; no new assets or fetches.
- The app shell is unchanged except new JS chunks; bump the SW cache
  (`flappy-fish-v3`) so returning players get the new build.
- Airplane-mode test on iOS/Android: start, play, retry, skins.
- No new permissions.

### 7.10 FX control (emergency switch)

A small, discoverable control appears in two places, both opening the same
compact panel:

- the **pause overlay** (primary), reachable from the HUD pause button; and
- the **start screen** bottom bar, next to Skins, so a bad device-specific
  look can be escaped before the first run.

The panel offers **Auto / High / Medium / Low / Off**, shows the resolved tier
(e.g. `Auto · High`), and persists the choice under
`localStorage["flappy_fish_fx"]`. Auto is the default.

- **Off** switches to the Canvas 2D renderer, restores the scene canvas at the
  visible DPR (§7.5), and sets `backgroundVisible = true`.
- **High / Medium / Low** re-initialise the GL path if needed. If a switch
  fails, the control reverts to Off and shows a short inline message; it must
  never leave a black canvas.
- The game stays paused while the panel is open from the pause overlay; closing
  returns to the paused state. The start-screen control must not start the game
  (stop propagation).
- Accessibility: 44 px targets, radio semantics, keyboard-operable, Escape
  closes, focus returns to the trigger. This is the reason it is not a hidden
  long-press.
- Precedence: a `?fx=` URL param applies to the session; otherwise the stored
  choice; otherwise Auto. The panel always shows the effective tier.

---

## 8. Performance Budget

Budgets are **measured, not asserted**. Phase 0 records the current Canvas 2D
baseline (per-frame gradients + `shadowBlur` at DPR 2) on the three target
devices; the post budget is derived from the measured headroom.

| Item | Budget |
|---|---|
| Simulation (JS) | baseline (today) + ≤0.5 ms |
| Canvas 2D scene at captureDpr | measured baseline, not a guess |
| Scene upload | measured in Phase 0; gate on the targets |
| Background + scene + composite | ≤3 ms |
| Bloom/rays | ≤2 ms |
| GPU total | ≤6 ms |
| Frame | **p95 ≤16.7 ms** (60 fps) on High/Medium/Low targets |
| Bundle delta | ≤30 KB raw / ≤10 KB gzip |
| Memory | ≤32 MB GPU for FBOs/textures |
| Shader warm-up | ≤150 ms at boot |
| Network | 0 requests after load |

A device that cannot hold the Low-GL budget drops to **Off (Canvas 2D)**, not
to a janky Medium. "30 fps" is not an accepted target for any tier.

An in-game `?benchmark=1` mode runs a scripted 60 s scene and logs p50/p95
frame time, tier, capture/post sizes, so the same numbers can be collected on
each device.

---

## 9. Testing and QA

**Automated (unit):**
- `selectQuality()`: WebGL2 missing → Off; heuristics → High/Medium/Low;
  reduced motion flags; override precedence.
- `nextTier(current, p95)`: hysteresis, no auto-upgrade, Off floor.
- `computeStageSize` (existing) + `worldToStage()` mapping at 390×844
  (origin 75.5), 448×900, landscape; fractional origin preserved.
- `resolvePearlY()` shared by `drawPearls` and the snapshot.
- `RenderEvent` queue: enqueue/drain/expiry.
- Fallback: with `getContext('webgl2')` returning null (test stub updated),
  the game still renders, accepts input and keeps the score.
- Existing 345 tests pass; `tsc` clean.

**Manual / device (visual + perf):**
- **Three physical targets** + desktop: iPhone SE (2nd/3rd gen), a modern
  iPhone (12+), a mid Android (Pixel 4a / Galaxy A52), desktop 1440p. Other
  aspect ratios via browser device emulation/remote testing — not 11 physical
  devices × 8 aspects in Phase 3.
- Matrix: portrait 16:9, 18:9, 19.5:9, 20:9; tablet 4:3; landscape; split view;
  notch/home indicator; standalone PWA; low-power mode; reduced motion.
- Checks: no seam at the 9:16 edge; no alpha halos; pearls/obstacles legible;
  no black frame on fallback; p95 target; no context-loss crash; no
  battery/thermal spike in 10 min.
- `?debug=1` overlay: FPS, p50/p95, tier, capture/post sizes; `?fx=` QA
  override (the installed-PWA path is the §7.10 control).
- **Freeze mode** `?freeze=1&seed=&t=` renders a deterministic frame for
  A/B screenshots and an edge-contrast check at gap/kelp/jellyfish/pearl.
- Visual before/after screenshots on each target; the matrix starts in Phase 1,
  not Phase 3.

**Not automated here:** real iOS/Android GPU rendering cannot be verified in
this environment (headless browser broken). Device QA is a required gate.

---

## 10. Delivery Phases

**Phase 0 — scaffolding + the capture gate (2–3 days)**
Quality detection, `?debug=1` / `?fx=` / `?benchmark=`, second canvas, scene
capture, snapshot contract, mapping helpers, event queue, failure containment,
tests. **Exit criterion:** a zero-effect 1:1 carry-through on iPhone SE and a
mid Android, with the measured capture cost; the fallback restores the exact
current look. If the gate fails, stop before Phase 1.

**Phase 1 — the look (3–5 days)**
Full-bleed background, scene composite, bloom, ACES, grade, vignette, grain,
CA, caustics; High/Medium/Low-GL tiers; readability scrims and ribbon DOM
label. This is the first "wow" build.

**Phase 2 — impact and life (3–5 days)**
God rays, GPU foreground particles, pearl/jellyfish glows, shield ring,
hit shockwave/shake, personal-best pulse, idle ambience.

**Phase 3 — hardening (2–3 days)**
Adaptive downgrade, three-device matrix, performance tuning, SW bump,
README/design updates, reduced-motion, final QA.

Total: roughly **2 weeks of focused work**, with a shippable visual jump at the
end of Phase 1.

---

## 11. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Canvas→texture upload too slow on iOS | frame drops | Phase 0 measured gate; captureDpr cap; adaptive; Low-GL/Off |
| Fallback is a blurry 1× buffer | bad fallback | keep scene canvas in DOM; restore CSS size + `engine.resize` at visible DPR |
| Alpha/premultiplied halos at scene edges | ugly seams | premultiplied pipeline; `SRGB8_ALPHA8`; edge test scene |
| sRGB/linear mismatch | washed/dark | pinned pipeline; RGBA8 headroom scale; known-colour test |
| Float FBO unsupported | bloom broken | RGBA8 headroom fallback; test both |
| Shader compile slow/fails on old Android | boot delay/black | compile smoke test; try/catch; Off fallback |
| Renderer throw kills the loop | frozen game | frame try/catch; rAF in `finally`; disable FX |
| Fill-rate on 3× phones | jank | postDpr 2 cap; bloom quarter-res; Medium/Low-GL |
| Effects hurt readability | gameplay worse | readability guardrail; freeze-mode contrast check; Off |
| Context loss | frozen screen | auto-fallback to 2D; no run reset |
| Installed PWA has no URL bar | recovery blocked | §7.10 in-game FX control; Off restores 2D; failed switch reverts to Off |
| Two renderers drift | bugs | shared snapshot/resolvePearlY; 2D renderer remains source of truth |
| Bundle creep | slower load | no deps; +≤30 KB; gzip check in CI |

---

## 12. Acceptance Criteria

- On a 19.5:9 phone the background is edge-to-edge; the 9:16 playfield has no
  seam, stretch or crop.
- The visual difference vs. the current build is obvious in a side-by-side:
  visible shafts/caustics, bloom on pearls/shield, graded image, impact effects.
- **p95 ≤16.7 ms (60 fps)** on iPhone 12/Pixel 6 at High; p95 ≤16.7 ms on the
  older targets at Medium/Low-GL; Off runs the current game at its current
  frame rate. No tier accepts 30 fps.
- No input regression: taps still register immediately; no dead strips.
- No WebGL2 → exact current Canvas 2D look, no errors, full playability;
  renderer errors fall back without killing the loop.
- No new network requests; works offline; SW update delivers the new build.
- 345 existing tests + new tests pass; `tsc` clean; bundle ≤ +30 KB raw.
- `prefers-reduced-motion` disables shake/CA/grain; no added flashing.
- **Emergency recovery:** an installed PWA can set Auto/High/Medium/Low/Off
  from the start screen or pause overlay without a new release; a failed
  switch reverts to Off and never leaves a black canvas.

---

## 13. What Is Left to the Builder

- Pass the Phase 0 capture gate; record the measured numbers; if it fails,
  stop and revisit B vs C.
- Write the shaders and tune the look to the guardrails; exact bloom
  threshold/exposure/grade values.
- Implement the pinned colour/alpha pipeline and the known-colour test.
- Implement the snapshot contract and `resolvePearlY` shared helper.
- Compute the fractional `gameRect` origin and position the scene canvas with
  the same floats; add `worldToStage` tests.
- Move the ribbon label to DOM in GL mode.
- Implement the Low-GL tier, `nextTier`, and re-evaluation at retry.
- Split the mount-only GL effect from the input effect; clear `afterRender`.
- Choose the FBO format fallback order and test on iOS.
- Run the three-device matrix and the benchmark mode; record p50/p95.
- Implement the §7.10 FX control/panel, persistence, runtime re-init and
  accessibility.
- Keep the 2D fallback pixel-identical to today's build.

---

## 14. Owner Decisions

**Settled by the owner:** keep the same side-on one-tap game; option B;
full-bleed background with a 9:16 gameplay safe area; and a small, discoverable
FX control as the emergency switch.

1. **Mood:** bioluminescent *Abzû/Ori* (proposed; no reference supplied).
   Alternative: darker trench / horror, or neon synthwave. Same pipeline;
   palette/fog/grading change.
2. **Emergency FX switch — SETTLED:** a small, discoverable control on the
   start screen and in the pause overlay (Auto / High / Medium / Low / Off),
   persisted; see §7.10. Not a hidden long-press, and not "follow-up release
   only".
3. **Quality UI:** automatic tiers + the §7.10 control; Auto is the default.
4. **QA devices:** three physical targets (iPhone SE 2/3, modern iPhone,
   Pixel 4a/Galaxy A52) + desktop; other aspects via emulation. Confirm the
   available devices.
5. **Sequencing:** publish the pending five-fix commit first, then branch this
   work from it. Do not mix the visual upgrade into the fix release.

---

## 15. Open Questions for the Owner

- Are the three QA devices available, or which can you test on?
- Is ~2 weeks / phased delivery acceptable, with Phase 1 shippable first?
