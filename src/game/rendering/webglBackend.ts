import type { PostFXBackend } from './backend';
import type { GameRect } from './geometry';
import type { QualityProfile, SceneSnapshot } from './types';
import {
  createFbo,
  createProgram,
  createQuad,
  createTexture,
  uploadCanvas,
  type Framebuffer,
  type Quad,
} from './glUtils';
import backgroundVertSource from './shaders/background.vert?raw';
import backgroundFragSource from './shaders/background.frag?raw';
import sceneVertSource from './shaders/scene.vert?raw';
import sceneFragSource from './shaders/scene.frag?raw';
import brightFragSource from './shaders/bright.frag?raw';
import blurFragSource from './shaders/blur.frag?raw';
import compositeFragSource from './shaders/composite.frag?raw';

interface BackgroundUniforms {
  resolution: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  gameRect: WebGLUniformLocation | null;
  world: WebGLUniformLocation | null;
}

interface SceneUniforms {
  scene: WebGLUniformLocation | null;
  gameRect: WebGLUniformLocation | null;
  resolution: WebGLUniformLocation | null;
  sceneSize: WebGLUniformLocation | null;
}

interface BrightUniforms {
  scene: WebGLUniformLocation | null;
  threshold: WebGLUniformLocation | null;
  headroom: WebGLUniformLocation | null;
}

interface BlurUniforms {
  image: WebGLUniformLocation | null;
  texelSize: WebGLUniformLocation | null;
  direction: WebGLUniformLocation | null;
  weight: WebGLUniformLocation | null;
}

interface CompositeUniforms {
  scene: WebGLUniformLocation | null;
  bloom: WebGLUniformLocation | null;
  resolution: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  exposure: WebGLUniformLocation | null;
  bloomScale: WebGLUniformLocation | null;
  bloomStrength: WebGLUniformLocation | null;
  bloomEnabled: WebGLUniformLocation | null;
  vignette: WebGLUniformLocation | null;
  grain: WebGLUniformLocation | null;
  ca: WebGLUniformLocation | null;
  dither: WebGLUniformLocation | null;
  gradeStrength: WebGLUniformLocation | null;
  gradeShadow: WebGLUniformLocation | null;
  gradeHighlight: WebGLUniformLocation | null;
}

/** Cold deep-water clear so a dropped pass can never flash a bright frame. */
const CLEAR_R = 0.002;
const CLEAR_G = 0.006;
const CLEAR_B = 0.014;

/** Bloom chain: threshold in linear light, three mips, 9-tap separable blur. */
const BLOOM_THRESHOLD = 0.8;
const BLOOM_MIPS = 3;
const BLOOM_STRENGTH = 0.55;
const BLOOM_UPSAMPLE_WEIGHT = 0.5;

/** Composite defaults from the approved plan/spec. */
const EXPOSURE = 1.1;
const VIGNETTE = 0.25;
const GRAIN = 0.03;
const CHROMATIC_ABERRATION = 0.0015;
const DITHER_SCALE = 1 / 255;
const GRADE_STRENGTH = 1.0;
const GRADE_SHADOW = { r: 0.9, g: 1.0, b: 1.08, pivot: 0.05 };
const GRADE_HIGHLIGHT = { r: 1.08, g: 1.0, b: 0.9, pivot: 0.9 };

/**
 * Half-float colour targets need a color-renderable extension in WebGL2.
 * When neither is exposed (notably the iOS RGBA8 assumption) the backend
 * falls back to RGBA8 + 4x bloom headroom + an ordered output dither.
 */
function supportsHalfFloatTargets(gl: WebGL2RenderingContext): boolean {
  if (typeof gl.getExtension !== 'function') {
    return false;
  }

  try {
    return (
      gl.getExtension('EXT_color_buffer_half_float') !== null ||
      gl.getExtension('EXT_color_buffer_float') !== null
    );
  } catch {
    return false;
  }
}

/**
 * WebGL2 compositor backend: a procedural full-bleed background, the Canvas
 * 2D scene captured into an SRGB8_ALPHA8 texture and composited into the 9:16
 * rect with premultiplied alpha, a bright/blur bloom mip chain, then an
 * ACES-tonemapped grade that encodes linear->sRGB explicitly.
 *
 * The scene and bloom targets are RGBA16F when the driver exposes a
 * color-renderable half-float extension, otherwise RGBA8. `effects()` stays a
 * no-op until Task 9 so the controller's pass order is already wired.
 */
