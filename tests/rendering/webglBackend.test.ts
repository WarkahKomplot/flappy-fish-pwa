import { describe, it, expect, vi } from 'vitest';
import { WebGLBackend } from '../../src/game/rendering/webglBackend';
import { compileShader, createProgram } from '../../src/game/rendering/glUtils';
import { QUALITY_PROFILES } from '../../src/game/rendering/quality';
import type { SceneSnapshot } from '../../src/game/rendering/types';
import type { GameRect } from '../../src/game/rendering/geometry';

/**
 * A `vi.fn()`-backed WebGL2 context. jsdom has no GPU, so the backend tests
 * assert the contract that matters on real hardware: the pinned colour
 * pipeline calls (SRGB texture, premultiply, premultiplied blend, present to
 * the default framebuffer), the pixel caps, and the failure paths.
 */
type FakeGl = WebGL2RenderingContext & Record<string, ReturnType<typeof vi.fn>>;

function createFakeGl(overrides: Record<string, unknown> = {}): FakeGl {
  const gl: Record<string, unknown> = {
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88e4,
    FLOAT: 0x1406,
    TRIANGLES: 0x0004,
    TEXTURE_2D: 0x0de1,
    TEXTURE0: 0x84c0,
    TEXTURE1: 0x84c1,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    LINEAR: 0x2601,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    CLAMP_TO_EDGE: 0x812f,
    RGBA: 0x1908,
    RGBA8: 0x8058,
    RGBA16F: 0x881a,
    HALF_FLOAT: 0x140b,
    SRGB8_ALPHA8: 0x8c43,
    UNSIGNED_BYTE: 0x1401,
    FRAMEBUFFER: 0x8d40,
    COLOR_ATTACHMENT0: 0x8ce0,
    FRAMEBUFFER_COMPLETE: 0x8cd5,
    FRAMEBUFFER_INCOMPLETE_ATTACHMENT: 0x8cd6,
    BLEND: 0x0be2,
    ONE: 1,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    DEPTH_TEST: 0x0b71,
    COLOR_BUFFER_BIT: 0x4000,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9240,
    UNPACK_FLIP_Y_WEBGL: 0x9241,
    getExtension: vi.fn(() => null),
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ''),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ''),
    deleteProgram: vi.fn(),
    useProgram: vi.fn(),
    getUniformLocation: vi.fn((_program: unknown, name: string) => ({ name })),
    uniform1f: vi.fn(),
    uniform1i: vi.fn(),
    uniform2f: vi.fn(),
    uniform4f: vi.fn(),
    createVertexArray: vi.fn(() => ({})),
    bindVertexArray: vi.fn(),
    createBuffer: vi.fn(() => ({})),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    deleteBuffer: vi.fn(),
    deleteVertexArray: vi.fn(),
    createTexture: vi.fn(() => ({})),
    bindTexture: vi.fn(),
    texParameteri: vi.fn(),
    texImage2D: vi.fn(),
    activeTexture: vi.fn(),
    deleteTexture: vi.fn(),
    createFramebuffer: vi.fn(() => ({})),
    bindFramebuffer: vi.fn(),
    framebufferTexture2D: vi.fn(),
    checkFramebufferStatus: vi.fn(() => 0x8cd5),
    deleteFramebuffer: vi.fn(),
    viewport: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    enable: vi.fn(),
    disable: vi.fn(),
    blendFunc: vi.fn(),
    drawArrays: vi.fn(),
    pixelStorei: vi.fn(),
    ...overrides,
  };

  return gl as unknown as FakeGl;
}

interface DrawState {
  framebuffer: unknown;
  texture: unknown;
  attachment: unknown;
}

/**
 * Wraps `createFakeGl` with the state a real driver enforces: every draw is
 * recorded with the bound framebuffer, the texture on unit 0, and that
 * framebuffer's colour attachment. This lets the bloom tests assert there is
 * no sampled-texture-equals-bound-attachment feedback loop.
 */
function createTrackedFakeGl(overrides: Record<string, unknown> = {}): {
  gl: FakeGl;
  drawStates: DrawState[];
} {
  const attachments = new Map<unknown, unknown>();
  let boundFramebuffer: unknown = null;
  let activeUnit = 0;
  let boundTexture0: unknown = null;
  const drawStates: DrawState[] = [];

  const gl = createFakeGl({
    framebufferTexture2D: vi.fn(
      (
        _target: unknown,
        _attachment: unknown,
        _textarget: unknown,
        texture: unknown
      ) => {
        attachments.set(boundFramebuffer, texture);
      }
    ),
    bindFramebuffer: vi.fn((_target: unknown, framebuffer: unknown) => {
      boundFramebuffer = framebuffer;
    }),
    activeTexture: vi.fn((unit: number) => {
      activeUnit = unit;
    }),
    bindTexture: vi.fn((_target: unknown, texture: unknown) => {
      if (activeUnit === 0) {
        boundTexture0 = texture;
      }
    }),
    drawArrays: vi.fn(() => {
      drawStates.push({
        framebuffer: boundFramebuffer,
        texture: boundTexture0,
        attachment: attachments.get(boundFramebuffer),
      });
    }),
    ...overrides,
  });

  return { gl, drawStates };
}

