import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GameEngine } from '../src/game/engine';
import { PHYSICS_CONSTANTS } from '../src/game/constants';
import { ParticleSystem } from '../src/game/entities/particles';
import {
  renderFish,
  drawNeonTetra,
  drawClownfish,
  drawGoldenManta,
  drawBubbleShield,
} from '../src/game/entities/fish';
import type { SoundEffects } from '../src/game/audio';
import type { FishEntity } from '../src/game/types';
import * as storage from '../src/game/storage';

function createMockSoundEffects(): SoundEffects {
  return {
    playSwimFlap: vi.fn(),
    playPearlChime: vi.fn(),
    playShieldActivate: vi.fn(),
    playShieldPop: vi.fn(),
    playHit: vi.fn(),
    playPersonalBest: vi.fn(),
    resumeContext: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockContext(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    quadraticCurveTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    rect: vi.fn(),
    roundRect: vi.fn(),
    fillText: vi.fn(),
    createLinearGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    createRadialGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    setLineDash: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    shadowColor: '',
    shadowBlur: 0,
    font: '',
    textAlign: 'left',
    textBaseline: 'top',
  } as unknown as CanvasRenderingContext2D;
}

describe('GameEngine 60fps Canvas Orchestrator', () => {
  let engine: GameEngine;
  let mockSounds: SoundEffects;
  let scoreCallback: ReturnType<typeof vi.fn>;
  let comboCallback: ReturnType<typeof vi.fn>;
  let gameOverCallback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    mockSounds = createMockSoundEffects();
    scoreCallback = vi.fn();
    comboCallback = vi.fn();
    gameOverCallback = vi.fn();

    engine = new GameEngine({
      soundEffects: mockSounds,
      onScoreChange: scoreCallback,
      onComboChange: comboCallback,
      onGameOver: gameOverCallback,
    });
  });

  afterEach(() => {
    engine.destroy();
  });

  describe('Initialization & Initial State', () => {
    it('initializes in idle state with score 0 and no shield', () => {
      expect(engine.status).toBe('idle');
      expect(engine.score).toBe(0);
      expect(engine.runPearls).toBe(0);
      expect(engine.comboManager.combo).toBe(0);
      expect(engine.comboManager.hasShield).toBe(false);
      expect(engine.fish.isDead).toBe(false);
      expect(engine.fish.invulnerableTime).toBe(0);
      expect(engine.fish.x).toBe(80);
      expect(engine.fish.y).toBe(300);
      expect(engine.fish.skin).toBe('neon-tetra');
    });

    it('pre-seeds initial obstacle pairs ahead of the fish', () => {
      expect(engine.obstacles.length).toBeGreaterThanOrEqual(3);
      for (const obs of engine.obstacles) {
        expect(obs.x).toBeGreaterThan(engine.fish.x);
        expect(obs.gapSize).toBe(PHYSICS_CONSTANTS.OBSTACLE_GAP);
      }
    });

    it('populates ambient particles in particle system', () => {
      expect(engine.particles.activeCount).toBeGreaterThan(0);
    });

    it('returns a complete snapshot from getState()', () => {
      const state = engine.getState();
      expect(state).toEqual({
        status: 'idle',
        score: 0,
        highScore: 0,
        lifetimePearls: 0,
        combo: 0,
        hasShield: false,
        shieldActiveTime: 0,
        activeSkin: 'neon-tetra',
        isMuted: false,
      });
    });
  });

  describe('State Machine & Input Handling', () => {
    it('transitions from idle to playing on start()', () => {
      engine.start();
      expect(engine.status).toBe('playing');
      expect(engine.fish.vy).toBe(PHYSICS_CONSTANTS.SWIM_IMPULSE);
      expect(mockSounds.playSwimFlap).toHaveBeenCalledTimes(1);
      expect(mockSounds.resumeContext).toHaveBeenCalledTimes(1);
    });

    it('transitions from idle to playing on handleInput()', () => {
      engine.handleInput();
      expect(engine.status).toBe('playing');
      expect(engine.fish.vy).toBe(PHYSICS_CONSTANTS.SWIM_IMPULSE);
      expect(mockSounds.playSwimFlap).toHaveBeenCalledTimes(1);
    });

    it('applies swim impulse on handleInput() while playing', () => {
      engine.start();
      engine.fish.vy = 2.0; // sinking downward
      engine.handleInput();

      expect(engine.fish.vy).toBe(PHYSICS_CONSTANTS.SWIM_IMPULSE);
      expect(mockSounds.playSwimFlap).toHaveBeenCalledTimes(2);
    });

    it('pauses and resumes game via pause(), resume(), togglePause()', () => {
      engine.start();
      expect(engine.status).toBe('playing');

      engine.pause();
      expect(engine.status).toBe('paused');

      engine.resume();
      expect(engine.status).toBe('playing');

      engine.togglePause();
      expect(engine.status).toBe('paused');

      engine.togglePause();
      expect(engine.status).toBe('playing');
    });

    it('does not advance fish physics or obstacles while idle or paused', () => {
      const initialObsX = engine.obstacles[0].x;

      engine.update(1); // idle update
      expect(engine.fish.x).toBe(80);
      expect(engine.obstacles[0].x).toBe(initialObsX);

      engine.start();
      engine.pause();
      const pausedObsX = engine.obstacles[0].x;

      engine.update(1); // paused update
      expect(engine.obstacles[0].x).toBe(pausedObsX);
    });

    it('advances fish physics and obstacle scrolling while playing', () => {
      engine.start();
      const initialObsX = engine.obstacles[0].x;
      const initialVy = engine.fish.vy;

      engine.update(1);
      expect(engine.obstacles[0].x).toBeLessThan(initialObsX);
      expect(engine.fish.vy).not.toBe(initialVy);
    });
  });

  describe('Scoring & Obstacle Clearance', () => {
    it('increments score and invokes onScoreChange when fish clears an obstacle', () => {
      engine.start();
      const firstObs = engine.obstacles[0];

      // Position fish just ahead of obstacle
      firstObs.x = engine.fish.x - firstObs.width - 5;
      firstObs.passed = false;

      engine.update(1);

      expect(firstObs.passed).toBe(true);
      expect(engine.score).toBe(1);
      expect(scoreCallback).toHaveBeenCalledWith(1);
    });

    it('does not increment score multiple times for the same obstacle', () => {
      engine.start();
      const firstObs = engine.obstacles[0];
      firstObs.x = engine.fish.x - firstObs.width - 5;

      engine.update(1);
      expect(engine.score).toBe(1);

      engine.update(1);
      expect(engine.score).toBe(1);
      expect(scoreCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('3-Pearl Combo & Bubble Shield Mechanics', () => {
    it('collects pearl in clearance gap, increments pearls, advances combo, and plays chime', () => {
      engine.start();
      const obs = engine.obstacles[0];

      // Spawn pearl and place it directly on fish coordinates
      obs.pearl = {
        id: 'test-pearl-1',
        x: engine.fish.x,
        y: engine.fish.y,
        radius: PHYSICS_CONSTANTS.PEARL_RADIUS,
        collected: false,
        missed: false,
      };

      engine.update(1);

      expect(obs.pearl.collected).toBe(true);
      expect(engine.runPearls).toBe(1);
      expect(engine.comboManager.combo).toBe(1);
      expect(comboCallback).toHaveBeenCalledWith(1, false);
      expect(mockSounds.playPearlChime).toHaveBeenCalledWith(0);
    });

    it('activates Bubble Shield upon collecting 3 consecutive pearls', () => {
      engine.start();

      // Collect 1st pearl
      engine.comboManager.onPearlCollected();
      expect(engine.comboManager.combo).toBe(1);

      // Collect 2nd pearl
      engine.comboManager.onPearlCollected();
      expect(engine.comboManager.combo).toBe(2);

      // Collect 3rd pearl in game update
      const obs = engine.obstacles[0];
      obs.pearl = {
        id: 'test-pearl-3',
        x: engine.fish.x,
        y: engine.fish.y,
        radius: PHYSICS_CONSTANTS.PEARL_RADIUS,
        collected: false,
        missed: false,
      };

      engine.update(1);

      expect(engine.comboManager.hasShield).toBe(true);
      expect(engine.comboManager.combo).toBe(0);
      expect(comboCallback).toHaveBeenCalledWith(0, true);
      expect(mockSounds.playShieldActivate).toHaveBeenCalledTimes(1);
    });

    it('resets combo to 0 when an active pearl is bypassed (Review Focus 4)', () => {
      engine.start();
      engine.comboManager.combo = 2;

      const obs = engine.obstacles[0];
      // Pearl is placed behind the fish (missed)
      obs.pearl = {
        id: 'missed-pearl',
        x: engine.fish.x - 50,
        y: engine.fish.y,
        radius: PHYSICS_CONSTANTS.PEARL_RADIUS,
        collected: false,
        missed: false,
      };

      engine.update(1);

      expect(obs.pearl.missed).toBe(true);
      expect(engine.comboManager.combo).toBe(0);
      expect(comboCallback).toHaveBeenCalledWith(0, false);
    });

    it('preserves combo streak across neutral gaps where no pearl spawned (Review Focus 4)', () => {
      engine.start();
      engine.comboManager.combo = 2;

      // Obstacle without pearl
      const obs = engine.obstacles[0];
      obs.pearl = null;
      obs.x = engine.fish.x - obs.width - 10;

      engine.update(1);

      expect(engine.comboManager.combo).toBe(2);
    });
  });

  describe('Damage Absorption, Grace Period & Game Over', () => {
    it('absorbs obstacle collision when Bubble Shield is active and grants invulnerability', () => {
      engine.start();
      engine.comboManager.hasShield = true;

      // Align obstacle to collide with fish
      const obs = engine.obstacles[0];
      obs.x = engine.fish.x - 10;
      obs.topHeight = engine.fish.y + 20; // top kelp collides with fish

      engine.update(1);

      expect(engine.comboManager.hasShield).toBe(false);
      expect(engine.fish.invulnerableTime).toBe(PHYSICS_CONSTANTS.INVULNERABILITY_DURATION);
      expect(mockSounds.playShieldPop).toHaveBeenCalledTimes(1);
      expect(comboCallback).toHaveBeenCalledWith(0, false);
      expect(engine.status).toBe('playing');
      expect(engine.fish.isDead).toBe(false);
    });

    it('ignores collisions during invulnerability grace period', () => {
      engine.start();
      engine.fish.invulnerableTime = 1.0;

      const obs = engine.obstacles[0];
      obs.x = engine.fish.x - 10;
      obs.topHeight = engine.fish.y + 20;

      engine.update(1);

      expect(engine.status).toBe('playing');
      expect(engine.fish.isDead).toBe(false);
      expect(gameOverCallback).not.toHaveBeenCalled();
    });

    it('triggers Game Over on unshielded collision with obstacle', () => {
      engine.start();
      engine.score = 5;
      engine.runPearls = 3;

      const obs = engine.obstacles[0];
      obs.x = engine.fish.x - 10;
      obs.topHeight = engine.fish.y + 20;

      engine.update(1);

      expect(engine.status).toBe('gameover');
      expect(engine.fish.isDead).toBe(true);
      expect(mockSounds.playHit).toHaveBeenCalledTimes(1);
      expect(gameOverCallback).toHaveBeenCalledWith(5, 5, 3);
      expect(storage.getHighScore()).toBe(5);
      expect(storage.getLifetimePearls()).toBe(3);
    });

    it('triggers Game Over on unshielded collision with seabed floor', () => {
      engine.start();
      engine.fish.y = PHYSICS_CONSTANTS.CANVAS_HEIGHT + 10; // past floor

      engine.update(1);

      expect(engine.status).toBe('gameover');
      expect(engine.fish.isDead).toBe(true);
      expect(mockSounds.playHit).toHaveBeenCalledTimes(1);
      expect(gameOverCallback).toHaveBeenCalled();
    });

    it('clamps fish position to top boundary on ceiling contact without game over', () => {
      engine.start();
      engine.fish.y = -20;
      engine.fish.vy = -5.0;

      engine.update(1);

      expect(engine.status).toBe('playing');
      expect(engine.fish.y).toBeCloseTo(
        PHYSICS_CONSTANTS.FISH_RADIUS * PHYSICS_CONSTANTS.HITBOX_SCALE,
        1
      );
      expect(engine.fish.vy).toBe(0);
    });

    it('allows instant retry on handleInput() after Game Over (<0.2s transition)', () => {
      engine.start();
      engine.status = 'gameover';
      engine.fish.isDead = true;

      engine.handleInput();

      expect(engine.status).toBe('playing');
      expect(engine.score).toBe(0);
      expect(engine.fish.isDead).toBe(false);
      expect(engine.fish.vy).toBe(PHYSICS_CONSTANTS.SWIM_IMPULSE);
      expect(mockSounds.playSwimFlap).toHaveBeenCalled();
    });
  });

  describe('Personal Best Distance Ribbon', () => {
    it('places Personal Best ribbon when a high score exists', () => {
      storage.saveHighScore(8);
      const newEngine = new GameEngine({ soundEffects: mockSounds });

      expect(newEngine.highScore).toBe(8);
      expect(newEngine.ribbonTargetScore).toBe(8);
      expect(newEngine.ribbonCrossed).toBe(false);
      expect(newEngine.ribbonX).toBeGreaterThan(0);

      newEngine.destroy();
    });

    it('plays fanfare and emits confetti when crossing Personal Best ribbon', () => {
      storage.saveHighScore(3);
      const pbEngine = new GameEngine({ soundEffects: mockSounds });
      pbEngine.start();

      // Move ribbon right onto fish coordinates
      pbEngine.ribbonX = pbEngine.fish.x;

      pbEngine.update(1);

      expect(pbEngine.ribbonCrossed).toBe(true);
      expect(mockSounds.playPersonalBest).toHaveBeenCalledTimes(1);

      // Subsequent frames do not re-trigger fanfare
      pbEngine.update(1);
      expect(mockSounds.playPersonalBest).toHaveBeenCalledTimes(1);

      pbEngine.destroy();
    });
  });

  describe('Retina / High-DPI Canvas DPR Scaling (Review Focus 3)', () => {
    it('scales canvas context cleanly by (dpr, dpr) for standard logical 360x640', () => {
      const mockCtx = createMockContext();

      // Simulate DPR = 2 (Retina mobile screen)
      engine.render(mockCtx, 360, 640, 2);

      expect(mockCtx.save).toHaveBeenCalled();
      expect(mockCtx.clearRect).toHaveBeenCalledWith(0, 0, 720, 1280);
      expect(mockCtx.scale).toHaveBeenCalledWith(2, 2);
      expect(mockCtx.restore).toHaveBeenCalled();
    });

    it('scales context correctly for DPR = 1 (Standard desktop screen)', () => {
      const mockCtx = createMockContext();

      engine.render(mockCtx, 360, 640, 1);

      expect(mockCtx.scale).toHaveBeenCalledWith(1, 1);
      expect(mockCtx.clearRect).toHaveBeenCalledWith(0, 0, 360, 640);
    });

    it('scales proportionally when rendering to custom dimensions with DPR = 2', () => {
      const mockCtx = createMockContext();

      // Display width 720, height 1280, DPR 2
      engine.render(mockCtx, 720, 1280, 2);

      // (720 / 360) * 2 = 4, (1280 / 640) * 2 = 4
      expect(mockCtx.scale).toHaveBeenCalledWith(4, 4);
    });
  });

  describe('Skins and Mute Settings', () => {
    it('switches fish skin via setSkin()', () => {
      engine.setSkin('clownfish');
      expect(engine.fish.skin).toBe('clownfish');
      expect(storage.getActiveSkin()).toBe('clownfish');

      engine.setSkin('golden-manta');
      expect(engine.fish.skin).toBe('golden-manta');
      expect(storage.getActiveSkin()).toBe('golden-manta');
    });

    it('sets audio muted state via setMuted()', () => {
      engine.setMuted(true);
      expect(storage.isAudioMuted()).toBe(true);

      engine.setMuted(false);
      expect(storage.isAudioMuted()).toBe(false);
    });
  });
});

describe('ParticleSystem Pool and Effects', () => {
  let particles: ParticleSystem;

  beforeEach(() => {
    particles = new ParticleSystem(100);
  });

  it('pre-allocates particle array up to capacity', () => {
    expect(particles.particles.length).toBe(100);
    expect(particles.activeCount).toBe(0);
  });

  it('initializes persistent ambient particles', () => {
    particles.initAmbient(360, 640, 20);
    expect(particles.activeCount).toBe(20);

    const ambient = particles.particles.filter((p) => p.active && p.type === 'ambient');
    expect(ambient.length).toBe(20);
  });

  it('emits swim bubbles with upward buoyancy and water drag', () => {
    particles.emitSwimBubbles(80, 300, 5);
    const bubbles = particles.particles.filter((p) => p.active && p.type === 'bubble');
    expect(bubbles.length).toBe(5);
    expect(bubbles[0].buoyancy).toBeLessThan(0); // buoyant
    expect(bubbles[0].drag).toBeLessThan(1); // damped
  });

  it('emits sparkling burst on pearl collection', () => {
    particles.emitPearlCollect(120, 200, 10);
    const sparks = particles.particles.filter((p) => p.active && p.type === 'spark');
    expect(sparks.length).toBe(10);
  });

  it('emits buoyant bubble burst on shield pop', () => {
    particles.emitShieldPop(80, 300, 15);
    const shieldBubbles = particles.particles.filter((p) => p.active && p.type === 'bubble');
    expect(shieldBubbles.length).toBe(15);
  });

  it('emits multi-colored confetti upon crossing Personal Best ribbon', () => {
    particles.emitConfetti(80, 300, 30);
    const confetti = particles.particles.filter((p) => p.active && p.type === 'confetti');
    expect(confetti.length).toBe(30);
    expect(confetti[0].wobbleSpeed).toBeGreaterThan(0);
  });

  it('updates particle life, positions, and expires timed particles', () => {
    particles.emitSwimBubbles(80, 300, 4);
    expect(particles.activeCount).toBe(4);

    // Fast-forward 2 seconds (120 frames at 60fps) -> timed bubbles should expire
    particles.update(120);
    expect(particles.activeCount).toBe(0);
  });

  it('wraps ambient particles horizontally when drifting off screen', () => {
    particles.initAmbient(360, 640, 1);
    const p = particles.particles.find((item) => item.active && item.type === 'ambient')!;
    p.x = -15; // moved off-screen to the left

    particles.update(1, 360, 640);
    expect(p.x).toBeGreaterThan(0);
  });

  it('renders active particles to canvas context', () => {
    particles.initAmbient(360, 640, 5);
    particles.emitConfetti(100, 100, 5);

    const mockCtx = createMockContext();
    particles.render(mockCtx);

    expect(mockCtx.save).toHaveBeenCalled();
    expect(mockCtx.restore).toHaveBeenCalled();
  });

  it('resets particles while optionally preserving ambient motes', () => {
    particles.initAmbient(360, 640, 10);
    particles.emitSwimBubbles(80, 300, 5);
    expect(particles.activeCount).toBe(15);

    // Reset with keepAmbient = true
    particles.reset(true);
    expect(particles.activeCount).toBe(10);

    // Total reset
    particles.reset(false);
    expect(particles.activeCount).toBe(0);
  });
});

describe('Fish Vector Renderers & Skins', () => {
  let mockCtx: CanvasRenderingContext2D;
  let testFish: FishEntity;

  beforeEach(() => {
    mockCtx = createMockContext();
    testFish = {
      x: 100,
      y: 200,
      vx: 0,
      vy: 0,
      radius: 16,
      rotation: 0.1,
      skin: 'neon-tetra',
      isDead: false,
      invulnerableTime: 0,
    };
  });

  it('renders neon-tetra skin correctly', () => {
    drawNeonTetra(mockCtx, 16, 0.5);
    expect(mockCtx.save).toHaveBeenCalled();
    expect(mockCtx.createLinearGradient).toHaveBeenCalled();
    expect(mockCtx.arc).toHaveBeenCalled();
    expect(mockCtx.restore).toHaveBeenCalled();
  });

  it('renders clownfish skin with 3 stripes', () => {
    drawClownfish(mockCtx, 16, 0.5);
    expect(mockCtx.save).toHaveBeenCalled();
    expect(mockCtx.createLinearGradient).toHaveBeenCalled();
    expect(mockCtx.restore).toHaveBeenCalled();
  });

  it('renders golden-manta ray with undulating wings', () => {
    drawGoldenManta(mockCtx, 16, 0.5);
    expect(mockCtx.save).toHaveBeenCalled();
    expect(mockCtx.createRadialGradient).toHaveBeenCalled();
    expect(mockCtx.restore).toHaveBeenCalled();
  });

  it('renders Forcefield Bubble Shield with orbital motes', () => {
    drawBubbleShield(mockCtx, 16, 0.5);
    expect(mockCtx.save).toHaveBeenCalled();
    expect(mockCtx.createRadialGradient).toHaveBeenCalled();
    // 1 base circle + 1 specular glint + 3 orbital motes
    expect(mockCtx.arc).toHaveBeenCalled();
    expect(mockCtx.restore).toHaveBeenCalled();
  });

  it('dispatches renderFish across all 3 skins without throwing', () => {
    const skins: ('neon-tetra' | 'clownfish' | 'golden-manta')[] = [
      'neon-tetra',
      'clownfish',
      'golden-manta',
    ];

    for (const skin of skins) {
      testFish.skin = skin;
      renderFish(mockCtx, testFish, false, 0);
      expect(mockCtx.translate).toHaveBeenCalledWith(testFish.x, testFish.y);
      expect(mockCtx.rotate).toHaveBeenCalledWith(testFish.rotation);
    }
  });

  it('toggles globalAlpha at 10Hz during invulnerability grace period', () => {
    testFish.invulnerableTime = 1.0;
    renderFish(mockCtx, testFish, false, 0);

    // At 1.0s, Math.floor(1.0 * 20) % 2 === 0 -> blink cycle true -> alpha reduced
    expect(mockCtx.globalAlpha).toBe(0.35);

    testFish.invulnerableTime = 0.95;
    renderFish(mockCtx, testFish, false, 0);
    // At 0.95s, Math.floor(0.95 * 20) = 19 % 2 !== 0 -> blink cycle false -> alpha normal
    expect(mockCtx.globalAlpha).toBe(0.9);
  });

  it('renders Bubble Shield centered on fish when hasShield is true', () => {
    renderFish(mockCtx, testFish, true, 0);
    expect(mockCtx.createRadialGradient).toHaveBeenCalled();
  });
});

