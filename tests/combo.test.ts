import { describe, it, expect, beforeEach } from 'vitest';
import { ComboManager } from '../src/game/combo';
import { createObstaclePair } from '../src/game/entities/obstacles';
import { createPearlForGap } from '../src/game/entities/collectibles';
import { PHYSICS_CONSTANTS } from '../src/game/constants';
import type { ObstacleEntity } from '../src/game/types';

describe('ComboManager and Collectibles', () => {
  let comboManager: ComboManager;

  beforeEach(() => {
    comboManager = new ComboManager();
  });

  describe('3-Pearl Consecutive Combo & Shield Activation', () => {
    it('initializes with 0 combo, no shield, and 0 active shield time', () => {
      expect(comboManager.comboCount).toBe(0);
      expect(comboManager.combo).toBe(0);
      expect(comboManager.hasShield).toBe(false);
      expect(comboManager.shieldActiveTime).toBe(0);
    });

    it('advances combo count sequentially on each pearl collection', () => {
      const first = comboManager.onPearlCollected();
      expect(first).toEqual({ combo: 1, shieldActivated: false });
      expect(comboManager.comboCount).toBe(1);
      expect(comboManager.hasShield).toBe(false);

      const second = comboManager.onPearlCollected();
      expect(second).toEqual({ combo: 2, shieldActivated: false });
      expect(comboManager.comboCount).toBe(2);
      expect(comboManager.hasShield).toBe(false);
    });

    it('activates Bubble Shield on 3rd pearl and resets combo count to 0', () => {
      comboManager.onPearlCollected(); // 1
      comboManager.onPearlCollected(); // 2
      const third = comboManager.onPearlCollected(); // 3

      expect(third).toEqual({ combo: 0, shieldActivated: true });
      expect(comboManager.comboCount).toBe(0);
      expect(comboManager.hasShield).toBe(true);
      expect(comboManager.shieldActiveTime).toBe(0);
    });
  });

  describe('Neutral Gaps vs Missed Pearls (Review Focus 4)', () => {
    it('preserves combo streak across neutral gaps where no pearl spawned', () => {
      comboManager.onPearlCollected(); // combo = 1
      expect(comboManager.comboCount).toBe(1);

      // Simulating passing an obstacle gap where pearl is null (neutral gap)
      // No onPearlMissed is triggered
      expect(comboManager.comboCount).toBe(1);

      comboManager.onPearlCollected(); // combo = 2
      expect(comboManager.comboCount).toBe(2);

      // Another neutral gap passed
      expect(comboManager.comboCount).toBe(2);
    });

    it('strictly resets combo count to 0 when an active pearl is missed (Review Focus 4)', () => {
      comboManager.onPearlCollected(); // 1
      comboManager.onPearlCollected(); // 2
      expect(comboManager.comboCount).toBe(2);

      // Swam past an uncollected pearl
      comboManager.onPearlMissed();
      expect(comboManager.comboCount).toBe(0);

      // Next collection starts new streak from 1
      const next = comboManager.onPearlCollected();
      expect(next).toEqual({ combo: 1, shieldActivated: false });
      expect(comboManager.comboCount).toBe(1);
    });

    it('does not deactivate an already-active shield when a subsequent pearl is missed', () => {
      // Build shield
      comboManager.onPearlCollected();
      comboManager.onPearlCollected();
      comboManager.onPearlCollected();
      expect(comboManager.hasShield).toBe(true);

      // Miss subsequent pearl
      comboManager.onPearlMissed();
      expect(comboManager.comboCount).toBe(0);
      expect(comboManager.hasShield).toBe(true); // Shield remains active until damage
    });
  });

  describe('Hit Absorption and Invulnerability Duration', () => {
    it('absorbs 1 collision, pops shield, and grants 1.2s invulnerability duration', () => {
      // Activate shield
      comboManager.onPearlCollected();
      comboManager.onPearlCollected();
      comboManager.onPearlCollected();
      expect(comboManager.hasShield).toBe(true);

      const result = comboManager.onHitAbsorbed();
      expect(result).toEqual({
        shieldBroken: true,
        invulnerableDuration: PHYSICS_CONSTANTS.INVULNERABILITY_DURATION,
      });
      expect(result.invulnerableDuration).toBe(1.2);
      expect(comboManager.hasShield).toBe(false);
      expect(comboManager.shieldActiveTime).toBe(0);
    });

    it('returns shieldBroken: false and 0 duration when hit occurs without shield', () => {
      expect(comboManager.hasShield).toBe(false);
      const result = comboManager.onHitAbsorbed();
      expect(result).toEqual({
        shieldBroken: false,
        invulnerableDuration: 0,
      });
      expect(comboManager.hasShield).toBe(false);
    });

    it('tracks shield active time correctly while shield is active', () => {
      comboManager.onPearlCollected();
      comboManager.onPearlCollected();
      comboManager.onPearlCollected();
      expect(comboManager.hasShield).toBe(true);

      comboManager.update(0.5);
      expect(comboManager.shieldActiveTime).toBeCloseTo(0.5, 4);

      comboManager.update(0.3);
      expect(comboManager.shieldActiveTime).toBeCloseTo(0.8, 4);

      comboManager.onHitAbsorbed();
      expect(comboManager.shieldActiveTime).toBe(0);

      // Update when shield is inactive does not increment shieldActiveTime
      comboManager.update(1.0);
      expect(comboManager.shieldActiveTime).toBe(0);
    });

    it('resets all state on reset()', () => {
      comboManager.onPearlCollected();
      comboManager.onPearlCollected();
      comboManager.onPearlCollected();
      comboManager.update(1.0);

      comboManager.reset();
      expect(comboManager.comboCount).toBe(0);
      expect(comboManager.hasShield).toBe(false);
      expect(comboManager.shieldActiveTime).toBe(0);
    });
  });

  describe('createObstaclePair', () => {
    it('generates obstacle pair with 140px gap size and 60px width', () => {
      const obstacle = createObstaclePair(250, 640);

      expect(obstacle.x).toBe(250);
      expect(obstacle.width).toBe(PHYSICS_CONSTANTS.OBSTACLE_WIDTH);
      expect(obstacle.width).toBe(60);
      expect(obstacle.gapSize).toBe(PHYSICS_CONSTANTS.OBSTACLE_GAP);
      expect(obstacle.gapSize).toBe(140);
      expect(obstacle.bottomY).toBe(obstacle.topHeight + obstacle.gapSize);
      expect(obstacle.passed).toBe(false);
    });

    it('generates obstacles with topHeight maintaining safe margins from boundaries', () => {
      const worldHeight = 640;
      const minMargin = 60;
      const maxTop = worldHeight - minMargin - PHYSICS_CONSTANTS.OBSTACLE_GAP;

      for (let i = 0; i < 20; i++) {
        const obs = createObstaclePair(i * 100, worldHeight);
        expect(obs.topHeight).toBeGreaterThanOrEqual(minMargin);
        expect(obs.topHeight).toBeLessThanOrEqual(maxTop);
        expect(obs.bottomY).toBe(obs.topHeight + PHYSICS_CONSTANTS.OBSTACLE_GAP);
        expect(obs.bottomY).toBeLessThanOrEqual(worldHeight - minMargin);
      }
    });

    it('allows deterministic options for topHeight and gapSize in tests', () => {
      const obs = createObstaclePair(100, 640, { topHeight: 200, gapSize: 140, width: 60 });
      expect(obs.topHeight).toBe(200);
      expect(obs.gapSize).toBe(140);
      expect(obs.bottomY).toBe(340);
      expect(obs.width).toBe(60);
    });
  });

  describe('createPearlForGap', () => {
    let obstacle: ObstacleEntity;

    beforeEach(() => {
      obstacle = createObstaclePair(200, 640, { topHeight: 180, gapSize: 140, width: 60 });
    });

    it('places pearl at the exact horizontal and vertical center of the obstacle gap', () => {
      const pearl = createPearlForGap(obstacle, () => 0.1); // Force spawn (< 0.6)

      expect(pearl).not.toBeNull();
      if (!pearl) return;

      // Horizontal center: x + width / 2 = 200 + 30 = 230
      expect(pearl.x).toBe(obstacle.x + obstacle.width / 2);
      expect(pearl.x).toBe(230);

      // Vertical center: topHeight + gapSize / 2 = 180 + 70 = 250
      expect(pearl.y).toBe(obstacle.topHeight + obstacle.gapSize / 2);
      expect(pearl.y).toBe(250);

      expect(pearl.radius).toBe(PHYSICS_CONSTANTS.PEARL_RADIUS);
      expect(pearl.radius).toBe(12);
      expect(pearl.collected).toBe(false);
      expect(pearl.missed).toBe(false);
    });

    it('spawns pearl when random roll is under spawn chance (60%)', () => {
      const pearl = createPearlForGap(obstacle, () => 0.59);
      expect(pearl).not.toBeNull();
    });

    it('returns null (neutral gap) when random roll is at or above spawn chance (60%)', () => {
      const pearl = createPearlForGap(obstacle, () => 0.60);
      expect(pearl).toBeNull();

      const pearl2 = createPearlForGap(obstacle, () => 0.95);
      expect(pearl2).toBeNull();
    });

    it('simulates full run sequence: neutral gaps preserve streak, miss resets streak (Review Focus 4)', () => {
      const manager = new ComboManager();

      // Gate 1: pearl spawned and collected
      const obs1 = createObstaclePair(200, 640, { topHeight: 150 });
      const pearl1 = createPearlForGap(obs1, () => 0.1); // spawn
      expect(pearl1).not.toBeNull();
      pearl1!.collected = true;
      manager.onPearlCollected();
      expect(manager.comboCount).toBe(1);

      // Gate 2: neutral gap (no pearl spawned)
      const obs2 = createObstaclePair(400, 640, { topHeight: 180 });
      const pearl2 = createPearlForGap(obs2, () => 0.8); // no spawn
      expect(pearl2).toBeNull();
      // Fish flies through neutral gap -> combo remains 1
      expect(manager.comboCount).toBe(1);

      // Gate 3: pearl spawned and collected
      const obs3 = createObstaclePair(600, 640, { topHeight: 200 });
      const pearl3 = createPearlForGap(obs3, () => 0.2); // spawn
      expect(pearl3).not.toBeNull();
      pearl3!.collected = true;
      manager.onPearlCollected();
      expect(manager.comboCount).toBe(2);

      // Gate 4: neutral gap (no pearl spawned) -> combo remains 2
      const obs4 = createObstaclePair(800, 640, { topHeight: 220 });
      const pearl4 = createPearlForGap(obs4, () => 0.75); // no spawn
      expect(pearl4).toBeNull();
      expect(manager.comboCount).toBe(2);

      // Gate 5: pearl spawned but player swims past without collecting (missed!)
      const obs5 = createObstaclePair(1000, 640, { topHeight: 160 });
      const pearl5 = createPearlForGap(obs5, () => 0.3); // spawn
      expect(pearl5).not.toBeNull();
      // Fish passed without collecting -> missed!
      pearl5!.missed = true;
      manager.onPearlMissed();
      expect(manager.comboCount).toBe(0);
    });
  });
});
