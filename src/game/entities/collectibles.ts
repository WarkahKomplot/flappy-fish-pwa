import type { ObstacleEntity, PearlEntity } from '../types';
import { PHYSICS_CONSTANTS } from '../constants';

let pearlIdCounter = 0;

export function resetPearlIdCounter(): void {
  pearlIdCounter = 0;
}

/**
 * Stable per-entity seed derived from an obstacle id, used to offset the
 * pearl's sinusoidal bob so neighbouring pearls do not bob in lockstep.
 */
export function getEntitySeed(id: string | number | undefined): number {
  if (!id) return 0;
  if (typeof id === 'number') return id;
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash % 100);
}

/**
 * Single shared bob formula for both the Canvas 2D renderer and the scene
 * snapshot, so the drawn pearl and the compositor can never drift apart.
 */
export function resolvePearlY(time: number, seed: number, baseY: number): number {
  return baseY + Math.sin(time * 3.5 + seed) * 4;
}

/**
 * Creates a luminous pearl located at the vertical and horizontal center of an obstacle gap
 * based on ~60% spawn probability.
 *
 * @param obstacle The obstacle pair entity containing the gap coordinates
 * @param randomFn Optional pseudo-random generator function (defaults to Math.random)
 * @returns PearlEntity if spawned, or null if neutral gap
 */
export function createPearlForGap(
  obstacle: ObstacleEntity,
  randomFn: () => number = Math.random
): PearlEntity | null {
  const roll = randomFn();
  if (roll >= PHYSICS_CONSTANTS.PEARL_SPAWN_CHANCE) {
    return null;
  }

  const x = obstacle.x + obstacle.width / 2;
  const y = obstacle.topHeight + obstacle.gapSize / 2;

  return {
    id: `pearl_${obstacle.id}_${++pearlIdCounter}`,
    x,
    y,
    radius: PHYSICS_CONSTANTS.PEARL_RADIUS,
    collected: false,
    missed: false,
  };
}
