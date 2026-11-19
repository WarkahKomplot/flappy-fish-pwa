import { describe, it, expect } from 'vitest';
import {
  FX_STORAGE_KEY,
  isFxPreference,
  loadFxPreference,
  parseFxOverride,
  resolveFxPreference,
  saveFxPreference,
} from '../../src/game/rendering/fxSettings';

describe('fx settings', () => {
  it('defaults invalid or missing preferences to auto', () => {
    const s = window.localStorage;
    s.clear();
    expect(loadFxPreference(s)).toBe('auto');
    s.setItem(FX_STORAGE_KEY, 'ultra');
    expect(loadFxPreference(s)).toBe('auto');
  });

  it('round-trips a preference', () => {
    saveFxPreference('low', localStorage);
    expect(loadFxPreference(localStorage)).toBe('low');
  });

  it('parses ?fx= and ignores invalid values', () => {
    expect(parseFxOverride('?fx=medium')).toBe('medium');
    expect(parseFxOverride('?fx=off')).toBe('off');
    expect(parseFxOverride('?fx=nope')).toBeNull();
    expect(parseFxOverride('')).toBeNull();
  });

  it('validates preferences and resolves URL precedence', () => {
    expect(isFxPreference('auto')).toBe(true);
    expect(isFxPreference('high')).toBe(true);
    expect(isFxPreference('ultra')).toBe(false);
    expect(isFxPreference(null)).toBe(false);
    expect(isFxPreference(undefined)).toBe(false);
    expect(resolveFxPreference('high', 'low')).toBe('high');
    expect(resolveFxPreference(null, 'low')).toBe('low');
  });
});
