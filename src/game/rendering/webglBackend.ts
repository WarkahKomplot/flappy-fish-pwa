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
import spriteVertSource from './shaders/sprite.vert?raw';
import particleVertSource from './shaders/particle.vert?raw';
import effectsFragSource from './shaders/effects.frag?raw';

interface BackgroundUniforms {
  resolution: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  gameRect: WebGLUniformLocation | null;
  world: WebGLUniformLocation | null;
  shake: WebGLUniformLocation | null;
}

interface SceneUniforms {
  scene: WebGLUniformLocation | null;
  gameRect: WebGLUniformLocation | null;
  resolution: WebGLUniformLocation | null;
  sceneSize: WebGLUniformLocation | null;
  shake: WebGLUniformLocation | null;
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
  hit: WebGLUniformLocation | null;
  vignette: WebGLUniformLocation | null;
  grain: WebGLUniformLocation | null;
  ca: WebGLUniformLocation | null;
  dither: WebGLUniformLocation | null;
  gradeStrength: WebGLUniformLocation | null;
  gradeShadow: WebGLUniformLocation | null;
  gradeHighlight: WebGLUniformLocation | null;
}

interface SpriteUniforms {
  resolution: WebGLUniformLocation | null;
  shake: WebGLUniformLocation | null;
  center: WebGLUniformLocation | null;
  size: WebGLUniformLocation | null;
  color: WebGLUniformLocation | null;
  kind: WebGLUniformLocation | null;
}

