import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getHighScore,
  saveHighScore,
  getLifetimePearls,
  addLifetimePearls,
  getActiveSkin,
  setActiveSkin,
  isSkinUnlocked,
  isAudioMuted,
  setAudioMuted,
} from '../src/game/storage';
import { STORAGE_KEYS, SKIN_DEFINITIONS } from '../src/game/constants';
import type { SkinId } from '../src/game/types';

describe('Storage Layer', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('High Score persistence', () => {
    it('defaults to 0 when storage is empty', () => {
      expect(getHighScore()).toBe(0);
    });

    it('saves and retrieves a new high score', () => {
      saveHighScore(42);
      expect(getHighScore()).toBe(42);
      expect(localStorage.getItem(STORAGE_KEYS.HIGH_SCORE)).toBe('42');
    });

    it('does not downgrade an existing high score if the new score is lower', () => {
      saveHighScore(50);
      saveHighScore(30);
      expect(getHighScore()).toBe(50);
    });

    it('updates high score when a strictly higher score is achieved', () => {
      saveHighScore(50);
      saveHighScore(75);
      expect(getHighScore()).toBe(75);
    });

    it('handles corrupted or non-numeric values gracefully by returning 0', () => {
      localStorage.setItem(STORAGE_KEYS.HIGH_SCORE, 'corrupted_abc');
      expect(getHighScore()).toBe(0);
    });

    it('handles negative stored values gracefully by returning 0', () => {
      localStorage.setItem(STORAGE_KEYS.HIGH_SCORE, '-10');
      expect(getHighScore()).toBe(0);
    });
  });

  describe('Lifetime Pearls persistence', () => {
    it('defaults to 0 when storage is empty', () => {
      expect(getLifetimePearls()).toBe(0);
    });

    it('adds pearls cumulatively and returns the new total', () => {
      const firstTotal = addLifetimePearls(15);
      expect(firstTotal).toBe(15);
      expect(getLifetimePearls()).toBe(15);

      const secondTotal = addLifetimePearls(10);
      expect(secondTotal).toBe(25);
      expect(getLifetimePearls()).toBe(25);
      expect(localStorage.getItem(STORAGE_KEYS.LIFETIME_PEARLS)).toBe('25');
    });

    it('does not add negative count or NaN', () => {
      addLifetimePearls(10);
      const unchangedTotal = addLifetimePearls(-5);
      expect(unchangedTotal).toBe(10);
      expect(getLifetimePearls()).toBe(10);
    });

    it('handles corrupted storage data by falling back to 0', () => {
      localStorage.setItem(STORAGE_KEYS.LIFETIME_PEARLS, 'invalid_pearls');
      expect(getLifetimePearls()).toBe(0);
    });
  });

  describe('Skin unlocking & active skin management', () => {
    it('defaults active skin to neon-tetra', () => {
      const activeSkin: SkinId = getActiveSkin();
      expect(activeSkin).toBe('neon-tetra');
    });

    it('persists and retrieves chosen active skin', () => {
      setActiveSkin('clownfish');
      expect(getActiveSkin()).toBe('clownfish');
      expect(localStorage.getItem(STORAGE_KEYS.ACTIVE_SKIN)).toBe('clownfish');
    });

    it('falls back to neon-tetra if stored active skin is invalid', () => {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_SKIN, 'invalid-nonexistent-skin');
      expect(getActiveSkin()).toBe('neon-tetra');
    });

    it('verifies unlock thresholds matching milestone requirements', () => {
      expect(SKIN_DEFINITIONS['neon-tetra'].requiredPearls).toBe(0);
      expect(SKIN_DEFINITIONS['clownfish'].requiredPearls).toBe(50);
      expect(SKIN_DEFINITIONS['golden-manta'].requiredPearls).toBe(150);

      // Neon Tetra (0 required)
      expect(isSkinUnlocked('neon-tetra', 0)).toBe(true);
      expect(isSkinUnlocked('neon-tetra', 10)).toBe(true);

      // Clownfish (50 required)
      expect(isSkinUnlocked('clownfish', 0)).toBe(false);
      expect(isSkinUnlocked('clownfish', 49)).toBe(false);
      expect(isSkinUnlocked('clownfish', 50)).toBe(true);
      expect(isSkinUnlocked('clownfish', 100)).toBe(true);

      // Golden Manta (150 required)
      expect(isSkinUnlocked('golden-manta', 149)).toBe(false);
      expect(isSkinUnlocked('golden-manta', 150)).toBe(true);
      expect(isSkinUnlocked('golden-manta', 250)).toBe(true);
    });
  });

  describe('Audio Mute state', () => {
    it('defaults isAudioMuted to false', () => {
      expect(isAudioMuted()).toBe(false);
    });

    it('sets and retrieves muted state', () => {
      setAudioMuted(true);
      expect(isAudioMuted()).toBe(true);
      expect(localStorage.getItem(STORAGE_KEYS.MUTED)).toBe('true');

      setAudioMuted(false);
      expect(isAudioMuted()).toBe(false);
      expect(localStorage.getItem(STORAGE_KEYS.MUTED)).toBe('false');
    });
  });

  describe('Storage failure resilience (e.g. disabled cookies/private browsing)', () => {
    it('handles localStorage.getItem throwing an exception gracefully', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError: Access Denied');
      });

      expect(getHighScore()).toBe(0);
      expect(getLifetimePearls()).toBe(0);
      expect(getActiveSkin()).toBe('neon-tetra');
      expect(isAudioMuted()).toBe(false);
    });

    it('handles localStorage.setItem throwing an exception gracefully', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      expect(() => saveHighScore(100)).not.toThrow();
      expect(() => addLifetimePearls(10)).not.toThrow();
      expect(() => setActiveSkin('clownfish')).not.toThrow();
      expect(() => setAudioMuted(true)).not.toThrow();
    });
  });
});
