import { describe, it, expect, beforeEach } from 'vitest';
import {
  applySwimImpulse,
  updateFishPhysics,
  calculateFishRotation,
  speedForScore,
  gapForScore,
} from '../src/game/physics';
import { PHYSICS_CONSTANTS } from '../src/game/constants';
import type { FishEntity } from '../src/game/types';

describe('Fish Physics and Movement Engine', () => {
  let fish: FishEntity;

  beforeEach(() => {
    fish = {
      x: 100,
      y: 300,
      vx: 0,
      vy: 0,
      radius: PHYSICS_CONSTANTS.FISH_RADIUS,
      rotation: 0,
      skin: 'neon-tetra',
      isDead: false,
      invulnerableTime: 0,
    };
  });

  describe('applySwimImpulse', () => {
    it('applies negative vertical velocity (upward impulse) to a stationary fish', () => {
      applySwimImpulse(fish);
      expect(fish.vy).toBe(PHYSICS_CONSTANTS.SWIM_IMPULSE);
      expect(fish.vy).toBe(-6.5);
    });

    it('cancels downward momentum when sinking and gives full swim impulse', () => {
      fish.vy = 5.0; // falling fast
      applySwimImpulse(fish);
      expect(fish.vy).toBe(PHYSICS_CONSTANTS.SWIM_IMPULSE);
      expect(fish.vy).toBe(-6.5);
    });

    it('allows a chained swim flap to build upward velocity', () => {
      fish.vy = -3.0; // already swimming upward
      applySwimImpulse(fish);
      // -3.0 + (-6.5) = -9.5, clamped to MAX_UPWARD_VELOCITY (-8.5)
      expect(fish.vy).toBe(PHYSICS_CONSTANTS.MAX_UPWARD_VELOCITY);
      expect(fish.vy).toBe(-8.5);
    });

    it('strictly clamps upward velocity on rapid multi-taps (Review Focus 1)', () => {
      // Simulate 10 rapid taps in 0.5s
      for (let i = 0; i < 10; i++) {
        applySwimImpulse(fish);
      }
      expect(fish.vy).toBe(PHYSICS_CONSTANTS.MAX_UPWARD_VELOCITY);
      expect(fish.vy).toBe(-8.5);
    });
  });

  describe('updateFishPhysics', () => {
    it('accelerates downward under gravity from rest', () => {
      updateFishPhysics(fish, 1);
      // vy was 0 -> after 1 frame with drag (0 * 0.98) + gravity (0.38)
      expect(fish.vy).toBeCloseTo(PHYSICS_CONSTANTS.GRAVITY, 4);
      expect(fish.y).toBeCloseTo(300 + PHYSICS_CONSTANTS.GRAVITY, 4);
    });

    it('applies water drag damping to vertical velocity', () => {
      fish.vy = 4.0;
      updateFishPhysics(fish, 1);
      // Expected: (4.0 * 0.98) + 0.38 = 3.92 + 0.38 = 4.30
      const expectedVy = 4.0 * PHYSICS_CONSTANTS.WATER_DRAG + PHYSICS_CONSTANTS.GRAVITY;
      expect(fish.vy).toBeCloseTo(expectedVy, 4);
    });

    it('clamps downward velocity to TERMINAL_VELOCITY', () => {
      fish.vy = 7.9;
      // After multiple updates, fish should reach but never exceed TERMINAL_VELOCITY (8.0)
      for (let i = 0; i < 50; i++) {
        updateFishPhysics(fish, 1);
      }
      expect(fish.vy).toBe(PHYSICS_CONSTANTS.TERMINAL_VELOCITY);
      expect(fish.vy).toBe(8.0);
    });

    it('clamps upward velocity to MAX_UPWARD_VELOCITY if exceeded', () => {
      fish.vy = -15.0; // anomalous excessive upward velocity
      updateFishPhysics(fish, 1);
      expect(fish.vy).toBeGreaterThanOrEqual(PHYSICS_CONSTANTS.MAX_UPWARD_VELOCITY);
    });

    it('integrates position using velocity and delta time', () => {
      fish.x = 100;
      fish.y = 200;
      fish.vx = 2.0;
      fish.vy = 4.0;

      updateFishPhysics(fish, 1);
      expect(fish.x).toBe(102.0);
      expect(fish.y).toBeCloseTo(200 + fish.vy, 4);
    });

    it('handles variable dt correctly', () => {
      fish.y = 100;
      fish.vy = 0;
      // dt = 2 (e.g. dropped frame)
      updateFishPhysics(fish, 2);
      expect(fish.y).toBeGreaterThan(100);
    });
  });

  describe('Dynamic Pitch Angle Rotation', () => {
    it('angles up (-20 degrees / -0.35 rad) when swimming upward at swim impulse speed', () => {
      fish.vy = PHYSICS_CONSTANTS.SWIM_IMPULSE;
      updateFishPhysics(fish, 0); // update rotation
      expect(fish.rotation).toBeCloseTo(PHYSICS_CONSTANTS.UPWARD_PITCH_ANGLE, 2);
    });

    it('clamps upward pitch to UPWARD_PITCH_ANGLE even at MAX_UPWARD_VELOCITY', () => {
      fish.vy = PHYSICS_CONSTANTS.MAX_UPWARD_VELOCITY;
      const rot = calculateFishRotation(fish.vy);
      expect(rot).toBe(PHYSICS_CONSTANTS.UPWARD_PITCH_ANGLE);
    });

    it('noses down (+45 degrees / +0.78 rad) when falling at terminal velocity', () => {
      fish.vy = PHYSICS_CONSTANTS.TERMINAL_VELOCITY;
      const rot = calculateFishRotation(fish.vy);
      expect(rot).toBeCloseTo(PHYSICS_CONSTANTS.DOWNWARD_PITCH_ANGLE, 2);
    });

    it('is neutral (0 rad) when vertical velocity is 0', () => {
      expect(calculateFishRotation(0)).toBe(0);
    });

    it('smoothly scales pitch angle for intermediate velocities', () => {
      const halfUp = calculateFishRotation(PHYSICS_CONSTANTS.SWIM_IMPULSE / 2);
      expect(halfUp).toBeCloseTo(PHYSICS_CONSTANTS.UPWARD_PITCH_ANGLE / 2, 2);

      const halfDown = calculateFishRotation(PHYSICS_CONSTANTS.TERMINAL_VELOCITY / 2);
      expect(halfDown).toBeCloseTo(PHYSICS_CONSTANTS.DOWNWARD_PITCH_ANGLE / 2, 2);
    });
  });
});

