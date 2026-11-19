import type { GameRect } from './geometry';
import type { QualityProfile, SceneSnapshot } from './types';

/**
 * The GPU-facing half of the compositor. Every method receives the frame
 * contract explicitly so the backend stays stateless between passes except
 * for GL resources, and so `PostFXController` can drive pass order without
 * knowing anything about WebGL.
 */
export interface PostFXBackend {
  init(fxCanvas: HTMLCanvasElement, sceneCanvas: HTMLCanvasElement): boolean;
  resize(
    stageW: number,
    stageH: number,
    gameRect: GameRect,
    profile: QualityProfile
  ): void;
  beginFrame(snapshot: SceneSnapshot, profile: QualityProfile): void;
  background(snapshot: SceneSnapshot, profile: QualityProfile): void;
  scene(snapshot: SceneSnapshot, profile: QualityProfile): void;
  effects(snapshot: SceneSnapshot, profile: QualityProfile): void;
  bloom(snapshot: SceneSnapshot, profile: QualityProfile): void;
  composite(snapshot: SceneSnapshot, profile: QualityProfile): void;
  endFrame(): void;
  dispose(): void;
}
