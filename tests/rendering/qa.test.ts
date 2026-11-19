import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseQaFlags } from '../../src/game/rendering/qa';
import { FrameStats } from '../../src/game/rendering/frameStats';
import { applyVisualFixture } from '../../src/game/rendering/visualFixture';
import { GameEngine } from '../../src/game/engine';
import { PHYSICS_CONSTANTS } from '../../src/game/constants';
import type { SoundEffects } from '../../src/game/audio';

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

describe('parseQaFlags', () => {
  it('parses the supported QA flags and their values', () => {
    expect(
      parseQaFlags('?debug=1&benchmark=1&freeze=1&seed=42&t=3.5')
    ).toEqual({
      debug: true,
      benchmark: true,
      freeze: true,
      seed: 42,
      time: 3.5,
    });
  });

  it('treats an absent query as all-off with no fixture values', () => {
    expect(parseQaFlags('')).toEqual({
      debug: false,
      benchmark: false,
      freeze: false,
    });
  });

  it('accepts bare flags and the explicit time alias', () => {
    expect(parseQaFlags('?debug&freeze&seed=0&time=0')).toEqual({
      debug: true,
      benchmark: false,
      freeze: true,
      seed: 0,
      time: 0,
    });
  });

  it('does not enable a flag set to 0', () => {
    expect(parseQaFlags('?debug=0&benchmark=0&freeze=0')).toMatchObject({
      debug: false,
      benchmark: false,
      freeze: false,
    });
  });

  it('ignores non-finite fixture values', () => {
    expect(parseQaFlags('?seed=nope&t=Infinity')).toEqual({
      debug: false,
      benchmark: false,
      freeze: false,
    });
  });
});

describe('FrameStats', () => {
  it('computes percentiles for adaptive quality', () => {
    const stats = new FrameStats(100);
    for (const ms of [10, 12, 14, 16, 18, 20, 100]) {
      stats.push(ms);
    }

    expect(stats.percentile(0.95)).toBeGreaterThan(18);
    expect(stats.percentile(0.5)).toBe(16);
    expect(stats.size).toBe(7);
  });

  it('keeps only the newest samples when the ring buffer wraps', () => {
    const stats = new FrameStats(3);
    for (const ms of [100, 1, 2, 3]) {
      stats.push(ms);
    }

    expect(stats.size).toBe(3);
    expect(stats.percentile(0.5)).toBe(2);
    expect(stats.percentile(0.95)).toBe(3);
  });

  it('returns 0 for an empty buffer and ignores non-finite samples', () => {
    const stats = new FrameStats(4);
    expect(stats.percentile(0.95)).toBe(0);

    stats.push(Number.NaN);
    stats.push(Number.POSITIVE_INFINITY);
    expect(stats.size).toBe(0);
    expect(stats.percentile(0.5)).toBe(0);
  });
});

describe('applyVisualFixture', () => {
  let engine: GameEngine;
  let mockSounds: SoundEffects;

  beforeEach(() => {
    localStorage.clear();
    mockSounds = createMockSoundEffects();
    engine = new GameEngine({ soundEffects: mockSounds });
  });

  afterEach(() => {
    engine.destroy();
    vi.restoreAllMocks();
  });

  it('applies a deterministic paused frame without RNG or physics', () => {
    // Move the live state away from the fixture values first: if the fixture
    // ran a physics tick, these values would drift instead of being replaced.
    engine.gameTime = 100;
    engine.fish.x = 200;
    engine.fish.y = 500;
    engine.obstacles[0].x = 999;
    const randomSpy = vi.spyOn(Math, 'random');

    applyVisualFixture(engine, 2, 7);
    const a = engine.getSceneSnapshot();
    applyVisualFixture(engine, 2, 7);
    const b = engine.getSceneSnapshot();

    expect(randomSpy).not.toHaveBeenCalled();
    expect(engine.gameTime).toBe(2);
    expect(engine.status).toBe('paused');
    expect(engine.fish.x).toBe(80);
    expect(engine.fish.y).toBe(300);
    expect(engine.obstacles.map((obs) => obs.x)).toEqual([180, 380, 580]);
    expect(a.obstacles).toHaveLength(3);
    expect(a.obstacles.map((o) => o.x)).toEqual(b.obstacles.map((o) => o.x));
    expect(a.obstacles.map((o) => o.topHeight)).toEqual(
      b.obstacles.map((o) => o.topHeight)
    );
    // No update tick ran: the fixture frame is exactly time 2 next time too.
    expect(engine.getSceneSnapshot().time).toBe(2);
  });

  it('places a fixed pearl at every gap centre and a fixed ribbon', () => {
    applyVisualFixture(engine, 1.5, 3);
    const snapshot = engine.getSceneSnapshot();

    for (const obstacle of snapshot.obstacles) {
      expect(obstacle.pearl).toBeDefined();
      expect(obstacle.pearl?.x).toBeCloseTo(
        obstacle.x + PHYSICS_CONSTANTS.OBSTACLE_WIDTH / 2
      );
      expect(obstacle.pearl?.y).toBeCloseTo(
        obstacle.topHeight + PHYSICS_CONSTANTS.OBSTACLE_GAP / 2
      );
      expect(obstacle.pearl?.collected).toBe(false);
      expect(obstacle.pearl?.missed).toBe(false);
    }

    expect(snapshot.ribbon.target).toBeGreaterThan(0);
    expect(snapshot.ribbon.x).toBeGreaterThan(0);
    expect(snapshot.ribbon.x).toBeLessThan(PHYSICS_CONSTANTS.CANVAS_WIDTH);
    expect(snapshot.events).toHaveLength(0);
  });

  it('clears ambient particles so freeze frames are pixel-reproducible', () => {
    expect(engine.particles.activeCount).toBeGreaterThan(0);
    applyVisualFixture(engine, 0, 1);
    expect(engine.particles.activeCount).toBe(0);
  });

  it('keeps top heights inside the playable band for any seed', () => {
    for (const seed of [-99, -1, 0, 1, 7, 1234]) {
      applyVisualFixture(engine, 0, seed);
      for (const obs of engine.obstacles) {
        expect(obs.topHeight).toBeGreaterThanOrEqual(60);
        expect(obs.topHeight + obs.gapSize).toBeLessThanOrEqual(
          PHYSICS_CONSTANTS.CANVAS_HEIGHT - 60
        );
      }
    }
  });
});