function mocked(fn: unknown): ReturnType<typeof vi.fn> {
  return fn as ReturnType<typeof vi.fn>;
}

function uniform1fValue(gl: FakeGl, name: string): number | undefined {
  const calls = mocked(gl.uniform1f).mock.calls;
  for (let i = calls.length - 1; i >= 0; i--) {
    const location = calls[i][0] as { name?: string } | null;
    if (location?.name === name) {
      return calls[i][1] as number;
    }
  }
  return undefined;
}

function makeSnapshot(): SceneSnapshot {
  return {
    time: 1.25,
    status: 'idle',
    world: { width: 360, height: 640 },
    fish: {
      x: 80,
      y: 300,
      vx: 0,
      vy: 0,
      radius: 16,
      rotation: 0,
      skin: 'neon-tetra',
      isDead: false,
      invulnerableTime: 0,
    },
    obstacles: [],
    shield: { active: false, activeTime: 0 },
    ribbon: { x: -9999, target: 0, crossed: true },
    events: [],
  };
}

function initBackend(gl: FakeGl): {
  backend: WebGLBackend;
  fxCanvas: HTMLCanvasElement;
  sceneCanvas: HTMLCanvasElement;
} {
  const fxCanvas = document.createElement('canvas');
  const sceneCanvas = document.createElement('canvas');
  vi.spyOn(fxCanvas, 'getContext').mockReturnValue(gl as unknown as RenderingContext);
  const backend = new WebGLBackend();
  expect(backend.init(fxCanvas, sceneCanvas)).toBe(true);
  return { backend, fxCanvas, sceneCanvas };
}

const PROFILE = QUALITY_PROFILES.high;
const GAME_RECT: GameRect = { x: 0, y: 75.5, width: 390, height: 693 };

describe('WebGLBackend init failure containment', () => {
  it('returns false for a missing context', () => {
    const canvas = document.createElement('canvas');
    const scene = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(null);

    expect(new WebGLBackend().init(canvas, scene)).toBe(false);
  });

  it('returns false for a context without shader support and never throws', () => {
    const canvas = document.createElement('canvas');
    const scene = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue({
      createShader: undefined,
    } as unknown as RenderingContext);

    expect(() => new WebGLBackend().init(canvas, scene)).not.toThrow();
    expect(new WebGLBackend().init(canvas, scene)).toBe(false);
  });

  it('returns false and releases partial resources when program creation fails', () => {
    const fxCanvas = document.createElement('canvas');
    const scene = document.createElement('canvas');
    let links = 0;
    const gl = createFakeGl({
      getProgramParameter: vi.fn(() => {
        links += 1;
        return links !== 2;
      }),
      getProgramInfoLog: vi.fn(() => 'link failed: varying mismatch'),
    });
    vi.spyOn(fxCanvas, 'getContext').mockReturnValue(gl as unknown as RenderingContext);

    const backend = new WebGLBackend();

    let result = true;
    expect(() => {
      result = backend.init(fxCanvas, scene);
    }).not.toThrow();
    expect(result).toBe(false);
    // The first program linked before the second failed; dispose deletes it.
    expect(gl.deleteProgram).toHaveBeenCalled();
    expect(() => {
      backend.dispose();
      backend.dispose();
    }).not.toThrow();
  });
  it('dispose is idempotent without init', () => {
    const backend = new WebGLBackend();

    expect(() => {
      backend.dispose();
      backend.dispose();
    }).not.toThrow();
  });
});