describe('Difficulty curve', () => {
  it('ramps scroll speed with score and caps it at MAX_HORIZONTAL_SPEED', () => {
    expect(speedForScore(0)).toBeCloseTo(PHYSICS_CONSTANTS.HORIZONTAL_SPEED);
    expect(speedForScore(10)).toBeCloseTo(
      PHYSICS_CONSTANTS.HORIZONTAL_SPEED + 10 * PHYSICS_CONSTANTS.SPEED_RAMP_PER_POINT
    );
    // Far past the cap: still clamped.
    expect(speedForScore(10000)).toBeCloseTo(PHYSICS_CONSTANTS.MAX_HORIZONTAL_SPEED);
  });

  it('narrows the gap with score and floors it at MIN_OBSTACLE_GAP', () => {
    expect(gapForScore(0)).toBeCloseTo(PHYSICS_CONSTANTS.OBSTACLE_GAP);
    expect(gapForScore(10)).toBeCloseTo(
      PHYSICS_CONSTANTS.OBSTACLE_GAP - 10 * PHYSICS_CONSTANTS.GAP_NARROW_PER_POINT
    );
    // Far past the floor: still clamped.
    expect(gapForScore(10000)).toBeCloseTo(PHYSICS_CONSTANTS.MIN_OBSTACLE_GAP);
    // The floor must leave a fair, passable gap for the 16px fish hitbox.
    expect(PHYSICS_CONSTANTS.MIN_OBSTACLE_GAP).toBeGreaterThanOrEqual(100);
  });
});
