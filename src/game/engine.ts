import { PHYSICS_CONSTANTS } from './constants';
import {
  applySwimImpulse,
  updateFishPhysics,
  checkFishObstacleCollision,
  checkFishBoundsCollision,
} from './physics';
import { ComboManager } from './combo';
import { soundEffects, type SoundEffects } from './audio';
import {
  getHighScore,
  saveHighScore,
  getLifetimePearls,
  addLifetimePearls,
  getActiveSkin,
  setActiveSkin,
  isAudioMuted,
  setAudioMuted,
} from './storage';
import { createObstaclePair } from './entities/obstacles';
import { createPearlForGap } from './entities/collectibles';
import { renderFish } from './entities/fish';
import { ParticleSystem } from './entities/particles';
import type {
  FishEntity,
  ObstacleEntity,
  GameState,
  GameStatus,
  SkinId,
} from './types';

function getEntitySeed(id: string | number | undefined): number {
  if (!id) return 0;
  if (typeof id === 'number') return id;
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash % 100);
}

export interface GameEngineOptions {
  canvas?: HTMLCanvasElement | null;
  onScoreChange?: (score: number) => void;
  onComboChange?: (combo: number, shield: boolean) => void;
  onGameOver?: (score: number, highScore: number, pearls: number) => void;
  soundEffects?: SoundEffects;
  activeSkin?: SkinId;
}

/**
 * 60fps HTML5 Canvas 2D game engine orchestrator for Flappy Fish PWA.
 * Coordinates physics integration, obstacle recycling, 3-Pearl Shield combo,
 * procedural Web Audio triggers, particle systems, and Retina/High-DPI canvas scaling.
 */
export class GameEngine {
  public status: GameStatus = 'idle';
  public score: number = 0;
  public highScore: number = 0;
  public runPearls: number = 0;
  public fish: FishEntity;
  public obstacles: ObstacleEntity[] = [];
  public comboManager: ComboManager;
  public particles: ParticleSystem;
  public soundEffects: SoundEffects;

  public onScoreChange?: (score: number) => void;
  public onComboChange?: (combo: number, shield: boolean) => void;
  public onGameOver?: (score: number, highScore: number, pearls: number) => void;

  public ribbonX: number = -9999;
  public ribbonCrossed: boolean = false;
  public ribbonTargetScore: number = 0;

  private canvas: HTMLCanvasElement | null = null;
  private canvasCtx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private running: boolean = false;
  private lastTime: number = 0;
  private gameTime: number = 0;
  private displayWidth: number = PHYSICS_CONSTANTS.CANVAS_WIDTH;
  private displayHeight: number = PHYSICS_CONSTANTS.CANVAS_HEIGHT;
  private dpr: number = 1;

  constructor(options?: GameEngineOptions) {
    this.soundEffects = options?.soundEffects ?? soundEffects;
    this.onScoreChange = options?.onScoreChange;
    this.onComboChange = options?.onComboChange;
    this.onGameOver = options?.onGameOver;

    const initialSkin = options?.activeSkin ?? getActiveSkin();
    this.highScore = getHighScore();

    this.fish = {
      x: 80,
      y: 300,
      vx: 0,
      vy: 0,
      radius: PHYSICS_CONSTANTS.FISH_RADIUS,
      rotation: 0,
      skin: initialSkin,
      isDead: false,
      invulnerableTime: 0,
    };

    this.comboManager = new ComboManager();
    this.particles = new ParticleSystem(300);
    this.particles.initAmbient(
      PHYSICS_CONSTANTS.CANVAS_WIDTH,
      PHYSICS_CONSTANTS.CANVAS_HEIGHT,
      30
    );

    if (options?.canvas) {
      this.attachCanvas(options.canvas);
    }

    this.reset();
  }

  /**
   * Attaches an HTMLCanvasElement and extracts 2D context.
   */
  public attachCanvas(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.canvasCtx = canvas.getContext('2d');
  }

