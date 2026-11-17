# Flappy Fish PWA - System Design Specification

- **Date:** 2026-11-16
- **Status:** Proposed
- **Target Platforms:** iOS Safari, Android Chrome, Desktop (Responsive PWA)
- **Primary Tech Stack:** React 18, TypeScript, HTML5 Canvas (60fps game loop), Web Audio API, PWA Service Worker + Manifest

---

## 1. Intent & The "Why"
*Flappy Bird* was one of the most viral and addictive mobile games in history due to its zero-friction retry loop and punishing "near-miss" psychology. However, classic clones often feel rigid and suffer from monotony in early levels. 

*Flappy Fish* re-envisions the genre underwater: replacing the rigid bird and pipe aesthetic with a fluid, deep-sea bioluminescent world, natural aquatic physics (buoyancy, water drag), and a high-dopamine **3-Pearl Shield Combo** mechanic. Built as a Progressive Web App (PWA), it requires zero app-store downloads, works completely offline, and delivers native-level 60fps performance with instantaneous tap response.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Instant Replay Loop (<0.2s):** Instantaneous tap-to-retry on death with no loading screens, interstitial ads, or unskippable menus.
- **Deep-Sea Fluid Feel:** Smooth aquatic physics (swim impulses, buoyancy, water drag) with bioluminescent visual styling.
- **Rewarding Risk/Reward:** 3-Pearl Combo mechanic where collecting pearls inside hazardous gaps grants a protective 1-hit Bubble Shield.
- **High Retention:** Persistent pearl banking to unlock cosmetic fish skins (e.g. Neon Tetra, Clownfish, Bioluminescent Ray) and an in-water "Personal Best" distance ribbon.
- **Seamless PWA Experience:** 100% offline functionality, standalone full-screen presentation, zero touch latency, and no browser gesture conflicts (zoom/bounce prevention).

### Non-Goals
- Real-time online multiplayer (focus is strictly on frictionless single-player high-score chase).
- Backend server infrastructure / cloud accounts (high scores and pearl banks persist locally on device via `localStorage`).
- In-app purchases or monetization ads.

### Anti-Goals
- **No Floatiness/Input Delay:** Any input latency >16ms ruins the game. Touch inputs must execute directly on hardware events without browser delays.
- **No Unfair Collision Frustration:** The collision hitboxes must never penalize visual grazing. Hitboxes must be ~15% smaller than the visible sprites.
- **No Heavy Bundles:** Game bundle must remain under 100KB gzipped to ensure near-instant first paint over cellular networks.

---

## 3. Approaches Considered & Selected

- **Approach 1: Vanilla TypeScript + HTML5 Canvas**
  - *Pros:* Smallest possible bundle size (<40KB).
  - *Cons:* Menus, skin selectors, and installation prompts require cumbersome custom DOM manipulation or raw canvas text rendering.
- **Approach 2: React + High-Performance HTML5 Canvas Hybrid (Selected)**
  - *Pros:* Optimal separation of concerns. The 60fps game physics and particle rendering run directly on raw Canvas 2D without React state overhead; React cleanly manages the HUD overlays, skin shop modal, high score records, and PWA install banners.
  - *Tradeoffs:* Slightly larger bundle than vanilla TS, but still well under 100KB gzipped.
- **Approach 3: Full Game Engine (Phaser.js / Pixi.js)**
  - *Pros:* Pre-built arcade physics and asset pipelines.
  - *Cons:* Adds 800KB+ overhead, slower mobile startup, and unnecessary complexity for a single-screen flappy game.

**Decision:** Approach 2 was selected for maximum rendering performance coupled with modern, maintainable UI management.

---

## 4. Game Mechanics & Physics Specification

### 4.1 Swimming Physics
- **Buoyancy / Sinking:** The fish experiences a gentle downward sink velocity with terminal velocity clamping.
- **Swim Impulse (Tap/Click):** Tapping applies an upward velocity impulse. Holding does not flap continuously; each flap requires a discrete tap.
- **Water Drag:** Horizontal and vertical velocities have a slight damping coefficient to simulate water resistance, avoiding jerky instant drops while maintaining sharp responsiveness.
- **Rotation/Pitch:** The fish rotates dynamically based on vertical velocity: angling up (-20°) during an upward swim stroke and nosing down (+45°) during descent.

### 4.2 Obstacle Hazards
- **Top Obstacles:** Swaying deep-sea kelp fronds descending from the surface.
- **Bottom Obstacles:** Bioluminescent translucent jellyfish drifting upward from the seabed.
- **Gap Size:** Tuned for precision navigation (~140px vertical clearance on standard 360x640 logical canvas coordinate system).
- **Hitboxes:** Circular / multi-box hitboxes sized at ~85% of visual sprite bounds to provide forgiving "near-miss" satisfaction.