export class WebGLBackend implements PostFXBackend {
  private gl: WebGL2RenderingContext | null = null;
  private fxCanvas: HTMLCanvasElement | null = null;
  private sceneCanvas: HTMLCanvasElement | null = null;

  private backgroundProgram: WebGLProgram | null = null;
  private sceneProgram: WebGLProgram | null = null;
  private brightProgram: WebGLProgram | null = null;
  private blurProgram: WebGLProgram | null = null;
  private compositeProgram: WebGLProgram | null = null;
  private quad: Quad | null = null;
  private sceneTexture: WebGLTexture | null = null;
  private sceneFbo: Framebuffer | null = null;
  private bloomFbos: Framebuffer[] = [];
  private bloomTemps: Framebuffer[] = [];

  private backgroundUniforms: BackgroundUniforms | null = null;
  private sceneUniforms: SceneUniforms | null = null;
  private brightUniforms: BrightUniforms | null = null;
  private blurUniforms: BlurUniforms | null = null;
  private compositeUniforms: CompositeUniforms | null = null;

  private stageWidth = 0;
  private stageHeight = 0;
  private postWidth = 0;
  private postHeight = 0;
  private gameRect: GameRect = { x: 0, y: 0, width: 0, height: 0 };

  /** True when the scene/bloom FBOs are RGBA16F rather than RGBA8. */
  private halfFloatTargets = false;
  /** True only if this frame actually ran the bright/blur bloom chain. */
  private bloomThisFrame = false;

  /**
   * Brings up the context, programs and static geometry. Every failure —
   * missing context, an unusable context object (the 2D-shaped mock), a
   * shader/link error, a bad FBO — returns false instead of throwing so the
   * caller can reveal the Canvas 2D scene.
   */
  public init(fxCanvas: HTMLCanvasElement, sceneCanvas: HTMLCanvasElement): boolean {
    if (this.gl) {
      return true;
    }

    try {
      const gl = fxCanvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance',
      });

      if (
        !gl ||
        typeof gl.createShader !== 'function' ||
        typeof gl.createProgram !== 'function'
      ) {
        return false;
      }

      this.gl = gl;
      this.fxCanvas = fxCanvas;
      this.sceneCanvas = sceneCanvas;
      this.halfFloatTargets = supportsHalfFloatTargets(gl);

      this.backgroundProgram = createProgram(
        gl,
        backgroundVertSource,
        backgroundFragSource
      );
      this.sceneProgram = createProgram(gl, sceneVertSource, sceneFragSource);
      this.brightProgram = createProgram(
        gl,
        backgroundVertSource,
        brightFragSource
      );
      this.blurProgram = createProgram(gl, backgroundVertSource, blurFragSource);
      this.compositeProgram = createProgram(
        gl,
        backgroundVertSource,
        compositeFragSource
      );

      this.quad = createQuad(gl);
      this.sceneTexture = createTexture(gl);

