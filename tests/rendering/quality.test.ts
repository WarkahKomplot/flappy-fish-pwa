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

  it('disables motion-sensitive effects on every GL tier without changing tier', () => {
    for (const tier of ['high', 'medium', 'low'] as const) {
      const profile = getQualityProfile(tier, true);
      expect(profile?.tier).toBe(tier);
      expect(profile?.shake).toBe(false);
      expect(profile?.chromaticAberration).toBe(false);
      expect(profile?.grain).toBe(false);
    }

    // Reduced motion removes effects, not the playable tier or its budget.
    expect(getQualityProfile('low', true)?.captureDpr).toBe(0.75);
    expect(getQualityProfile('low', true)?.particleCount).toBe(40);
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
