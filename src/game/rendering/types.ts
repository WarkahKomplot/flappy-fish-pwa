import type { FishEntity, GameStatus } from '../types';

export type QualityTier = 'high' | 'medium' | 'low' | 'off';

export type FxPreference = 'auto' | QualityTier;

export interface QualityProfile {
  tier: Exclude<QualityTier, 'off'>;
  captureDpr: number;
  postDpr: number;
  maxPostPixels: number;
  bloom: boolean;
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

export interface ObstacleSnapshot {
  x: number;
  width: number;
  topHeight: number;
  bottomY: number;
  pearl?: {
    x: number;
    y: number;
    visualY: number;
    radius: number;
    collected: boolean;
    missed: boolean;
  };
}

export interface SceneSnapshot {
  time: number;
  status: GameStatus;
  world: { width: number; height: number };
  fish: FishEntity;
  obstacles: ObstacleSnapshot[];
  shield: { active: boolean; activeTime: number };
  ribbon: { x: number; target: number; crossed: boolean };
  events: RenderEvent[];
}

export type RenderEventType =
  | 'pearl'
  | 'shield-activate'
  | 'shield-pop'
  | 'hit'
  | 'best';

export interface RenderEvent {
  type: RenderEventType;
  x: number;
  y: number;
  t: number;
}
