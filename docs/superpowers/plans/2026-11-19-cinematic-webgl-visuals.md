# Cinematic WebGL Visual Upgrade Implementation Plan

> **For agentic workers:** Implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a WebGL2 cinematic compositor — full-bleed animated background, bloom, ACES, caustics, god rays, glows, particles, impact effects, quality tiers and an in-game FX control — over the existing Canvas 2D scene, keeping the same side-on one-tap gameplay and an exact Canvas 2D fallback.

**Architecture:** The engine keeps simulation and the 2D scene render. A hidden/in-DOM scene canvas is uploaded once per frame into a WebGL2 compositor that draws a procedural full-bleed background and composites the scene into the 9:16 gameplay rect, then applies post effects. A pure controller owns tier/effect decisions; a WebGL backend owns GL resources and shaders. Rendering is injected through `afterRender(snapshot)`; any failure falls back to the 2D path.

**Tech Stack:** TypeScript, React 18, Vite 6, Vitest, Canvas 2D, WebGL2 (GLSL ES 3.00), no new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-11-19-cinematic-webgl-visuals-design.md`

## Global Constraints

- Logical world is **360×640**; gameplay stays in a **9:16** safe area; background is full-bleed; no gameplay/physics/hitbox/scoring changes.
- Quality profiles: High `captureDpr 1.5`, `postDpr 2`, `maxPostPixels 2_200_000`; Medium `1.0 / 1.5`; Low `0.75 / 1.0`; Off = Canvas 2D.
- Capture buffer cap: `MAX_CAPTURE_PIXELS = 1_500_000`.
- Renderer budget: **p95 ≤16.7 ms** on High/Medium/Low targets. No tier accepts 30 fps.
- Bundle: hard total **≤100 KB gzip** (the original budget), interim **≤90 KB after Task 11**, and **≤16 KB raw / ≤6 KB gzip combined for Tasks 11+12**. The 45/15 delta guardrail was spent at Task 10 (+44.25 KB raw / +12.97 KB gzip; total 81.1 KB). No new runtime dependencies; shaders inline or `?raw`, comments stripped.
- Colour: scene texture `SRGB8_ALPHA8`; linear composite; explicit linear→sRGB at present; premultiplied alpha end-to-end.
- Fallback: no WebGL2 / failed init / renderer throw → exact current Canvas 2D look, game keeps running and keeps its run state.
- FX control: **Auto / High / Medium / Low / Off**, persisted, on the start screen and pause overlay, accessible, reverts to Off if a switch fails.
- `prefers-reduced-motion`: disable shake, chromatic aberration and grain; keep gameplay readable.
- No luminance flashes; impacts use a bloom swell. No flashing beyond the existing invulnerability blink.
- Existing **345** tests pass; `tsc` clean; service worker cache bumped to `flappy-fish-v3` on release.
- The pending five-fix working tree must be committed before starting (see `HANDOFF.md`); this plan branches from it.

## Review Focus

- A `webgl2` context that exists but is unusable (the current test mock returns a 2D object) must fall back, not throw or show a black canvas. Pinned by Task 6/7 tests.
- An `afterRender`/GL throw mid-frame must not stop the rAF loop; the game keeps running and falls back. Pinned by Task 4 and Task 6 tests.
- Switching **Off → High → Off** at runtime must not leak a context or leave a black canvas. Pinned by Task 5 and Task 10 tests/manual.
- The 9:16 origin on 390×844 is **75.5 px**, not 76; rounding causes a seam. Pinned by Task 2 tests and Task 7 manual freeze frames.
- A reduced-motion user on the **Low** tier still gets a readable, playable game with no shake/CA/grain. Pinned by Task 1 and Task 11 tests.

---

## File Structure

**New**
- `src/game/rendering/types.ts` — quality, snapshot and event types.
- `src/game/rendering/quality.ts` — profiles, selection, tier transitions.
- `src/game/rendering/fxSettings.ts` — preference persistence and URL precedence.
- `src/game/rendering/geometry.ts` — `GameRect`, world→stage mapping, capture sizing.
- `src/game/rendering/backend.ts` — `PostFXBackend` interface.
- `src/game/rendering/postFx.ts` — `PostFXController` (pure pass/tier orchestration).
- `src/game/rendering/glUtils.ts` — shader/program/FBO/texture helpers.
- `src/game/rendering/webglBackend.ts` — WebGL2 implementation.
- `src/game/rendering/shaders/*.glsl` — background, scene, bright, blur, composite.
- `src/game/rendering/visualFixture.ts` — deterministic QA scene.
- `src/game/rendering/frameStats.ts` — p50/p95 ring buffer.
- `src/game/rendering/qa.ts` — `?debug/?benchmark/?freeze` parsing.
- `src/components/FxPanel.tsx` — the Auto/High/Medium/Low/Off panel.
- `src/components/DebugOverlay.tsx` — FPS/p50/p95/tier/tier sizes.

**Modified**
- `src/game/engine.ts` — snapshot/events, `backgroundVisible`, `afterRender`, `frame()`, loop safety, `ribbonLabelDom`.
- `src/game/entities/collectibles.ts` — move `getEntitySeed`, add `resolvePearlY`.
- `src/game/entities/obstacles.ts` — accept an optional random function.
- `src/game/layout.ts` — re-export geometry types/helpers if needed.
- `src/components/GameCanvas.tsx` — two canvases, GL mount effect, fallback, resize, input split, preference.
- `src/components/StartScreen.tsx`, `src/components/HUD.tsx` — FX buttons.
- `src/components/GameOverModal.tsx` — static panel when FX is active.
- `src/App.tsx` — FX preference/panel state, effective tier, pass-through.
- `src/index.css` — HUD scrims.
- `public/sw.js` — cache v3.
- `README.md` — visual feature + FX control note.

**Tests**
- `tests/helpers/canvas.ts` — shared 2D-context mock.
- `tests/rendering/quality.test.ts`, `fxSettings.test.ts`, `geometry.test.ts`, `capture.test.ts`, `snapshot.test.ts`, `engineFrame.test.ts`, `postFx.test.ts`, `webglBackend.test.ts`, `gameCanvas.test.tsx`, `fxPanel.test.tsx`, `ribbonLabel.test.tsx`, `qa.test.ts`.
- Update `tests/ui.test.tsx` and `tests/engine.test.ts` where stubs/assumptions change.

---

## Task 1: Quality Model

**Files:**
- Create: `src/game/rendering/types.ts`, `src/game/rendering/quality.ts`
- Test: `tests/rendering/quality.test.ts`

**Interfaces:**
- Produces:
```ts
export type QualityTier = 'high' | 'medium' | 'low' | 'off';
export type FxPreference = 'auto' | QualityTier;
export interface QualityProfile {
  tier: Exclude<QualityTier, 'off'>;
  captureDpr: number;
  postDpr: number;
  maxPostPixels: number;
  bloom: boolean;
  godRays: boolean;
  chromaticAberration: boolean;
  grain: boolean;
  effects: boolean;
  particleCount: number;
  shake: boolean;
}
export interface QualityInput {
  webgl2: boolean;
  reducedMotion: boolean;
  hardwareConcurrency: number;
  deviceMemory?: number;
  isDesktop: boolean;
  override?: FxPreference | null;
}
export const QUALITY_PROFILES: Record<Exclude<QualityTier, 'off'>, QualityProfile>;
export function selectQuality(input: QualityInput): QualityTier;
export function getQualityProfile(tier: QualityTier, reducedMotion: boolean): QualityProfile | null;
export function nextTier(current: QualityTier, p95Ms: number): QualityTier;
```

- [ ] **Step 1: Write the failing tests**

```ts
it('falls back to off when WebGL2 is unavailable', () => {
  expect(selectQuality({ webgl2: false, reducedMotion: false, hardwareConcurrency: 8, isDesktop: false })).toBe('off');
});
it('respects an explicit override', () => {
  expect(selectQuality({ webgl2: true, reducedMotion: false, hardwareConcurrency: 8, isDesktop: true, override: 'medium' })).toBe('medium');
});
it('selects high on desktop and capable mobile, low on weak mobile', () => {
  expect(selectQuality({ webgl2: true, reducedMotion: false, hardwareConcurrency: 8, isDesktop: true })).toBe('high');
  expect(selectQuality({ webgl2: true, reducedMotion: false, hardwareConcurrency: 8, deviceMemory: 8, isDesktop: false })).toBe('high');
  expect(selectQuality({ webgl2: true, reducedMotion: false, hardwareConcurrency: 4, deviceMemory: 4, isDesktop: false })).toBe('low');
});
it('disables motion-sensitive effects without changing tier', () => {
  const p = getQualityProfile('high', true);
  expect(p?.shake).toBe(false);
  expect(p?.chromaticAberration).toBe(false);
  expect(p?.grain).toBe(false);
  expect(getQualityProfile('off', false)).toBeNull();
});
it('downgrades on a slow p95 and never auto-upgrades', () => {
  expect(nextTier('high', 16)).toBe('high');
  expect(nextTier('high', 25)).toBe('medium');
  expect(nextTier('medium', 25)).toBe('low');
  expect(nextTier('low', 25)).toBe('off');
  expect(nextTier('off', 10)).toBe('off');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/rendering/quality.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the profiles and functions**

Exact values: High `1.5 / 2 / 2_200_000`, bloom/rays/CA/grain/effects true, particles 180, shake true. Medium `1.0 / 1.5`, bloom true, rays false, CA false, grain false, effects true, particles 90, shake true. Low `0.75 / 1.0`, all post flags false, effects false, particles 40, shake false. `selectQuality`: no WebGL2 → `off`; explicit non-auto override → it; desktop → `high`; `hardwareConcurrency >= 8 && (deviceMemory ?? 4) >= 6` → `high`; `hardwareConcurrency <= 4 || (deviceMemory ?? 8) <= 4` → `low`; else `medium`. `nextTier`: `p95Ms <= 20` or current `off` → current; else one step down. `getQualityProfile` returns `null` for `off`; when `reducedMotion`, copies with `shake/CA/grain = false`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/rendering/quality.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/rendering/types.ts src/game/rendering/quality.ts tests/rendering/quality.test.ts
git commit -m "feat(render): add quality tiers and selection"
```

---

## Task 2: FX Preference, Geometry, Capture Size

**Files:**
- Create: `src/game/rendering/fxSettings.ts`, `src/game/rendering/geometry.ts`
- Test: `tests/rendering/fxSettings.test.ts`, `tests/rendering/geometry.test.ts`, `tests/rendering/capture.test.ts`

**Interfaces:**
- Produces:
```ts
export const FX_STORAGE_KEY = 'flappy_fish_fx';
export function isFxPreference(value: unknown): value is FxPreference;
export function loadFxPreference(storage?: Storage): FxPreference;
export function saveFxPreference(pref: FxPreference, storage?: Storage): void;
export function parseFxOverride(search: string): FxPreference | null;
export function resolveFxPreference(override: FxPreference | null, stored: FxPreference): FxPreference;
export interface GameRect { x: number; y: number; width: number; height: number; }
export function computeGameRect(stageWidth: number, stageHeight: number): GameRect;
export function worldToStage(worldX: number, worldY: number, rect: GameRect): { x: number; y: number };
export interface CaptureSize { width: number; height: number; }
export function computeCaptureSize(gameRect: GameRect, captureDpr: number): CaptureSize;
```

- [ ] **Step 1: Write the failing tests**

```ts
it('defaults invalid or missing preferences to auto', () => {
  const s = window.localStorage;
  s.clear();
  expect(loadFxPreference(s)).toBe('auto');
  s.setItem(FX_STORAGE_KEY, 'ultra');
  expect(loadFxPreference(s)).toBe('auto');
});
it('round-trips a preference', () => {
  saveFxPreference('low', localStorage);
  expect(loadFxPreference(localStorage)).toBe('low');
});
it('parses ?fx= and ignores invalid values', () => {
  expect(parseFxOverride('?fx=medium')).toBe('medium');
  expect(parseFxOverride('?fx=off')).toBe('off');
  expect(parseFxOverride('?fx=nope')).toBeNull();
  expect(parseFxOverride('')).toBeNull();
});
it('keeps the exact fractional 9:16 origin', () => {
  expect(computeGameRect(390, 844)).toEqual({ x: 0, y: 75.5, width: 390, height: 693 });
  expect(computeGameRect(448, 900)).toEqual({ x: 0, y: 52, width: 448, height: 796 });
});
it('maps world corners and center into the stage rect', () => {
  const r = { x: 0, y: 75.5, width: 390, height: 693 };
  expect(worldToStage(0, 0, r)).toEqual({ x: 0, y: 75.5 });
  expect(worldToStage(360, 640, r)).toEqual({ x: 390, y: 768.5 });
  expect(worldToStage(180, 320, r)).toEqual({ x: 195, y: 422 });
});
it('caps the capture buffer', () => {
  expect(computeCaptureSize({ x: 0, y: 0, width: 390, height: 693 }, 1.5)).toEqual({ width: 585, height: 1040 });
  const big = computeCaptureSize({ x: 0, y: 0, width: 1200, height: 2133 }, 2);
  expect(big.width * big.height).toBeLessThanOrEqual(1_500_000);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/rendering/fxSettings.test.ts tests/rendering/geometry.test.ts tests/rendering/capture.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`fxSettings` uses `localStorage` by default and try/catch; valid values are `auto|high|medium|low|off`; save never throws. `parseFxOverride` uses `new URLSearchParams(search)`. `computeGameRect` calls `computeStageSize` from `../layout` and returns `x=(stageW-width)/2`, `y=(stageH-height)/2` (no rounding). `worldToStage` scales by `360/640` and adds the origin. `computeCaptureSize` multiplies by `captureDpr`, rounds, then scales down if `width*height > MAX_CAPTURE_PIXELS` (export the constant).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/rendering/fxSettings.test.ts tests/rendering/geometry.test.ts tests/rendering/capture.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/rendering/fxSettings.ts src/game/rendering/geometry.ts tests/rendering/fxSettings.test.ts tests/rendering/geometry.test.ts tests/rendering/capture.test.ts
git commit -m "feat(render): add FX preference, stage mapping and capture sizing"
```

---

## Task 3: Scene Snapshot, Events, Shared Pearl Bob

**Files:**
- Modify: `src/game/entities/collectibles.ts` (move `getEntitySeed`, add `resolvePearlY`)
- Modify: `src/game/engine.ts` (snapshot, events, use shared bob)
- Modify: `src/game/rendering/types.ts` (add `SceneSnapshot`, `ObstacleSnapshot`, `RenderEvent`)
- Test: `tests/rendering/snapshot.test.ts`

**Interfaces:**
- Produces:
```ts
export function getEntitySeed(id: string | number | undefined): number;
export function resolvePearlY(time: number, seed: number, baseY: number): number;
export interface ObstacleSnapshot {
  x: number; width: number; topHeight: number; bottomY: number;
  pearl?: { x: number; y: number; visualY: number; radius: number; collected: boolean; missed: boolean };
}
export interface SceneSnapshot {
  time: number; status: GameStatus;
  world: { width: number; height: number };
  fish: FishEntity;
  obstacles: ObstacleSnapshot[];
  shield: { active: boolean; activeTime: number };
  ribbon: { x: number; target: number; crossed: boolean };
  events: RenderEvent[];
}
export type RenderEventType = 'pearl' | 'shield-activate' | 'shield-pop' | 'hit' | 'best';
export interface RenderEvent { type: RenderEventType; x: number; y: number; t: number; }
```
- `GameEngine`: `public gameTime: number` (make the existing field public for snapshots/tests); `public events: RenderEvent[]`; `public getSceneSnapshot(): SceneSnapshot`; `private pushEvent(type, x, y): void`.
- Consumes: existing `drawPearls` bob formula.

- [ ] **Step 1: Write the failing tests**

```ts
it('uses the shared pearl bob formula', () => {
  expect(resolvePearlY(0, 0, 100)).toBeCloseTo(100);
  expect(resolvePearlY(1, 0, 100)).toBeCloseTo(100 + Math.sin(3.5) * 4);
});
it('snapshots resolved pearl positions and copies fish', () => {
  const engine = new GameEngine({ soundEffects: mockSounds });
  engine.start();
  const obs = engine.obstacles[0];
  obs.pearl = { id: 'p', x: 120, y: 200, radius: 12, collected: false, missed: false };
  engine.gameTime = 2;
  const snap = engine.getSceneSnapshot();
  expect(snap.obstacles[0].pearl?.visualY).toBeCloseTo(resolvePearlY(2, getEntitySeed(obs.id), 200));
  expect(snap.fish).not.toBe(engine.fish);
  engine.destroy();
});
it('emits a pearl event when collected', () => {
  const engine = new GameEngine({ soundEffects: mockSounds });
  engine.start();
  const obs = engine.obstacles[0];
  obs.pearl = { id: 'p', x: engine.fish.x, y: engine.fish.y, radius: 12, collected: false, missed: false };
  engine.update(1);
  expect(engine.getSceneSnapshot().events.some(e => e.type === 'pearl')).toBe(true);
  engine.destroy();
});
it('prunes events older than one second', () => {
  const engine = new GameEngine({ soundEffects: mockSounds });
  engine.events.push({ type: 'hit', x: 0, y: 0, t: 0 });
  engine.gameTime = 2;
  expect(engine.getSceneSnapshot().events).toHaveLength(0);
  engine.destroy();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/rendering/snapshot.test.ts`
Expected: FAIL — `resolvePearlY`/snapshot missing.

- [ ] **Step 3: Implement**

Move the hash from `engine.ts` to `collectibles.ts`; add `resolvePearlY` (`baseY + Math.sin(time*3.5 + seed) * 4`). Use it in `drawPearls` for `bobY` and in `getSceneSnapshot` for `visualY`. Push events at pearl collect, shield activate, shield pop (both floor and obstacle), game over (`hit`), and ribbon crossing (`best`). `getSceneSnapshot` filters `events` to `t >= gameTime - 1` and assigns the filtered array back to `this.events`. Use `world: { width: 360, height: 640 }` from `PHYSICS_CONSTANTS`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/rendering/snapshot.test.ts tests/engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/entities/collectibles.ts src/game/engine.ts src/game/rendering/types.ts tests/rendering/snapshot.test.ts
git commit -m "feat(render): add scene snapshot, events and shared pearl bob"
```

---

## Task 4: Frame Safety, Background Flag, afterRender Hook

**Files:**
- Modify: `src/game/engine.ts`
- Create: `tests/helpers/canvas.ts` (move `createMockContext` here)
- Modify: `tests/engine.test.ts` (import the helper)
- Test: `tests/rendering/engineFrame.test.ts`

**Interfaces:**
- Produces:
```ts
public backgroundVisible: boolean; // default true
public afterRender?: (snapshot: SceneSnapshot) => void;
public frame(dtFrames: number): void;
```
- `render()` skips `drawBackground` when `backgroundVisible` is false.
- `loop` calls `frame(dtFrames)` then schedules the next rAF.

- [ ] **Step 1: Write the failing tests**

`createMockContext` moves from `tests/engine.test.ts` to `tests/helpers/canvas.ts`; both test files import it. The helper returns the same `vi.fn()`-backed 2D context used today.

```ts
it('keeps running and disables FX when afterRender throws', () => {
  const engine = new GameEngine({ soundEffects: mockSounds });
  engine.afterRender = () => { throw new Error('gl boom'); };
  expect(() => engine.frame(1)).not.toThrow();
  expect(engine.afterRender).toBeUndefined();
  expect(engine.backgroundVisible).toBe(true);
  engine.destroy();
});
it('calls afterRender with a snapshot', () => {
  const engine = new GameEngine({ soundEffects: mockSounds });
  const spy = vi.fn();
  engine.afterRender = spy;
  engine.frame(1);
  expect(spy).toHaveBeenCalledWith(expect.objectContaining({ status: 'idle' }));
  engine.destroy();
});
it('skips the background fill when backgroundVisible is false', () => {
  const engine = new GameEngine({ soundEffects: mockSounds });
  const ctx = createMockContext();
  engine.backgroundVisible = false;
  engine.render(ctx);
  expect(ctx.fillRect).not.toHaveBeenCalledWith(0, 0, 360, 640);
  engine.backgroundVisible = true;
  engine.render(ctx);
  expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 360, 640);
  engine.destroy();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/rendering/engineFrame.test.ts`
Expected: FAIL — `frame`/`backgroundVisible` missing.

- [ ] **Step 3: Implement**

Add `frame(dtFrames)` with `update` then `try { render if ctx; afterRender?.(getSceneSnapshot()) } catch { afterRender = undefined; backgroundVisible = true }`. Change `loop` to call `frame(dtFrames)` (keep dt cap). In `render`, wrap `this.drawBackground(ctx)` in `if (this.backgroundVisible)`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/rendering/engineFrame.test.ts tests/engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/engine.ts tests/rendering/engineFrame.test.ts
git commit -m "feat(engine): add frame safety, background flag and afterRender hook"
```

---

## Task 5: PostFX Backend Interface and Controller

**Files:**
- Create: `src/game/rendering/backend.ts`, `src/game/rendering/postFx.ts`
- Test: `tests/rendering/postFx.test.ts`

**Interfaces:**
- Produces:
```ts
export interface PostFXBackend {
  init(fxCanvas: HTMLCanvasElement, sceneCanvas: HTMLCanvasElement): boolean;
  resize(stageW: number, stageH: number, gameRect: GameRect, profile: QualityProfile): void;
  beginFrame(snapshot: SceneSnapshot, profile: QualityProfile): void;
  background(snapshot: SceneSnapshot, profile: QualityProfile): void;
  scene(snapshot: SceneSnapshot, profile: QualityProfile): void;
  effects(snapshot: SceneSnapshot, profile: QualityProfile): void;
  bloom(snapshot: SceneSnapshot, profile: QualityProfile): void;
  composite(snapshot: SceneSnapshot, profile: QualityProfile): void;
  endFrame(): void;
  dispose(): void;
}
export class PostFXController {
  constructor(backend: PostFXBackend, options: { reducedMotion: boolean; onTierChange?: (tier: QualityTier) => void });
  init(fxCanvas: HTMLCanvasElement, sceneCanvas: HTMLCanvasElement): boolean;
  setPreference(pref: FxPreference, autoTier: QualityTier): void;
  get tier(): QualityTier;
  get profile(): QualityProfile | null;
  resize(stageW: number, stageH: number, gameRect: GameRect): void;
  render(snapshot: SceneSnapshot): void;
  dispose(): void;
}
```

- [ ] **Step 1: Write the failing tests**

Define `fakeBackend(options: { init: boolean })` in the test file: `calls: string[]`, plus `vi.fn()`s for `background/scene/effects/bloom/composite/beginFrame/endFrame` that push their name; `resize` and `dispose` are plain `vi.fn()`s (not recorded), and `init` returns `options.init`.

```ts
it('reports off when init fails and never renders', () => {
  const backend = fakeBackend({ init: false });
  const onTier = vi.fn();
  const c = new PostFXController(backend, { reducedMotion: false, onTierChange: onTier });
  expect(c.init(canvas, scene)).toBe(false);
  c.render(snapshot);
  expect(c.tier).toBe('off');
  expect(onTier).toHaveBeenLastCalledWith('off');
  expect(backend.beginFrame).not.toHaveBeenCalled();
});
it('runs passes in order at high', () => {
  const backend = fakeBackend({ init: true });
  const c = new PostFXController(backend, { reducedMotion: false });
  c.init(canvas, scene);
  c.setPreference('high', 'high');
  c.resize(390, 844, rect);
  c.render(snapshot);
  expect(backend.calls).toEqual(['beginFrame', 'background', 'scene', 'effects', 'bloom', 'composite', 'endFrame']);
});
it('skips effects and bloom at low', () => {
  const backend = fakeBackend({ init: true });
  const c = new PostFXController(backend, { reducedMotion: false });
  c.init(canvas, scene);
  c.setPreference('low', 'high');
  c.render(snapshot);
  expect(backend.calls).toEqual(['beginFrame', 'background', 'scene', 'composite', 'endFrame']);
});
it('off is a no-op', () => {
  const backend = fakeBackend({ init: true });
  const c = new PostFXController(backend, { reducedMotion: false });
  c.init(canvas, scene);
  c.setPreference('off', 'high');
  c.render(snapshot);
  expect(backend.beginFrame).not.toHaveBeenCalled();
});
it('switches off and back on without losing the backend', () => {
  const backend = fakeBackend({ init: true });
  const c = new PostFXController(backend, { reducedMotion: false });
  c.init(canvas, scene);
  c.setPreference('high', 'high');
  c.render(snapshot);
  c.setPreference('off', 'high');
  backend.calls.length = 0;
  c.render(snapshot);
  expect(backend.calls).toEqual([]);
  c.setPreference('high', 'high');
  c.render(snapshot);
  expect(backend.calls[0]).toBe('beginFrame');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/rendering/postFx.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

The controller stores `available`, `preference`, `autoTier`, `dims`, `profile`. `init` calls `backend.init`; if false, sets tier `off`, calls `onTierChange('off')`, returns false. `setPreference` resolves `pref === 'auto' ? autoTier : pref`, computes the profile via `getQualityProfile(tier, reducedMotion)`, calls `onTierChange(tier)`, and if `dims` exists calls `backend.resize(..., profile)`. `resize` stores dims and calls `backend.resize` when available. `render` returns unless available && profile; calls `beginFrame`, `background`, `scene`, then `effects` if `profile.effects`, `bloom` if `profile.bloom`, `composite`, `endFrame`. `dispose` calls backend and marks unavailable.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/rendering/postFx.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/rendering/backend.ts src/game/rendering/postFx.ts tests/rendering/postFx.test.ts
git commit -m "feat(render): add PostFX backend interface and controller"
```

---

## Task 6: GameCanvas Two-Canvas Structure and Fallback

**Files:**
- Modify: `src/components/GameCanvas.tsx`, `src/App.tsx`
- Test: `tests/rendering/gameCanvas.test.tsx`; update `tests/ui.test.tsx` stubs
- Note: the GL backend arrives in Task 7; this task ships the two-canvas layout, feature detection, fallback, resize, input split and the `?fx`/stored preference wiring, with a factory that can return `null`.

**Interfaces:**
- Update `GameCanvasProps`:
```ts
export interface GameCanvasProps {
  engine: GameEngine;
  onTap?: () => void;
  className?: string;
  fxPreference?: FxPreference;
  onEffectiveTierChange?: (tier: QualityTier) => void;
  backendFactory?: () => PostFXBackend | null;
}
```
- The component renders `data-testid="game-canvas"` (scene) and `data-testid="fx-canvas"` (FX).
- When no usable backend: scene `opacity:1`, `engine.backgroundVisible = true`, FX canvas `display:none`, `engine.resize(gameW, gameH, visibleDpr)`.

- [ ] **Step 1: Write the failing tests**

```ts
it('shows the 2D scene and hides FX when WebGL2 is unavailable', () => {
  const engine = new GameEngine({ soundEffects: mockSounds });
  render(<GameCanvas engine={engine} backendFactory={() => null} />);
  expect(screen.getByTestId('game-canvas').style.opacity).toBe('1');
  expect(screen.getByTestId('fx-canvas').style.display).toBe('none');
  engine.destroy();
});
it('does not throw when getContext returns a 2D-shaped object for webgl2', () => {
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((type) =>
    type === '2d' ? (mock2d as any) : ({ createShader: undefined } as any)
  );
  const engine = new GameEngine({ soundEffects: mockSounds });
  expect(() => render(<GameCanvas engine={engine} />)).not.toThrow();
  expect(screen.getByTestId('game-canvas').style.opacity).toBe('1');
  getContext.mockRestore();
  engine.destroy();
});
it('routes stage taps to the engine', () => {
  const engine = new GameEngine({ soundEffects: mockSounds });
  const spy = vi.spyOn(engine, 'handleInput');
  render(<GameCanvas engine={engine} backendFactory={() => null} />);
  fireEvent.pointerDown(screen.getByTestId('game-canvas'), { pointerType: 'mouse' });
  expect(spy).toHaveBeenCalled();
  engine.destroy();
});
it('reveals the 2D scene if the GL frame throws', () => {
  mockMeasuredStage(); // 390×844
  const engine = new GameEngine({ soundEffects: mockSounds });
  const throwing = fakeBackendThatThrowsOnRender(); // init true, beginFrame throws
  render(<GameCanvas engine={engine} backendFactory={() => throwing} />);
  // The mount effect installs afterRender; drive one frame.
  act(() => { engine.frame(1); });
  expect(screen.getByTestId('game-canvas').style.opacity).toBe('1');
  expect(screen.getByTestId('fx-canvas').style.display).toBe('none');
  engine.destroy();
});
it('reports Off and keeps the 2D scene when the preference is High but no backend exists', () => {
  const onTier = vi.fn();
  const engine = new GameEngine({ soundEffects: mockSounds });
  render(<GameCanvas engine={engine} fxPreference="high" backendFactory={() => null} onEffectiveTierChange={onTier} />);
  expect(onTier).toHaveBeenLastCalledWith('off');
  expect(screen.getByTestId('game-canvas').style.opacity).toBe('1');
  engine.destroy();
});
it('falls back if controller.resize throws', () => {
  mockMeasuredStage();
  const engine = new GameEngine({ soundEffects: mockSounds });
  const throwing = fakeBackendThatThrowsOnResize(); // init true, resize throws
  render(<GameCanvas engine={engine} backendFactory={() => throwing} />);
  expect(screen.getByTestId('game-canvas').style.opacity).toBe('1');
  expect(screen.getByTestId('fx-canvas').style.display).toBe('none');
  engine.destroy();
});
```

Define `mockMeasuredStage()`, `fakeBackendThatThrowsOnRender()` and
`fakeBackendThatThrowsOnResize()` in the test file. The fakes implement
`PostFXBackend`: `init` returns true, `resize`/`beginFrame` throw where named,
all other methods are `vi.fn()`s.

`ribbonLabelDom` is introduced in Task 11; **do not reference it in Task 6** — this keeps Task 6's typecheck green. Task 11 adds the flag and sets it when GL is active / resets it in `useFallback`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/rendering/gameCanvas.test.tsx`
Expected: FAIL — no `fx-canvas`/`backendFactory`.

- [ ] **Step 3: Implement**

Split effects: a mount-only GL/controller effect keyed `[engine]` (StrictMode guard) and a separate input effect using a ref for `onTap`. Build the stage with two absolutely positioned canvases: the scene canvas sized/positioned from `computeGameRect` (fractional `left/top`/`translate3d`), and the FX canvas `absolute inset-0 w-full h-full pointer-events-none z-10`. The scene canvas keeps `data-testid="game-canvas"`; the FX canvas is `data-testid="fx-canvas"`.

Wire the preference at the app level now: `App` reads `parseFxOverride(window.location.search) ?? loadFxPreference()` into `fxPreference` and passes it to `GameCanvas`; Task 10 adds the panel that changes it. `GameCanvas` also computes the auto tier **after** the backend initialises:

```ts
const ok = controller.init(fxCanvas, sceneCanvas);
const autoTier = ok
  ? selectQuality({
      webgl2: true,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      hardwareConcurrency: navigator.hardwareConcurrency || 4,
      deviceMemory: (navigator as any).deviceMemory,
      isDesktop: matchMedia('(hover: hover) and (pointer: fine)').matches,
      override: null,
    })
  : 'off';
controller.setPreference(fxPreference, autoTier);
```

If `backendFactory` is absent, use `() => null` until Task 7 imports the real backend. On no backend or failed `controller.init`, call `useFallback()` and `onEffectiveTierChange?.('off')`: show scene, hide FX, set `backgroundVisible = true`, `engine.afterRender = undefined`, `engine.resize(gameW, gameH, dpr)`, and dispose the controller in a try/catch. **If init failed or the factory returned null, do not call `controller.setPreference` later** — keep the effective tier Off; the stored preference is retried on the next load. On success: hide scene (`opacity:0`), show FX, `backgroundVisible=false`, set `afterRender` to a try/catch that calls `controller.render(snapshot)` and calls `useFallback()` on throw. Call `controller.setPreference` and `controller.resize` inside their own try/catch; a throw calls `useFallback()`. `useFallback()` must call `onEffectiveTierChange('off')` last, so the UI cannot show a non-Off tier after a failure. Report controller tier changes through `onEffectiveTierChange` only while the controller is available.

ResizeObserver recomputes the stage. **If `stageW` or `stageH` is 0** (unmeasured/jsdom), skip `controller.resize` and GL rendering and keep the 2D fallback at 360×640 until measured. For GL-path tests, mock the stage's `getBoundingClientRect` to a measured 390×844; fallback tests leave it 0. Otherwise compute `gameRect`; in GL mode enforce the capture cap by calling `computeCaptureSize(gameRect, profile.captureDpr)` and resizing the scene buffer to `engine.resize(capture.width, capture.height, 1)` (the scene texture is that capped buffer; the backend samples it into the game rect). Set the scene canvas CSS to the game rect and call `controller.resize(stageW, stageH, gameRect)`. In fallback call `engine.resize(gameW, gameH, visibleDpr)`. Update `tests/ui.test.tsx`'s `getContext` stub to return `null` for `'webgl2'`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/rendering/gameCanvas.test.tsx tests/ui.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/GameCanvas.tsx tests/rendering/gameCanvas.test.tsx tests/ui.test.tsx
git commit -m "feat(canvas): add two-canvas structure and Canvas 2D fallback"
```

---

## Task 7: WebGL Backend — Full-Bleed Background and Scene Composite

**Files:**
- Create: `src/game/rendering/glUtils.ts`, `src/game/rendering/webglBackend.ts`, `src/game/rendering/shaders/background.vert`, `background.frag`, `scene.vert`, `scene.frag`
- Modify: `src/components/GameCanvas.tsx` (use `new WebGLBackend()` as the default factory; first frame + idle loop)
- Modify: `src/game/engine.ts` (`startLoop()`)
- Test: `tests/rendering/webglBackend.test.ts`, `tests/rendering/gameCanvas.test.tsx`, `tests/rendering/engineFrame.test.ts`; manual freeze check

**Interfaces:**
- `WebGLBackend implements PostFXBackend`; `init` returns `false` (never throws) when `getContext('webgl2')` is null, when `typeof gl.createShader !== 'function'`, or when program creation throws.
- Shader uniforms: background `uResolution`, `uTime`, `uGameRect`, `uWorld`; scene `uScene`, `uGameRect`, `uSceneSize`.
- Scene texture: `SRGB8_ALPHA8`, `UNPACK_PREMULTIPLY_ALPHA_WEBGL = true`; blend `ONE / ONE_MINUS_SRC_ALPHA`.
- `GameEngine.startLoop(): void` starts the rAF loop **without changing status** (idempotent; `start()` reuses it; `destroy()` stops it).

- [ ] **Step 1: Write the failing tests**

```ts
it('returns false for a missing context', () => {
  const canvas = document.createElement('canvas');
  vi.spyOn(canvas, 'getContext').mockReturnValue(null);
  expect(new WebGLBackend().init(canvas, scene)).toBe(false);
});
it('returns false for a context without shader support', () => {
  const canvas = document.createElement('canvas');
  vi.spyOn(canvas, 'getContext').mockReturnValue({ createShader: undefined } as any);
  expect(() => new WebGLBackend().init(canvas, scene)).not.toThrow();
  expect(new WebGLBackend().init(canvas, scene)).toBe(false);
});
```

Also add:
- `gameCanvas.test.tsx`: a **non-null** backend whose `init` returns `false` → scene visible, FX hidden, `onEffectiveTierChange` ends `off`.
- `gameCanvas.test.tsx`: a measured **1200×2000** stage → the scene canvas buffer (`width * height`) is ≤ `1_500_000`, proving `computeCaptureSize` is consumed.
- `engineFrame.test.ts`: `startLoop()` is idempotent (spying `requestAnimationFrame` sees one schedule for two calls) and `destroy()` cancels it.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/rendering/webglBackend.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the GL foundation**

`glUtils`: `compileShader(gl, type, source)`, `createProgram(gl, vs, fs)`, `createQuad(gl)`, `createTexture(gl)`, `createFbo(gl, w, h, internalFormat)`, `uploadCanvas(gl, texture, canvas)`. `webglBackend.init`: get context with `{ alpha:false, antialias:false, depth:false, stencil:false, powerPreference:'high-performance' }`, feature-detect, compile the background and scene programs, create a full-screen quad, return false on any throw. `resize` sets the canvas buffer from `stageW/H × profile.postDpr` capped by `maxPostPixels`, viewport, and recreates the scene FBO. `background` draws the full-screen triangle with the world mapping uniforms. `scene` uploads the scene canvas and draws a quad into `uGameRect` (clip-space conversion: `x = (gx/stageW)*2-1`, etc.), alpha-blended; `beginFrame` binds the scene FBO and clears; `composite` blits/draws the scene FBO to the default framebuffer (no bloom yet); `effects`/`bloom` are no-ops until Task 8; `endFrame` is a no-op. `dispose` deletes programs/textures/FBOs and is **idempotent** (safe on a partially-initialised backend and safe to call twice).

**First frame + idle loop (do not skip this):** before `GameCanvas` hides the scene canvas, run one `controller.render(engine.getSceneSnapshot())` inside try/catch; only hide the scene after it succeeds. Then call `engine.startLoop()` when GL is active, so the start screen shows the animated background/fish before the first tap (the rAF previously started only on tap). `startLoop` is idempotent and `start()` reuses it. Do **not** start the idle loop in the 2D fallback; preserve today's start-screen behavior. If the first render throws, fall back to 2D.

- [ ] **Step 4: Manual visual verification**

Run `npm run dev`; open `http://localhost:3000/?fx=high` in a browser with WebGL2. Expected: full-bleed procedural background edge-to-edge; the 9:16 game scene composited in the center with no seam at the top/bottom edges; no console errors; the **start screen itself** shows the animated background and idle fish (the idle loop), and tapping still flaps. At 390×844 DevTools, the game rect origin must be 75.5 px (inspect the scene canvas `getBoundingClientRect().top`). Run `npm test` and `npx tsc --noEmit`; both pass.

- [ ] **Step 5: Commit**

```bash
git add src/game/rendering/glUtils.ts src/game/rendering/webglBackend.ts src/game/rendering/shaders src/components/GameCanvas.tsx src/game/engine.ts tests/rendering/webglBackend.test.ts tests/rendering/gameCanvas.test.tsx tests/rendering/engineFrame.test.ts
git commit -m "feat(render): add WebGL2 full-bleed background and scene composite"
```

---

## Task 8: Bloom, ACES tonemap, grade, vignette, grain, CA

**Files:**
- Create: `src/game/rendering/shaders/bright.frag`, `blur.frag`, `composite.frag`
- Modify: `src/game/rendering/webglBackend.ts`, `src/components/GameCanvas.tsx`
- Test: controller pass flags already cover enable/disable; manual visual checks.

**Interfaces:**
- Adds FBO mip chain; `bloom(snapshot, profile)` runs bright → blur H → blur V → upsample; `composite` combines scene + bloom, applies ACES, exposure, grade, vignette, grain, CA, and encodes linear→sRGB.
- The bright pass stores `min(color, 4.0) / 4.0` when the FBO is RGBA8; the composite multiplies bloom by 4.
- `chromaticAberration` and `grain` are disabled by the profile; `prefers-reduced-motion` keeps them off.
- The background palette must use the **exact sRGB transfer function** (not `pow(2.2)`) when decoding authored sRGB to linear; the two must agree with `present.frag`.

- [ ] **Step 1: Implement the bloom/bright/blur shaders and FBO chain**

Use half-float FBOs when `EXT_color_buffer_half_float` or `EXT_color_buffer_float` is present; otherwise RGBA8 with the 1/4 headroom **plus a small ordered dither** in the composite/present to avoid dark-end banding (linear RGBA8 deep-water values occupy only a few codes). Replace the background's `pow(2.2)` decode with the exact sRGB transfer function. Bloom threshold ~0.8 (linear), 3 mips, 9-tap Gaussian, additive upsample.

- [ ] **Step 2: Implement the composite shader**

ACES fitted tonemap, exposure uniform default `1.1`, grade uniforms (defaults: teal shadows, warm highlights), vignette strength 0.25, grain 0.03, CA 0.0015, gamma/linear→sRGB encode. No luminance flash. The composite output must match the sRGB scene colours on iOS and Android (known-colour check).

**First-frame scene population:** `engine.resize` clears the scene buffer, so the first GL frame after mount/resize can be background-only. Before the first `controller.render`, render one 2D frame (`engine.frame(0)` with `afterRender` temporarily unset, or equivalent) so the scene texture contains the fish/obstacles. Do this on the first frame after a resize; the idle loop then keeps it current.

- [ ] **Step 3: Manual visual verification**

Use the QA freeze fixture (or `?fx=high` at the start screen) at 390×844 and 448×900. Expected: pearls/shield/fish stripe bloom; background shafts/caustics visible; blacks not crushed; no washed-out gap; disabling bloom via `?fx=low` removes bloom but keeps the full-bleed background. Run `npm test`, `npx tsc --noEmit`, `npm run build`.

**Shader validation:** no GLSL compiler/GPU is available in this environment, and the Task 7 "glslang" claim was not reproducible. Do not claim shader compilation. Manual GLSL review plus a device/driver compile (and `gl.getError()` after init) is a release gate; record it in the Task 12 QA notes.

- [ ] **Step 4: Commit**

```bash
git add src/game/rendering/shaders src/game/rendering/webglBackend.ts src/components/GameCanvas.tsx
git commit -m "feat(render): add bloom, ACES tonemap and cinematic grade"
```

---

## Task 9: Glows, GPU particles, shield ring, impact and personal-best effects

**Files:**
- Create: `src/game/rendering/shaders/glow.frag`, `particle.frag`, `ring.frag` (or fold into composite)
- Modify: `src/game/rendering/webglBackend.ts`
- Test: controller pass flags; manual visual checks.

**Interfaces:**
- `effects(snapshot, profile)` draws:
  - additive radial glows at `pearl.visualY` and jellyfish `bottomY`;
  - a GPU particle pool (`profile.particleCount`) for ambient silt/bubbles and swim events;
  - a shield rim/ring at the fish (no full-screen lens warp);
  - one-shot rings from `events` younger than 500 ms: `hit` (shockwave + bloom swell), `shield-pop` (cyan ring), `best` (gold pulse), `pearl` (sparkle).
  - camera shake only when `profile.shake`; offset the scene/background quad by 2–3 px decaying over ~120 ms, scaled by tier (High 1×, Medium 0.5×). God rays are High-only. The HUD is DOM and never shakes.
- No luminance flash; impacts use a bloom swell.

- [ ] **Step 1: Implement the effects passes and particle pool**

Particle pool size from the profile; reuse buffers; additive blending; depth-layered (background vs foreground). Event rings use `snapshot.time - event.t`. Clamp/expire. The shield ring is drawn outside the fish sprite; do not warp the scene texture.

- [ ] **Step 2: Manual visual verification**

Play with `?fx=high`: collect 3 pearls (shield ring), pop it, hit kelp (shockwave + shake), cross the personal-best ribbon (gold pulse), collect pearls (sparkles). Confirm no full-screen flash, no fish warping, no HUD shake. `?fx=low` has no effects and no shake. Run `npm test` and `npx tsc --noEmit`.

- [ ] **Step 3: Commit**

```bash
git add src/game/rendering/shaders src/game/rendering/webglBackend.ts
git commit -m "feat(render): add glows, GPU particles and impact effects"
```

---

## Task 10: FX Control UI

**Files:**
- Create: `src/components/FxPanel.tsx`
- Modify: `src/components/StartScreen.tsx`, `src/components/HUD.tsx`, `src/App.tsx`, `src/components/GameCanvas.tsx`
- Test: `tests/rendering/fxPanel.test.tsx`, update `tests/ui.test.tsx`, and add the applicable preference-switch/re-init tests to `tests/rendering/gameCanvas.test.tsx` (the final Task 10 commit has 5 new; the Off-with-backend case pre-existed)

**Interfaces:**
- `FxPanel` props:
```ts
export interface FxPanelProps {
  isOpen: boolean;
  preference: FxPreference;
  effectiveTier: QualityTier;
  failureMessage?: string;
  onSelect: (pref: FxPreference) => void;
  onClose: () => void;
}
```
- `StartScreen`/`HUD` gain `onOpenFx?: () => void`. HUD shows the FX button when `isPaused`; StartScreen shows a compact FX button next to Skins.
- `App` owns `fxPreference` (loaded via `loadFxPreference`), `effectiveTier`, `isFxOpen`; saves on select; passes `fxPreference` to `GameCanvas`; renders one `FxPanel` at z-50.

- [ ] **Step 1: Write the failing tests**

```ts
it('renders all five options and marks the selected one', () => {
  render(<FxPanel isOpen preference="auto" effectiveTier="high" onSelect={vi.fn()} onClose={vi.fn()} />);
  for (const label of ['Auto', 'High', 'Medium', 'Low', 'Off']) expect(screen.getByText(label)).toBeDefined();
  expect(screen.getByTestId('fx-option-auto').getAttribute('aria-checked')).toBe('true');
  expect(screen.getByTestId('fx-effective-tier').textContent).toContain('High');
});
it('selects a tier and closes on Escape', () => {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  render(<FxPanel isOpen preference="auto" effectiveTier="high" onSelect={onSelect} onClose={onClose} />);
  fireEvent.click(screen.getByTestId('fx-option-low'));
  expect(onSelect).toHaveBeenCalledWith('low');
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(onClose).toHaveBeenCalled();
});
it('does not start the game when opened from the start screen', () => {
  const onStart = vi.fn();
  const onOpenFx = vi.fn();
  render(<StartScreen highScore={0} lifetimePearls={0} activeSkin="neon-tetra" onOpenSkins={vi.fn()} onStart={onStart} onOpenFx={onOpenFx} />);
  fireEvent.click(screen.getByTestId('fx-open-button'));
  expect(onOpenFx).toHaveBeenCalled();
  expect(onStart).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/rendering/fxPanel.test.tsx`
Expected: FAIL — components missing.

- [ ] **Step 3: Implement the panel and wiring**

`FxPanel` is a z-50 modal with a `role="dialog"`, five `role="radio"` buttons (`data-testid="fx-option-<value>"`), `aria-checked`, an effective-tier line (`data-testid="fx-effective-tier"`), Escape/backdrop close and focus return. StartScreen adds `data-testid="fx-open-button"` with `stopPropagation`; HUD adds the same when paused. `App` loads/saves via `fxSettings`, renders the panel, passes `onOpenFx` to both, and passes `fxPreference`/`onEffectiveTierChange` to `GameCanvas`. `GameCanvas` applies preference changes through one `applyPreference(pref)` path: if a controller is alive, call `controller.setPreference(pref, autoTier)` in try/catch, then re-measure and call `controller.resize` so an Off→High switch gets a viewport/FBO. If the controller is null/disposed (failed init or a previous render throw) and the new preference is a GL tier, create a fresh controller/backend via `backendFactory` and re-run init → setPreference → resize → first frame; if any step throws or init fails, call `onEffectiveTierChange('off')` and show the 2D fallback. Selecting a higher tier after a failed init must not report a working GL tier until a fresh init succeeds; Off keeps the controller alive but shows 2D. After any tier change, re-measure so the resize is not stale.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/rendering/fxPanel.test.tsx tests/ui.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/FxPanel.tsx src/components/StartScreen.tsx src/components/HUD.tsx src/components/GameCanvas.tsx src/App.tsx tests/rendering/fxPanel.test.tsx tests/ui.test.tsx
git commit -m "feat(ui): add discoverable FX control and persistence"
```

---

## Task 11: Readability, Ribbon DOM Label, Game-Over Panel, Reduced Motion

**Files:**
- Create: `src/components/RibbonLabel.tsx`
- Modify: `src/game/engine.ts` (`ribbonLabelDom`), `src/components/GameCanvas.tsx`, `src/components/GameOverModal.tsx`, `src/components/HUD.tsx`, `src/index.css`, `src/App.tsx`
- Test: `tests/rendering/ribbonLabel.test.tsx` (imports `createMockContext` from `tests/helpers/canvas.ts`), `tests/engine.test.ts` (fillText flag), update `tests/ui.test.tsx`

**Interfaces:**
- `GameEngine.ribbonLabelDom: boolean` (default `false`); when true, `drawPersonalBestRibbon` keeps the dashed line but skips the badge rect/text. `GameCanvas` sets it true when GL is active.
- `RibbonLabel` props `{ x: number; y: number; target: number; visible: boolean }`, rendered as a DOM badge (`data-testid="ribbon-label"`) inside the stage, `pointer-events:none`.
- `GameCanvas` updates the label via a ref in `afterRender` (no React state per frame) using `worldToStage(snapshot.ribbon.x, 110, gameRect)`.
- HUD gets top/bottom CSS scrims; `GameOverModal` gets `isFxActive?: boolean` and uses `bg-slate-950/90` without `backdrop-blur` when true.
- Reduced motion: the profile already removes shake/CA/grain; verify no other motion is added.

- [ ] **Step 1: Write the failing tests**

```ts
it('renders the ribbon badge at the mapped position', () => {
  render(<RibbonLabel x={120} y={180} target={8} visible />);
  const el = screen.getByTestId('ribbon-label');
  expect(el.style.left).toBe('120px');
  expect(el.style.top).toBe('180px');
  expect(el.textContent).toContain('BEST: 8');
});
it('skips the Canvas 2D ribbon text when the DOM label owns it', () => {
  const engine = new GameEngine({ soundEffects: mockSounds });
  engine.highScore = 3;
  engine.ribbonTargetScore = 3;
  engine.ribbonX = 100;
  engine.ribbonLabelDom = true;
  const ctx = createMockContext();
  engine.render(ctx);
  expect(ctx.fillText).not.toHaveBeenCalledWith(expect.stringContaining('BEST'), expect.any(Number), expect.any(Number));
  engine.destroy();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Also add an App test: a stored GL preference that resolves Off on load persists Off and shows the failure message (the Task 10 behavior; pin it while touching App).

Run: `npx vitest run tests/rendering/ribbonLabel.test.tsx tests/engine.test.ts`
Expected: FAIL — component/flag missing.

- [ ] **Step 3: Implement**

Add the flag and conditional in `drawPersonalBestRibbon`; add `RibbonLabel`; in `GameCanvas`, render it inside the stage, keep a ref, and in `afterRender` set `style.left/top` from `worldToStage` and `opacity` (visible when the mapped x is within the stage). Set `engine.ribbonLabelDom = true` only while GL is active, and reset it to `false` in `useFallback()` so the 2D label returns. Add the CSS scrims (top/bottom gradients) behind the HUD; add `isFxActive` to `GameOverModal` and pass `effectiveTier !== 'off'` from `App`. Verify with `prefers-reduced-motion` emulation that shake/CA/grain are off and the game is still readable.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/rendering/ribbonLabel.test.tsx tests/engine.test.ts tests/ui.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/RibbonLabel.tsx src/components/GameCanvas.tsx src/components/GameOverModal.tsx src/components/HUD.tsx src/components/StartScreen.tsx src/App.tsx src/game/engine.ts src/index.css tests/rendering/ribbonLabel.test.tsx tests/engine.test.ts tests/ui.test.tsx
git commit -m "feat(ui): move ribbon label to DOM and fix overlay readability"
```

---

## Task 12: Adaptation, QA Tooling, Service Worker, Docs

**Files:**
- Create: `src/game/rendering/qa.ts`, `src/game/rendering/frameStats.ts`, `src/game/rendering/visualFixture.ts`, `src/components/DebugOverlay.tsx`
- Modify: `src/components/GameCanvas.tsx`, `src/App.tsx`, `public/sw.js`, `README.md`, `docs/superpowers/specs/2026-11-19-cinematic-webgl-visuals-design.md` (status/QA results)
- Test: `tests/rendering/qa.test.ts`

**Interfaces:**
- `parseQaFlags(search: string): { debug: boolean; benchmark: boolean; freeze: boolean; seed?: number; time?: number }`.
- `applyVisualFixture(engine: GameEngine, time: number, seed: number): void` sets a deterministic idle/playing frame (fixed fish position, three obstacles, two pearls, ribbon) with no RNG.
- `FrameStats` ring buffer with `push(ms)` and `percentile(p: number): number` (pure, tested).
- `DebugOverlay` shows FPS, p50/p95, tier, capture/post sizes when `?debug=1`.
- Adaptive: only when the user has **not** overridden (`fxPreference === 'auto'`); when p95 over 5 s > 20 ms, call `nextTier` and `controller.setPreference(tier, autoTier)`; one downgrade per run; re-evaluate at start/retry; never auto-upgrade. A manual tier disables adaptation.
- SW: `CACHE_NAME = 'flappy-fish-v3'`, registration query `sw.js?v=12`.

- [ ] **Step 1: Write the failing tests**

```ts
it('parses QA flags', () => {
  expect(parseQaFlags('?debug=1&benchmark=1&freeze=1&seed=42&t=3.5')).toMatchObject({ debug: true, benchmark: true, freeze: true, seed: 42, time: 3.5 });
  expect(parseQaFlags('')).toMatchObject({ debug: false, benchmark: false, freeze: false });
});
it('computes percentiles for adaptive quality', () => {
  const s = new FrameStats(100);
  for (const ms of [10, 12, 14, 16, 18, 20, 100]) s.push(ms);
  expect(s.percentile(0.95)).toBeGreaterThan(18);
});
it('applies a deterministic fixture', () => {
  const engine = new GameEngine({ soundEffects: mockSounds });
  applyVisualFixture(engine, 2, 7);
  const a = engine.getSceneSnapshot();
  applyVisualFixture(engine, 2, 7);
  const b = engine.getSceneSnapshot();
  expect(a.obstacles.map(o => o.x)).toEqual(b.obstacles.map(o => o.x));
  expect(a.obstacles).toHaveLength(3);
  engine.destroy();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/rendering/qa.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

`parseQaFlags` is pure. `applyVisualFixture` pauses the engine (`status='paused'`), sets `gameTime`, `fish` to `(80, 300)`, creates three fixed obstacles at `x=180, 380, 580` with fixed `topHeight`, sets pearls at fixed gap centres, and sets `ribbonX`/`ribbonTargetScore`; it must not advance physics. Wire `?freeze` to call it after boot and skip `start()`; `?debug` renders `DebugOverlay`; `?benchmark` logs p50/p95 on each run end. Add the adaptive loop in GameCanvas (FrameStats, `nextTier`, one downgrade per run, re-evaluate on status idle/gameover). Bump the SW cache and registration query, update README with the FX control and `?fx` QA note, and record the device matrix results in the design doc. Also record the final bundle baseline vs `3aae4eb` against the hard ≤100 KB gzip total (interim ≤90 KB after Task 11; Tasks 11+12 ≤16 KB raw / 6 KB gzip).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/rendering/qa.test.ts && npm test && npx tsc --noEmit && npm run build`
Expected: all pass; cumulative bundle delta ≤45 KB raw / ≤15 KB gzip, total ≤100 KB gzip.

- [ ] **Step 5: Commit**

```bash
git add src/game/rendering/qa.ts src/game/rendering/visualFixture.ts src/components/DebugOverlay.tsx src/components/GameCanvas.tsx src/App.tsx public/sw.js README.md docs/superpowers/specs/2026-11-19-cinematic-webgl-visuals-design.md tests/rendering/qa.test.ts
git commit -m "feat(render): add QA tooling, adaptation and release notes"
```

---

## Self-Review

**Spec coverage:** full-bleed background (Task 7), bloom/ACES/grade/CA/vignette/grain (8), caustics/god rays (7/8), glows/particles/shield/impact/best (9), quality tiers/adaptation (1/5/12), FX control (10), fallback (6/7), snapshot/events (3), frame safety (4), fractional origin (2/6), ribbon DOM/scrims/GameOver (11), SW/docs/QA (12), offline/no deps (all), reduced motion (1/11).

**Step scan:** every task ends with a failing test (or a manual visual check where a GPU is required), a command, and a commit. Shader bodies are intentionally left to the implementer; uniforms, pass order and acceptance are pinned.

**Type consistency:** `QualityTier`, `FxPreference`, `QualityProfile`, `GameRect`, `SceneSnapshot`, `PostFXBackend`, `PostFXController`, `FxPanelProps`, `GameCanvasProps` are defined once and reused. `resolvePearlY`/`getEntitySeed` are named consistently. `frame(dtFrames)` is the single loop entry.

**Review Focus tests:** unusable WebGL2 (Task 6/7), renderer throw (4/6), runtime Off→High→Off (5/10), 75.5 origin (2/7), reduced motion + Low (1/11).

**Proportion:** the plan pins interfaces, values and tests; it does not transcribe shader or component bodies.