      this.backgroundUniforms = {
        resolution: gl.getUniformLocation(this.backgroundProgram, 'uResolution'),
        time: gl.getUniformLocation(this.backgroundProgram, 'uTime'),
        gameRect: gl.getUniformLocation(this.backgroundProgram, 'uGameRect'),
        world: gl.getUniformLocation(this.backgroundProgram, 'uWorld'),
      };
      this.sceneUniforms = {
        scene: gl.getUniformLocation(this.sceneProgram, 'uScene'),
        gameRect: gl.getUniformLocation(this.sceneProgram, 'uGameRect'),
        resolution: gl.getUniformLocation(this.sceneProgram, 'uResolution'),
        sceneSize: gl.getUniformLocation(this.sceneProgram, 'uSceneSize'),
      };
      this.brightUniforms = {
        scene: gl.getUniformLocation(this.brightProgram, 'uScene'),
        threshold: gl.getUniformLocation(this.brightProgram, 'uThreshold'),
        headroom: gl.getUniformLocation(this.brightProgram, 'uHeadroom'),
      };
      this.blurUniforms = {
        image: gl.getUniformLocation(this.blurProgram, 'uImage'),
        texelSize: gl.getUniformLocation(this.blurProgram, 'uTexelSize'),
        direction: gl.getUniformLocation(this.blurProgram, 'uDirection'),
        weight: gl.getUniformLocation(this.blurProgram, 'uWeight'),
      };
      this.compositeUniforms = {
        scene: gl.getUniformLocation(this.compositeProgram, 'uScene'),
        bloom: gl.getUniformLocation(this.compositeProgram, 'uBloom'),
        resolution: gl.getUniformLocation(this.compositeProgram, 'uResolution'),
        time: gl.getUniformLocation(this.compositeProgram, 'uTime'),
        exposure: gl.getUniformLocation(this.compositeProgram, 'uExposure'),
        bloomScale: gl.getUniformLocation(this.compositeProgram, 'uBloomScale'),
        bloomStrength: gl.getUniformLocation(
          this.compositeProgram,
          'uBloomStrength'
        ),
        bloomEnabled: gl.getUniformLocation(
          this.compositeProgram,
          'uBloomEnabled'
        ),
        vignette: gl.getUniformLocation(this.compositeProgram, 'uVignette'),
        grain: gl.getUniformLocation(this.compositeProgram, 'uGrain'),
        ca: gl.getUniformLocation(this.compositeProgram, 'uCA'),
        dither: gl.getUniformLocation(this.compositeProgram, 'uDither'),
        gradeStrength: gl.getUniformLocation(
          this.compositeProgram,
          'uGradeStrength'
        ),
        gradeShadow: gl.getUniformLocation(this.compositeProgram, 'uGradeShadow'),
        gradeHighlight: gl.getUniformLocation(
          this.compositeProgram,
          'uGradeHighlight'
        ),
      };

