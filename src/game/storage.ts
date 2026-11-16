import { STORAGE_KEYS, SKIN_DEFINITIONS } from './constants';
import type { SkinId } from './types';

const VALID_SKIN_IDS: SkinId[] = ['neon-tetra', 'clownfish', 'golden-manta'];

function isValidSkinId(value: unknown): value is SkinId {
  return typeof value === 'string' && VALID_SKIN_IDS.includes(value as SkinId);
}

export function getHighScore(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.HIGH_SCORE);
    if (!raw) return 0;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export function saveHighScore(score: number): void {
  try {
    if (!Number.isFinite(score) || score <= 0) return;
    const currentHigh = getHighScore();
    if (score > currentHigh) {
      localStorage.setItem(STORAGE_KEYS.HIGH_SCORE, Math.floor(score).toString());
    }
  } catch {
    // Graceful fallback when localStorage is disabled or throws QuotaExceededError
  }
}

export function getLifetimePearls(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LIFETIME_PEARLS);
    if (!raw) return 0;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export function addLifetimePearls(count: number): number {
  const current = getLifetimePearls();
  if (!Number.isFinite(count) || count <= 0) {
    return current;
  }

  const updated = current + Math.floor(count);
  try {
    localStorage.setItem(STORAGE_KEYS.LIFETIME_PEARLS, updated.toString());
  } catch {
    // Graceful fallback
  }
  return updated;
}

export function getActiveSkin(): SkinId {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACTIVE_SKIN);
    if (isValidSkinId(raw)) {
      return raw;
    }
  } catch {
    // Fall back to default skin on access error
  }
  return 'neon-tetra';
}

export function setActiveSkin(skin: SkinId): void {
  if (!isValidSkinId(skin)) return;
  try {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_SKIN, skin);
  } catch {
    // Graceful fallback
  }
}

export function isSkinUnlocked(skin: SkinId, lifetimePearls: number): boolean {
  const definition = SKIN_DEFINITIONS[skin];
  if (!definition) return false;
  return Number.isFinite(lifetimePearls) && lifetimePearls >= definition.requiredPearls;
}

export function isAudioMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.MUTED) === 'true';
  } catch {
    return false;
  }
}

export function setAudioMuted(muted: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.MUTED, muted ? 'true' : 'false');
  } catch {
    // Graceful fallback
  }
}
