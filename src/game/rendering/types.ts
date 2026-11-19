export type QualityTier = 'high' | 'medium' | 'low' | 'off';

export type FxPreference = 'auto' | QualityTier;

export interface QualityProfile {
  tier: Exclude<QualityTier, 'off'>;
  captureDpr: number;
  postDpr: number;
  maxPostPixels: number;
  bloom: boolean;
  godRays: boolean;
  chromaticAberration: boolean;
  grain: boolean;
  effects: boolean;
  particleCount: number;
  shake: boolean;
}

export interface QualityInput {
  webgl2: boolean;
  reducedMotion: boolean;
  hardwareConcurrency: number;
  deviceMemory?: number;
  isDesktop: boolean;
  override?: FxPreference | null;
}
