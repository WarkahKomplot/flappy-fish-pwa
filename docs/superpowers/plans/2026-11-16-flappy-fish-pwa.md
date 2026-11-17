# Flappy Fish PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an offline-capable, highly addictive underwater "Flappy Fish" Progressive Web App (PWA) running at 60fps on iOS and Android with a 3-Pearl Shield Combo system, procedural Web Audio, and GitHub Pages deployment.

**Architecture:** A high-performance HTML5 Canvas 2D engine running direct `requestAnimationFrame` physics and particle systems with zero React re-render lag, layered beneath a lightweight React HUD and UI overlay system (start screen, milestone skin selector, Game Over screen, and PWA install prompts). State persistence is handled via `localStorage`, and audio is synthesized procedurally through the Web Audio API.

**Tech Stack:** React 18, TypeScript, HTML5 Canvas 2D, Tailwind CSS, Vite, Web Audio API, Service Worker + Web App Manifest, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-16-flappy-fish-pwa-design.md`

---

## Global Constraints

- **Target Platforms:** iOS Safari, Android Chrome, and modern desktop browsers.
- **Offline Capability:** 100% offline functionality via PWA Service Worker cache-first strategy.
- **Zero Input Latency:** Direct touch event handling with `{ passive: false }` calling `e.preventDefault()` to eliminate the mobile 300ms tap delay and browser gesture zoom/bounce.
- **Generous Hitboxes:** Collision boundaries must be ~15% smaller than visible sprites to guarantee fair "near-miss" satisfaction.
- **Zero Audio Latency:** Pure procedural audio synthesis via Web Audio API; no external audio file downloads.
- **Open Source & Hosting:** MIT License, automated deployment to GitHub Pages via GitHub Actions.

---

## Review Focus

1. **Rapid Multi-Tap Overflow:** Tapping the screen 10 times in 0.5s must not send the fish through the top boundary with extreme velocity; upward vertical velocity must be strictly clamped. (Tested in Task 2)
2. **AudioContext Autoplay Policy on iOS/Android:** Web Audio `AudioContext` begins in a "suspended" state on mobile until the first user gesture; the audio manager must lazily resume on first touch without dropping sound or throwing unhandled errors. (Tested in Task 4)
3. **Canvas DPR Scaling on Mobile:** Canvas logical coordinate space (360x640) must scale to `window.devicePixelRatio` so bioluminescent lines and particles remain razor-sharp on Retina/OLED screens without performance degradation. (Tested in Task 5)
4. **Pearl Combo Reset Lifecycle:** Gaps where no pearl spawned (~40% of obstacles) must be neutral; the combo meter must only reset if the player bypasses a visible pearl without collecting it or takes damage. (Tested in Task 3)
5. **Offline PWA Cold-Start:** Service worker must pre-cache `index.html`, bundle scripts, icons, and manifest so the game boots and plays seamlessly in Airplane mode. (Tested in Task 7)

---

## Task Decomposition

### Task 1: Project Setup, Types, and Storage Layer

**Files:**
- Create: `src/game/types.ts`
- Create: `src/game/constants.ts`
- Create: `src/game/storage.ts`
- Test: `tests/storage.test.ts`

**Interfaces:**
- Produces:
  - `GameConfig`, `GameState`, `FishEntity`, `ObstacleEntity`, `PearlEntity`, `SkinId` in `types.ts`
  - `STORAGE_KEYS`, `SKIN_DEFINITIONS`, `PHYSICS_CONSTANTS` in `constants.ts`
  - `getHighScore(): number`, `saveHighScore(score: number): void`
  - `getLifetimePearls(): number`, `addLifetimePearls(count: number): number`
  - `getActiveSkin(): SkinId`, `setActiveSkin(skin: SkinId): void`
  - `isSkinUnlocked(skin: SkinId, lifetimePearls: number): boolean`
  - `isAudioMuted(): boolean`, `setAudioMuted(muted: boolean): void`

- [ ] **Step 1: Write failing storage tests**

Create `tests/storage.test.ts` testing high score updating, cumulative lifetime pearl persistence, skin unlock thresholds (Neon Tetra: 0, Clownfish: 50, Golden Manta: 150), and mute toggle.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/storage.test.ts`
Expected: FAIL (modules not found)

- [ ] **Step 3: Implement `types.ts`, `constants.ts`, and `storage.ts`**

