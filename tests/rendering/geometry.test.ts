import { describe, it, expect } from 'vitest';
import { computeGameRect, worldToStage } from '../../src/game/rendering/geometry';

describe('stage geometry', () => {
  it('keeps the exact fractional 9:16 origin', () => {
    expect(computeGameRect(390, 844)).toEqual({
      x: 0,
      y: 75.5,
      width: 390,
      height: 693,
    });
    expect(computeGameRect(448, 900)).toEqual({
      x: 0,
      y: 52,
      width: 448,
      height: 796,
    });
  });

  it('maps world corners and center into the stage rect', () => {
    const r = { x: 0, y: 75.5, width: 390, height: 693 };
    expect(worldToStage(0, 0, r)).toEqual({ x: 0, y: 75.5 });
    expect(worldToStage(360, 640, r)).toEqual({ x: 390, y: 768.5 });
    expect(worldToStage(180, 320, r)).toEqual({ x: 195, y: 422 });
  });
});
