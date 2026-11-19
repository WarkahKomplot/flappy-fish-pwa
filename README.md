# 🌊 🐠 Flappy Fish — Deep Sea Arcade PWA

> An underwater, offline-capable Progressive Web App (PWA) clone of *Flappy Bird* with fluid aquatic physics, a 3-Pearl Bubble Shield combo system, procedural Web Audio, and milestone skin unlocks.

[![Live Web App](https://img.shields.io/badge/Play%20Online-GitHub%20Pages-blue?style=for-the-badge&logo=github)](https://warkahkomplot.github.io/flappy-fish-pwa/)
[![Tests](https://img.shields.io/badge/Vitest-476%20Passed-brightgreen?style=for-the-badge&logo=vitest)](https://github.com/WarkahKomplot/flappy-fish-pwa)
[![PWA](https://img.shields.io/badge/PWA-100%25%20Offline-cyan?style=for-the-badge)](https://warkahkomplot.github.io/flappy-fish-pwa/)
[![License](https://img.shields.io/badge/License-MIT-amber?style=for-the-badge)](LICENSE)

📱 **Play Live**: [https://warkahkomplot.github.io/flappy-fish-pwa/](https://warkahkomplot.github.io/flappy-fish-pwa/)

---

## 🎮 Gameplay & Mechanics

Instead of rigid gravity flaps and green pipes, **Flappy Fish** plunges you into a glowing deep-sea trench with fluid swimming physics and high-dopamine risk/reward:

* **🏊 Fluid Aquatic Physics:** Gentle downward buoyancy with smooth water drag damping. Tap to deliver a snappy forward/upward tail propulsion; fish pitches dynamically (-20° swim stroke, +45° descent).
* **🛡️ 3-Pearl Bubble Shield Combo:** Hazardous gaps between swaying kelp and drifting jellyfish have a ~60% chance of spawning glowing golden pearls. Collecting **3 consecutive pearls** unleashes an iridescent **Bubble Shield** that absorbs 1 collision and grants a 1.2s blinking grace period.
* **🚩 In-Water "Personal Best" Ribbon:** A visible floating ribbon banner (`🏆 BEST: X`) appears in the water at your all-time high score. Crossing it triggers a celebratory confetti burst and triumphant fanfare!
* **🐠 Milestone Skin Wardrobe:** Pearls are never lost upon game over—they deposit into your permanent lifetime bank to unlock cosmetic companions:
  * **Neon Tetra:** Bioluminescent cyan silhouette with electric blue fins *(Default)*.
  * **Clownfish:** Warm orange with 3 vertical curved white stripes *(Unlocked at 50 Lifetime Pearls)*.
  * **Golden Manta:** Graceful diamond ray with harmonic wing flutter *(Unlocked at 150 Lifetime Pearls)*.
* **⚡ 0.2-Second Frictionless Restart:** Instant tap-anywhere on death restarts your swim immediately. Zero ads, zero countdowns, zero loading screens.
* **🎯 Generous Hitboxes:** Collision hitboxes are sized ~15% smaller than the visible sprites (`0.85x`), guaranteeing fair "near-miss" satisfaction without annoying grazing deaths.

---

## 🔊 Procedural Web Audio API

Zero audio file downloads and zero network latency. Every sound is synthesized procedurally in real-time via `AudioContext`:
* **Swim Stroke:** 80ms low-pass filtered white noise burst (gentle fin swoosh).
* **Pearl Chimes:** Pure sine wave triad melody that climbs in pitch on consecutive catches (C5 ➔ E5 ➔ G5).
* **Bubble Shield Pop:** 2-operator frequency-modulated bubble pop burst.
* **Personal Best Fanfare:** Triumphant multi-voice synth flourish.
* **Autoplay Resilient:** Seamlessly wakes suspended mobile audio contexts on your first screen touch without audio clipping.

---

## 📲 How to Install as an App (iOS & Android)

**Flappy Fish** is a full Progressive Web App that works 100% offline with zero app-store download:

### 🍏 iPhone / iPad (Safari):
1. Open [https://warkahkomplot.github.io/flappy-fish-pwa/](https://warkahkomplot.github.io/flappy-fish-pwa/) in **Safari**.
2. Tap the **Share** button (box with an upward arrow at the bottom).
3. Scroll down and tap **"Add to Home Screen"**.
4. Tap **Add** in the top right corner. The Flappy Fish icon will appear on your home screen and open in full-screen standalone mode!

### 🤖 Android (Chrome / Brave / Edge):
1. Open [https://warkahkomplot.github.io/flappy-fish-pwa/](https://warkahkomplot.github.io/flappy-fish-pwa/) in your browser.
2. Tap the install banner at the bottom (or tap the **three dots** in the top right $\rightarrow$ **"Install App"** / **"Add to Home screen"**).
3. Open Flappy Fish anytime from your home screen—even in Airplane Mode with 0 Wi-Fi or cellular data!

---

## 🕹️ Controls

| Platform | Action |
|---|---|
| **Mobile / Tablet** | Tap anywhere on the screen (zero 300ms tap delay, no zoom bounce) |
| **Desktop / Laptop** | Click anywhere with the mouse, or press **Spacebar** / **Arrow Up** |
| **Pause / Audio** | Tap `⏸️` in the HUD to pause, tap `🔇` to toggle audio mute |

---

## ✨ Cinematic FX & Quality Control

A WebGL2 compositor adds the full-bleed animated background, bloom, colour
grade, caustics, glows and impact effects over the unchanged Canvas 2D scene.
If WebGL2 is missing or a GL frame fails, the game automatically falls back to
the exact Canvas 2D look and keeps the run alive.

The quality control lives on the **start screen** (next to Skins) and in the
**pause overlay**, and offers five settings:

| Setting | Behaviour |
|---|---|
| **Auto** *(default)* | Picks a tier from WebGL2 support, desktop/mobile heuristics and `prefers-reduced-motion`. If a run's p95 frame time stays above 20 ms for ~5 s, Auto drops **one** tier for that run. It never upgrades automatically and re-evaluates on each start/retry. |
| **High / Medium / Low** | Manual GL tiers (`Low` keeps the full-bleed background + scene composite without bloom/rays/CA/grain). A manual choice disables adaptivity. |
| **Off** | Exact Canvas 2D renderer, today's look and frame rate. |

The choice is persisted in `localStorage["flappy_fish_fx"]`; `prefers-reduced-motion`
removes shake, chromatic aberration and grain without changing the tier. A
failed GL switch reverts to Off and shows a short inline message.

### QA URL flags (development / device checks)

These are additive overrides for QA only; a normal load uses none of them.

| Flag | Purpose |
|---|---|
| `?fx=auto` (also `high`, `medium`, `low`, `off`) | Session-only FX override (outranks the persisted setting). |
| `?debug=1` | Overlay with FPS, p50/p95 frame time, effective tier, and capture/post buffer sizes. Hidden in a normal load. |
| `?benchmark=1` | Logs `p50`/`p95` frame time, tier and buffer sizes to the console at the end of each run. |
| `?freeze=1&seed=7&t=2` | Deterministic paused fixture (fish, three obstacles, pearls, ribbon) with the start screen and input disabled, for A/B screenshots. `t` is the frozen scene time. |

---

## 🛠️ Tech Stack & Architecture

* **Frontend:** React 18, TypeScript, Tailwind CSS, Vite.
* **Arcade Loop:** 60fps HTML5 Canvas 2D engine with Retina / High-DPI (`devicePixelRatio`) scaling and zero-allocation particle pools.
* **Cinematic compositor:** WebGL2 post stack (full-bleed background, bloom, ACES/grade, caustics, glows) with an exact Canvas 2D fallback and Auto/High/Medium/Low/Off quality control.
* **Audio:** Web Audio API procedural synthesizer (zero audio assets).
* **PWA:** Web App Manifest + Cache-First Service Worker (`public/sw.js`).
* **CI/CD:** Automated GitHub Actions build and deployment to GitHub Pages on push to `main`.
* **Testing:** Vitest + React Testing Library (476 unit & integration tests).

---

## 💻 Local Development

```bash
# Clone the repository
git clone git@github.com:WarkahKomplot/flappy-fish-pwa.git
cd flappy-fish-pwa

# Install dependencies
npm install

# Start local development server (http://localhost:3000)
npm run dev

# Run full test suite (476 tests)
npm test

# Build production bundle
npm run build
```

---

## 📄 License

This project is 100% free and open-source under the [MIT License](LICENSE).