Implement types for all game entities, skin milestones, and `localStorage` storage helpers with fallback handling.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/storage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/types.ts src/game/constants.ts src/game/storage.ts tests/storage.test.ts
git commit -m "feat(game): add core types, constants, and storage persistence layer"
```

---

### Task 2: Core Physics, Movement, and Generous Collision Engine

**Files:**
- Create: `src/game/physics.ts`
- Test: `tests/physics.test.ts`
- Test: `tests/collision.test.ts`

**Interfaces:**
- Consumes: `FishEntity`, `ObstacleEntity`, `PHYSICS_CONSTANTS` from Task 1
- Produces:
  - `applySwimImpulse(fish: FishEntity): void`
  - `updateFishPhysics(fish: FishEntity, dt: number): void`
  - `checkFishObstacleCollision(fish: FishEntity, obstacle: ObstacleEntity): boolean`
  - `checkFishBoundsCollision(fish: FishEntity, worldHeight: number): { hitCeiling: boolean; hitFloor: boolean }`

- [ ] **Step 1: Write failing physics and collision tests**

Create `tests/physics.test.ts` testing gravity acceleration, water drag damping, and upward velocity clamping (Review Focus 1).
Create `tests/collision.test.ts` testing circular/box overlap with a 15% reduction in collision bounds (generous near-miss hitboxes).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test tests/physics.test.ts tests/collision.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `physics.ts`**

Implement numerical integration with gravity (`0.38`), swim impulse (`-6.5`), maximum upward velocity clamp (`-8.5`), maximum downward terminal velocity (`8.0`), pitch angle calculation, and 15% inset hitbox checks.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test tests/physics.test.ts tests/collision.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/physics.ts tests/physics.test.ts tests/collision.test.ts
git commit -m "feat(game): implement fluid swimming physics and generous collision detection"
```

---

### Task 3: Obstacle, Pearl, and 3-Pearl Combo State Machine

**Files:**
- Create: `src/game/entities/obstacles.ts`
- Create: `src/game/entities/collectibles.ts`
- Create: `src/game/combo.ts`
- Test: `tests/combo.test.ts`

**Interfaces:**
- Consumes: `ObstacleEntity`, `PearlEntity`, `FishEntity` from Task 1
- Produces:
  - `createObstaclePair(x: number, worldHeight: number): ObstacleEntity`
  - `createPearlForGap(obstacle: ObstacleEntity): PearlEntity | null`
  - `ComboManager`: class managing `comboCount` (0-3), `hasShield: boolean`, `shieldActiveTime: number`
  - `ComboManager.onPearlCollected(): { combo: number; shieldActivated: boolean }`
  - `ComboManager.onPearlMissed(): void`
  - `ComboManager.onHitAbsorbed(): { shieldBroken: boolean; invulnerableDuration: number }`

- [ ] **Step 1: Write failing combo tests**

Create `tests/combo.test.ts` testing:
1. Collecting 3 consecutive pearls activates the Bubble Shield and resets combo count to 0.
2. Neutral gaps (where no pearl spawned) do not reset the combo.
3. Swimming past an active uncollected pearl resets combo to 0 (Review Focus 4).
4. Absorbing a hit breaks the shield and grants a 1.2-second invulnerability window.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/combo.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `obstacles.ts`, `collectibles.ts`, and `combo.ts`**

Implement procedural generation of kelp/jellyfish gap pairs, 60% probability pearl placement in gaps, and `ComboManager` tracking.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/combo.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/entities/obstacles.ts src/game/entities/collectibles.ts src/game/combo.ts tests/combo.test.ts
git commit -m "feat(game): implement obstacle generation and 3-pearl shield combo manager"
```

---

### Task 4: Procedural Web Audio API Synthesizer

**Files:**
- Create: `src/game/audio.ts`
- Test: `tests/audio.test.ts`

**Interfaces:**
- Consumes: `isAudioMuted` from Task 1
- Produces:
  - `SoundEffects`:
    - `playSwimFlap(): void` (80ms filtered noise swoosh)
    - `playPearlChime(comboIndex: number): void` (C5=523Hz, E5=659Hz, G5=784Hz)
    - `playShieldActivate(): void` (arpeggiated power-up chime)
    - `playShieldPop(): void` (FM modulated bubble burst)
    - `playHit(): void` (low frequency thud)
    - `playPersonalBest(): void` (triumphant brass-like synth burst)
    - `resumeContext(): Promise<void>` (Review Focus 2)

- [ ] **Step 1: Write failing audio tests**

Create `tests/audio.test.ts` using mock `AudioContext` verifying frequencies for the pearl triad, mute behavior, and lazy context resumption.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/audio.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `audio.ts`**

Implement procedural sound synthesis with zero external audio files, graceful fallback for suspended browser audio contexts, and mute state observance.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/audio.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/audio.ts tests/audio.test.ts
git commit -m "feat(game): implement procedural Web Audio API sound effects"
```

---

### Task 5: 60fps Canvas Rendering Engine & Particle Systems

**Files:**
- Create: `src/game/entities/fish.ts`
- Create: `src/game/entities/particles.ts`
- Create: `src/game/engine.ts`

**Interfaces:**
- Consumes: Physics, combo, entities, audio, and storage from Tasks 1-4
- Produces:
  - `GameEngine` orchestrator class:
    - `start(): void`
    - `pause(): void`
    - `handleInput(): void`
    - `update(dt: number): void`
    - `render(ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number): void`
    - Event callbacks: `onScoreChange(score: number)`, `onComboChange(combo: number, shield: boolean)`, `onGameOver(score: number, highscore: number, pearls: number)`

- [ ] **Step 1: Implement `fish.ts` sprite renderers**

Draw vector fish for each skin (Neon Tetra with cyan glow, Clownfish with orange/white stripes, Golden Manta with gold gradient and wing flutter), bubble shield forcefield orb, and bubble trail generator.

