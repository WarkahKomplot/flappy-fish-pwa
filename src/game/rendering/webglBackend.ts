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
import presentFragSource from './shaders/present.frag?raw';

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

interface PresentUniforms {
  frame: WebGLUniformLocation | null;
}

/** Cold deep-water clear so a dropped pass can never flash a bright frame. */
const CLEAR_R = 0.002;
const CLEAR_G = 0.006;
const CLEAR_B = 0.014;

/**
 * WebGL2 compositor backend: a procedural full-bleed background, the Canvas
 * 2D scene captured into an SRGB8_ALPHA8 texture and composited into the 9:16
 * rect with premultiplied alpha, then an explicit linear->sRGB present.
 *
 * Task 8 adds the bloom/ACES/grade composite and Task 9 the effect passes;
 * `effects()` and `bloom()` are intentional no-ops here so the controller's
 * pass order is already wired.
 */
export class WebGLBackend implements PostFXBackend {
  private gl: WebGL2RenderingContext | null = null;
  private fxCanvas: HTMLCanvasElement | null = null;
  private sceneCanvas: HTMLCanvasElement | null = null;

  private backgroundProgram: WebGLProgram | null = null;
  private sceneProgram: WebGLProgram | null = null;
  private presentProgram: WebGLProgram | null = null;
  private quad: Quad | null = null;
  private sceneTexture: WebGLTexture | null = null;
  private sceneFbo: Framebuffer | null = null;

  private backgroundUniforms: BackgroundUniforms | null = null;
  private sceneUniforms: SceneUniforms | null = null;
  private presentUniforms: PresentUniforms | null = null;

  private stageWidth = 0;
  private stageHeight = 0;
  private postWidth = 0;
  private postHeight = 0;
  private gameRect: GameRect = { x: 0, y: 0, width: 0, height: 0 };

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

      this.backgroundProgram = createProgram(
        gl,
        backgroundVertSource,
        backgroundFragSource
      );
      this.sceneProgram = createProgram(gl, sceneVertSource, sceneFragSource);
      this.presentProgram = createProgram(
        gl,
        backgroundVertSource,
        presentFragSource
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
      this.presentUniforms = {
        frame: gl.getUniformLocation(this.presentProgram, 'uFrame'),
      };

      return true;
    } catch {
      this.dispose();
      return false;
    }
  }

  /**
   * Sizes the FX drawing buffer from the measured stage and the tier's
   * postDpr, capped by `maxPostPixels`, then reallocates the linear scene FBO.
   * The default framebuffer is presented 1:1 with this buffer.
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

    if (this.sceneFbo) {
      gl.deleteFramebuffer(this.sceneFbo.framebuffer);
      gl.deleteTexture(this.sceneFbo.texture);
      this.sceneFbo = null;
    }

    this.sceneFbo = createFbo(gl, width, height, gl.RGBA8);
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

    gl.bindVertexArray(quad.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
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

    gl.bindVertexArray(quad.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  /** Task 9 owns the glow/particle/shield passes. */
  public effects(_snapshot: SceneSnapshot, _profile: QualityProfile): void {
    // Intentionally empty until Task 9.
  }

  /** Task 8 owns the bright/blur/bloom chain. */
  public bloom(_snapshot: SceneSnapshot, _profile: QualityProfile): void {
    // Intentionally empty until Task 8.
  }

  /**
   * Present pass for now: copies the linear scene FBO to the default
   * framebuffer and encodes linear->sRGB. Task 8 replaces this with the
   * ACES/grade composite.
   */
  public composite(_snapshot: SceneSnapshot, _profile: QualityProfile): void {
    const gl = this.gl;
    const program = this.presentProgram;
    const fbo = this.sceneFbo;
    const quad = this.quad;
    const uniforms = this.presentUniforms;

    if (!gl || !program || !fbo || !quad || !uniforms) {
      return;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.postWidth, this.postHeight);
    gl.disable(gl.BLEND);
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fbo.texture);
    gl.uniform1i(uniforms.frame, 0);

    gl.bindVertexArray(quad.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  public endFrame(): void {
    // Nothing to do until Task 8/9 split read/write targets.
  }

  /**
   * Releases every GL object. Safe before init, after a partial init, and on
   * repeated calls; the GameCanvas fallback path relies on that.
   */
  public dispose(): void {
    const gl = this.gl;

    if (gl) {
      try {
        if (this.sceneFbo) {
          gl.deleteFramebuffer(this.sceneFbo.framebuffer);
          gl.deleteTexture(this.sceneFbo.texture);
        }
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
        if (this.presentProgram) {
          gl.deleteProgram(this.presentProgram);
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
    this.presentProgram = null;
    this.quad = null;
    this.sceneTexture = null;
    this.sceneFbo = null;
    this.backgroundUniforms = null;
    this.sceneUniforms = null;
    this.presentUniforms = null;
    this.stageWidth = 0;
    this.stageHeight = 0;
    this.postWidth = 0;
    this.postHeight = 0;
    this.gameRect = { x: 0, y: 0, width: 0, height: 0 };
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