  /**
   * Updates rendering viewport resolution and device pixel ratio.
   */
  public resize(width: number, height: number, dpr: number = 1): void {
    this.displayWidth = width;
    this.displayHeight = height;
    this.dpr = dpr;

    if (this.canvas) {
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
    }
  }

  /**
   * Resets all game state for a fresh run.
   */
  public reset(): void {
    const prevScore = this.score;
    const prevCombo = this.comboManager.combo;
    const prevShield = this.comboManager.hasShield;

    this.status = 'idle';
    this.score = 0;
    this.runPearls = 0;
    this.highScore = getHighScore();
    this.gameTime = 0;

    this.fish.x = 80;
    this.fish.y = 300;
    this.fish.vx = 0;
    this.fish.vy = 0;
    this.fish.rotation = 0;
    this.fish.skin = getActiveSkin();
    this.fish.isDead = false;
    this.fish.invulnerableTime = 0;

    this.comboManager.reset();
    this.particles.reset(true); // preserve ambient particles

    // Seed initial obstacles
    this.obstacles = [];
    const startX = PHYSICS_CONSTANTS.CANVAS_WIDTH + 60;
    for (let i = 0; i < 3; i++) {
      const obs = createObstaclePair(
        startX + i * PHYSICS_CONSTANTS.OBSTACLE_SPACING,
        PHYSICS_CONSTANTS.CANVAS_HEIGHT
      );
      obs.pearl = createPearlForGap(obs);
      this.obstacles.push(obs);
    }

    // Configure In-Water Personal Best ribbon
    if (this.highScore > 0) {
      this.ribbonTargetScore = this.highScore;
      this.ribbonX =
        startX +
        (this.highScore - 1) * PHYSICS_CONSTANTS.OBSTACLE_SPACING +
        PHYSICS_CONSTANTS.OBSTACLE_WIDTH / 2;
      this.ribbonCrossed = false;
    } else {
      this.ribbonTargetScore = 0;
      this.ribbonX = -9999;
      this.ribbonCrossed = true;
    }

    if (prevScore !== 0 && this.onScoreChange) {
      this.onScoreChange(0);
    }
    if ((prevCombo !== 0 || prevShield) && this.onComboChange) {
      this.onComboChange(0, false);
    }
  }

  /**
   * Starts or resumes the game and starts the animation loop if attached to canvas.
   */
  public start(): void {
    if (this.status === 'idle') {
      this.status = 'playing';
      applySwimImpulse(this.fish);
      this.soundEffects.playSwimFlap();
      this.particles.emitSwimBubbles(this.fish.x - this.fish.radius, this.fish.y);
      this.soundEffects.resumeContext();
    } else if (this.status === 'paused') {
      this.status = 'playing';
    } else if (this.status === 'gameover') {
      this.reset();
      this.status = 'playing';
      applySwimImpulse(this.fish);
      this.soundEffects.playSwimFlap();
      this.particles.emitSwimBubbles(this.fish.x - this.fish.radius, this.fish.y);
      this.soundEffects.resumeContext();
    }

    if (!this.running && typeof requestAnimationFrame !== 'undefined') {
      this.running = true;
      this.lastTime = 0;
      this.animationFrameId = requestAnimationFrame(this.loop);
    }
  }

  /**
   * Pauses the active game loop.
   */
  public pause(): void {
    if (this.status === 'playing') {
      this.status = 'paused';
    }
  }

  /**
   * Resumes a paused game.
   */
  public resume(): void {
    if (this.status === 'paused') {
      this.status = 'playing';
    }
  }

  /**
   * Toggles pause state.
   */
  public togglePause(): void {
    if (this.status === 'playing') {
      this.pause();
    } else if (this.status === 'paused') {
      this.resume();
    }
  }

  /**
   * Handles user tap/click/key input.
   */
  public handleInput(): void {
    this.soundEffects.resumeContext();

    if (this.status === 'idle') {
      this.start();
    } else if (this.status === 'playing') {
      applySwimImpulse(this.fish);
      this.soundEffects.playSwimFlap();
      this.particles.emitSwimBubbles(this.fish.x - this.fish.radius, this.fish.y);
    } else if (this.status === 'gameover') {
      // Instant tap-to-retry (<0.2s transition)
      this.start();
    }
  }

