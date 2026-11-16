import type { ObstacleEntity } from '../types';
import { PHYSICS_CONSTANTS } from '../constants';

export interface ObstacleOptions {
  gapSize?: number;
  width?: number;
  topHeight?: number;
  id?: string | number;
  minMargin?: number;
}

let obstacleIdCounter = 0;

export function resetObstacleIdCounter(): void {
  obstacleIdCounter = 0;
}

/**
 * Creates an obstacle pair consisting of kelp descending from top (0 -> topHeight)
 * and jellyfish rising from bottom (bottomY -> worldHeight) with a clearance gap in between.
 */
export function createObstaclePair(
  x: number,
  worldHeight: number,
  options?: ObstacleOptions
): ObstacleEntity {
  const gapSize = options?.gapSize ?? PHYSICS_CONSTANTS.OBSTACLE_GAP;
  const width = options?.width ?? PHYSICS_CONSTANTS.OBSTACLE_WIDTH;
  const minMargin = options?.minMargin ?? 60;
  const maxTop = Math.max(minMargin, worldHeight - minMargin - gapSize);

  const topHeight =
    options?.topHeight !== undefined
      ? options.topHeight
      : minMargin + Math.random() * (maxTop - minMargin);

  const id = options?.id ?? `obstacle_${++obstacleIdCounter}`;

  return {
    id,
    x,
    topHeight,
    bottomY: topHeight + gapSize,
    gapSize,
    width,
    passed: false,
    pearl: null,
  };
}