      return true;
    } catch {
      this.dispose();
      return false;
    }
  }

  /**
   * Sizes the FX drawing buffer from the measured stage and the tier's
   * postDpr, capped by `maxPostPixels`, then reallocates the scene FBO and the
   * bloom mip chain. The default framebuffer is presented 1:1 with this
   * buffer.
   */
  public resize(
    stageW: number,
    stageH: number,
    gameRect: GameRect,
    profile: QualityProfile
  ): void {
    const gl = this.gl;
    const fxCanvas = this.fxCanvas;

    if (!gl || !fxCanvas || !(stageW > 0) || !(stageH > 0)) {
      return;
    }

    this.stageWidth = stageW;
    this.stageHeight = stageH;
    this.gameRect = gameRect;

    let width = Math.max(1, Math.round(stageW * profile.postDpr));
    let height = Math.max(1, Math.round(stageH * profile.postDpr));
    if (width * height > profile.maxPostPixels) {
      const scale = Math.sqrt(profile.maxPostPixels / (width * height));
      width = Math.max(1, Math.floor(width * scale));
      height = Math.max(1, Math.floor(height * scale));
    }

    this.postWidth = width;
    this.postHeight = height;

    fxCanvas.width = width;
    fxCanvas.height = height;

    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    this.releaseTargets();

    try {
      this.allocateTargets(width, height, profile.bloom);
    } catch (error) {
      // The extension can be advertised but still reject a complete RGBA16F
      // target; degrade to the RGBA8 + dither path rather than failing FX.
      this.releaseTargets();
      if (!this.halfFloatTargets) {
        throw error;
      }
      this.halfFloatTargets = false;
      this.allocateTargets(width, height, profile.bloom);
    }

    this.bloomThisFrame = false;
  }

  /** Binds the linear scene FBO and clears it to deep water. */
  public beginFrame(_snapshot: SceneSnapshot, _profile: QualityProfile): void {
    const gl = this.gl;
    const fbo = this.sceneFbo;
    if (!gl || !fbo) {
      return;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.framebuffer);
    gl.viewport(0, 0, this.postWidth, this.postHeight);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(CLEAR_R, CLEAR_G, CLEAR_B, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    this.bloomThisFrame = false;
  }

  /** Full-bleed procedural background, evaluated in world coordinates. */
  public background(snapshot: SceneSnapshot, _profile: QualityProfile): void {
    const gl = this.gl;
    const program = this.backgroundProgram;
    const quad = this.quad;
    const uniforms = this.backgroundUniforms;

    if (!gl || !program || !quad || !uniforms) {
      return;
    }

    gl.disable(gl.BLEND);
    gl.useProgram(program);

    const rect = this.deviceGameRect();
    gl.uniform2f(uniforms.resolution, this.postWidth, this.postHeight);
    gl.uniform1f(uniforms.time, snapshot.time);
    gl.uniform4f(uniforms.gameRect, rect.x, rect.y, rect.width, rect.height);
    gl.uniform2f(uniforms.world, snapshot.world.width, snapshot.world.height);

    this.drawQuad(gl, quad);
  }

  /** Uploads and draws the Canvas 2D capture into the game rect. */
  public scene(_snapshot: SceneSnapshot, _profile: QualityProfile): void {
    const gl = this.gl;
    const program = this.sceneProgram;
    const quad = this.quad;
    const uniforms = this.sceneUniforms;
    const sceneCanvas = this.sceneCanvas;
    const texture = this.sceneTexture;

    if (!gl || !program || !quad || !uniforms || !sceneCanvas || !texture) {
      return;
    }

    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    uploadCanvas(gl, texture, sceneCanvas);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(uniforms.scene, 0);
    gl.uniform2f(uniforms.sceneSize, sceneCanvas.width, sceneCanvas.height);

    const rect = this.deviceGameRect();
    gl.uniform4f(uniforms.gameRect, rect.x, rect.y, rect.width, rect.height);
    gl.uniform2f(uniforms.resolution, this.postWidth, this.postHeight);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    this.drawQuad(gl, quad);
  }

  /** Task 9 owns the glow/particle/shield passes. */
  public effects(_snapshot: SceneSnapshot, _profile: QualityProfile): void {
    // Intentionally empty until Task 9.
  }

  /**
   * Bright pass into mip 0, a separable 9-tap Gaussian per mip (each pass is
   * also the downsample), then an additive upsample from the coarsest mip
   * back to mip 0, which the composite samples.
   */
  public bloom(_snapshot: SceneSnapshot, _profile: QualityProfile): void {
    const gl = this.gl;
    const sceneFbo = this.sceneFbo;
    const quad = this.quad;
    const bright = this.brightUniforms;
    const blurUniforms = this.blurUniforms;
    const brightProgram = this.brightProgram;
    const blurProgram = this.blurProgram;

    if (
      !gl ||
      !sceneFbo ||
      !quad ||
      !bright ||
      !blurUniforms ||
      !brightProgram ||
      !blurProgram ||
      this.bloomFbos.length !== BLOOM_MIPS ||
      this.bloomTemps.length !== BLOOM_MIPS
    ) {
      return;
    }

    gl.disable(gl.BLEND);

    // Threshold the linear scene into the half-resolution head mip.
    const head = this.bloomFbos[0];
    this.bindTarget(gl, head);
    gl.useProgram(brightProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneFbo.texture);
    gl.uniform1i(bright.scene, 0);
    gl.uniform1f(bright.threshold, BLOOM_THRESHOLD);
    // RGBA8 stores min(color, 4) / 4; half-float keeps the raw value.
    gl.uniform1f(bright.headroom, this.halfFloatTargets ? 1 : 4);
    this.drawQuad(gl, quad);

    // Blur H then V at every level. The target texel size widens the kernel
    // as the mip shrinks, so level i is built from level i-1.
    for (let i = 0; i < BLOOM_MIPS; i++) {
      const source = i === 0 ? head : this.bloomFbos[i - 1];
      const temp = this.bloomTemps[i];
      const mip = this.bloomFbos[i];

      this.blurPass(gl, quad, source, temp, 1, 0, temp.width, temp.height, 1);
      this.blurPass(gl, quad, temp, mip, 0, 1, mip.width, mip.height, 1);
    }

    // Additive upsample: mip 2 -> mip 1 -> mip 0. The composite samples
    // mip 0, so the coarser glow is folded back into the head level.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(blurProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(blurUniforms.image, 0);
    gl.uniform2f(blurUniforms.direction, 0, 0);
    gl.uniform1f(blurUniforms.weight, BLOOM_UPSAMPLE_WEIGHT);

    for (let i = BLOOM_MIPS - 1; i >= 1; i--) {
      const target = this.bloomFbos[i - 1];
      const source = this.bloomFbos[i];

      this.bindTarget(gl, target);
      gl.bindTexture(gl.TEXTURE_2D, source.texture);
      gl.uniform2f(blurUniforms.texelSize, 1 / source.width, 1 / source.height);
      this.drawQuad(gl, quad);
    }

    gl.disable(gl.BLEND);
    this.bloomThisFrame = true;
  }

  /**
   * Final pass: scene + bloom, exposure 1.1, ACES, teal/warm grade, vignette
   * 0.25, profile-gated grain 0.03 and CA 0.0015, ordered dither on RGBA8,
   * then the exact linear->sRGB encode.
   */
  public composite(snapshot: SceneSnapshot, profile: QualityProfile): void {
    const gl = this.gl;
    const fbo = this.sceneFbo;
    const quad = this.quad;
    const program = this.compositeProgram;
    const uniforms = this.compositeUniforms;

    if (!gl || !fbo || !quad || !program || !uniforms) {
      return;
    }

    // Bloom targets only exist on bloom tiers. Without them, bind the scene
    // texture as a safe dummy and let uBloomEnabled skip the sample.
    const hasBloom = this.bloomThisFrame && this.bloomFbos.length > 0;
    const bloomTexture = hasBloom ? this.bloomFbos[0].texture : fbo.texture;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.postWidth, this.postHeight);
    gl.disable(gl.BLEND);
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fbo.texture);
    gl.uniform1i(uniforms.scene, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloomTexture);
    gl.uniform1i(uniforms.bloom, 1);

    gl.uniform2f(uniforms.resolution, this.postWidth, this.postHeight);
    gl.uniform1f(uniforms.time, snapshot.time);
    gl.uniform1f(uniforms.exposure, EXPOSURE);
    gl.uniform1f(uniforms.bloomScale, this.halfFloatTargets ? 1 : 4);
    gl.uniform1f(uniforms.bloomStrength, BLOOM_STRENGTH);
    gl.uniform1f(uniforms.bloomEnabled, hasBloom ? 1 : 0);
    gl.uniform1f(uniforms.vignette, VIGNETTE);
    gl.uniform1f(uniforms.grain, profile.grain ? GRAIN : 0);
    gl.uniform1f(
      uniforms.ca,
      profile.chromaticAberration ? CHROMATIC_ABERRATION : 0
    );
    gl.uniform1f(uniforms.dither, this.halfFloatTargets ? 0 : DITHER_SCALE);
    gl.uniform1f(uniforms.gradeStrength, GRADE_STRENGTH);
    gl.uniform4f(
      uniforms.gradeShadow,
      GRADE_SHADOW.r,
      GRADE_SHADOW.g,
      GRADE_SHADOW.b,
      GRADE_SHADOW.pivot
    );
    gl.uniform4f(
      uniforms.gradeHighlight,
      GRADE_HIGHLIGHT.r,
      GRADE_HIGHLIGHT.g,
      GRADE_HIGHLIGHT.b,
      GRADE_HIGHLIGHT.pivot
    );

    this.drawQuad(gl, quad);

    // Leave a conventional active unit for any later pass.
    gl.activeTexture(gl.TEXTURE0);
  }

  public endFrame(): void {
    // All passes target their own framebuffers; nothing deferred.
  }

  /**
   * Releases every GL object. Safe before init, after a partial init, and on
   * repeated calls; the GameCanvas fallback path relies on that.
   */
  public dispose(): void {
    const gl = this.gl;

    if (gl) {
      try {
        this.releaseTargets();
        if (this.sceneTexture) {
          gl.deleteTexture(this.sceneTexture);
        }
        if (this.quad) {
          gl.deleteBuffer(this.quad.buffer);
          gl.deleteVertexArray(this.quad.vao);
        }
        if (this.backgroundProgram) {
          gl.deleteProgram(this.backgroundProgram);
        }
        if (this.sceneProgram) {
          gl.deleteProgram(this.sceneProgram);
        }
        if (this.brightProgram) {
          gl.deleteProgram(this.brightProgram);
        }
        if (this.blurProgram) {
          gl.deleteProgram(this.blurProgram);
        }
        if (this.compositeProgram) {
          gl.deleteProgram(this.compositeProgram);
        }
      } catch {
        // Best effort: a lost context can reject deletes. The caller is
        // already on the Canvas 2D path.
      }
    }

    this.gl = null;
    this.fxCanvas = null;
    this.sceneCanvas = null;
    this.backgroundProgram = null;
    this.sceneProgram = null;
    this.brightProgram = null;
    this.blurProgram = null;
    this.compositeProgram = null;
    this.quad = null;
    this.sceneTexture = null;
    this.sceneFbo = null;
    this.bloomFbos = [];
    this.bloomTemps = [];
    this.backgroundUniforms = null;
    this.sceneUniforms = null;
    this.brightUniforms = null;
    this.blurUniforms = null;
    this.compositeUniforms = null;
    this.stageWidth = 0;
    this.stageHeight = 0;
    this.postWidth = 0;
    this.postHeight = 0;
    this.gameRect = { x: 0, y: 0, width: 0, height: 0 };
    this.halfFloatTargets = false;
    this.bloomThisFrame = false;
  }

  /**
   * Allocates the scene target and, when the profile enables bloom, the
   * bloom ping-pong chain in the currently selected format. Throws if any
   * target is incomplete so `resize` can degrade to RGBA8. The tier can
   * switch at runtime, so `resize` reallocates when `withBloom` changes.
   */
  private allocateTargets(
    width: number,
    height: number,
    withBloom: boolean
  ): void {
    const gl = this.gl;
    if (!gl) {
      throw new Error('WebGL context is not initialised');
    }

    const internalFormat = this.halfFloatTargets ? gl.RGBA16F : gl.RGBA8;
    const type = this.halfFloatTargets ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

    this.sceneFbo = createFbo(gl, width, height, internalFormat, type);

    if (!withBloom) {
      return;
    }

    for (let i = 0; i < BLOOM_MIPS; i++) {
      const divisor = 1 << (i + 1);
      const mipWidth = Math.max(1, Math.floor(width / divisor));
      const mipHeight = Math.max(1, Math.floor(height / divisor));

      this.bloomFbos.push(
        createFbo(gl, mipWidth, mipHeight, internalFormat, type)
      );
      this.bloomTemps.push(
        createFbo(gl, mipWidth, mipHeight, internalFormat, type)
      );
    }
  }

  /** Deletes the scene/bloom framebuffers and their colour textures. */
  private releaseTargets(): void {
    const gl = this.gl;

    if (gl) {
      try {
        const targets: Array<Framebuffer | null> = [
          this.sceneFbo,
          ...this.bloomFbos,
          ...this.bloomTemps,
        ];
        for (const target of targets) {
          if (!target) {
            continue;
          }
          gl.deleteFramebuffer(target.framebuffer);
          gl.deleteTexture(target.texture);
        }
      } catch {
        // A lost context can reject deletes; drop the references anyway.
      }
    }

    this.sceneFbo = null;
    this.bloomFbos = [];
    this.bloomTemps = [];
  }

  private bindTarget(gl: WebGL2RenderingContext, target: Framebuffer): void {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
  }

  private blurPass(
    gl: WebGL2RenderingContext,
    quad: Quad,
    source: Framebuffer,
    target: Framebuffer,
    dirX: number,
    dirY: number,
    texelWidth: number,
    texelHeight: number,
    weight: number
  ): void {
    const uniforms = this.blurUniforms;
    const program = this.blurProgram;

    if (!uniforms || !program) {
      return;
    }

    this.bindTarget(gl, target);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source.texture);
    gl.uniform1i(uniforms.image, 0);
    gl.uniform2f(uniforms.texelSize, 1 / texelWidth, 1 / texelHeight);
    gl.uniform2f(uniforms.direction, dirX, dirY);
    gl.uniform1f(uniforms.weight, weight);
    this.drawQuad(gl, quad);
  }

  private drawQuad(gl: WebGL2RenderingContext, quad: Quad): void {
    gl.bindVertexArray(quad.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  /**
   * Converts the fractional CSS/stage game rect into framebuffer pixels using
   * the actual (possibly pixel-capped) buffer size.
   */
  private deviceGameRect(): GameRect {
    const sx = this.stageWidth > 0 ? this.postWidth / this.stageWidth : 1;
    const sy = this.stageHeight > 0 ? this.postHeight / this.stageHeight : 1;

    return {
      x: this.gameRect.x * sx,
      y: this.gameRect.y * sy,
      width: this.gameRect.width * sx,
      height: this.gameRect.height * sy,
    };
  }
}
