import { MEDAL_THRESHOLDS } from './constants';

export type MedalId = 'bronze' | 'silver' | 'gold';

/**
 * Milestone medal for a finished run, or null below the bronze threshold.
 * Higher thresholds win: a gold-eligible score is gold, not bronze.
 */
export function getMedal(score: number): MedalId | null {
  if (!Number.isFinite(score) || score <= 0) {
    return null;
  }
  if (score >= MEDAL_THRESHOLDS.gold) return 'gold';
  if (score >= MEDAL_THRESHOLDS.silver) return 'silver';
  if (score >= MEDAL_THRESHOLDS.bronze) return 'bronze';
  return null;
}
