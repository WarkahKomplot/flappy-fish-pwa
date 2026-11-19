import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PostFXBackend } from '../../src/game/rendering/backend';
import { PostFXController } from '../../src/game/rendering/postFx';
import type { SceneSnapshot } from '../../src/game/rendering/types';

interface FakeBackend extends PostFXBackend {
  calls: string[];
}

/**
 * Records the draw-pass order in `calls`. `init` is the only method whose
 * result matters; `resize` and `dispose` are spies that stay out of the pass
 * log so the expected pass sequences stay readable.
 */
function fakeBackend(options: { init: boolean }): FakeBackend {
  const calls: string[] = [];
  const record = (name: string) => () => {
    calls.push(name);
  };

  return {
    calls,
    init: vi.fn(() => options.init),
    resize: vi.fn(),
    beginFrame: vi.fn(record('beginFrame')),
    background: vi.fn(record('background')),
    scene: vi.fn(record('scene')),
    effects: vi.fn(record('effects')),
    bloom: vi.fn(record('bloom')),
    composite: vi.fn(record('composite')),
    endFrame: vi.fn(record('endFrame')),
    dispose: vi.fn(),
  };
}

const snapshot: SceneSnapshot = {
  time: 1.5,
  status: 'playing',
  world: { width: 360, height: 640 },
  fish: {
    x: 90,
    y: 300,
    vx: 0,
    vy: -80,
    radius: 14,
    rotation: -0.2,
    skin: 'neon-tetra',
    isDead: false,
    invulnerableTime: 0,
  },
  obstacles: [
    {
      x: 200,
      width: 52,
      topHeight: 180,
      bottomY: 470,
      pearl: {
        x: 226,
        y: 300,
        visualY: 302,
        radius: 12,
        collected: false,
        missed: false,
      },
    },
  ],
  shield: { active: true, activeTime: 1 },
  ribbon: { x: 120, target: 8, crossed: false },
  events: [],
};

const rect = { x: 0, y: 75.5, width: 390, height: 693 };

describe('PostFXController', () => {
  let canvas: HTMLCanvasElement;
  let scene: HTMLCanvasElement;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    scene = document.createElement('canvas');
  });

  it('reports off when init fails and never renders', () => {
    const backend = fakeBackend({ init: false });
    const onTier = vi.fn();
    const c = new PostFXController(backend, {
      reducedMotion: false,
      onTierChange: onTier,
    });

    expect(c.init(canvas, scene)).toBe(false);
    c.render(snapshot);

    expect(c.tier).toBe('off');
    expect(onTier).toHaveBeenLastCalledWith('off');
    expect(backend.beginFrame).not.toHaveBeenCalled();
    expect(backend.init).toHaveBeenCalledWith(canvas, scene);
  });

  it('runs passes in order at high', () => {
    const backend = fakeBackend({ init: true });
    const c = new PostFXController(backend, { reducedMotion: false });

    c.init(canvas, scene);
    c.setPreference('high', 'high');
    c.resize(390, 844, rect);
    c.render(snapshot);

    expect(backend.calls).toEqual([
      'beginFrame',
      'background',
      'scene',
      'effects',
      'bloom',
      'composite',
      'endFrame',
    ]);
  });

  it('skips effects and bloom at low', () => {
    const backend = fakeBackend({ init: true });
    const c = new PostFXController(backend, { reducedMotion: false });

    c.init(canvas, scene);
    c.setPreference('low', 'high');
    c.render(snapshot);

    expect(backend.calls).toEqual([
      'beginFrame',
      'background',
      'scene',
      'composite',
      'endFrame',
    ]);
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
    expect(backend.dispose).not.toHaveBeenCalled();
  });

  it('resolves auto through the supplied auto tier and notifies', () => {
    const backend = fakeBackend({ init: true });
    const onTier = vi.fn();
    const c = new PostFXController(backend, {
      reducedMotion: false,
      onTierChange: onTier,
    });

    c.init(canvas, scene);
    c.setPreference('auto', 'medium');

    expect(c.tier).toBe('medium');
    expect(c.profile?.tier).toBe('medium');
    expect(onTier).toHaveBeenLastCalledWith('medium');
  });

  it('resizes when a preference change follows a measured stage', () => {
    const backend = fakeBackend({ init: true });
    const c = new PostFXController(backend, { reducedMotion: false });

    c.init(canvas, scene);
    c.setPreference('high', 'high');
    c.resize(390, 844, rect);
    expect(backend.resize).toHaveBeenCalledTimes(1);
    expect(backend.resize).toHaveBeenLastCalledWith(
      390,
      844,
      rect,
      expect.objectContaining({ tier: 'high' })
    );

    c.setPreference('medium', 'high');

    expect(backend.resize).toHaveBeenCalledTimes(2);
    expect(backend.resize).toHaveBeenLastCalledWith(
      390,
      844,
      rect,
      expect.objectContaining({ tier: 'medium' })
    );
  });

  it('honours reduced motion in the resolved profile', () => {
    const backend = fakeBackend({ init: true });
    const c = new PostFXController(backend, { reducedMotion: true });

    c.init(canvas, scene);
    c.setPreference('high', 'high');

    expect(c.profile?.shake).toBe(false);
    expect(c.profile?.chromaticAberration).toBe(false);
    expect(c.profile?.grain).toBe(false);
    expect(c.tier).toBe('high');
  });

  it('disposes the backend and stops rendering', () => {
    const backend = fakeBackend({ init: true });
    const c = new PostFXController(backend, { reducedMotion: false });

    c.init(canvas, scene);
    c.setPreference('high', 'high');
    c.dispose();
    c.render(snapshot);

    expect(backend.dispose).toHaveBeenCalledTimes(1);
    expect(backend.beginFrame).not.toHaveBeenCalled();
    expect(c.tier).toBe('off');
  });
});