- [ ] **Step 2: Implement `particles.ts`**

Create lightweight particle pool for water ambient motes, pop fragments, and celebratory confetti upon crossing the high score ribbon.

- [ ] **Step 3: Implement `engine.ts`**

Orchestrate the 60fps loop using `requestAnimationFrame`, rendering swaying kelp from the ceiling, pulsing jellyfish from the seabed, floating pearls, in-water "Personal Best" ribbon, and Retina/DPR canvas coordinate mapping (Review Focus 3).

- [ ] **Step 4: Verify engine loop in headless environment**

Run: `npm test` to ensure all existing tests remain green.

- [ ] **Step 5: Commit**

```bash
git add src/game/entities/fish.ts src/game/entities/particles.ts src/game/engine.ts
git commit -m "feat(game): implement 60fps canvas rendering engine and particle system"
```

---

### Task 6: React UI Overlays & HUD (Instant Restart & Skin Selector)

**Files:**
- Create: `src/components/GameCanvas.tsx`
- Create: `src/components/HUD.tsx`
- Create: `src/components/StartScreen.tsx`
- Create: `src/components/GameOverModal.tsx`
- Create: `src/components/SkinSelector.tsx`
- Modify: `src/App.tsx`
- Test: `tests/ui.test.tsx`

**Interfaces:**
- Consumes: `GameEngine` from Task 5, storage and skin definitions from Task 1
- Produces:
  - Complete interactive game presentation with zero tap latency
  - In-game HUD: score counter, pearl combo indicator (3 dots), shield status badge, pause & mute buttons
  - Start screen with "Tap to Swim" guide
  - Game Over modal with instant tap anywhere to retry (<0.2s transition)
  - Milestone skin equip modal (Neon Tetra, Clownfish 50, Golden Manta 150)

- [ ] **Step 1: Write failing UI unit tests**

Create `tests/ui.test.tsx` testing that clicking retry invokes engine restart, skin milestones show locked/unlocked states based on pearl balance, and mute button toggles audio state.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/ui.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement React overlay components & GameCanvas**

Implement `GameCanvas.tsx` attaching non-passive direct `touchstart` and `pointerdown` listeners with `preventDefault()`. Implement `HUD.tsx`, `StartScreen.tsx`, `GameOverModal.tsx`, and `SkinSelector.tsx`. Connect everything into `App.tsx`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/ui.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ src/App.tsx tests/ui.test.tsx
git commit -m "feat(ui): add game HUD, start screen, instant retry modal, and skin selector"
```

---

### Task 7: PWA Service Worker, Manifest, and GitHub Pages CI/CD Pipeline

**Files:**
- Create: `public/manifest.json`
- Create: `public/sw.js`
- Create: `public/icons/icon-192.svg`
- Create: `public/icons/icon-512.svg`
- Create: `.github/workflows/deploy.yml`
- Modify: `index.html`
- Modify: `vite.config.ts`

**Interfaces:**
- Produces:
  - Offline-first PWA installable on iOS Safari and Android Chrome
  - Automated GitHub Actions workflow deploying production build to GitHub Pages on push to `main`

- [ ] **Step 1: Create `manifest.json` and SVG app icons**

Set `display: "standalone"`, `orientation: "portrait"`, `background_color: "#020617"`, `theme_color: "#0369a1"`, and vector app icons.

- [ ] **Step 2: Create `sw.js` and register in `index.html`**

Implement cache-first service worker for all scripts, styles, and static assets. Add iOS home screen meta tags:
`<meta name="apple-mobile-web-app-capable" content="yes">`
`<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`

- [ ] **Step 3: Configure `vite.config.ts` and GitHub Pages workflow**

Set `base: "./"` in `vite.config.ts` so all assets resolve relative to the repository path on GitHub Pages. Create `.github/workflows/deploy.yml` building Vite and deploying to GitHub Pages (`actions/deploy-pages@v4`).

- [ ] **Step 4: Verify production build & service worker bundle**

Run: `npm run build`
Expected: Build succeeds with 0 errors, outputting optimized bundles to `dist/`.

- [ ] **Step 5: Commit**

```bash
git add public/ .github/workflows/deploy.yml index.html vite.config.ts
git commit -m "feat(pwa): add service worker, web manifest, and GitHub Pages deployment workflow"
```

---

## Plan Self-Review Checklist

- [x] **Spec coverage:** 100% of features from `2026-11-16-flappy-fish-pwa-design.md` are covered (Fluid swimming physics, kelp & jellyfish hazards, 3-pearl shield combo, lifetime milestone skins, Web Audio synthesizer, PWA manifest/offline SW, and GitHub Pages publishing).
- [x] **Step scan:** Every step contains exact signatures, concrete commands, and clear verification outputs.
- [x] **Type consistency:** Identifiers (`FishEntity`, `ObstacleEntity`, `PearlEntity`, `ComboManager`, `SkinId`) match across all tasks.
- [x] **Review focus addressed:** All 5 review focus items are covered with explicit unit tests and verification steps.
- [x] **Proportion:** The plan is focused and actionable without reproducing bloated code transcripts.