  /**
   * Fixed/variable timestep physics and state updater.
   * dt: frame units (1.0 = 16.67ms frame at 60fps).
   */
  public update(dt: number): void {
    const dtSeconds = dt / 60;
    this.gameTime += dtSeconds;

    // Ambient particles always update even during idle/pause
    this.particles.update(
      dt,
      PHYSICS_CONSTANTS.CANVAS_WIDTH,
      PHYSICS_CONSTANTS.CANVAS_HEIGHT
    );

    if (this.status === 'idle') {
      // Gentle sinusoidal bob in place while waiting to tap
      this.fish.y = 300 + Math.sin(this.gameTime * 3) * 6;
      this.fish.rotation = Math.sin(this.gameTime * 3) * 0.08;
      return;
    }

    if (this.status !== 'playing') {
      return;
    }

    // 1. Fish physics integration
    updateFishPhysics(this.fish, dt);

    // 2. Invulnerability countdown
    if (this.fish.invulnerableTime > 0) {
      this.fish.invulnerableTime = Math.max(0, this.fish.invulnerableTime - dtSeconds);
    }

    // 3. Combo manager updates
    this.comboManager.update(dtSeconds);

    // 4. Bounds collision (ceiling & floor)
    const { hitCeiling, hitFloor } = checkFishBoundsCollision(
      this.fish,
      PHYSICS_CONSTANTS.CANVAS_HEIGHT
    );

    if (hitCeiling) {
      // Clamp fish within upper canvas boundary
      this.fish.y = this.fish.radius * PHYSICS_CONSTANTS.HITBOX_SCALE;
      if (this.fish.vy < 0) {
        this.fish.vy = 0;
      }
    }

    if (hitFloor) {
      this.fish.y =
        PHYSICS_CONSTANTS.CANVAS_HEIGHT -
        this.fish.radius * PHYSICS_CONSTANTS.HITBOX_SCALE;

      if (this.comboManager.hasShield) {
        // Bubble shield absorbs floor impact and bounces fish upward
        const absorb = this.comboManager.onHitAbsorbed();
        this.fish.invulnerableTime = absorb.invulnerableDuration;
        this.soundEffects.playShieldPop();
        this.particles.emitShieldPop(this.fish.x, this.fish.y);
        applySwimImpulse(this.fish);
        if (this.onComboChange) {
          this.onComboChange(0, false);
        }
      } else if (this.fish.invulnerableTime <= 0) {
        this.triggerGameOver();
        return;
      }
    }

    // 5. In-Water Personal Best ribbon update
    if (this.highScore > 0) {
      this.ribbonX -= PHYSICS_CONSTANTS.HORIZONTAL_SPEED * dt;
      if (!this.ribbonCrossed && this.ribbonX <= this.fish.x) {
        this.ribbonCrossed = true;
        this.soundEffects.playPersonalBest();
        this.particles.emitConfetti(this.fish.x, this.fish.y);
      }
    }

    // 6. Obstacle scrolling, collectibles, scoring, and collision detection
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      obs.x -= PHYSICS_CONSTANTS.HORIZONTAL_SPEED * dt;

      // Update pearl position and check collection
      if (obs.pearl) {
        obs.pearl.x -= PHYSICS_CONSTANTS.HORIZONTAL_SPEED * dt;

        if (!obs.pearl.collected && !obs.pearl.missed) {
          const seed = getEntitySeed(obs.id);
          const bobY = Math.sin(this.gameTime * 3.5 + seed) * 4;
          const pearlY = obs.pearl.y + bobY;
          const dx = this.fish.x - obs.pearl.x;
          const dy = this.fish.y - pearlY;
          const distSq = dx * dx + dy * dy;
          const collectRadius =
            this.fish.radius * PHYSICS_CONSTANTS.HITBOX_SCALE + obs.pearl.radius;

          if (distSq < collectRadius * collectRadius) {
            obs.pearl.collected = true;
            this.runPearls += 1;
            this.particles.emitPearlCollect(obs.pearl.x, pearlY);
            const result = this.comboManager.onPearlCollected();

            if (result.shieldActivated) {
              this.soundEffects.playShieldActivate();
            } else {
              this.soundEffects.playPearlChime(result.combo - 1);
            }

            if (this.onComboChange) {
              this.onComboChange(result.combo, this.comboManager.hasShield);
            }
          } else if (obs.pearl.x + obs.pearl.radius < this.fish.x - this.fish.radius) {
            // Swam past an uncollected spawned pearl -> reset combo streak (Review Focus 4)
            obs.pearl.missed = true;
            this.comboManager.onPearlMissed();
            if (this.onComboChange) {
              this.onComboChange(0, this.comboManager.hasShield);
            }
          }
        }
      }

      // Check obstacle clearance score
      if (!obs.passed && obs.x + obs.width < this.fish.x) {
        obs.passed = true;
        this.score += 1;
        if (this.onScoreChange) {
          this.onScoreChange(this.score);
        }
      }

      // Check obstacle collision (kelp or jellyfish)
      if (!this.fish.isDead && this.fish.invulnerableTime <= 0) {
        if (checkFishObstacleCollision(this.fish, obs)) {
          if (this.comboManager.hasShield) {
            // Absorb 1 collision, pop shield, grant 1.2s invulnerability
            const absorb = this.comboManager.onHitAbsorbed();
            this.fish.invulnerableTime = absorb.invulnerableDuration;
            this.soundEffects.playShieldPop();
            this.particles.emitShieldPop(this.fish.x, this.fish.y);
            if (this.onComboChange) {
              this.onComboChange(0, false);
            }
          } else {
            this.triggerGameOver();
            return;
          }
        }
      }

      // Remove off-screen obstacles
      if (obs.x + obs.width < -60) {
        this.obstacles.splice(i, 1);
      }
    }