interface ParticleUniforms {
  resolution: WebGLUniformLocation | null;
  shake: WebGLUniformLocation | null;
  fish: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
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

/** One-shot events fade out over this window; hit shake decays faster. */
const EVENT_SECONDS = 0.5;
const SHAKE_PX = 3;
const SHAKE_SECONDS = 0.12;

const PEARL_GLOW = [1, 0.82, 0.35, 0.9] as const;
const JELLY_GLOW = [0.8, 0.32, 0.92, 0.62] as const;
const SHIELD_RING = [0.4, 0.92, 1, 0.85] as const;
const SHIELD_GLOW = [0.3, 0.8, 1, 0.16] as const;

/**
 * One-shot styles: [r, g, b, kind, start world size, end world size, alpha].
 * kind 0 = soft pulse, 1 = ring, 2 = sparkle.
 */
const HIT_FX = [1, 0.58, 0.3, 1, 16, 74, 0.9] as const;
const SHIELD_POP_FX = [0.32, 0.92, 1, 1, 14, 64, 0.9] as const;
const BEST_FX = [1, 0.82, 0.3, 0, 26, 96, 1] as const;
const PEARL_FX = [1, 0.96, 0.72, 2, 8, 30, 0.85] as const;

type EventFx = readonly [number, number, number, number, number, number, number];

function eventFx(type: string): EventFx | null {
  switch (type) {
    case 'hit':
      return HIT_FX;
    case 'shield-pop':
      return SHIELD_POP_FX;
    case 'best':
      return BEST_FX;
    case 'pearl':
      return PEARL_FX;
    default:
      return null;
  }
}

/** Interleaved particle vertex: aPos(2), aSeed(2), aParams(4). */
const PARTICLE_FLOATS = 8;
const PARTICLE_VERTS = 6;
const PARTICLE_BACK_RATIO = 0.55;
const PARTICLE_TRAIL_RATIO = 0.12;
const PARTICLE_QUAD = [0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1] as const;

function pseudoRandom(n: number): number {
  const value = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

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
 * color-renderable half-float extension, otherwise RGBA8. `effects()` draws
 * additive glows, particles, the shield rim and one-shot rings into that
 * scene target before bloom, so the controller's pass order stays fixed.
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
  private spriteProgram: WebGLProgram | null = null;
  private particleProgram: WebGLProgram | null = null;
  private quad: Quad | null = null;
  private sceneTexture: WebGLTexture | null = null;
  private sceneFbo: Framebuffer | null = null;
  private bloomFbos: Framebuffer[] = [];
  private bloomTemps: Framebuffer[] = [];
  private particleVao: WebGLVertexArrayObject | null = null;
  private particleBuffer: WebGLBuffer | null = null;
  private particleCount = 0;
  private particleBackVerts = 0;

  private backgroundUniforms: BackgroundUniforms | null = null;
  private sceneUniforms: SceneUniforms | null = null;
  private brightUniforms: BrightUniforms | null = null;
  private blurUniforms: BlurUniforms | null = null;
  private compositeUniforms: CompositeUniforms | null = null;
  private spriteUniforms: SpriteUniforms | null = null;
  private particleUniforms: ParticleUniforms | null = null;

  private shakeX = 0;
  private shakeY = 0;

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
      this.spriteProgram = createProgram(
        gl,
        spriteVertSource,
        effectsFragSource
      );
      this.particleProgram = createProgram(
        gl,
        particleVertSource,
        effectsFragSource
      );

      this.quad = createQuad(gl);
      this.sceneTexture = createTexture(gl);

      this.backgroundUniforms = {
        resolution: gl.getUniformLocation(this.backgroundProgram, 'uResolution'),
        time: gl.getUniformLocation(this.backgroundProgram, 'uTime'),
        gameRect: gl.getUniformLocation(this.backgroundProgram, 'uGameRect'),
        world: gl.getUniformLocation(this.backgroundProgram, 'uWorld'),
        shake: gl.getUniformLocation(this.backgroundProgram, 'uShake'),
      };
      this.sceneUniforms = {
        scene: gl.getUniformLocation(this.sceneProgram, 'uScene'),
        gameRect: gl.getUniformLocation(this.sceneProgram, 'uGameRect'),
        resolution: gl.getUniformLocation(this.sceneProgram, 'uResolution'),
        sceneSize: gl.getUniformLocation(this.sceneProgram, 'uSceneSize'),
        shake: gl.getUniformLocation(this.sceneProgram, 'uShake'),
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
        hit: gl.getUniformLocation(this.compositeProgram, 'uHit'),
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
      this.spriteUniforms = {
        resolution: gl.getUniformLocation(this.spriteProgram, 'uResolution'),
        shake: gl.getUniformLocation(this.spriteProgram, 'uShake'),
        center: gl.getUniformLocation(this.spriteProgram, 'uCenter'),
        size: gl.getUniformLocation(this.spriteProgram, 'uSize'),
        color: gl.getUniformLocation(this.spriteProgram, 'uColor'),
        kind: gl.getUniformLocation(this.spriteProgram, 'uKind'),
      };
      this.particleUniforms = {
        resolution: gl.getUniformLocation(this.particleProgram, 'uResolution'),
        shake: gl.getUniformLocation(this.particleProgram, 'uShake'),
        fish: gl.getUniformLocation(this.particleProgram, 'uFish'),
        time: gl.getUniformLocation(this.particleProgram, 'uTime'),
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

    this.ensureParticlePool(profile.particleCount);
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
  public background(snapshot: SceneSnapshot, profile: QualityProfile): void {
    const gl = this.gl;
    const program = this.backgroundProgram;
    const quad = this.quad;
    const uniforms = this.backgroundUniforms;

    if (!gl || !program || !quad || !uniforms) {
      return;
    }

    gl.disable(gl.BLEND);
    gl.useProgram(program);

    this.computeShake(snapshot, profile);
    const rect = this.deviceGameRect();
    gl.uniform2f(uniforms.resolution, this.postWidth, this.postHeight);
    gl.uniform1f(uniforms.time, snapshot.time);
    gl.uniform4f(uniforms.gameRect, rect.x, rect.y, rect.width, rect.height);
    gl.uniform2f(uniforms.world, snapshot.world.width, snapshot.world.height);
    gl.uniform2f(uniforms.shake, this.shakeX, this.shakeY);

    this.drawQuad(gl, quad);
  }

  /** Uploads and draws the Canvas 2D capture into the game rect. */
  public scene(snapshot: SceneSnapshot, profile: QualityProfile): void {
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

    this.computeShake(snapshot, profile);
    const rect = this.deviceGameRect();
    gl.uniform4f(uniforms.gameRect, rect.x, rect.y, rect.width, rect.height);
    gl.uniform2f(uniforms.resolution, this.postWidth, this.postHeight);
    gl.uniform2f(uniforms.shake, this.shakeX, this.shakeY);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    this.drawQuad(gl, quad);
  }

  /**
   * Additive effects into the scene target before bloom: a preallocated
   * GPU particle pool (back silt, then front silt/trail), pearl and jellyfish
   * glows, the shield rim/ring at the fish, and one-shot event rings younger
   * than EVENT_SECONDS. Particle motion lives entirely in the vertex shader,
   * so a frame uploads nothing and allocates nothing.
   */
  public effects(snapshot: SceneSnapshot, profile: QualityProfile): void {
    const gl = this.gl;
    const fbo = this.sceneFbo;
    const quad = this.quad;
    const sprite = this.spriteProgram;
    const spriteUniforms = this.spriteUniforms;
    const particleUniforms = this.particleUniforms;

    if (
      !gl ||
      !profile.effects ||
      !fbo ||
      !quad ||
      !sprite ||
      !spriteUniforms ||
      !particleUniforms ||
      !this.particleProgram
    ) {
      return;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.framebuffer);
    gl.viewport(0, 0, this.postWidth, this.postHeight);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    this.computeShake(snapshot, profile);
    const rect = this.deviceGameRect();
    const world = snapshot.world;
    const scaleX = world.width > 0 ? rect.width / world.width : 1;
    const scaleY = world.height > 0 ? rect.height / world.height : 1;
    const fishX = rect.x + snapshot.fish.x * scaleX;
    const fishY = rect.y + snapshot.fish.y * scaleY;

    if (this.particleVao && this.particleCount > 0) {
      this.drawParticles(
        gl,
        snapshot,
        particleUniforms,
        0,
        this.particleBackVerts,
        fishX,
        fishY
      );
    }

    gl.useProgram(sprite);
    gl.uniform2f(spriteUniforms.resolution, this.postWidth, this.postHeight);
    gl.uniform2f(spriteUniforms.shake, this.shakeX, this.shakeY);

    for (const obs of snapshot.obstacles) {
      if (obs.pearl && !obs.pearl.collected && !obs.pearl.missed) {
        const pearlX = rect.x + obs.pearl.x * scaleX;
        const pearlY = rect.y + obs.pearl.visualY * scaleY;
        const glow =
          obs.pearl.radius * 6 * scaleX *
          (1 + 0.08 * Math.sin(snapshot.time * 3.5 + obs.x * 0.02));

        this.drawSprite(
          gl,
          quad,
          pearlX,
          pearlY,
          glow,
          PEARL_GLOW[0],
          PEARL_GLOW[1],
          PEARL_GLOW[2],
          PEARL_GLOW[3],
          0
        );
      }

      const jellyX = rect.x + (obs.x + obs.width * 0.5) * scaleX;
      const jellyY = rect.y + obs.bottomY * scaleY;
      const jellyGlow =
        obs.width * 2.4 * scaleX *
        (1 + 0.10 * Math.sin(snapshot.time * 3 + obs.x * 0.05));

      this.drawSprite(
        gl,
        quad,
        jellyX,
        jellyY,
        jellyGlow,
        JELLY_GLOW[0],
        JELLY_GLOW[1],
        JELLY_GLOW[2],
        JELLY_GLOW[3],
        0
      );
    }

    if (snapshot.shield.active) {
      const radius =
        (snapshot.fish.radius + 18) * scaleX *
        (1 + 0.05 * Math.sin(snapshot.time * 6 + snapshot.shield.activeTime));

      this.drawSprite(
        gl,
        quad,
        fishX,
        fishY,
        radius * 2,
        SHIELD_GLOW[0],
        SHIELD_GLOW[1],
        SHIELD_GLOW[2],
        SHIELD_GLOW[3],
        0
      );
      this.drawSprite(
        gl,
        quad,
        fishX,
        fishY,
        radius * 2,
        SHIELD_RING[0],
        SHIELD_RING[1],
        SHIELD_RING[2],
        SHIELD_RING[3],
        1
      );
    }

    for (const event of snapshot.events) {
      const age = snapshot.time - event.t;
      if (!(age >= 0) || age >= EVENT_SECONDS) {
        continue;
      }

      const fx = eventFx(event.type);
      if (!fx) {
        continue;
      }

      const progress = age / EVENT_SECONDS;
      const size = (fx[4] + (fx[5] - fx[4]) * progress) * scaleX;

      this.drawSprite(
        gl,
        quad,
        rect.x + event.x * scaleX,
        rect.y + event.y * scaleY,
        size,
        fx[0],
        fx[1],
        fx[2],
        fx[6] * (1 - progress),
        fx[3]
      );
    }

    if (this.particleVao && this.particleCount > 0) {
      this.drawParticles(
        gl,
        snapshot,
        particleUniforms,
        this.particleBackVerts,
        this.particleCount * PARTICLE_VERTS - this.particleBackVerts,
        fishX,
        fishY
      );
    }

    gl.disable(gl.BLEND);
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
    gl.uniform1f(uniforms.hit, this.hitSwell(snapshot));
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
        this.releaseParticlePool();
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
        if (this.spriteProgram) {
          gl.deleteProgram(this.spriteProgram);
        }
        if (this.particleProgram) {
          gl.deleteProgram(this.particleProgram);
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
    this.spriteProgram = null;
    this.particleProgram = null;
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
    this.spriteUniforms = null;
    this.particleUniforms = null;
    this.particleVao = null;
    this.particleBuffer = null;
    this.particleCount = 0;
    this.particleBackVerts = 0;
    this.shakeX = 0;
    this.shakeY = 0;
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

  /**
   * Rebuilds the particle pool only when the profile's count changes. The
   * descriptor buffer is static; drift and trail motion are vertex-shader
   * functions of uTime/uFish, so per-frame draws upload and allocate nothing.
   */
  private ensureParticlePool(count: number): void {
    const target = Math.max(0, Math.floor(count));
    if (
      target === this.particleCount &&
      this.particleVao &&
      this.particleBuffer
    ) {
      return;
    }

    this.releaseParticlePool();

    const gl = this.gl;
    if (!gl || target === 0) {
      return;
    }

    const vao = gl.createVertexArray();
    const buffer = gl.createBuffer();
    if (!vao || !buffer) {
      if (vao) gl.deleteVertexArray(vao);
      if (buffer) gl.deleteBuffer(buffer);
      return;
    }

    const backCount = Math.max(1, Math.round(target * PARTICLE_BACK_RATIO));
    const trailCount = Math.max(2, Math.round(target * PARTICLE_TRAIL_RATIO));
    const data = new Float32Array(target * PARTICLE_VERTS * PARTICLE_FLOATS);
    let offset = 0;

    for (let i = 0; i < target; i++) {
      const back = i < backCount;
      const trail = !back && i >= target - trailCount;
      const seedX = pseudoRandom(i + 1);
      const seedY = pseudoRandom(i + 17.3);
      const size = trail
        ? 2.2
        : back
          ? 1.5 + pseudoRandom(i + 5.1) * 2.5
          : 4 + pseudoRandom(i + 7.7) * 5;

      for (let v = 0; v < PARTICLE_VERTS; v++) {
        data[offset++] = PARTICLE_QUAD[v * 2];
        data[offset++] = PARTICLE_QUAD[v * 2 + 1];
        data[offset++] = seedX;
        data[offset++] = seedY;
        data[offset++] = size;
        data[offset++] = back ? 0 : 1;
        data[offset++] = 0.6 + pseudoRandom(i + 11.9) * 0.8;
        data[offset++] = trail ? 1 : 0;
      }
    }

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, PARTICLE_FLOATS * 4, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, PARTICLE_FLOATS * 4, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, PARTICLE_FLOATS * 4, 16);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    this.particleVao = vao;
    this.particleBuffer = buffer;
    this.particleCount = target;
    this.particleBackVerts = backCount * PARTICLE_VERTS;
  }

  private releaseParticlePool(): void {
    const gl = this.gl;

    if (gl) {
      try {
        if (this.particleVao) gl.deleteVertexArray(this.particleVao);
        if (this.particleBuffer) gl.deleteBuffer(this.particleBuffer);
      } catch {
        // A lost context can reject deletes; drop the references anyway.
      }
    }

    this.particleVao = null;
    this.particleBuffer = null;
    this.particleCount = 0;
    this.particleBackVerts = 0;
  }

  /** Camera shake is a translation of the world only, never a lens warp. */
  private computeShake(
    snapshot: SceneSnapshot,
    profile: QualityProfile
  ): void {
    this.shakeX = 0;
    this.shakeY = 0;

    if (!profile.shake) {
      return;
    }

    let latest: number | null = null;
    let hitX = 0;
    let hitY = 0;

    for (const event of snapshot.events) {
      if (event.type !== 'hit') {
        continue;
      }
      const age = snapshot.time - event.t;
      if (age < 0 || age >= SHAKE_SECONDS) {
        continue;
      }
      if (latest === null || event.t > latest) {
        latest = event.t;
        hitX = event.x;
        hitY = event.y;
      }
    }

    if (latest === null) {
      return;
    }

    const tierScale =
      profile.tier === 'high' ? 1 : profile.tier === 'medium' ? 0.5 : 0;
    if (tierScale <= 0) {
      return;
    }

    const age = snapshot.time - latest;
    const amplitude = SHAKE_PX * (1 - age / SHAKE_SECONDS) * tierScale;
    const phase = hitX * 0.13 + hitY * 0.29 + age * 120;
    this.shakeX = Math.cos(phase) * amplitude;
    this.shakeY = Math.sin(phase) * amplitude;
  }

  /** Zero-to-one bloom swell for a recent hit; never a luminance flash. */
  private hitSwell(snapshot: SceneSnapshot): number {
    let swell = 0;

    for (const event of snapshot.events) {
      if (event.type !== 'hit') {
        continue;
      }
      const age = snapshot.time - event.t;
      if (age < 0 || age >= EVENT_SECONDS) {
        continue;
      }
      const weight = 1 - age / EVENT_SECONDS;
      if (weight > swell) {
        swell = weight;
      }
    }

    return swell;
  }

  private drawSprite(
    gl: WebGL2RenderingContext,
    quad: Quad,
    centerX: number,
    centerY: number,
    size: number,
    r: number,
    g: number,
    b: number,
    a: number,
    kind: number
  ): void {
    const uniforms = this.spriteUniforms;
    if (!uniforms) {
      return;
    }

    gl.uniform2f(uniforms.center, centerX, centerY);
    gl.uniform2f(uniforms.size, size, size);
    gl.uniform4f(uniforms.color, r, g, b, a);
    gl.uniform1f(uniforms.kind, kind);
    this.drawQuad(gl, quad);
  }

  private drawParticles(
    gl: WebGL2RenderingContext,
    snapshot: SceneSnapshot,
    uniforms: ParticleUniforms,
    first: number,
    count: number,
    fishX: number,
    fishY: number
  ): void {
    const program = this.particleProgram;
    const vao = this.particleVao;
    if (!program || !vao || count <= 0) {
      return;
    }

    gl.useProgram(program);
    gl.uniform2f(uniforms.resolution, this.postWidth, this.postHeight);
    gl.uniform2f(uniforms.shake, this.shakeX, this.shakeY);
    gl.uniform2f(uniforms.fish, fishX, fishY);
    gl.uniform1f(uniforms.time, snapshot.time);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, first, count);
    gl.bindVertexArray(null);
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
