import { describe, it, expect } from 'vitest';
import { selectQuality, getQualityProfile, nextTier } from '../../src/game/rendering/quality';

describe('quality model', () => {
  it('falls back to off when WebGL2 is unavailable', () => {
    expect(
      selectQuality({
        webgl2: false,
        reducedMotion: false,
        hardwareConcurrency: 8,
        isDesktop: false,
      })
    ).toBe('off');
  });

  it('respects an explicit override', () => {
    expect(
      selectQuality({
        webgl2: true,
        reducedMotion: false,
        hardwareConcurrency: 8,
        isDesktop: true,
        override: 'medium',
      })
    ).toBe('medium');
  });

  it('selects high on desktop and capable mobile, low on weak mobile', () => {
    expect(
      selectQuality({
        webgl2: true,
        reducedMotion: false,
        hardwareConcurrency: 8,
        isDesktop: true,
      })
    ).toBe('high');
    expect(
      selectQuality({
        webgl2: true,
        reducedMotion: false,
        hardwareConcurrency: 8,
        deviceMemory: 8,
        isDesktop: false,
      })
    ).toBe('high');
    expect(
      selectQuality({
        webgl2: true,
        reducedMotion: false,
        hardwareConcurrency: 4,
        deviceMemory: 4,
        isDesktop: false,
      })
    ).toBe('low');
  });

  it('disables motion-sensitive effects without changing tier', () => {
    const p = getQualityProfile('high', true);
    expect(p?.shake).toBe(false);
    expect(p?.chromaticAberration).toBe(false);
    expect(p?.grain).toBe(false);
    expect(getQualityProfile('off', false)).toBeNull();
  });

  it('downgrades on a slow p95 and never auto-upgrades', () => {
    expect(nextTier('high', 16)).toBe('high');
    expect(nextTier('high', 25)).toBe('medium');
    expect(nextTier('medium', 25)).toBe('low');
    expect(nextTier('low', 25)).toBe('off');
    expect(nextTier('off', 10)).toBe('off');
  });
});
