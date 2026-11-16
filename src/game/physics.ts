import { PHYSICS_CONSTANTS } from './constants';
import type { FishEntity, ObstacleEntity } from './types';

/**
 * Calculates dynamic fish pitch angle (rotation in radians) based on vertical velocity.
 * - Negative velocity (upward swim stroke) pitches up towards UPWARD_PITCH_ANGLE (-20° / -0.35 rad).
 * - Positive velocity (downward sink) pitches down towards DOWNWARD_PITCH_ANGLE (+45° / +0.78 rad).
 * - Zero velocity remains neutral level (0 rad).
 */
export function calculateFishRotation(vy: number): number {
  if (vy < 0) {
    const ratio = Math.min(1, Math.max(0, vy / PHYSICS_CONSTANTS.SWIM_IMPULSE));
    return ratio * PHYSICS_CONSTANTS.UPWARD_PITCH_ANGLE;
  } else if (vy > 0) {
    const ratio = Math.min(1, Math.max(0, vy / PHYSICS_CONSTANTS.TERMINAL_VELOCITY));
    return ratio * PHYSICS_CONSTANTS.DOWNWARD_PITCH_ANGLE;
  }
  return 0;
}

/**
 * Applies a discrete swim impulse on tap/click.
 * Cancels downward sink momentum and applies upward impulse.
 * Upward velocity is strictly clamped to MAX_UPWARD_VELOCITY (-8.5) to prevent rapid multi-tap skyrocket overflow (Review Focus 1).
 */
export function applySwimImpulse(fish: FishEntity): void {
  const baseVy = fish.vy > 0 ? 0 : fish.vy;
  fish.vy = baseVy + PHYSICS_CONSTANTS.SWIM_IMPULSE;

  if (fish.vy < PHYSICS_CONSTANTS.MAX_UPWARD_VELOCITY) {
    fish.vy = PHYSICS_CONSTANTS.MAX_UPWARD_VELOCITY;
  }
}

/**
 * Updates fish physics integration for a single frame:
 * 1. Applies water drag damping.
 * 2. Applies gravitational sink acceleration.
 * 3. Clamps vertical velocities to upward and downward terminal limits.
 * 4. Integrates positions.
 * 5. Updates dynamic pitch angle.
 */
export function updateFishPhysics(fish: FishEntity, dt: number = 1): void {
  // 1. Water drag damping
  fish.vy *= Math.pow(PHYSICS_CONSTANTS.WATER_DRAG, dt);

  // 2. Downward gravitational acceleration
  fish.vy += PHYSICS_CONSTANTS.GRAVITY * dt;

  // 3. Velocity clamping
  if (fish.vy < PHYSICS_CONSTANTS.MAX_UPWARD_VELOCITY) {
    fish.vy = PHYSICS_CONSTANTS.MAX_UPWARD_VELOCITY;
  }
  if (fish.vy > PHYSICS_CONSTANTS.TERMINAL_VELOCITY) {
    fish.vy = PHYSICS_CONSTANTS.TERMINAL_VELOCITY;
  }

  // 4. Position numerical integration
  fish.x += fish.vx * dt;
  fish.y += fish.vy * dt;

  // 5. Dynamic pitch rotation
  fish.rotation = calculateFishRotation(fish.vy);
}

/**
 * Checks intersection between a circle and an Axis-Aligned Bounding Box (AABB).
 */
export function circleIntersectsAABB(
  cx: number,
  cy: number,
  radius: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): boolean {
  const closestX = Math.max(minX, Math.min(cx, maxX));
  const closestY = Math.max(minY, Math.min(cy, maxY));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return (dx * dx + dy * dy) < (radius * radius);
}

/**
 * Checks bounds collision with ceiling and floor using generous near-miss hitboxes.
 */
export function checkFishBoundsCollision(
  fish: FishEntity,
  worldHeight: number,
  hitboxScale: number = PHYSICS_CONSTANTS.HITBOX_SCALE
): { hitCeiling: boolean; hitFloor: boolean } {
  const effectiveRadius = fish.radius * hitboxScale;
  return {
    hitCeiling: fish.y - effectiveRadius <= 0,
    hitFloor: fish.y + effectiveRadius >= worldHeight,
  };
}

/**
 * Checks collision between the fish and an obstacle pair (top kelp + bottom jellyfish).
 * Applies a 15% reduction in collision bounds (HITBOX_SCALE: 0.85) to provide forgiving "near-miss" satisfaction.
 */
export function checkFishObstacleCollision(
  fish: FishEntity,
  obstacle: ObstacleEntity,
  hitboxScale: number = PHYSICS_CONSTANTS.HITBOX_SCALE
): boolean {
  const effectiveRadius = fish.radius * hitboxScale;

  // Top kelp obstacle: descends from ceiling y=0 down to y=obstacle.topHeight
  const hitTop = circleIntersectsAABB(
    fish.x,
    fish.y,
    effectiveRadius,
    obstacle.x,
    0,
    obstacle.x + obstacle.width,
    obstacle.topHeight
  );

  if (hitTop) {
    return true;
  }

  // Bottom jellyfish obstacle: ascends from seabed up to y=obstacle.bottomY
  const hitBottom = circleIntersectsAABB(
    fish.x,
    fish.y,
    effectiveRadius,
    obstacle.x,
    obstacle.bottomY,
    obstacle.x + obstacle.width,
    Number.POSITIVE_INFINITY
  );

  return hitBottom;
}