    // 7. Spawn new obstacle pairs
    const lastObs = this.obstacles[this.obstacles.length - 1];
    if (
      !lastObs ||
      lastObs.x <=
        PHYSICS_CONSTANTS.CANVAS_WIDTH + PHYSICS_CONSTANTS.OBSTACLE_SPACING
    ) {
      const nextX = lastObs
        ? lastObs.x + PHYSICS_CONSTANTS.OBSTACLE_SPACING
        : PHYSICS_CONSTANTS.CANVAS_WIDTH + 60;
      const newObs = createObstaclePair(nextX, PHYSICS_CONSTANTS.CANVAS_HEIGHT);
      newObs.pearl = createPearlForGap(newObs);
      this.obstacles.push(newObs);
    }
  }

  /**
   * Triggers Game Over sequence upon unshielded collision.
   */
  private triggerGameOver(): void {
    this.status = 'gameover';
    this.fish.isDead = true;
    this.soundEffects.playHit();

    saveHighScore(this.score);
    this.highScore = Math.max(this.highScore, this.score);

    if (this.runPearls > 0) {
      addLifetimePearls(this.runPearls);
    }

    if (this.onGameOver) {
      this.onGameOver(this.score, this.highScore, this.runPearls);
    }
  }

  /**
   * Renders the complete game scene to Canvas 2D.
   * Handles Retina/High-DPI DPR scaling (Review Focus 3).
   */
  public render(
    ctx: CanvasRenderingContext2D,
    width: number = PHYSICS_CONSTANTS.CANVAS_WIDTH,
    height: number = PHYSICS_CONSTANTS.CANVAS_HEIGHT,
    dpr: number = 1
  ): void {
    ctx.save();

    // Clear physical canvas buffer
    ctx.clearRect(0, 0, width * dpr, height * dpr);

    // Retina / High-DPI DPR scaling:
    // Logical coordinates are strictly 360x640 (Review Focus 3)
    const scaleX = (width / PHYSICS_CONSTANTS.CANVAS_WIDTH) * dpr;
    const scaleY = (height / PHYSICS_CONSTANTS.CANVAS_HEIGHT) * dpr;
    ctx.scale(scaleX, scaleY);

    // 1. Deep-sea background gradient & sunbeams
    this.drawBackground(ctx);

    // 2. Ambient particles & motes
    this.particles.render(ctx);

    // 3. In-water Personal Best ribbon
    this.drawPersonalBestRibbon(ctx);

    // 4. Obstacles (swaying kelp & pulsing jellyfish)
    this.drawObstacles(ctx);

    // 5. Floating pearls with sinusoidal bob
    this.drawPearls(ctx);

    // 6. Active fish with skin & forcefield bubble shield
    renderFish(ctx, this.fish, this.comboManager.hasShield, this.gameTime);

    ctx.restore();
  }

  /**
   * Draws deep-sea gradient background with soft swaying sunbeams.
   */
  private drawBackground(ctx: CanvasRenderingContext2D): void {
    const w = PHYSICS_CONSTANTS.CANVAS_WIDTH;
    const h = PHYSICS_CONSTANTS.CANVAS_HEIGHT;

    // Deep sea vertical gradient
    const seaGrad = ctx.createLinearGradient(0, 0, 0, h);
    seaGrad.addColorStop(0, '#020b18');
    seaGrad.addColorStop(0.4, '#042247');
    seaGrad.addColorStop(0.85, '#021833');
    seaGrad.addColorStop(1, '#010a17');

    ctx.fillStyle = seaGrad;
    ctx.fillRect(0, 0, w, h);

    // Soft angled sunbeams from surface
    ctx.save();
    const beamSway = Math.sin(this.gameTime * 0.4) * 15;

    for (let i = 0; i < 4; i++) {
      const startX = 40 + i * 90 + beamSway;
      const beamGrad = ctx.createLinearGradient(startX, 0, startX + 50, h);
      beamGrad.addColorStop(0, 'rgba(56, 189, 248, 0.08)');
      beamGrad.addColorStop(0.5, 'rgba(34, 211, 238, 0.03)');
      beamGrad.addColorStop(1, 'rgba(2, 11, 24, 0)');

      ctx.beginPath();
      ctx.moveTo(startX, 0);
      ctx.lineTo(startX + 45, 0);
      ctx.lineTo(startX + 90, h);
      ctx.lineTo(startX + 15, h);
      ctx.closePath();
      ctx.fillStyle = beamGrad;
      ctx.fill();
    }

    ctx.restore();
  }

  /**
   * Draws top swaying kelp fronds and bottom pulsing jellyfish obstacles.
   */
  private drawObstacles(ctx: CanvasRenderingContext2D): void {
    const worldHeight = PHYSICS_CONSTANTS.CANVAS_HEIGHT;

    for (const obs of this.obstacles) {
      if (obs.x + obs.width < -10 || obs.x > PHYSICS_CONSTANTS.CANVAS_WIDTH + 10) {
        continue;
      }

      ctx.save();

      // --- TOP OBSTACLE: Swaying Kelp Column (0 -> topHeight) ---
      const kelpGrad = ctx.createLinearGradient(
        obs.x, 0,
        obs.x + obs.width, obs.topHeight
      );
      kelpGrad.addColorStop(0, '#064e3b');
      kelpGrad.addColorStop(0.5, '#059669');
      kelpGrad.addColorStop(1, '#10b981');

      // Main kelp column
      ctx.fillStyle = kelpGrad;
      ctx.fillRect(obs.x + 8, 0, obs.width - 16, obs.topHeight);

      // Bulbous bottom tip / kelp holdfast
      ctx.beginPath();
      ctx.arc(
        obs.x + obs.width / 2,
        obs.topHeight,
        (obs.width - 16) / 2,
        0,
        Math.PI
      );
      ctx.fillStyle = '#10b981';
      ctx.fill();

      // Swaying kelp fronds
      const numFronds = Math.max(2, Math.floor(obs.topHeight / 40));
      for (let f = 1; f <= numFronds; f++) {
        const fy = (obs.topHeight / (numFronds + 1)) * f;
        const frondSway = Math.sin(this.gameTime * 2.5 + fy * 0.04) * 8;

        // Left frond
        ctx.beginPath();
        ctx.moveTo(obs.x + 8, fy);
        ctx.quadraticCurveTo(
          obs.x - 12 + frondSway, fy - 10,
          obs.x - 16 + frondSway, fy + 8
        );
        ctx.quadraticCurveTo(obs.x + 4, fy + 12, obs.x + 8, fy + 14);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.75)';
        ctx.fill();

        // Right frond
        ctx.beginPath();
        ctx.moveTo(obs.x + obs.width - 8, fy + 10);
        ctx.quadraticCurveTo(
          obs.x + obs.width + 12 - frondSway, fy,
          obs.x + obs.width + 16 - frondSway, fy + 18
        );
        ctx.quadraticCurveTo(
          obs.x + obs.width - 4, fy + 22,
          obs.x + obs.width - 8, fy + 24
        );
        ctx.fillStyle = 'rgba(5, 150, 105, 0.75)';
        ctx.fill();
      }

      // --- BOTTOM OBSTACLE: Bioluminescent Pulsing Jellyfish (bottomY -> worldHeight) ---
      const bellY = obs.bottomY;
      const bellWidth = obs.width;
      const pulse = Math.sin(this.gameTime * 4 + obs.x * 0.03) * 3;
      const bellHeight = 36 + pulse;

      // Jellyfish dome / bell gradient
      const jellyGrad = ctx.createRadialGradient(
        obs.x + bellWidth / 2, bellY + 10, 5,
        obs.x + bellWidth / 2, bellY + bellHeight, bellWidth / 1.5
      );
      jellyGrad.addColorStop(0, 'rgba(236, 72, 153, 0.85)');
      jellyGrad.addColorStop(0.6, 'rgba(168, 85, 247, 0.75)');
      jellyGrad.addColorStop(1, 'rgba(126, 34, 206, 0.85)');

      // Bell dome
      ctx.beginPath();
      ctx.moveTo(obs.x, bellY + bellHeight);
      ctx.bezierCurveTo(
        obs.x, bellY,
        obs.x + bellWidth, bellY,
        obs.x + bellWidth, bellY + bellHeight
      );
      ctx.closePath();
      ctx.fillStyle = jellyGrad;
      ctx.shadowColor = '#c084fc';
      ctx.shadowBlur = 8;
      ctx.fill();

      // Luminous rim
      ctx.strokeStyle = 'rgba(244, 114, 182, 0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Trailing tentacles dangling to seabed
      const tentacleCount = 5;
      for (let t = 0; t < tentacleCount; t++) {
        const tx = obs.x + 8 + (t * (bellWidth - 16)) / (tentacleCount - 1);
        ctx.beginPath();
        ctx.moveTo(tx, bellY + bellHeight);

        const tentacleLen = worldHeight - (bellY + bellHeight);
        const steps = 6;
        for (let s = 1; s <= steps; s++) {
          const sy = bellY + bellHeight + (tentacleLen / steps) * s;
          const wave = Math.sin(this.gameTime * 3 + sy * 0.05 + t) * 6;
          ctx.lineTo(tx + wave, sy);
        }

        ctx.strokeStyle = 'rgba(192, 132, 252, 0.55)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  /**
   * Draws floating pearls inside obstacle clearance gaps with shimmering aura.
   */
  private drawPearls(ctx: CanvasRenderingContext2D): void {
    for (const obs of this.obstacles) {
      if (!obs.pearl || obs.pearl.collected) continue;

      const seed = getEntitySeed(obs.id);
      const bobY = Math.sin(this.gameTime * 3.5 + seed) * 4;
      const px = obs.pearl.x;
      const py = obs.pearl.y + bobY;
      const r = obs.pearl.radius;

      if (px < -20 || px > PHYSICS_CONSTANTS.CANVAS_WIDTH + 20) continue;

      ctx.save();

      // Outer shimmering golden aura
      const auraGrad = ctx.createRadialGradient(px, py, r * 0.5, px, py, r * 2.2);
      auraGrad.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
      auraGrad.addColorStop(0.5, 'rgba(254, 240, 138, 0.3)');
      auraGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.beginPath();
      ctx.arc(px, py, r * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = auraGrad;
      ctx.fill();

      // Pearl 3D spherical gradient
      const pearlGrad = ctx.createRadialGradient(
        px - r * 0.35, py - r * 0.35, r * 0.1,
        px, py, r
      );
      pearlGrad.addColorStop(0, '#ffffff');
      pearlGrad.addColorStop(0.4, '#fef9c3');
      pearlGrad.addColorStop(0.85, '#fde047');
      pearlGrad.addColorStop(1, '#cbd5e1');

      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = pearlGrad;
      ctx.shadowColor = '#facc15';
      ctx.shadowBlur = 8;
      ctx.fill();

      // Specular highlight dot
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(px - r * 0.35, py - r * 0.35, r * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      ctx.restore();
    }
  }

  /**
   * Draws the in-water Personal Best floating distance ribbon.
   */
  private drawPersonalBestRibbon(ctx: CanvasRenderingContext2D): void {
    if (
      this.highScore <= 0 ||
      this.ribbonX < -150 ||
      this.ribbonX > PHYSICS_CONSTANTS.CANVAS_WIDTH + 150
    ) {
      return;
    }

    ctx.save();

    // Glowing golden dashed vertical marker
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.75)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 6]);
    ctx.shadowColor = '#facc15';
    ctx.shadowBlur = 8;

    ctx.beginPath();
    ctx.moveTo(this.ribbonX, 0);
    ctx.lineTo(this.ribbonX, PHYSICS_CONSTANTS.CANVAS_HEIGHT);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    // Floating banner badge
    const badgeY = 110;
    const badgeWidth = 110;
    const badgeHeight = 24;
    const badgeX = this.ribbonX - badgeWidth / 2;

    ctx.fillStyle = 'rgba(202, 138, 4, 0.9)';
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.roundRect
      ? ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 6)
      : ctx.rect(badgeX, badgeY, badgeWidth, badgeHeight);
    ctx.fill();
    ctx.stroke();

    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      `★ BEST: ${this.ribbonTargetScore} ★`,
      this.ribbonX,
      badgeY + badgeHeight / 2
    );

    ctx.restore();
  }

  /**
   * Master animation frame loop for browser execution.
   */
  private loop = (timestamp: number): void => {
    if (!this.running) return;

    if (this.lastTime === 0) {
      this.lastTime = timestamp;
    }

    const elapsed = timestamp - this.lastTime;
    this.lastTime = timestamp;

    // Cap delta time to prevent spiraling after tab switching
    const dtSeconds = Math.min(elapsed / 1000, 0.1);
    const dtFrames = dtSeconds * 60;

    this.update(dtFrames);

    if (this.canvasCtx) {
      this.render(this.canvasCtx, this.displayWidth, this.displayHeight, this.dpr);
    }

    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  /**
   * Updates the active skin.
   */
  public setSkin(skin: SkinId): void {
    this.fish.skin = skin;
    setActiveSkin(skin);
  }

  /**
   * Sets audio mute preference.
   */
  public setMuted(muted: boolean): void {
    setAudioMuted(muted);
  }

  /**
   * Returns current game state snapshot.
   */
  public getState(): GameState {
    return {
      status: this.status,
      score: this.score,
      highScore: this.highScore,
      lifetimePearls: getLifetimePearls(),
      combo: this.comboManager.combo,
      hasShield: this.comboManager.hasShield,
      shieldActiveTime: this.comboManager.shieldActiveTime,
      activeSkin: this.fish.skin,
      isMuted: isAudioMuted(),
    };
  }

  /**
   * Cleans up running loops and event listeners.
   */
  public destroy(): void {
    this.running = false;
    if (
      this.animationFrameId !== null &&
      typeof cancelAnimationFrame !== 'undefined'
    ) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
}
