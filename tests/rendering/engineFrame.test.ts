import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GameEngine } from '../../src/game/engine';
import type { SoundEffects } from '../../src/game/audio';
import { createMockContext } from '../helpers/canvas';

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

describe('GameEngine frame safety and renderer hooks', () => {
  let engine: GameEngine;
  let mockSounds: SoundEffects;

  beforeEach(() => {
    localStorage.clear();
    mockSounds = createMockSoundEffects();
    engine = new GameEngine({ soundEffects: mockSounds });
  });

  afterEach(() => {
    engine.destroy();
    vi.unstubAllGlobals();
  });

  it('keeps running and disables FX when afterRender throws', () => {
    engine.afterRender = () => {
      throw new Error('gl boom');
    };

    expect(() => engine.frame(1)).not.toThrow();
    expect(engine.afterRender).toBeUndefined();
    expect(engine.backgroundVisible).toBe(true);
  });

  it('calls afterRender with a snapshot', () => {
    const spy = vi.fn();
    engine.afterRender = spy;

    engine.frame(1);

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ status: 'idle' }));
  });

  it('skips the background fill when backgroundVisible is false', () => {
    const ctx = createMockContext();

    engine.backgroundVisible = false;
    engine.render(ctx);
    expect(ctx.fillRect).not.toHaveBeenCalledWith(0, 0, 360, 640);

    engine.backgroundVisible = true;
    engine.render(ctx);
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 360, 640);
  });

  it('startLoop schedules one rAF and is idempotent without changing status', () => {
    const raf = vi.fn(() => 42);
    vi.stubGlobal('requestAnimationFrame', raf);

    engine.startLoop();
    engine.startLoop();

    expect(raf).toHaveBeenCalledTimes(1);
    expect(engine.status).toBe('idle');
  });

  it('start() reuses startLoop', () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 7));
    const startLoop = vi.spyOn(engine, 'startLoop');

    engine.start();

    expect(startLoop).toHaveBeenCalledTimes(1);
    expect(engine.status).toBe('playing');
  });

  it('destroy cancels the loop started by startLoop', () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 99));
    const cancel = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancel);

    engine.startLoop();
    engine.destroy();

    expect(cancel).toHaveBeenCalledWith(99);
  });
});
