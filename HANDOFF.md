# HANDOFF — Flappy Fish fix pass before publishing

**Prepared:** 2026-11-19
**Repo:** `/Users/arief/.gemini/antigravity/scratch/malaysia-nav-pwa`
**Branch:** `flappy-fish-pwa` (tracks `flappy-fish/main`)
**State:** committed locally on `flappy-fish-pwa` (fix commit + design/plan doc commits); **not pushed**. `dist/` was rebuilt.

This note is for the agent that publishes this repo to GitHub. Read the
"Publishing" section before pushing.

---

## TL;DR — five fixes applied

| # | Fix | Main files |
|---|-----|-----------|
| 1 | Kelp collision now matches the drawn kelp (inset column + holdfast bulb) | `src/game/physics.ts`, `src/game/engine.ts`, `src/game/constants.ts` |
| 2 | Canvas letterboxed to 9:16 instead of stretched; whole stage still tappable | `src/game/layout.ts` (new), `src/components/GameCanvas.tsx` |
| 3 | "NEW BEST!" no longer fires when you merely tie the stored best | `src/game/engine.ts`, `src/components/GameOverModal.tsx`, `src/App.tsx` |
| 4 | Legacy navigation app no longer shipped; bundle 1.41 MB → 234 KB | `src/App.tsx`, `vite.config.ts` |
| 5 | Removed the test-only `isLegacyNavTest()` branch and its obsolete test | `src/App.tsx`, `tests/AppHeader.test.tsx` (deleted) |

**Verified in this pass:**
- `npx tsc --noEmit` → exit 0, no errors
- `npm test` → **46 files / 345 tests passed**
- `npm run build` → 43 modules, built in ~0.8 s
- `dist/index.html` now preloads only `vendor` (React); no maplibre/dexie chunks

Bundle comparison (raw):

| | Before | After |
|---|---|---|
| JS | 1,300 KB (index 280 + maplibre 784 + vendor 138 + dexie 98) | 188.6 KB (index 46.9 + vendor 141.7) |
| CSS | 108 KB | 45.0 KB |
| **Total** | **~1.41 MB** | **~234 KB (~68 KB gzip)** |

---

## Detailed changes

### 1. Kelp art and hitbox are now the same shape

**Problem:** `drawObstacles()` painted the kelp column 44 px wide (8 px inset
per side) with a semicircular holdfast bulb 22 px *below* `topHeight`, but
`checkFishObstacleCollision()` used the full 60 px width and stopped exactly at
`topHeight`. Players hit 8 px of invisible wall on each side and could swim
through the visibly solid bulb.

**Fix:**
- `src/game/constants.ts` — added `KELP_SIDE_INSET: 8` as the single source of
  truth for both renderer and hitbox.
- `src/game/physics.ts` — added `circleIntersectsCircle()`; the top obstacle is
  now tested as (a) an AABB inset by `KELP_SIDE_INSET` and (b) a circle centred
  at `(obstacle.x + width/2, topHeight)` with radius `(width - 2*inset)/2`.
- `src/game/engine.ts` — `drawObstacles()` uses the same inset and bulb radius
  (including the fronds), so the art literally cannot drift from the hitbox.

**Behaviour change:** the holdfast bulb is solid; the side gutters are not. The
collidable gap at the bulb centre is now 118 px (140 px minus the 22 px bulb),
which is what the player already saw. No other tuning changed.

**Tests:** `tests/collision.test.ts` updated — bulb is solid, side gutter is
clear, generous near-miss at the bulb tip (13.6 + 22 vs 16 + 22), rounded
holdfast corner. The old "grazing top kelp at y = 215 is safe" test was wrong
(it was inside the painted bulb) and was replaced.

### 2. 9:16 letterbox instead of non-uniform stretch

**Problem:** the canvas filled the viewport and the engine scaled X and Y
independently. On a 390×844 phone that is ~22 % vertical stretch, so pearls and
eyes rendered as ellipses. On desktop it was ~13 %.

**Fix:**
- `src/game/layout.ts` (new) — `computeStageSize(availW, availH)` returns the
  largest 360×640-proportioned rectangle that fits, falling back to 360×640
  when the container is not measured (jsdom / first frame).
- `src/components/GameCanvas.tsx` — sizes the canvas with that helper, centres
  it in the stage (`bg-[#010a17]` bars), and keeps the engine's X/Y scale equal.
  Uses `ResizeObserver` on the stage as before.
- Input listeners moved from the `<canvas>` to the **stage container**, so taps
  on the letterbox bars still flap. Without this, the bottom ~75 px on a tall
  phone would have been a dead zone.
- `tests/layout.test.ts` (new) — phone, desktop, landscape, unmeasured fallback.

