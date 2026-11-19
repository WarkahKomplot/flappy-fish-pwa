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
});
