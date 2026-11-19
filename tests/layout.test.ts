import { describe, it, expect } from 'vitest';
import { computeStageSize } from '../src/game/layout';

describe('computeStageSize (uniform 9:16 letterbox)', () => {
  it('fits a tall phone without stretching the world', () => {
    const { width, height } = computeStageSize(390, 844);

    expect(width).toBe(390);
    expect(Math.abs(width / height - 360 / 640)).toBeLessThan(0.002);
    expect(height).toBeLessThan(844); // letterboxed, not filled
  });

  it('fits a desktop stage inside its container', () => {
    const { width, height } = computeStageSize(448, 900);

    expect(width).toBe(448);
    expect(height).toBe(796);
    expect(height).toBeLessThanOrEqual(900);
  });

  it('letterboxes landscape containers by width instead of height', () => {
    const { width, height } = computeStageSize(1280, 720);

    expect(width).toBe(405);
    expect(height).toBe(720);
    expect(width).toBeLessThan(1280);
  });

  it('falls back to the native 360x640 world before layout is measured', () => {
    expect(computeStageSize(0, 0)).toEqual({ width: 360, height: 640 });
    expect(computeStageSize(Number.NaN, 640)).toEqual({ width: 360, height: 640 });
  });
});