### 4.3 Power-Ups & Collectibles
- **Scoring & Pearls Separation:**
  - **Run Score:** Strictly represents obstacles successfully cleared (1 point per gate passed), maintaining pure arcade integrity.
  - **Luminous Pearls:** Spawn probability in gap is ~60%. Collecting a pearl increments the player's permanent `lifetime_pearls` balance by +1 and advances the consecutive Pearl Combo meter (1 ➔ 2 ➔ 3).
  - **Audio Chime:** Web Audio plays an ascending melodic triad on consecutive catches (C5 ➔ E5 ➔ G5).
  - **Combo Reset Rules:** Gaps where no pearl spawned are **neutral** (they do not reset the streak). The combo meter only resets to 0 if a player flies past an actively spawned pearl without collecting it, or takes damage.
- **Bubble Shield:**
  - Triggered upon collecting 3 consecutive pearls.
  - Surrounds the fish with a glowing, pulsing cyan spherical forcefield.
  - **Hit Absorption:** Absorbs exactly 1 collision with kelp or a jellyfish.
  - Upon impact, the shield bursts with a distinct bubble pop sound, triggering a 1.2-second invulnerability flash (fish blinks translucent) allowing the player to safely exit the obstacle zone.
  - Meter resets to 0 upon shield deployment.

### 4.4 Progression & Addictive Retention Features
- **In-Water "Personal Best" Ribbon:** A visible floating banner rendered at the exact X-coordinate corresponding to the player's all-time high score (`high_score * obstacle_spacing`). Crossing it triggers a celebratory bubble confetti burst.
- **Frictionless Restart:** Immediate tap on game over resets fish coordinates and obstacle pool instantly (<0.2s transition).
- **Lifetime Milestone Skin Unlocks:** Pearls are never spent or lost. They accumulate into a permanent `lifetime_pearls` total, unlocking cosmetic skins at milestones:
  1. *Neon Tetra* (Default: cyan glowing)
  2. *Clownfish* (Unlocked at 50 lifetime pearls: orange/white stripes)
  3. *Golden Manta* (Unlocked at 150 lifetime pearls: glowing gold with wing flutter)

---

## 5. Audio Architecture (Procedural Web Audio API)
To ensure zero external asset loading latency and offline reliability, all audio is synthesized procedurally using `AudioContext`:
- **Swim Flap:** Short noise burst filtered through a low-pass biquad filter (underwater swoosh, 80ms).
- **Pearl Collect:** Pure sine wave chimes with rising pitch (523Hz ➔ 659Hz ➔ 784Hz).
- **Shield Activate:** Two-tone major chord arpeggio with resonance.
- **Shield Pop:** High-frequency frequency-modulated burst (bubble pop).
- **Game Over:** Soft descending low-frequency resonant thud.
- **Mute Toggle:** Global audio mute switch preserved in `localStorage`.

---

## 6. PWA & Mobile Optimization Architecture

### 6.1 Touch & Viewport Handling
- **Viewport Meta:** `width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover`.
- **CSS Touch Action:** `touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;`.
- **Direct Event Listeners:** Attached directly to canvas with `{ passive: false }` calling `e.preventDefault()` to eliminate iOS double-tap zoom and pull-to-refresh bounce.

### 6.2 Service Worker & Manifest
- **Manifest:** Standalone display, theme color (`#0369a1`), background color (`#020617`), portrait orientation lock, custom high-res icons.
- **Service Worker:** Cache-first strategy for all scripts, CSS, and manifest files, ensuring 100% offline availability once installed.
- **iOS Add-to-Home-Screen Support:** `<meta name="apple-mobile-web-app-capable" content="yes">`, `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`, Apple touch icons.

### 6.3 Open Source & Online GitHub Pages Deployment
- **License:** 100% Free and Open Source (MIT License). Zero proprietary engines or paid services.
- **Hosting & Online Access:** Automated deployment via GitHub Pages (`.github/workflows/deploy.yml`).
- **PWA HTTPS Requirements:** GitHub Pages natively provides free HTTPS/SSL, which is strictly required for Service Workers and iOS/Android "Add to Home Screen" installation.
- **Online URL:** Accessible globally at `https://<username>.github.io/<repo-name>/`.

---

## 7. What is Left to the Builder
- Precise numerical tuning of gravity (`0.38`), swim impulse (`-6.5`), and horizontal scroll speed (`2.8`).
- Procedural particle pool sizing (bubbles, ambient motes, pop fragments).
- Local storage schema implementation:
  - `flappy_fish_highscore`: integer (maximum obstacles cleared in a single run)
  - `flappy_fish_lifetime_pearls`: integer (cumulative lifetime pearls collected)
  - `flappy_fish_active_skin`: string (`"neon-tetra"` | `"clownfish"` | `"golden-manta"`)
  - `flappy_fish_muted`: boolean
