import type { PostFXBackend } from './backend';
import type { GameRect } from './geometry';
import { getQualityProfile } from './quality';
import type {
  FxPreference,
  QualityProfile,
  QualityTier,
  SceneSnapshot,
} from './types';

interface StageDims {
  stageW: number;
  stageH: number;
  gameRect: GameRect;
}

/**
 * Owns the post-FX decisions: availability, tier/profile, measured stage, and
 * the fixed pass order. It makes no GL calls, so the orchestration can be
 * exercised with a fake backend and the WebGL implementation stays in one
 * place. A missing/off profile makes every render a no-op, which is the exact
 * Canvas 2D fallback.
 */
export class PostFXController {
  private readonly backend: PostFXBackend;
  private readonly reducedMotion: boolean;
  private readonly onTierChange?: (tier: QualityTier) => void;

  private available = false;
  private preference: FxPreference = 'auto';
  private autoTier: QualityTier = 'off';
  private dims: StageDims | null = null;
  private currentProfile: QualityProfile | null = null;

  constructor(
    backend: PostFXBackend,
    options: {
      reducedMotion: boolean;
      onTierChange?: (tier: QualityTier) => void;
    }
  ) {
    this.backend = backend;
    this.reducedMotion = options.reducedMotion;
    this.onTierChange = options.onTierChange;
  }

  /**
   * Attempts to bring up the backend once. A false result permanently marks
   * this controller unavailable (until another init succeeds) and reports Off.
   */
  init(fxCanvas: HTMLCanvasElement, sceneCanvas: HTMLCanvasElement): boolean {
    this.available = this.backend.init(fxCanvas, sceneCanvas);

    if (!this.available) {
      this.currentProfile = null;
      this.onTierChange?.('off');
      return false;
    }

    return true;
  }

  /**
   * Resolves `auto` against the caller-selected auto tier, recomputes the
   * profile (reduced motion is applied here), reports the effective tier, and
   * reallocates backend resources if the stage has already been measured.
   */
  setPreference(pref: FxPreference, autoTier: QualityTier): void {
    this.preference = pref;
    this.autoTier = autoTier;

    const tier = this.preference === 'auto' ? this.autoTier : this.preference;
    this.currentProfile = getQualityProfile(tier, this.reducedMotion);

    this.onTierChange?.(tier);

    if (this.dims && this.available && this.currentProfile) {
      this.backend.resize(
        this.dims.stageW,
        this.dims.stageH,
        this.dims.gameRect,
        this.currentProfile
      );
    }
  }

  get tier(): QualityTier {
    return this.currentProfile?.tier ?? 'off';
  }

  get profile(): QualityProfile | null {
    return this.currentProfile;
  }

  /**
   * Remembers the measured stage so a later preference change can resize
   * without the caller replaying the observation.
   */
  resize(stageW: number, stageH: number, gameRect: GameRect): void {
    this.dims = { stageW, stageH, gameRect };

    if (this.available && this.currentProfile) {
      this.backend.resize(stageW, stageH, gameRect, this.currentProfile);
    }
  }

  /**
   * Runs one frame: begin → background → scene → optional effects → optional
   * bloom → composite → end. Effects and bloom are gated by the profile, so
   * the same call site serves every tier.
   */
  render(snapshot: SceneSnapshot): void {
    const profile = this.currentProfile;

    if (!this.available || !profile) {
      return;
    }

    this.backend.beginFrame(snapshot, profile);
    this.backend.background(snapshot, profile);
    this.backend.scene(snapshot, profile);

    if (profile.effects) {
      this.backend.effects(snapshot, profile);
    }

    if (profile.bloom) {
      this.backend.bloom(snapshot, profile);
    }

    this.backend.composite(snapshot, profile);
    this.backend.endFrame();
  }

  /**
   * Releases GPU resources and turns every later render into a no-op. The
   * backend object itself is not reused after this.
   */
  dispose(): void {
    this.backend.dispose();
    this.available = false;
    this.currentProfile = null;
    this.dims = null;
  }
}
