import { PHYSICS_CONSTANTS } from './constants';
import type { FishEntity, ObstacleEntity } from './types';

/**
 * Scroll speed for the current score: a gentle linear ramp from the base
 * speed, capped so the game never exceeds MAX_HORIZONTAL_SPEED.
 */
export function speedForScore(score: number): number {
  const ramped =
    PHYSICS_CONSTANTS.HORIZONTAL_SPEED +
    Math.max(0, score) * PHYSICS_CONSTANTS.SPEED_RAMP_PER_POINT;
  return Math.min(ramped, PHYSICS_CONSTANTS.MAX_HORIZONTAL_SPEED);
}

/**
 * Obstacle gap for the current score: tapers from the base gap down to
 * MIN_OBSTACLE_GAP, which still leaves a passable corridor for the fish.
 */
export function gapForScore(score: number): number {
  const narrowed =
    PHYSICS_CONSTANTS.OBSTACLE_GAP -
    Math.max(0, score) * PHYSICS_CONSTANTS.GAP_NARROW_PER_POINT;
  return Math.max(narrowed, PHYSICS_CONSTANTS.MIN_OBSTACLE_GAP);
}

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
 * Checks intersection between two circles.
 * Used for the kelp holdfast bulb, which is drawn as a semicircle below the
 * kelp column and must therefore also be part of the collision shape.
 */
export function circleIntersectsCircle(
  cx1: number,
  cy1: number,
  r1: number,
  cx2: number,
  cy2: number,
  r2: number
): boolean {
  const dx = cx1 - cx2;
  const dy = cy1 - cy2;
  const combinedRadius = r1 + r2;
  return dx * dx + dy * dy < combinedRadius * combinedRadius;
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
 *
 * The top kelp hitbox mirrors exactly what drawObstacles() paints: an inset
 * column (KELP_SIDE_INSET px in from each side) plus the semicircular holdfast
 * bulb hanging below topHeight. Before this, the hitbox was the full nominal
 * width and stopped at topHeight, so players could die on 8px of invisible wall
 * and swim through the visibly solid bulb.
 */
export function checkFishObstacleCollision(
  fish: FishEntity,
  obstacle: ObstacleEntity,
  hitboxScale: number = PHYSICS_CONSTANTS.HITBOX_SCALE
): boolean {
  const effectiveRadius = fish.radius * hitboxScale;
  const inset = PHYSICS_CONSTANTS.KELP_SIDE_INSET;
  const bulbRadius = Math.max(0, (obstacle.width - inset * 2) / 2);

  // Top kelp obstacle: inset column descending from ceiling y=0 to y=obstacle.topHeight
  const hitKelpColumn = circleIntersectsAABB(
    fish.x,
    fish.y,
    effectiveRadius,
    obstacle.x + inset,
    0,
    obstacle.x + obstacle.width - inset,
    obstacle.topHeight
  );

  // Top kelp holdfast: the semicircular bulb rendered below topHeight.
  // Testing the full circle is safe because its upper half sits inside the column.
  const hitKelpBulb = circleIntersectsCircle(
    fish.x,
    fish.y,
    effectiveRadius,
    obstacle.x + obstacle.width / 2,
    obstacle.topHeight,
    bulbRadius
  );

  if (hitKelpColumn || hitKelpBulb) {
    return true;
  }

  // Bottom jellyfish: the painted bell is a dome hanging below bottomY (its
  // top edge is at bottomY + bellHeight/4 at centre, bottomY + bellHeight at
  // the sides), so it is tested as a circle over the rectangular tentacle
  // column below the bell's widest line. This mirrors drawObstacles() and
  // keeps the unpainted corners above the bell clear.
  const bellHeight = PHYSICS_CONSTANTS.JELLY_BELL_HEIGHT;
  const domeRadius = bellHeight * 0.75;

  const hitJellyDome = circleIntersectsCircle(
    fish.x,
    fish.y,
    effectiveRadius,
    obstacle.x + obstacle.width / 2,
    obstacle.bottomY + bellHeight,
    domeRadius
  );

  const hitJellyBody = circleIntersectsAABB(
    fish.x,
    fish.y,
    effectiveRadius,
    obstacle.x,
    obstacle.bottomY + bellHeight,
    obstacle.x + obstacle.width,
    Number.POSITIVE_INFINITY
  );

  return hitJellyDome || hitJellyBody;
}
