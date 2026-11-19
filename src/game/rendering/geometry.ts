import { PHYSICS_CONSTANTS } from '../constants';
import { computeStageSize } from '../layout';

export interface GameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CaptureSize {
  width: number;
  height: number;
}

/**
 * Memory ceiling for the 2D scene buffer that is uploaded as a texture every
 * frame. The post chain has its own, larger cap on the quality profile.
 */
export const MAX_CAPTURE_PIXELS = 1_500_000;

/**
 * The 9:16 gameplay rect centered in the stage. The origin stays fractional
 * (390x844 -> y=75.5) on purpose: rounding it leaves a one-pixel seam between
 * the GL background and the scene composite.
 */
export function computeGameRect(stageWidth: number, stageHeight: number): GameRect {
  const stage = computeStageSize(stageWidth, stageHeight);

  return {
    x: (stageWidth - stage.width) / 2,
    y: (stageHeight - stage.height) / 2,
    width: stage.width,
    height: stage.height,
  };
}

/**
 * Maps a 360x640 world coordinate into stage pixels. X and Y use independent
 * factors because computeStageSize rounds each axis to whole pixels.
 */
export function worldToStage(
  worldX: number,
  worldY: number,
  rect: GameRect
): { x: number; y: number } {
  return {
    x: rect.x + worldX * (rect.width / PHYSICS_CONSTANTS.CANVAS_WIDTH),
    y: rect.y + worldY * (rect.height / PHYSICS_CONSTANTS.CANVAS_HEIGHT),
  };
}

/**
 * Rounds the capture buffer to whole pixels, then scales both axes down when
 * the result exceeds MAX_CAPTURE_PIXELS. The downscale floors so the cap holds
 * exactly; rounding up can land one row over the ceiling.
 */
export function computeCaptureSize(
  gameRect: GameRect,
  captureDpr: number
): CaptureSize {
  let width = Math.max(1, Math.round(gameRect.width * captureDpr));
  let height = Math.max(1, Math.round(gameRect.height * captureDpr));

  if (width * height > MAX_CAPTURE_PIXELS) {
    const scale = Math.sqrt(MAX_CAPTURE_PIXELS / (width * height));
    width = Math.max(1, Math.floor(width * scale));
    height = Math.max(1, Math.floor(height * scale));
  }

  return { width, height };
}
