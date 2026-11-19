import { PHYSICS_CONSTANTS } from '../constants';
import { createObstaclePair } from '../entities/obstacles';
import type { GameEngine } from '../engine';

const FIXTURE_GAP = PHYSICS_CONSTANTS.OBSTACLE_GAP;
const FIXTURE_WIDTH = PHYSICS_CONSTANTS.OBSTACLE_WIDTH;
const MIN_MARGIN = 60;

const FIXTURE_X = [180, 380, 580] as const;
const FIXTURE_TOP_HEIGHTS = [150, 220, 180] as const;
const FIXTURE_BEST = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Deterministic paused frame for `?freeze=1` screenshots and manual visual
 * inspection. It writes the engine state directly — no `update()`, no
 * `Math.random()`, no storage — so calling it twice with the same arguments
 * produces the same scene snapshot. The seed only shifts the three fixed kelp
 * heights within a safe band; it never randomises layout or pearls.
 */
export function applyVisualFixture(
  engine: GameEngine,
  time: number,
  seed: number
): void {
  const safeTime = Number.isFinite(time) ? time : 0;
  const safeSeed = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  const maxTop = PHYSICS_CONSTANTS.CANVAS_HEIGHT - MIN_MARGIN - FIXTURE_GAP;
  const jitter = ((Math.abs(safeSeed) % 5) - 2) * 6;

  engine.status = 'paused';
  engine.gameTime = safeTime;
  engine.events = [];
  engine.score = 0;
  engine.runPearls = 0;
  engine.isNewBest = false;

  engine.fish.x = 80;
  engine.fish.y = 300;
  engine.fish.vx = 0;
  engine.fish.vy = 0;
  engine.fish.rotation = 0;
  engine.fish.isDead = false;
  engine.fish.invulnerableTime = 0;

  engine.comboManager.reset();

  engine.obstacles = FIXTURE_X.map((x, index) => {
    const topHeight = clamp(
      FIXTURE_TOP_HEIGHTS[index] + jitter,
      MIN_MARGIN,
      maxTop
    );
    const obstacle = createObstaclePair(x, PHYSICS_CONSTANTS.CANVAS_HEIGHT, {
      id: `fixture-obstacle-${index}`,
      topHeight,
      gapSize: FIXTURE_GAP,
      width: FIXTURE_WIDTH,
      minMargin: MIN_MARGIN,
    });

    obstacle.pearl = {
      id: `fixture-pearl-${index}`,
      x: x + FIXTURE_WIDTH / 2,
      y: topHeight + FIXTURE_GAP / 2,
      radius: PHYSICS_CONSTANTS.PEARL_RADIUS,
      collected: false,
      missed: false,
    };

    return obstacle;
  });

  engine.ribbonTargetScore = FIXTURE_BEST;
  // The 2D renderer also gates the ribbon on highScore; mirror the fixture
  // target here so a frozen 2D fallback shows the same badge as the GL path.
  engine.highScore = FIXTURE_BEST;
  engine.ribbonX = 280;
  engine.ribbonCrossed = false;
}