**Visual notes for QA:** on 390×844 expect a 390×693 canvas (≈75 px bars); on
448×900 a 448×796 canvas (≈52 px bars). The HUD/start/game-over overlays still
span the full stage, so the bars are used by the score and buttons. Nothing is
cropped.

### 3. NEW BEST tie fix

**Problem:** `GameOverModal` defaulted `isNewHighScore` to `score >= highScore`,
but `highScore` is the post-save maximum, so tying the record showed the
"NEW BEST!" banner.

**Fix:**
- `src/game/engine.ts` — `GameEngine.isNewBest` public field. `triggerGameOver()`
  captures `previousBest` and computes `isNewBest = score > previousBest`
  **before** `saveHighScore()`.
- **API change:** `onGameOver` now receives a 4th argument:
  `(score, highScore, pearls, isNewBest)`. Any external consumer must accept it.
- `src/components/GameOverModal.tsx` — no longer derives the flag; default is
  `false`, caller supplies it.
- `src/App.tsx` — new `isNewBest` state, set from the callback, passed to the
  modal, cleared on start/retry.
- `tests/engine.test.ts` — new tie case (`isNewBest === false`); existing
  game-over test updated to expect the 4th argument.
- `tests/ui.test.tsx` — renders a tie (no banner) and an explicit new best
  (banner).

### 4. Legacy navigation app removed from the shipped bundle

**Problem:** `src/App.tsx` statically imported `LegacyNavApp` and
`MapContainer`, so `maplibre-gl` (784 KB) and `dexie` (98 KB) were in the
bundle and preloaded on every load — for a game that needs neither.

**Fix:**
- `src/App.tsx` — removed both imports; `App` is now the game component
  (the old `App` → `FlappyFishApp` wrapper is gone).
- `vite.config.ts` — removed the `maplibre` and `dexie` `manualChunks` (they
  would otherwise keep forcing those packages into chunks). React vendor chunk
  remains.
- `src/index.css` — deleted the dead `.maplibregl-marker` rule left over from
  the navigation app.

**Also required for this rollout (service worker):**
- `public/sw.js` — bumped `CACHE_NAME` from `flappy-fish-v1` to
  `flappy-fish-v2`.
- `src/main.tsx` — bumped the registration URL from `sw.js?v=10` to
  `sw.js?v=11` and replaced the stale "JerayaWara" log/error strings.

This is not cosmetic. The old SW is cache-first for the app shell under a fixed
cache name; without a bump, returning players would keep the old cached
`index.html` and the 1.4 MB maplibre bundle indefinitely. The new SW installs,
`skipWaiting()`/`clients.claim()` run, `activate` deletes v1, and the next
navigation fetches the new shell. The registration is still duplicated in
`index.html` and `main.tsx`; unifying that is left as backlog.

**Important:** the legacy source files are **still in the repo** (not deleted).
They are simply unreachable from the entry graph
(`index.html` → `main.tsx` → `App.tsx`), so Rollup drops them and their CSS.
That is deliberate: the old navigation app has its own remote (`origin` =
`WarkahKomplot/JerayaWara`), and deleting ~8 k lines is a separate decision.
A safe follow-up is to delete `src/components/{LegacyNavApp.tsx,map,...}`,
the nav-only services/hooks, and remove `maplibre-gl`/`dexie`/`lucide-react`
from `package.json` — but do that in a dedicated PR after this publish.

### 5. Test-only branch removed

- `src/App.tsx` — deleted `isLegacyNavTest()`, which called
  `(MapContainer as any)({})` during render and caught the resulting hook error.
  It only ever returned true when a test had mocked `MapContainer`.
- `tests/AppHeader.test.tsx` — deleted. It asserted the removed JerayaWara
  header and only passed because of that mock.
- `README.md` — test badge/text updated from 339 to **345** (345 = 339 − 2
  deleted + 8 new regression tests).

---

## Files changed

```
modified:  src/App.tsx
modified:  src/components/GameCanvas.tsx
modified:  src/components/GameOverModal.tsx
modified:  src/game/constants.ts
modified:  src/game/engine.ts
modified:  src/game/physics.ts
modified:  vite.config.ts
modified:  src/index.css
modified:  src/main.tsx
modified:  public/sw.js
modified:  README.md
new:       src/game/layout.ts
new:       tests/layout.test.ts
new:       HANDOFF.md (this file)
modified:  tests/collision.test.ts
modified:  tests/engine.test.ts
modified:  tests/ui.test.tsx
deleted:   tests/AppHeader.test.tsx
rebuilt:   dist/ (old hashed assets removed, new index/vendor/css added)
```

No source file other than `App.tsx` lost imports; the work is committed locally, not pushed.

---

## Verification commands

