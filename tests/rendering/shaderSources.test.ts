import { describe, it, expect } from 'vitest';
import downsampleSrc from '../../src/game/rendering/shaders/downsample.frag?raw';
import blurSrc from '../../src/game/rendering/shaders/blur.frag?raw';
import backgroundSrc from '../../src/game/rendering/shaders/background.frag?raw';
import sceneSrc from '../../src/game/rendering/shaders/scene.frag?raw';

/**
 * Source-level contracts for the bloom resampling and the 8-bit write dither.
 * The GPU math itself is exercised visually via the ?freeze fixture; these
 * pins stop the anti-aliasing / anti-banding structure from being silently
 * regressed into point samples or raw quantized writes.
 */
describe('bloom and banding shader contracts', () => {
  it('downsample.frag tent-filters the source with exactly 4 taps', () => {
    expect(downsampleSrc).toContain('uSourceTexelSize');
    // 4 bilinear taps at +/- half a source texel form a 4x4 tent; fewer taps
    // point-decimate the source and shimmer on high-frequency glow.
    expect(downsampleSrc.match(/texture\(/g)).toHaveLength(4);
  });

  it('blur.frag upsamples with a 3x3 tent in source-texel units', () => {
    expect(blurSrc).toContain('uUpsample');
    // The tent path must step in the source texel grid, not the target grid.
    expect(blurSrc).toMatch(/uUpsample[\s\S]*uTexelSize|uTexelSize[\s\S]*uUpsample/);
  });

  it('background and scene shaders dither writes to 8-bit targets', () => {
    for (const src of [backgroundSrc, sceneSrc]) {
      expect(src).toContain('uWriteDither');
      expect(src).toContain('bayer');
    }
  });
});
