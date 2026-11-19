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

    it('grants a generous near-miss at the drawn holdfast bulb tip', () => {
      // The holdfast is a semicircle centred at (130, topHeight=200) with
      // radius (60 - 2*8) / 2 = 22, so its lowest painted point is y = 222.
      // Fish centre at y = 236 sits 36px below the bulb centre.
      // Generous: 13.6 + 22 = 35.6 < 36 -> survives.
      fish.x = 130;
      fish.y = 236;

      expect(checkFishObstacleCollision(fish, obstacle)).toBe(false);

      // Unscaled radius: 16 + 22 = 38 > 36 -> would collide, proving the margin.
      expect(checkFishObstacleCollision(fish, obstacle, 1.0)).toBe(true);
    });

    it('treats the painted holdfast bulb as solid below topHeight', () => {
      // y = 215 is below topHeight (200) but inside the bulb that is actually
      // drawn there: distance to the bulb centre is 15 < 22 + 13.6.
      fish.x = 130;
      fish.y = 215;

      expect(checkFishObstacleCollision(fish, obstacle)).toBe(true);
    });

    it('ignores the 8px transparent gutter on each side of the kelp column', () => {
      // The painted column spans x = 108..152, not the nominal 100..160.
      // At x = 93 the fish circle (13.6) stops at 106.6, clear of the art;
      // the old full-width hitbox would have killed the player here.
      fish.x = 93;
      fish.y = 100;

      expect(checkFishObstacleCollision(fish, obstacle)).toBe(false);
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
      // Top kelp: fish is 12px below topHeight, i.e. inside the holdfast bulb.
      // Bottom jellyfish: fish is 12px above bottomY, inside the 13.6px hitbox.
      fish.x = 130;
      fish.y = 212;
      expect(checkFishObstacleCollision(fish, obstacle)).toBe(true);

      fish.y = 328;
      expect(checkFishObstacleCollision(fish, obstacle)).toBe(true);
    });

    it('treats the kelp holdfast corner as rounded, matching the art', () => {
      // The column starts at x = 108 (100 + 8px inset), not at the nominal 100,
      // and the bulb rounds the corner. (90, 210) is ~20.6px from that corner,
      // so it is clear even with the full 16px radius.
      fish.x = 90;
      fish.y = 210;

      expect(checkFishObstacleCollision(fish, obstacle)).toBe(false);
      expect(checkFishObstacleCollision(fish, obstacle, 1.0)).toBe(false);
    });
  });
});
