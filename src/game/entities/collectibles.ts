import type { ObstacleEntity, PearlEntity } from '../types';
import { PHYSICS_CONSTANTS } from '../constants';

let pearlIdCounter = 0;

export function resetPearlIdCounter(): void {
  pearlIdCounter = 0;
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