describe('WebGLBackend resources and colour contract', () => {
  it('resizes the FX buffer with postDpr and caps stage pixels', () => {
    const gl = createFakeGl();
    const { backend, fxCanvas } = initBackend(gl);

    backend.resize(390, 844, GAME_RECT, PROFILE);

    // 390x844 x postDpr 2 = 780x1688, below the 2.2 MP cap.
    expect(fxCanvas.width).toBe(780);
    expect(fxCanvas.height).toBe(1688);
    expect(gl.viewport).toHaveBeenCalledWith(0, 0, 780, 1688);
    expect(gl.createFramebuffer).toHaveBeenCalled();

    // A 1200x2000 stage at postDpr 2 is 9.6 MP and must be capped.
    backend.resize(1200, 2000, { x: 0, y: 0, width: 1200, height: 2000 }, PROFILE);
    expect(fxCanvas.width * fxCanvas.height).toBeLessThanOrEqual(
      PROFILE.maxPostPixels
    );

    backend.dispose();
  });

  it('draws background and scene into the FBO, then presents to the default framebuffer', () => {
    const gl = createFakeGl();
    const { backend, sceneCanvas } = initBackend(gl);
    const snapshot = makeSnapshot();

    backend.resize(390, 844, GAME_RECT, PROFILE);
    backend.beginFrame(snapshot, PROFILE);
    backend.background(snapshot, PROFILE);
    backend.scene(snapshot, PROFILE);
    backend.composite(snapshot, PROFILE);

    // World mapping uniforms: the fractional 75.5 px origin reaches the
    // shader as 151 device pixels at postDpr 2 (no rounding seam).
    expect(gl.uniform4f).toHaveBeenCalledWith(expect.anything(), 0, 151, 780, 1386);
    expect(gl.uniform2f).toHaveBeenCalledWith(expect.anything(), 360, 640);

    // Scene texture: SRGB8_ALPHA8, premultiplied upload, premultiplied blend.
    expect(gl.texImage2D).toHaveBeenCalledWith(
      gl.TEXTURE_2D,
      0,
      gl.SRGB8_ALPHA8,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      sceneCanvas
    );
    expect(gl.pixelStorei).toHaveBeenCalledWith(
      gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,
      true
    );
    expect(gl.blendFunc).toHaveBeenCalledWith(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // Background, scene, present.
    expect(gl.drawArrays).toHaveBeenCalledTimes(3);
    expect(gl.bindFramebuffer).toHaveBeenLastCalledWith(gl.FRAMEBUFFER, null);

    backend.dispose();
  });

  it('is idempotent on dispose after a successful init', () => {
    const gl = createFakeGl();
    const { backend } = initBackend(gl);
    backend.resize(390, 844, GAME_RECT, PROFILE);

    expect(() => {
      backend.dispose();
      backend.dispose();
    }).not.toThrow();
  });

  it('runs the three-mip bloom chain without feedback and with RGBA8 headroom', () => {
    const { gl, drawStates } = createTrackedFakeGl();
    const { backend } = initBackend(gl);
    const snapshot = makeSnapshot();

    backend.resize(390, 844, GAME_RECT, PROFILE);
    // Scene target plus 3 mips and 3 ping-pong temps.
    expect(gl.createFramebuffer).toHaveBeenCalledTimes(7);

    backend.beginFrame(snapshot, PROFILE);
    backend.background(snapshot, PROFILE);
    backend.scene(snapshot, PROFILE);
    backend.bloom(snapshot, PROFILE);
    backend.composite(snapshot, PROFILE);

    // background + scene + bright + 3x(H+V) + 2 upsamples + composite.
    expect(drawStates).toHaveLength(12);
    for (const draw of drawStates) {
      if (draw.framebuffer) {
        expect(draw.texture).not.toBe(draw.attachment);
      }
    }

    // RGBA8 fallback: 4x headroom, 4x bloom scale and a 1/255 ordered dither.
    expect(uniform1fValue(gl, 'uHeadroom')).toBe(4);
    expect(uniform1fValue(gl, 'uBloomScale')).toBe(4);
    expect(uniform1fValue(gl, 'uBloomEnabled')).toBe(1);
    expect(uniform1fValue(gl, 'uDither')).toBeCloseTo(1 / 255, 8);

    backend.dispose();
  });

  it('selects half-float targets when the extension is exposed', () => {
    const { gl } = createTrackedFakeGl({
      getExtension: vi.fn((name: string) =>
        name === 'EXT_color_buffer_half_float' ? {} : null
      ),
    });
    const { backend } = initBackend(gl);
    const snapshot = makeSnapshot();

    backend.resize(390, 844, GAME_RECT, PROFILE);

    const uploads = mocked(gl.texImage2D).mock.calls.filter(
      (call) => call[2] === gl.RGBA16F
    );
    expect(uploads).toHaveLength(7);
    expect(uploads.every((call) => call[7] === gl.HALF_FLOAT)).toBe(true);

    backend.beginFrame(snapshot, PROFILE);
    backend.background(snapshot, PROFILE);
    backend.scene(snapshot, PROFILE);
    backend.bloom(snapshot, PROFILE);
    backend.composite(snapshot, PROFILE);

    // No headroom scale and no banding dither on the half-float path.
    expect(uniform1fValue(gl, 'uHeadroom')).toBe(1);
    expect(uniform1fValue(gl, 'uBloomScale')).toBe(1);
    expect(uniform1fValue(gl, 'uDither')).toBe(0);

    backend.dispose();
  });

  it('retries once with RGBA8 when half-float targets are incomplete', () => {
    let lastFormat: number | undefined;
    const { gl } = createTrackedFakeGl({
      getExtension: vi.fn((name: string) =>
        name === 'EXT_color_buffer_half_float' ? {} : null
      ),
      texImage2D: vi.fn((...args: unknown[]) => {
        lastFormat = args[2] as number;
      }),
      checkFramebufferStatus: vi.fn(() =>
        // 0x8cd6 = FRAMEBUFFER_INCOMPLETE_ATTACHMENT, 0x8cd5 = COMPLETE.
        lastFormat === 0x881a ? 0x8cd6 : 0x8cd5
      ),
    });
    const { backend } = initBackend(gl);
    const snapshot = makeSnapshot();

    expect(() => backend.resize(390, 844, GAME_RECT, PROFILE)).not.toThrow();

    const uploads = mocked(gl.texImage2D).mock.calls;
    expect(uploads.filter((call) => call[2] === gl.RGBA16F)).toHaveLength(1);
    expect(uploads.filter((call) => call[2] === gl.RGBA8)).toHaveLength(7);
    expect(gl.deleteFramebuffer).toHaveBeenCalled();

    // The retry is one-shot: a later resize stays on RGBA8.
    backend.resize(390, 844, GAME_RECT, PROFILE);
    expect(uploads.filter((call) => call[2] === gl.RGBA16F)).toHaveLength(1);
    expect(uploads.filter((call) => call[2] === gl.RGBA8)).toHaveLength(14);

    backend.beginFrame(snapshot, PROFILE);
    backend.background(snapshot, PROFILE);
    backend.scene(snapshot, PROFILE);
    backend.bloom(snapshot, PROFILE);
    backend.composite(snapshot, PROFILE);

    expect(uniform1fValue(gl, 'uHeadroom')).toBe(4);
    expect(uniform1fValue(gl, 'uDither')).toBeCloseTo(1 / 255, 8);

    backend.dispose();
  });

  it('skips bloom targets and sampling on a no-bloom tier, then recreates on switch', () => {
    const { gl, drawStates } = createTrackedFakeGl();
    const { backend } = initBackend(gl);
    const snapshot = makeSnapshot();
    const low = QUALITY_PROFILES.low;

    backend.resize(390, 844, GAME_RECT, low);
    expect(gl.createFramebuffer).toHaveBeenCalledTimes(1);

    backend.beginFrame(snapshot, low);
    backend.background(snapshot, low);
    backend.scene(snapshot, low);
    backend.composite(snapshot, low);

    expect(drawStates).toHaveLength(3);
    expect(uniform1fValue(gl, 'uBloomEnabled')).toBe(0);

    // Runtime Low -> High switch reallocates the bloom chain.
    backend.resize(390, 844, GAME_RECT, PROFILE);
    expect(gl.createFramebuffer).toHaveBeenCalledTimes(8);

    backend.beginFrame(snapshot, PROFILE);
    backend.background(snapshot, PROFILE);
    backend.scene(snapshot, PROFILE);
    backend.bloom(snapshot, PROFILE);
    backend.composite(snapshot, PROFILE);

    expect(drawStates).toHaveLength(15);
    expect(uniform1fValue(gl, 'uBloomEnabled')).toBe(1);

    // High -> Low drops the bloom targets again.
    backend.resize(390, 844, GAME_RECT, low);
    expect(gl.createFramebuffer).toHaveBeenCalledTimes(9);

    backend.beginFrame(snapshot, low);
    backend.background(snapshot, low);
    backend.scene(snapshot, low);
    backend.composite(snapshot, low);

    expect(drawStates).toHaveLength(18);
    expect(uniform1fValue(gl, 'uBloomEnabled')).toBe(0);

    backend.dispose();
  });
});

describe('glUtils shader error reporting', () => {
  it('throws with the shader log when compilation fails', () => {
    const gl = createFakeGl({
      getShaderParameter: vi.fn(() => false),
      getShaderInfoLog: vi.fn(() => 'ERROR: 0:3 unresolved identifier'),
    });

    expect(() => compileShader(gl, gl.FRAGMENT_SHADER, 'void main() {}')).toThrow(
      /unresolved identifier/
    );
  });

  it('throws with the program log when linking fails', () => {
    const gl = createFakeGl({
      getProgramParameter: vi.fn(() => false),
      getProgramInfoLog: vi.fn(() => 'link failed: no main'),
    });

    expect(() => createProgram(gl, 'vertex', 'fragment')).toThrow(/no main/);
  });
});