```bash
cd /Users/arief/.gemini/antigravity/scratch/malaysia-nav-pwa

npx tsc --noEmit        # 0 errors
npm test                # 46 files, 345 tests, all pass
npm run build           # dist/ rebuilt
npm run preview         # optional: http://localhost:4173
```

Expected build output:

```
dist/index.html                   1.63 kB │ gzip:  0.80 kB
dist/assets/index-*.css          45.01 kB │ gzip:  8.12 kB
dist/assets/index-*.js           46.90 kB │ gzip: 14.02 kB
dist/assets/vendor-*.js         141.74 kB │ gzip: 45.48 kB
```

---

## Publishing (read this before pushing)

**Remotes in this checkout:**

```
flappy-fish  git@github.com:WarkahKomplot/flappy-fish-pwa.git  (the game repo)
origin       git@github.com:WarkahKomplot/JerayaWara.git      (OLD nav app — do NOT push here)
```

The local branch `flappy-fish-pwa` tracks `flappy-fish/main`. GitHub Pages
deploys from **`main`** via `.github/workflows/deploy.yml` (runs `npm ci`,
`npm test`, `npm run build`, uploads `dist/`).

**Recommended steps:**

```bash
cd /Users/arief/.gemini/antigravity/scratch/malaysia-nav-pwa

# Review the fix commit (it is already committed on this branch)
git status
git log --oneline -5
git show --stat "$(git log --format=%H --grep='kelp hitbox' -1)"

# Publish the branch to the GAME remote's main branch
git push flappy-fish flappy-fish-pwa:main
```

Notes:
- The fix commit is `fix: kelp hitbox parity, 9:16 letterbox, new-best tie,
  drop legacy nav bundle`. The branch also contains docs-only commits for the
  cinematic visual design and implementation plan (under
  `docs/superpowers/`); they are safe to push with the fixes.
- `dist/` is tracked in this repo (`.gitignore` only ignores `node_modules`)
  and the rebuilt files are in the fix commit.
- `.superpowers/brainstorm/2321-1794837262/` remains untracked scratch; it is
  not part of the commit and should not be pushed.
- If the publish agent prefers CI to build, the committed `dist` is still safe —
  the workflow rebuilds from source and uploads its own `dist`.
- After deploy, check https://warkahkomplot.github.io/flappy-fish-pwa/ and
  confirm the DevTools Network tab shows only `index-*.js`, `vendor-*.js`,
  `index-*.css` (no maplibre/dexie).

---

## Intentionally NOT changed (backlog for the next pass)

These were listed in the review but are outside this five-fix scope:

1. **Jellyfish dome mismatch.** The bottom obstacle's AABB starts at `bottomY`
   across the full width, while the drawn bell's top corners are ~9–36 px lower.
   Slightly over-collidable; left alone to avoid rebalancing gaps in this pass.
2. **Per-frame allocations / shadows.** `drawBackground` creates 5 gradients per
   frame; each obstacle creates several more; `shadowBlur` is used heavily.
   Consider pre-rendering the background/kelp and capping DPR at 2.
3. **Input leaks through modals.** The window-level Space/ArrowUp handler still
   fires while the skin wardrobe is open (starts the game behind it).
4. **Double retry.** The GameOver card's inner `onClick` bubbles to the backdrop
   `onRetry`, so a card tap calls `onRetry` twice (harmless today).
5. **Service worker.** The cache was bumped to v2 for this rollout, but the
   registration is still duplicated (`index.html` and `main.tsx`). Unify into
   one registration and keep bumping the cache on each deploy.
6. **Dead class.** `animate-fadeIn` is used in 3 components but not defined in
   `tailwind.config.js` (no fade animation is actually running).
7. **No difficulty curve.** Speed and gap are constant; after the 150-pearl
   Golden Manta there is no long-term goal. Consider a speed ramp, moving
   obstacles, or medals.
8. **Legacy test suite.** 187 of the 345 passing tests still cover the old
   navigation services, not the game. They do not affect the bundle; delete
   them when the legacy source is removed.
9. **Engine created during render.** `App.tsx` constructs `GameEngine` in the
   render body under `React.StrictMode`; a lazy `useState`/effect initializer
   would be safer.
10. **Accessibility.** `index.html` still sets `maximum-scale=1.0,
    user-scalable=no` (blocks pinch zoom).

---

## Rollback

The five fixes are a single commit on `flappy-fish-pwa`
(`fix: kelp hitbox parity, 9:16 letterbox, new-best tie, drop legacy nav bundle`).
Before pushing, undo it with `git reset --hard HEAD~1`; after pushing, use
`git revert <fix-commit>` so the published history stays intact. The design and
plan docs are separate commits and are not touched by that revert.
