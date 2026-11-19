import { describe, it, expect } from 'vitest';
import {
  computeCaptureSize,
  MAX_CAPTURE_PIXELS,
} from '../../src/game/rendering/geometry';

describe('capture sizing', () => {
  it('caps the capture buffer', () => {
    expect(computeCaptureSize({ x: 0, y: 0, width: 390, height: 693 }, 1.5)).toEqual({
      width: 585,
      height: 1040,
    });
    const big = computeCaptureSize({ x: 0, y: 0, width: 1200, height: 2133 }, 2);
    expect(big.width * big.height).toBeLessThanOrEqual(1_500_000);
  });

  it('exports the documented pixel cap', () => {
    expect(MAX_CAPTURE_PIXELS).toBe(1_500_000);
  });
});
