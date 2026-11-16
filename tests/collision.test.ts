import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkFishBoundsCollision,
  checkFishObstacleCollision,
  circleIntersectsAABB,
} from '../src/game/physics';
import { PHYSICS_CONSTANTS } from '../src/game/constants';
import type { FishEntity, ObstacleEntity } from '../src/game/types';

describe('Generous Collision Detection Engine', () => {
  let fish: FishEntity;
  let obstacle: ObstacleEntity;
  const WORLD_HEIGHT = 640;

  beforeEach(() => {
    fish = {
      x: 100,
      y: 300,
      vx: 0,
      vy: 0,
      radius: PHYSICS_CONSTANTS.FISH_RADIUS, // 16px
      rotation: 0,
      skin: 'neon-tetra',
      isDead: false,
      invulnerableTime: 0,
    };

    obstacle = {
      id: 'pipe-1',
      x: 100,
      width: PHYSICS_CONSTANTS.OBSTACLE_WIDTH, // 60px
      topHeight: 200, // Kelp descends from y=0 to y=200
      bottomY: 340, // Jellyfish ascends from y=340 to canvas floor
      gapSize: PHYSICS_CONSTANTS.OBSTACLE_GAP, // 140px clearance
      passed: false,
    };
  });

  describe('circleIntersectsAABB primitive', () => {
    it('detects circle overlapping box interior', () => {
      // Circle at (50, 50) with radius 10, Box from (40, 40) to (60, 60)
      expect(circleIntersectsAABB(50, 50, 10, 40, 40, 60, 60)).toBe(true);
    });

    it('detects circle overlapping box edge', () => {
      // Circle at (35, 50) with radius 10, Box from (40, 40) to (60, 60) -> distance to left edge is 5 < 10
      expect(circleIntersectsAABB(35, 50, 10, 40, 40, 60, 60)).toBe(true);
    });

    it('returns false when circle is outside box', () => {
      // Circle at (20, 50) with radius 10, Box from (40, 40) to (60, 60) -> distance is 20 > 10
      expect(circleIntersectsAABB(20, 50, 10, 40, 40, 60, 60)).toBe(false);
    });

    it('detects corner proximity overlap accurately', () => {
      // Corner at (40, 40). Circle at (33, 33).
      // Distance = sqrt((40-33)^2 + (40-33)^2) = sqrt(49 + 49) = sqrt(98) ≈ 9.899
      // With radius 10 -> intersects!
      expect(circleIntersectsAABB(33, 33, 10, 40, 40, 60, 60)).toBe(true);
      // Circle at (32, 32). Distance = sqrt(64 + 64) = sqrt(128) ≈ 11.31 > 10 -> no intersection!
      expect(circleIntersectsAABB(32, 32, 10, 40, 40, 60, 60)).toBe(false);
    });
  });

  describe('checkFishBoundsCollision (Ceiling & Floor)', () => {
    it('returns false when fish is safely between boundaries', () => {
      fish.y = 300;
      const bounds = checkFishBoundsCollision(fish, WORLD_HEIGHT);
      expect(bounds.hitCeiling).toBe(false);
      expect(bounds.hitFloor).toBe(false);
    });

    it('detects ceiling collision when fish reaches the top boundary', () => {
      // Generous hitbox radius = 16 * 0.85 = 13.6px
      fish.y = 10; // y - 13.6 = -3.6 <= 0
      const bounds = checkFishBoundsCollision(fish, WORLD_HEIGHT);
      expect(bounds.hitCeiling).toBe(true);
      expect(bounds.hitFloor).toBe(false);
    });

    it('detects floor collision when fish hits seabed', () => {
      // Floor at 640. Fish at 630. 630 + 13.6 = 643.6 >= 640
      fish.y = 630;
      const bounds = checkFishBoundsCollision(fish, WORLD_HEIGHT);
      expect(bounds.hitCeiling).toBe(false);
      expect(bounds.hitFloor).toBe(true);
    });

    it('demonstrates generous 15% near-miss hitbox tolerance at bounds', () => {
      // Visual radius = 16. Effective radius = 13.6.
      // At y = 14:
      // Visual boundary: 14 - 16 = -2 <= 0 (visual overlap with ceiling!)
      // Generous boundary: 14 - 13.6 = +0.4 > 0 (near-miss tolerated!)
      fish.y = 14;
      const generousBounds = checkFishBoundsCollision(fish, WORLD_HEIGHT);
      expect(generousBounds.hitCeiling).toBe(false);

      // Unscaled hitbox (scale = 1.0) WOULD collide
      const unscaledBounds = checkFishBoundsCollision(fish, WORLD_HEIGHT, 1.0);
      expect(unscaledBounds.hitCeiling).toBe(true);
    });
  });

  describe('checkFishObstacleCollision (Generous Near-Miss Hitboxes)', () => {
    it('returns false when fish is far ahead or behind the obstacle horizontally', () => {
      fish.x = 20; // obstacle is at x: 100..160
      fish.y = 100;
      expect(checkFishObstacleCollision(fish, obstacle)).toBe(false);

      fish.x = 250;
      expect(checkFishObstacleCollision(fish, obstacle)).toBe(false);
    });

    it('returns false when fish swims cleanly through the 140px gap', () => {
      // Obstacle gap: y = 200 to y = 340.
      // Center of gap is y = 270.
      fish.x = 130; // within obstacle width [100, 160]
      fish.y = 270;
      expect(checkFishObstacleCollision(fish, obstacle)).toBe(false);
    });

    it('detects direct collision with top kelp obstacle', () => {
      fish.x = 130;
      fish.y = 150; // inside top kelp [y: 0..200]
      expect(checkFishObstacleCollision(fish, obstacle)).toBe(true);
    });

    it('detects direct collision with bottom jellyfish obstacle', () => {
      fish.x = 130;
      fish.y = 400; // inside bottom jellyfish [y: 340..640]
      expect(checkFishObstacleCollision(fish, obstacle)).toBe(true);
    });

    it('grants generous near-miss when grazing top kelp within 15% margin', () => {
      // Top obstacle bottom edge is at y = 200.
      // Fish center at y = 215: distance to top obstacle is 15px.
      // Visual radius = 16px (visual penetration = 1px!).
      // Reduced hitbox radius = 16 * 0.85 = 13.6px.
      // Since distance (15) > 13.6, player survives!
      fish.x = 130;
      fish.y = 215;

      expect(checkFishObstacleCollision(fish, obstacle)).toBe(false);

      // Comparing with unscaled hitbox (scale = 1.0): unscaled WOULD collide!
      expect(checkFishObstacleCollision(fish, obstacle, 1.0)).toBe(true);
    });

    it('grants generous near-miss when grazing bottom jellyfish within 15% margin', () => {
      // Bottom obstacle top edge is at y = 340.
      // Fish center at y = 325: distance to bottom obstacle is 15px.
      // Visual radius = 16px (visual penetration = 1px!).
      // Reduced hitbox radius = 13.6px.
      // Distance (15) > 13.6 -> player survives!
      fish.x = 130;
      fish.y = 325;

      expect(checkFishObstacleCollision(fish, obstacle)).toBe(false);
      expect(checkFishObstacleCollision(fish, obstacle, 1.0)).toBe(true);
    });

    it('detects collision when penetration exceeds 15% generous margin', () => {
      // Top obstacle at y = 200. Fish center at y = 212.
      // Distance is 12px < 13.6px -> collision!
      fish.x = 130;
      fish.y = 212;
      expect(checkFishObstacleCollision(fish, obstacle)).toBe(true);

      // Bottom obstacle at y = 340. Fish center at y = 328.
      // Distance is 12px < 13.6px -> collision!
      fish.y = 328;
      expect(checkFishObstacleCollision(fish, obstacle)).toBe(true);
    });

    it('handles obstacle horizontal corner near-misses', () => {
      // Top-left corner of gap opening is at (100, 200).
      // Fish approaching diagonally at (90, 210).
      // Distance to corner = sqrt(10^2 + 10^2) = sqrt(200) ≈ 14.14px.
      // Visual radius (16) > 14.14 -> visually clips corner!
      // Generous radius (13.6) < 14.14 -> generous near-miss passes safely!
      fish.x = 90;
      fish.y = 210;

      expect(checkFishObstacleCollision(fish, obstacle)).toBe(false);
      expect(checkFishObstacleCollision(fish, obstacle, 1.0)).toBe(true);
    });
  });
});
