import type { QualityInput, QualityProfile, QualityTier } from './types';

type GlTier = Exclude<QualityTier, 'off'>;

/**
 * Visual budgets per GL tier. Capture is what the 2D scene buffer is rendered
 * at (engine.resize DPR); post is what the WebGL2 compositor allocates. The
 * pixel cap is a memory ceiling for the post chain and is the same on every
 * tier because a lower postDpr already stays well below it.
 */
export const QUALITY_PROFILES: Record<GlTier, QualityProfile> = {
  high: {
    tier: 'high',
    captureDpr: 1.5,
    postDpr: 2,
    maxPostPixels: 2_200_000,
    bloom: true,
    chromaticAberration: true,
    grain: true,
    effects: true,
    particleCount: 180,
    shake: true,
  },
  medium: {
    tier: 'medium',
    captureDpr: 1.0,
    postDpr: 1.5,
    maxPostPixels: 2_200_000,
    bloom: true,
    chromaticAberration: false,
    grain: false,
    effects: true,
    particleCount: 90,
    shake: true,
  },
  low: {
    tier: 'low',
    captureDpr: 0.75,
    postDpr: 1.0,
    maxPostPixels: 2_200_000,
    bloom: false,
    chromaticAberration: false,
    grain: false,
    effects: false,
    particleCount: 40,
    shake: false,
  },
};

/**
 * Picks the starting tier. WebGL2 availability always wins (a tier we cannot
 * render is Off); an explicit manual choice outranks the hardware heuristics;
 * Auto starts desktop and capable mobile on High, weak mobile on Low, and
 * everything else on Medium. Motion sensitivity never changes the tier, only
 * the effects inside it.
 */
export function selectQuality(input: QualityInput): QualityTier {
  if (!input.webgl2) {
    return 'off';
  }

  if (input.override && input.override !== 'auto') {
    return input.override;
  }

  if (input.isDesktop) {
    return 'high';
  }

  const { hardwareConcurrency, deviceMemory: memory } = input;

  // deviceMemory is a Chrome-only hint. An unknown value is no signal in
  // either direction: it must not count toward High or toward Low (the old
  // `?? 4` / `?? 8` defaults read as contradictory even though they behaved
  // this way).
  if (hardwareConcurrency >= 8 && memory !== undefined && memory >= 6) {
    return 'high';
  }

  if (hardwareConcurrency <= 4 || (memory !== undefined && memory <= 4)) {
    return 'low';
  }

  return 'medium';
}

export function getQualityProfile(
  tier: QualityTier,
  reducedMotion: boolean
): QualityProfile | null {
  if (tier === 'off') {
    return null;
  }

  const profile = QUALITY_PROFILES[tier];

  if (!reducedMotion) {
    return { ...profile };
  }

  return {
    ...profile,
    shake: false,
    chromaticAberration: false,
    grain: false,
  };
}

/**
 * Adaptive ladder: one step down when the p95 frame time misses 20 ms, never
 * a step up, and Off stays Off.
 */
export function nextTier(current: QualityTier, p95Ms: number): QualityTier {
  if (current === 'off' || p95Ms <= 20) {
    return current;
  }

  switch (current) {
    case 'high':
      return 'medium';
    case 'medium':
      return 'low';
    case 'low':
      return 'off';
  }
}
