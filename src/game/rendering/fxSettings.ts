import type { FxPreference } from './types';

export const FX_STORAGE_KEY = 'flappy_fish_fx';

const FX_PREFERENCES: ReadonlySet<string> = new Set<FxPreference>([
  'auto',
  'high',
  'medium',
  'low',
  'off',
]);

export function isFxPreference(value: unknown): value is FxPreference {
  return typeof value === 'string' && FX_PREFERENCES.has(value);
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Reads the persisted FX choice. Missing storage, private-mode throws and
 * unknown values all resolve to Auto rather than breaking boot.
 */
export function loadFxPreference(storage?: Storage): FxPreference {
  const target = storage ?? defaultStorage();

  if (!target) {
    return 'auto';
  }

  try {
    const value = target.getItem(FX_STORAGE_KEY);
    return isFxPreference(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
}

export function saveFxPreference(pref: FxPreference, storage?: Storage): void {
  if (!isFxPreference(pref)) {
    return;
  }

  const target = storage ?? defaultStorage();

  if (!target) {
    return;
  }

  try {
    target.setItem(FX_STORAGE_KEY, pref);
  } catch {
    // Storage can be unavailable (private mode, quota); the session keeps
    // running with the in-memory choice.
  }
}

/**
 * `?fx=` applies to this session only. Anything outside the five valid values
 * is ignored, including an empty value.
 */
export function parseFxOverride(search: string): FxPreference | null {
  try {
    const value = new URLSearchParams(search).get('fx');
    return isFxPreference(value) ? value : null;
  } catch {
    return null;
  }
}

export function resolveFxPreference(
  override: FxPreference | null,
  stored: FxPreference
): FxPreference {
  return override ?? stored;
}
