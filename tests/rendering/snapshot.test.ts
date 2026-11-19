import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GameEngine } from '../../src/game/engine';
import { getEntitySeed, resolvePearlY } from '../../src/game/entities/collectibles';
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

describe('resolvePearlY', () => {
  it('uses the shared pearl bob formula', () => {
    expect(resolvePearlY(0, 0, 100)).toBeCloseTo(100);
    expect(resolvePearlY(1, 0, 100)).toBeCloseTo(100 + Math.sin(3.5) * 4);
  });
});

describe('GameEngine scene snapshot and render events', () => {
  let engine: GameEngine;
  let mockSounds: SoundEffects;

  beforeEach(() => {
    localStorage.clear();
    mockSounds = createMockSoundEffects();
    engine = new GameEngine({ soundEffects: mockSounds });
  });

  afterEach(() => {
    engine.destroy();
  });

  it('snapshots resolved pearl positions and copies fish', () => {
    engine.start();
    const obs = engine.obstacles[0];
    obs.pearl = {
      id: 'p',
      x: 120,
      y: 200,
      radius: 12,
      collected: false,
      missed: false,
    };
    engine.gameTime = 2;

    const snap = engine.getSceneSnapshot();

    expect(snap.obstacles[0].pearl?.visualY).toBeCloseTo(
      resolvePearlY(2, getEntitySeed(obs.id), 200)
    );
    expect(snap.obstacles[0].x).toBe(obs.x);
    expect(snap.obstacles[0].width).toBe(obs.width);
    expect(snap.obstacles[0].topHeight).toBe(obs.topHeight);
    expect(snap.obstacles[0].bottomY).toBe(obs.bottomY);
    expect(snap.obstacles[0].pearl?.collected).toBe(false);
    expect(snap.obstacles[0].pearl?.missed).toBe(false);
    expect(snap.fish).not.toBe(engine.fish);
    expect(snap.fish).toEqual(engine.fish);
    expect(snap.time).toBe(2);
    expect(snap.status).toBe('playing');
    expect(snap.world).toEqual({
      width: PHYSICS_CONSTANTS.CANVAS_WIDTH,
      height: PHYSICS_CONSTANTS.CANVAS_HEIGHT,
    });
  });

  it('does not expose live engine state through the snapshot', () => {
    engine.start();
    const obs = engine.obstacles[0];
    obs.pearl = {
      id: 'p',
      x: 120,
      y: 200,
      radius: 12,
      collected: false,
      missed: false,
    };

    const snap = engine.getSceneSnapshot();
    const originalObstacleX = obs.x;
    const originalTopHeight = obs.topHeight;
    snap.fish.x = 999;
    snap.obstacles[0].x = 999;
    snap.obstacles[0].topHeight = 999;
    snap.obstacles[0].pearl!.y = 999;

    expect(engine.fish.x).toBe(80);
    expect(engine.obstacles[0].x).toBe(originalObstacleX);
    expect(engine.obstacles[0].topHeight).toBe(originalTopHeight);
    expect(engine.obstacles[0].pearl?.y).toBe(200);
  });

  it('emits a pearl event when collected', () => {
    engine.start();
    const obs = engine.obstacles[0];
    obs.pearl = {
      id: 'p',
      x: engine.fish.x,
      y: engine.fish.y,
      radius: 12,
      collected: false,
      missed: false,
    };

    engine.update(1);

    const events = engine.getSceneSnapshot().events;
    const pearlEvent = events.find((event) => event.type === 'pearl');
    expect(pearlEvent).toBeDefined();
    expect(pearlEvent?.t).toBeCloseTo(engine.gameTime);
    expect(pearlEvent?.x).toBe(obs.pearl.x);
    expect(pearlEvent?.y).toBe(
      resolvePearlY(engine.gameTime, getEntitySeed(obs.id), obs.pearl.y)
    );
  });

  it('prunes events older than one second', () => {
    engine.events.push({ type: 'hit', x: 0, y: 0, t: 0 });
    engine.gameTime = 2;

    expect(engine.getSceneSnapshot().events).toHaveLength(0);
    expect(engine.events).toHaveLength(0);
  });

  it('keeps events at the one-second boundary and drops older ones', () => {
    engine.gameTime = 5;
    engine.events = [
      { type: 'hit', x: 0, y: 0, t: 5 },
      { type: 'best', x: 0, y: 0, t: 4 },
      { type: 'pearl', x: 0, y: 0, t: 3.999 },
    ];

    const snap = engine.getSceneSnapshot();

    expect(snap.events.map((event) => event.type)).toEqual(['hit', 'best']);
    expect(engine.events.map((event) => event.type)).toEqual(['hit', 'best']);
  });

  it('returns a non-aliased events array', () => {
    engine.events.push({ type: 'hit', x: 0, y: 0, t: 0 });
    engine.gameTime = 0.5;

    const snap = engine.getSceneSnapshot();
    snap.events.push({ type: 'best', x: 1, y: 1, t: 0.5 });

    expect(snap.events).not.toBe(engine.events);
    expect(engine.events).toHaveLength(1);
  });

  it('emits shield-activate when the third pearl deploys the shield', () => {
    engine.start();
    engine.comboManager.combo = 2;
    const obs = engine.obstacles[0];
    obs.pearl = {
      id: 'p',
      x: engine.fish.x,
      y: engine.fish.y,
      radius: 12,
      collected: false,
      missed: false,
    };

    engine.update(1);

    expect(engine.comboManager.hasShield).toBe(true);
    const events = engine.getSceneSnapshot().events;
    const activateEvent = events.find((event) => event.type === 'shield-activate');
    expect(activateEvent).toBeDefined();
    expect(activateEvent?.x).toBeCloseTo(engine.fish.x);
    expect(activateEvent?.y).toBeCloseTo(engine.fish.y);
  });

  it('emits shield-pop when a shield absorbs a floor impact', () => {
    engine.start();
    engine.comboManager.hasShield = true;
    engine.fish.y = PHYSICS_CONSTANTS.CANVAS_HEIGHT + 10;

    engine.update(1);

    expect(engine.comboManager.hasShield).toBe(false);
    const events = engine.getSceneSnapshot().events;
    const popEvent = events.find((event) => event.type === 'shield-pop');
    expect(popEvent).toBeDefined();
    expect(popEvent?.x).toBeCloseTo(engine.fish.x);
    expect(popEvent?.y).toBeCloseTo(engine.fish.y);
  });

  it('emits shield-pop when a shield absorbs an obstacle hit', () => {
    engine.start();
    engine.comboManager.hasShield = true;
    const obs = engine.obstacles[0];
    obs.x = engine.fish.x - 10;
    obs.topHeight = engine.fish.y + 20;

    engine.update(1);

    expect(engine.comboManager.hasShield).toBe(false);
    expect(
      engine.getSceneSnapshot().events.some((event) => event.type === 'shield-pop')
    ).toBe(true);
  });

  it('emits a hit event on game over', () => {
    engine.start();
    const obs = engine.obstacles[0];
    obs.x = engine.fish.x - 10;
    obs.topHeight = engine.fish.y + 20;

    engine.update(1);

    expect(engine.status).toBe('gameover');
    const hitEvent = engine
      .getSceneSnapshot()
      .events.find((event) => event.type === 'hit');
    expect(hitEvent).toBeDefined();
    expect(hitEvent?.x).toBeCloseTo(engine.fish.x);
    expect(hitEvent?.y).toBeCloseTo(engine.fish.y);
  });

  it('emits a best event when crossing the personal-best ribbon', () => {
    engine.start();
    engine.highScore = 3;
    engine.ribbonTargetScore = 3;
    engine.ribbonCrossed = false;
    engine.ribbonX = engine.fish.x;

    engine.update(1);

    expect(engine.ribbonCrossed).toBe(true);
    const bestEvent = engine
      .getSceneSnapshot()
      .events.find((event) => event.type === 'best');
    expect(bestEvent).toBeDefined();
    expect(bestEvent?.x).toBeCloseTo(engine.fish.x);
    expect(bestEvent?.y).toBeCloseTo(engine.fish.y);
  });

  it('snapshots shield and ribbon state', () => {
    engine.start();
    engine.comboManager.hasShield = true;
    engine.comboManager.shieldActiveTime = 1.25;
    engine.ribbonX = 123;
    engine.ribbonTargetScore = 7;
    engine.ribbonCrossed = true;

    const snap = engine.getSceneSnapshot();

    expect(snap.shield).toEqual({ active: true, activeTime: 1.25 });
    expect(snap.ribbon).toEqual({ x: 123, target: 7, crossed: true });
  });
});
