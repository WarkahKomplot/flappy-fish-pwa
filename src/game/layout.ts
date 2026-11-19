import { PHYSICS_CONSTANTS } from './constants';

export interface StageSize {
  width: number;
  height: number;
}

/**
 * Fits the fixed 360x640 game world into the available viewport without
 * distorting it.
 *
 * The canvas used to be stretched to fill the container, which scaled X and Y
 * by different factors (about +22% vertical stretch on a 390x844 phone) and
 * turned every circle - fish eye, pearls - into an ellipse. We now pick the
 * largest 9:16 rectangle that fits and leave the rest as letterbox bars; the
 * engine's X/Y scale factors stay equal.
 *
 * Falls back to the native world size when the container is not measured yet
 * (e.g. jsdom or the first frame before layout).
 */
export function computeStageSize(
  availableWidth: number,
  availableHeight: number
): StageSize {
  const worldWidth = PHYSICS_CONSTANTS.CANVAS_WIDTH;
  const worldHeight = PHYSICS_CONSTANTS.CANVAS_HEIGHT;

  const valid =
    Number.isFinite(availableWidth) &&
    Number.isFinite(availableHeight) &&
    availableWidth > 0 &&
    availableHeight > 0;

  if (!valid) {
    return { width: worldWidth, height: worldHeight };
  }

  const scale = Math.min(availableWidth / worldWidth, availableHeight / worldHeight);

  return {
    width: Math.max(1, Math.round(worldWidth * scale)),
    height: Math.max(1, Math.round(worldHeight * scale)),
  };
}
