import { describe, it, expect, vi } from 'vitest';
import { WebGLBackend } from '../../src/game/rendering/webglBackend';
import { compileShader, createProgram } from '../../src/game/rendering/glUtils';
import { QUALITY_PROFILES, getQualityProfile } from '../../src/game/rendering/quality';
import type { SceneSnapshot, RenderEvent } from '../../src/game/rendering/types';
import type { GameRect } from '../../src/game/rendering/geometry';
import spriteVertSource from '../../src/game/rendering/shaders/sprite.vert?raw';
import particleVertSource from '../../src/game/rendering/shaders/particle.vert?raw';

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
    texSubImage2D: vi.fn(),
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
  program: unknown;
  uniforms: Record<string, number | number[]>;
  blend: { src: number; dst: number } | null;
  vertexArray: unknown;
  first: number;
  count: number;
}

interface BufferUpload {
  target: unknown;
  data: Float32Array;
  usage: unknown;
}

/**
 * Wraps `createFakeGl` with the state a real driver enforces: every draw is
 * recorded with the bound framebuffer, the texture on unit 0, that
 * framebuffer's colour attachment, the active program's uniforms at draw
 * time, the blend mode, and the vertex range. This lets the bloom tests
 * assert there is no sampled-texture-equals-bound-attachment feedback loop
 * and the effects tests assert what each sprite/particle draw actually saw.
 */
function createTrackedFakeGl(overrides: Record<string, unknown> = {}): {
  gl: FakeGl;
  drawStates: DrawState[];
  bufferUploads: BufferUpload[];
} {
  const attachments = new Map<unknown, unknown>();
  // 0x84c0 is gl.TEXTURE0, which is also the default active texture unit.
  const textureUnit0 = 0x84c0;
  let boundFramebuffer: unknown = null;
  let activeUnit = textureUnit0;
  let boundTexture0: unknown = null;
  let currentProgram: unknown = null;
  let currentUniforms: Record<string, number | number[]> = {};
  let boundVertexArray: unknown = null;
  let blendSrc = 0;
  let blendDst = 0;
  let blendEnabled = false;
  const drawStates: DrawState[] = [];
  const bufferUploads: BufferUpload[] = [];

  const setUniform = (location: unknown, value: number | number[]): void => {
    const name = (location as { name?: string } | null)?.name;
    if (name) {
      currentUniforms[name] = Array.isArray(value) ? value.slice() : value;
    }
  };

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
      if (activeUnit === textureUnit0) {
        boundTexture0 = texture;
      }
    }),
    useProgram: vi.fn((program: unknown) => {
      currentProgram = program;
      currentUniforms = {};
    }),
    uniform1f: vi.fn((location: unknown, x: number) => {
      setUniform(location, x);
    }),
    uniform1i: vi.fn((location: unknown, x: number) => {
      setUniform(location, x);
    }),
    uniform2f: vi.fn((location: unknown, x: number, y: number) => {
      setUniform(location, [x, y]);
    }),
    uniform4f: vi.fn(
      (location: unknown, x: number, y: number, z: number, w: number) => {
        setUniform(location, [x, y, z, w]);
      }
    ),
    bindVertexArray: vi.fn((vao: unknown) => {
      boundVertexArray = vao;
    }),
    enable: vi.fn((cap: number) => {
      if (cap === 0x0be2) {
        blendEnabled = true;
      }
    }),
    disable: vi.fn((cap: number) => {
      if (cap === 0x0be2) {
        blendEnabled = false;
      }
    }),
    blendFunc: vi.fn((src: number, dst: number) => {
      blendSrc = src;
      blendDst = dst;
    }),
    bufferData: vi.fn(
      (target: unknown, data: Float32Array, usage: unknown) => {
        bufferUploads.push({ target, data, usage });
      }
    ),
    drawArrays: vi.fn((_mode: number, first: number, count: number) => {
      drawStates.push({
        framebuffer: boundFramebuffer,
        texture: boundTexture0,
        attachment: attachments.get(boundFramebuffer),
        program: currentProgram,
        uniforms: { ...currentUniforms },
        blend: blendEnabled ? { src: blendSrc, dst: blendDst } : null,
        vertexArray: boundVertexArray,
        first,
        count,
      });
    }),
    ...overrides,
  });

  return { gl, drawStates, bufferUploads };
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

function uniform2fCalls(gl: FakeGl, name: string): Array<[number, number]> {
  return mocked(gl.uniform2f)
    .mock.calls.filter((call) => (call[0] as { name?: string } | null)?.name === name)
    .map((call) => [call[1] as number, call[2] as number]);
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

/** Device game rect for the 390x844 stage; the post cap does not bite here. */
function gameRectFor(profile: (typeof QUALITY_PROFILES)[keyof typeof QUALITY_PROFILES]): GameRect {
  return {
    x: 0,
    y: 75.5 * profile.postDpr,
    width: 390 * profile.postDpr,
    height: 693 * profile.postDpr,
  };
}

function worldToDevice(
  profile: (typeof QUALITY_PROFILES)[keyof typeof QUALITY_PROFILES],
  snapshot: SceneSnapshot,
  x: number,
  y: number
): { x: number; y: number } {
  const rect = gameRectFor(profile);
  return {
    x: rect.x + (x / snapshot.world.width) * rect.width,
    y: rect.y + (y / snapshot.world.height) * rect.height,
  };
}

function makeFxSnapshot(overrides: Partial<SceneSnapshot> = {}): SceneSnapshot {
  return { ...makeSnapshot(), time: 2, ...overrides };
}

/** Two pearls, two jellyfish, an active shield, and one of each event. */
function makeRichFxSnapshot(): SceneSnapshot {
  return makeFxSnapshot({
    time: 10,
    obstacles: [
      {
        x: 100,
        width: 44,
        topHeight: 120,
        bottomY: 300,
        pearl: {
          x: 120,
          y: 200,
          visualY: 210,
          radius: 12,
          collected: false,
          missed: false,
        },
      },
      {
        x: 260,
        width: 44,
        topHeight: 160,
        bottomY: 340,
        pearl: {
          x: 280,
          y: 240,
          visualY: 236,
          radius: 12,
          collected: false,
          missed: false,
        },
      },
    ],
    shield: { active: true, activeTime: 0.6 },
    events: [
      { type: 'hit', x: 40, y: 520, t: 9.9 },
      { type: 'shield-pop', x: 90, y: 540, t: 9.8 },
      { type: 'best', x: 140, y: 560, t: 9.7 },
      { type: 'pearl', x: 190, y: 580, t: 9.6 },
    ],
  });
}

function uniformNumber(draw: DrawState, name: string): number | undefined {
  const value = draw.uniforms[name];
  return typeof value === 'number' ? value : undefined;
}

function uniformPair(draw: DrawState, name: string): number[] | null {
  const value = draw.uniforms[name];
  return Array.isArray(value) ? value : null;
}

function spriteDraws(draws: DrawState[]): DrawState[] {
  return draws.filter((draw) => Array.isArray(draw.uniforms.uColor));
}

function particleDraws(draws: DrawState[]): DrawState[] {
  return draws.filter((draw) => Array.isArray(draw.uniforms.uFish));
}

function spriteAt(draws: DrawState[], x: number, y: number): DrawState | undefined {
  return spriteDraws(draws).find((draw) => {
    const center = uniformPair(draw, 'uCenter');
    return (
      center !== null &&
      Math.abs(center[0] - x) < 0.01 &&
      Math.abs(center[1] - y) < 0.01
    );
  });
}

function colorMatches(draw: DrawState, rgb: readonly number[]): boolean {
  const color = uniformPair(draw, 'uColor');
  return (
    color !== null &&
    Math.abs(color[0] - rgb[0]) < 1e-6 &&
    Math.abs(color[1] - rgb[1]) < 1e-6 &&
    Math.abs(color[2] - rgb[2]) < 1e-6
  );
}

/** The shader must centre a 0..1 quad on uCenter, not anchor it top-left. */
const CENTERED_QUAD =
  /\(aPos\s*-\s*(?:vec2\(\s*0\.5\s*\)|0\.5)\)\s*\*\s*(?:uSize|size)/;
const TOP_LEFT_QUAD = /aPos\s*\*\s*(?:uSize|size)/;

/** CPU mirror of the centred vertex convention: center +/- size / 2. */
function centeredBounds(
  center: number[],
  size: number[]
): { left: number; right: number; top: number; bottom: number } {
  return {
    left: center[0] - size[0] / 2,
    right: center[0] + size[0] / 2,
    top: center[1] - size[1] / 2,
    bottom: center[1] + size[1] / 2,
  };
}

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

  it('skips FBO reallocation when the post size and bloom flag are unchanged', () => {
    const gl = createFakeGl();
    const { backend } = initBackend(gl);

    backend.resize(390, 844, GAME_RECT, PROFILE);
    const framebuffers = mocked(gl.createFramebuffer).mock.calls.length;
    const textures = mocked(gl.createTexture).mock.calls.length;
    const deletes = mocked(gl.deleteTexture).mock.calls.length;

    // A second resize with the same computed post size and bloom flag (the
    // setPreference-then-updateDimensions path, and no-op ResizeObserver
    // ticks) must not churn the GPU allocations.
    backend.resize(390, 844, GAME_RECT, PROFILE);
    expect(mocked(gl.createFramebuffer).mock.calls.length).toBe(framebuffers);
    expect(mocked(gl.createTexture).mock.calls.length).toBe(textures);
    expect(mocked(gl.deleteTexture).mock.calls.length).toBe(deletes);

    // A real size change still reallocates.
    backend.resize(391, 844, GAME_RECT, PROFILE);
    expect(mocked(gl.createFramebuffer).mock.calls.length).toBeGreaterThan(
      framebuffers
    );
    expect(mocked(gl.createTexture).mock.calls.length).toBeGreaterThan(textures);

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

    // background + scene + bright + head blur H/V + 2x(downsample + H + V)
    // + 2 tent upsamples + composite.
    expect(drawStates).toHaveLength(14);
    expect(drawStates.some((draw) => draw.texture !== null)).toBe(true);
    for (const draw of drawStates) {
      if (draw.framebuffer) {
        expect(draw.texture).not.toBe(draw.attachment);
      }
    }

    // Additive upsample is pinned to ONE/ONE at half weight.
    expect(gl.blendFunc).toHaveBeenCalledWith(gl.ONE, gl.ONE);
    expect(uniform1fValue(gl, 'uWeight')).toBe(0.5);

    // RGBA8 fallback: 4x headroom, 4x bloom scale and a 1/255 ordered dither.
    expect(uniform1fValue(gl, 'uHeadroom')).toBe(4);
    expect(uniform1fValue(gl, 'uBloomScale')).toBe(4);
    expect(uniform1fValue(gl, 'uBloomEnabled')).toBe(1);
    expect(uniform1fValue(gl, 'uDither')).toBeCloseTo(1 / 255, 8);

    backend.dispose();
  });

  it('downsamples each mip with a tent filter in source-texel units', () => {
    const { gl } = createTrackedFakeGl();
    const { backend } = initBackend(gl);
    const snapshot = makeSnapshot();

    backend.resize(390, 844, GAME_RECT, PROFILE);
    mocked(gl.drawArrays).mockClear();

    backend.bloom(snapshot, PROFILE);

    // bright + head blur H/V + 2x (tent downsample + blur H + blur V)
    // + 2 tent upsamples.
    expect(mocked(gl.drawArrays).mock.calls.length).toBe(11);

    // Each downsample steps in the SOURCE mip's texels (post 780x1688 ->
    // mips 390x844, 195x422, 97x211), so a 2x size change can never fall on
    // every-other source texel and alias high-frequency glow.
    const sourceTexels = uniform2fCalls(gl, 'uSourceTexelSize');
    expect(sourceTexels.some(([x, y]) => x === 1 / 390 && y === 1 / 844)).toBe(
      true
    );
    expect(sourceTexels.some(([x, y]) => x === 1 / 195 && y === 1 / 422)).toBe(
      true
    );

    backend.dispose();
  });

  it('dithers background and scene writes on 8-bit targets', () => {
    const { gl } = createTrackedFakeGl();
    const { backend } = initBackend(gl);
    const snapshot = makeSnapshot();

    backend.resize(390, 844, GAME_RECT, PROFILE);

    backend.beginFrame(snapshot, PROFILE);
    backend.background(snapshot, PROFILE);
    // Deep-water gradients span a handful of linear LSBs; without an ordered
    // dither on write they quantize into visible bands before the composite
    // dither ever runs.
    expect(uniform1fValue(gl, 'uWriteDither')).toBeCloseTo(1 / 255, 8);

    backend.scene(snapshot, PROFILE);
    expect(uniform1fValue(gl, 'uWriteDither')).toBeCloseTo(1 / 255, 8);

    backend.dispose();
  });

  it('skips the write dither on half-float targets', () => {
    const { gl } = createTrackedFakeGl({
      getExtension: vi.fn((name: string) =>
        name === 'EXT_color_buffer_half_float' ? {} : null
      ),
    });
    const { backend } = initBackend(gl);
    const snapshot = makeSnapshot();

    backend.resize(390, 844, GAME_RECT, PROFILE);
    backend.beginFrame(snapshot, PROFILE);
    backend.background(snapshot, PROFILE);
    backend.scene(snapshot, PROFILE);

    expect(uniform1fValue(gl, 'uWriteDither')).toBe(0);

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

    // The retry is one-shot: a later identical resize is a no-op on targets
    // (same size, same bloom flag) and the device stays on RGBA8.
    backend.resize(390, 844, GAME_RECT, PROFILE);
    expect(uploads.filter((call) => call[2] === gl.RGBA16F)).toHaveLength(1);
    expect(uploads.filter((call) => call[2] === gl.RGBA8)).toHaveLength(7);

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

    // 3 + (background + scene + bright + head blur H/V + 2x(downsample + H + V)
    // + 2 tent upsamples + composite = 14).
    expect(drawStates).toHaveLength(17);
    expect(uniform1fValue(gl, 'uBloomEnabled')).toBe(1);

    // High -> Low drops the bloom targets again.
    backend.resize(390, 844, GAME_RECT, low);
    expect(gl.createFramebuffer).toHaveBeenCalledTimes(9);

    backend.beginFrame(snapshot, low);
    backend.background(snapshot, low);
    backend.scene(snapshot, low);
    backend.composite(snapshot, low);

    expect(drawStates).toHaveLength(20);
    expect(uniform1fValue(gl, 'uBloomEnabled')).toBe(0);

    backend.dispose();
  });
});

describe('WebGLBackend effects (glows, particles, shield, one-shots)', () => {
  it('draws no effects on the Low tier even if effects() is called directly', () => {
    const { gl, drawStates } = createTrackedFakeGl();
    const { backend } = initBackend(gl);
    const snapshot = makeRichFxSnapshot();

    backend.resize(390, 844, GAME_RECT, QUALITY_PROFILES.low);
    backend.beginFrame(snapshot, QUALITY_PROFILES.low);
    const before = drawStates.length;

    backend.effects(snapshot, QUALITY_PROFILES.low);

    expect(drawStates.length).toBe(before);
    backend.dispose();
  });

  it.each(['high', 'medium'] as const)(
    'draws glows, layered particles, the shield and every event ring on %s',
    (tier) => {
      const profile = QUALITY_PROFILES[tier];
      const { gl, drawStates } = createTrackedFakeGl();
      const { backend } = initBackend(gl);
      const snapshot = makeRichFxSnapshot();

      backend.resize(390, 844, GAME_RECT, profile);
      backend.beginFrame(snapshot, profile);
      const before = drawStates.length;

      backend.effects(snapshot, profile);

      const fx = drawStates.slice(before);
      expect(fx.length).toBeGreaterThan(7);
      // Effects always target the scene FBO, so bloom sees them.
      expect(fx.every((draw) => draw.framebuffer !== null)).toBe(true);
      // Additive light, never alpha-over or a luminance flash.
      expect(fx.every((draw) => draw.blend?.src === 1 && draw.blend?.dst === 1)).toBe(
        true
      );

      const sprites = spriteDraws(fx);
      const particles = particleDraws(fx);
      const rect = gameRectFor(profile);

      // Two depth layers: back silt then front silt/trail, nothing re-allocated.
      expect(particles).toHaveLength(2);
      expect(particles.reduce((sum, draw) => sum + draw.count, 0)).toBe(
        profile.particleCount * 6
      );
      expect(particles[0].first).toBe(0);
      expect(particles[1].first).toBe(particles[0].count);
      // Layer draws share the world's hit shake, if any.
      expect(uniformPair(particles[1], 'uShake')).toEqual(
        uniformPair(particles[0], 'uShake')
      );

      // Pearl glow at visualY (not the base pearl.y), jellyfish glow at bottomY.
      const pearlOne = worldToDevice(profile, snapshot, 120, 210);
      const pearlTwo = worldToDevice(profile, snapshot, 280, 236);
      const jellyOne = worldToDevice(profile, snapshot, 122, 300);
      const jellyTwo = worldToDevice(profile, snapshot, 282, 340);
      expect(spriteAt(fx, pearlOne.x, pearlOne.y)).toBeDefined();
      expect(spriteAt(fx, pearlTwo.x, pearlTwo.y)).toBeDefined();
      expect(spriteAt(fx, jellyOne.x, jellyOne.y)).toBeDefined();
      expect(spriteAt(fx, jellyTwo.x, jellyTwo.y)).toBeDefined();

      // Shield rim/ring at the fish: no full-screen lens warp, a local sprite.
      const fish = worldToDevice(profile, snapshot, snapshot.fish.x, snapshot.fish.y);
      const shieldDraws = sprites.filter((draw) => {
        const center = uniformPair(draw, 'uCenter');
        return (
          center !== null &&
          Math.abs(center[0] - fish.x) < 0.01 &&
          Math.abs(center[1] - fish.y) < 0.01
        );
      });
      expect(shieldDraws).toHaveLength(2);
      const shieldRing = shieldDraws.find(
        (draw) => uniformNumber(draw, 'uKind') === 1
      );
      expect(shieldRing).toBeDefined();
      expect(colorMatches(shieldRing!, [0.4, 0.92, 1])).toBe(true);
      const shieldSize = uniformPair(shieldRing!, 'uSize')!;
      expect(shieldSize[0]).toBe(shieldSize[1]);
      expect(shieldSize[0]).toBeGreaterThan(0);
      expect(shieldSize[0]).toBeLessThan(rect.width);

      // All four one-shot events map to a draw at their own position.
      for (const event of snapshot.events) {
        const point = worldToDevice(profile, snapshot, event.x, event.y);
        expect(spriteAt(fx, point.x, point.y)).toBeDefined();
      }

      // Every effects sprite is a bounded local quad, never a full-stage
      // warp or an extra composite pass.
      for (const draw of sprites) {
        const size = uniformPair(draw, 'uSize')!;
        expect(size[0]).toBe(size[1]);
        expect(size[0]).toBeGreaterThan(0);
        expect(size[0]).toBeLessThan(rect.width / 2);
      }
      expect(fx.some((draw) => draw.uniforms.uBloom !== undefined)).toBe(false);
      backend.dispose();
    }
  );

  it('centres sprite and particle quads on their anchors', () => {
    // Source pin: a top-left quad (aPos * size) silently shifts every glow,
    // ring and shield off its anchor by half its size.
    expect(spriteVertSource).toMatch(CENTERED_QUAD);
    expect(particleVertSource).toMatch(CENTERED_QUAD);
    expect(spriteVertSource).not.toMatch(TOP_LEFT_QUAD);
    expect(particleVertSource).not.toMatch(TOP_LEFT_QUAD);

    const profile = QUALITY_PROFILES.high;
    const { gl, drawStates } = createTrackedFakeGl();
    const { backend } = initBackend(gl);
    const snapshot = makeRichFxSnapshot();

    backend.resize(390, 844, GAME_RECT, profile);
    backend.beginFrame(snapshot, profile);
    const before = drawStates.length;
    backend.effects(snapshot, profile);
    const fx = drawStates.slice(before);
    const rect = gameRectFor(profile);

    // A pearl glow's quad surrounds its visualY anchor, not the base pearl.y.
    const pearl = worldToDevice(profile, snapshot, 120, 210);
    const glow = spriteAt(fx, pearl.x, pearl.y)!;
    const glowSize = uniformPair(glow, 'uSize')!;
    const glowBounds = centeredBounds(uniformPair(glow, 'uCenter')!, glowSize);
    expect(glowBounds.left).toBeLessThan(pearl.x);
    expect(glowBounds.right).toBeGreaterThan(pearl.x);
    expect(glowBounds.top).toBeLessThan(pearl.y);
    expect(glowBounds.bottom).toBeGreaterThan(pearl.y);
    expect(glowBounds.top).toBeLessThan(pearl.y - 10);
    expect(glowBounds.bottom).toBeGreaterThan(pearl.y + 10);
    expect(glowBounds.right - glowBounds.left).toBeCloseTo(glowSize[0], 6);

    // The shield ring's local quad is centred on the fish, not down-right.
    const fish = worldToDevice(profile, snapshot, snapshot.fish.x, snapshot.fish.y);
    const shieldRing = spriteDraws(fx).find((draw) => {
      const center = uniformPair(draw, 'uCenter')!;
      return (
        uniformNumber(draw, 'uKind') === 1 &&
        Math.abs(center[0] - fish.x) < 0.01 &&
        Math.abs(center[1] - fish.y) < 0.01
      );
    })!;
    const shieldBounds = centeredBounds(
      uniformPair(shieldRing, 'uCenter')!,
      uniformPair(shieldRing, 'uSize')!
    );
    expect(shieldBounds.left).toBeLessThan(fish.x);
    expect(shieldBounds.right).toBeGreaterThan(fish.x);
    expect(shieldBounds.top).toBeLessThan(fish.y);
    expect(shieldBounds.bottom).toBeGreaterThan(fish.y);
    // Centring, not a top-left anchor: both edges clear the fish.
    expect(fish.x - shieldBounds.left).toBeCloseTo(shieldBounds.right - fish.x, 6);
    expect(fish.y - shieldBounds.top).toBeCloseTo(shieldBounds.bottom - fish.y, 6);
    expect(shieldBounds.right - shieldBounds.left).toBeLessThan(rect.width / 2);

    // Two static particle ranges, 6 vertices apiece; their vertex shader uses
    // the same centred convention.
    const particles = particleDraws(fx);
    expect(particles).toHaveLength(2);
    expect(particles.every((draw) => draw.count % 6 === 0)).toBe(true);

    backend.dispose();
  });

  it('maps each event type to its ring or pulse and ignores 500 ms-old events', () => {
    const profile = QUALITY_PROFILES.high;
    const { gl, drawStates } = createTrackedFakeGl();
    const { backend } = initBackend(gl);
    const events: RenderEvent[] = [
      { type: 'hit', x: 30, y: 500, t: 9.95 },
      { type: 'shield-pop', x: 70, y: 520, t: 9.9 },
      { type: 'best', x: 110, y: 540, t: 9.85 },
      { type: 'pearl', x: 150, y: 560, t: 9.8 },
      { type: 'shield-activate', x: 180, y: 570, t: 9.75 },
      { type: 'hit', x: 210, y: 580, t: 9.4 },
      { type: 'hit', x: 240, y: 600, t: 9.5 },
    ];
    const snapshot = makeFxSnapshot({ time: 10, events });

    backend.resize(390, 844, GAME_RECT, profile);
    backend.beginFrame(snapshot, profile);
    const before = drawStates.length;
    backend.effects(snapshot, profile);
    const fx = drawStates.slice(before);

    // Four live, styled events; shield-activate and both expired hits draw none.
    expect(spriteDraws(fx)).toHaveLength(4);

    const expected = [
      { event: events[0], kind: 1, color: [1, 0.58, 0.3] },
      { event: events[1], kind: 1, color: [0.32, 0.92, 1] },
      { event: events[2], kind: 0, color: [1, 0.82, 0.3] },
      { event: events[3], kind: 2, color: [1, 0.96, 0.72] },
    ];

    for (const { event, kind, color } of expected) {
      const point = worldToDevice(profile, snapshot, event.x, event.y);
      const draw = spriteAt(fx, point.x, point.y);
      expect(draw).toBeDefined();
      expect(uniformNumber(draw!, 'uKind')).toBe(kind);
      expect(colorMatches(draw!, color)).toBe(true);
    }

    // Strict "younger than 500 ms": 0.5 s old is already gone.
    for (const event of [events[5], events[6]]) {
      const point = worldToDevice(profile, snapshot, event.x, event.y);
      expect(spriteAt(fx, point.x, point.y)).toBeUndefined();
    }
    const activate = worldToDevice(profile, snapshot, 180, 570);
    expect(spriteAt(fx, activate.x, activate.y)).toBeUndefined();

    backend.dispose();
  });

  it('expands each one-shot ring and fades it as it ages', () => {
    const profile = QUALITY_PROFILES.high;
    const { gl, drawStates } = createTrackedFakeGl();
    const { backend } = initBackend(gl);

    backend.resize(390, 844, GAME_RECT, profile);

    const sample = (age: number): DrawState => {
      const snapshot = makeFxSnapshot({
        time: 5,
        events: [{ type: 'hit', x: 60, y: 300, t: 5 - age }],
      });
      backend.beginFrame(snapshot, profile);
      const before = drawStates.length;
      backend.effects(snapshot, profile);
      const point = worldToDevice(profile, snapshot, 60, 300);
      const draw = spriteAt(drawStates.slice(before), point.x, point.y);
      expect(draw).toBeDefined();
      return draw!;
    };

    const young = sample(0.05);
    const old = sample(0.45);
    expect(uniformPair(old, 'uSize')![0]).toBeGreaterThan(
      uniformPair(young, 'uSize')![0]
    );
    expect(uniformPair(old, 'uColor')![3]).toBeLessThan(
      uniformPair(young, 'uColor')![3]
    );

    backend.dispose();
  });

  it('draws the shield ring at the fish only while the shield is active', () => {
    const profile = QUALITY_PROFILES.high;
    const { gl, drawStates } = createTrackedFakeGl();
    const { backend } = initBackend(gl);
    const snapshot = makeFxSnapshot({
      shield: { active: false, activeTime: 0 },
      obstacles: [],
      events: [],
    });

    backend.resize(390, 844, GAME_RECT, profile);
    backend.beginFrame(snapshot, profile);
    let before = drawStates.length;
    backend.effects(snapshot, profile);
    expect(spriteDraws(drawStates.slice(before))).toHaveLength(0);

    snapshot.shield = { active: true, activeTime: 0.4 };
    backend.beginFrame(snapshot, profile);
    before = drawStates.length;
    backend.effects(snapshot, profile);
    const shieldSprites = spriteDraws(drawStates.slice(before));
    expect(shieldSprites).toHaveLength(2);

    const fish = worldToDevice(profile, snapshot, snapshot.fish.x, snapshot.fish.y);
    for (const draw of shieldSprites) {
      const center = uniformPair(draw, 'uCenter');
      expect(center![0]).toBeCloseTo(fish.x, 6);
      expect(center![1]).toBeCloseTo(fish.y, 6);
      // Local quad, not a full-screen warp of the fish/scene.
      expect(uniformPair(draw, 'uSize')![0]).toBeLessThan(gameRectFor(profile).width);
    }
    expect(shieldSprites.some((draw) => uniformNumber(draw, 'uKind') === 1)).toBe(
      true
    );

    backend.dispose();
  });

  it('allocates the particle pool from the profile and reallocates on tier change', () => {
    const { gl, drawStates, bufferUploads } = createTrackedFakeGl();
    const { backend } = initBackend(gl);
    const snapshot = makeFxSnapshot();

    // init uploads only the shared unit quad.
    expect(bufferUploads).toHaveLength(1);
    expect(bufferUploads[0].data).toHaveLength(24);

    const fxOf = (tier: keyof typeof QUALITY_PROFILES): DrawState[] => {
      const profile = QUALITY_PROFILES[tier];
      backend.beginFrame(snapshot, profile);
      const before = drawStates.length;
      backend.effects(snapshot, profile);
      return drawStates.slice(before);
    };

    backend.resize(390, 844, GAME_RECT, QUALITY_PROFILES.high);
    expect(bufferUploads[1].data).toHaveLength(180 * 6 * 8);
    let particle = particleDraws(fxOf('high'));
    expect(particle.map((draw) => draw.count)).toEqual([594, 486]);

    backend.resize(390, 844, GAME_RECT, QUALITY_PROFILES.medium);
    expect(bufferUploads[2].data).toHaveLength(90 * 6 * 8);
    expect(mocked(gl.createBuffer).mock.calls.length).toBe(3);
    particle = particleDraws(fxOf('medium'));
    expect(particle.map((draw) => draw.count)).toEqual([300, 240]);

    backend.resize(390, 844, GAME_RECT, QUALITY_PROFILES.low);
    expect(bufferUploads[3].data).toHaveLength(40 * 6 * 8);
    expect(particleDraws(fxOf('low'))).toHaveLength(0);

    backend.resize(390, 844, GAME_RECT, QUALITY_PROFILES.high);
    expect(bufferUploads[4].data).toHaveLength(180 * 6 * 8);
    particle = particleDraws(fxOf('high'));
    expect(particle.map((draw) => draw.count)).toEqual([594, 486]);

    backend.dispose();
  });

  it('never uploads or allocates particle buffers per frame', () => {
    const { gl, drawStates, bufferUploads } = createTrackedFakeGl();
    const { backend } = initBackend(gl);
    const profile = QUALITY_PROFILES.high;
    const snapshot = makeFxSnapshot({ time: 3 });

    backend.resize(390, 844, GAME_RECT, profile);
    const uploads = bufferUploads.length;
    const buffers = mocked(gl.createBuffer).mock.calls.length;
    const arrays = mocked(gl.createVertexArray).mock.calls.length;

    for (let i = 0; i < 30; i++) {
      snapshot.time = 3 + i / 60;
      backend.effects(snapshot, profile);
    }

    expect(bufferUploads.length).toBe(uploads);
    expect(mocked(gl.createBuffer).mock.calls.length).toBe(buffers);
    expect(mocked(gl.createVertexArray).mock.calls.length).toBe(arrays);

    const times = particleDraws(drawStates).map(
      (draw) => uniformNumber(draw, 'uTime')!
    );
    expect(new Set(times).size).toBe(30);

    backend.dispose();
  });

  it('scales shake 1x/0.5x by tier and applies it only to world sampling', () => {
    const render = (tier: keyof typeof QUALITY_PROFILES, age: number, reducedMotion = false) => {
      const profile = reducedMotion
        ? getQualityProfile(tier, true)!
        : QUALITY_PROFILES[tier];
      const { gl, drawStates } = createTrackedFakeGl();
      const { backend } = initBackend(gl);
      const snapshot = makeFxSnapshot({
        time: 5,
        events: [{ type: 'hit', x: 60, y: 300, t: 5 - age }],
      });

      backend.resize(390, 844, GAME_RECT, profile);
      backend.beginFrame(snapshot, profile);
      const before = drawStates.length;
      backend.background(snapshot, profile);
      backend.scene(snapshot, profile);
      backend.effects(snapshot, profile);
      backend.composite(snapshot, profile);
      const draws = drawStates.slice(before);

      const background = draws.find(
        (draw) => draw.uniforms.uWorld !== undefined
      )!;
      const scene = draws.find(
        (draw) => draw.uniforms.uSceneSize !== undefined
      )!;
      const composite = draws.find(
        (draw) => draw.uniforms.uBloom !== undefined
      )!;
      const sprites = spriteDraws(draws);

      backend.dispose();
      return { background, scene, composite, sprites, profile, draws };
    };

    const high = render('high', 0.04);
    const highShake = uniformPair(high.background, 'uShake')!;
    expect(Math.hypot(highShake[0], highShake[1])).toBeCloseTo(2, 6);
    expect(uniformPair(high.scene, 'uShake')).toEqual(highShake);
    expect(high.sprites.length).toBeGreaterThan(0);
    for (const draw of high.sprites) {
      expect(uniformPair(draw, 'uShake')).toEqual(highShake);
    }
    // Shake is one coherent world translation (background, scene and effect
    // sprites share it). The composite is a single final present pass with
    // unchanged exposure; the DOM HUD is never part of the WebGL frame.
    expect(high.composite.uniforms.uShake).toBeUndefined();
    expect(
      high.draws.filter((draw) => draw.uniforms.uBloom !== undefined)
    ).toHaveLength(1);
    expect(high.draws[high.draws.length - 1]).toBe(high.composite);
    expect(high.composite.framebuffer).toBeNull();
    expect(uniformNumber(high.composite, 'uExposure')).toBeCloseTo(1.1, 6);
    for (const draw of high.sprites) {
      expect(uniformPair(draw, 'uSize')![0]).toBeLessThan(
        gameRectFor(high.profile).width / 2
      );
    }
    expect(uniformPair(high.scene, 'uGameRect')).toEqual([0, 151, 780, 1386]);

    const medium = render('medium', 0.04);
    const mediumShake = uniformPair(medium.background, 'uShake')!;
    expect(Math.hypot(mediumShake[0], mediumShake[1])).toBeCloseTo(1, 6);

    const low = render('low', 0.04);
    expect(uniformPair(low.background, 'uShake')).toEqual([0, 0]);
    expect(uniformPair(low.scene, 'uShake')).toEqual([0, 0]);

    const reduced = render('high', 0.04, true);
    expect(uniformPair(reduced.background, 'uShake')).toEqual([0, 0]);
    expect(uniformPair(reduced.scene, 'uShake')).toEqual([0, 0]);

    // Older than the 120 ms decay but younger than the 500 ms ring window:
    // the world is still, while the hit ring is still visible.
    const decayed = render('high', 0.2);
    expect(uniformPair(decayed.background, 'uShake')).toEqual([0, 0]);
    expect(decayed.sprites.length).toBeGreaterThan(0);
  });

  it('turns a hit into a bloom swell, never a luminance flash', () => {
    const profile = QUALITY_PROFILES.high;

    const compositeFor = (events: RenderEvent[]) => {
      const { gl, drawStates } = createTrackedFakeGl();
      const { backend } = initBackend(gl);
      const snapshot = makeFxSnapshot({ time: 6, events });

      backend.resize(390, 844, GAME_RECT, profile);
      backend.beginFrame(snapshot, profile);
      const before = drawStates.length;
      backend.bloom(snapshot, profile);
      backend.composite(snapshot, profile);
      const draw = drawStates
        .slice(before)
        .find((state) => state.uniforms.uBloom !== undefined)!;

      const result = {
        hit: uniformNumber(draw, 'uHit')!,
        exposure: uniformNumber(draw, 'uExposure')!,
        bloomStrength: uniformNumber(draw, 'uBloomStrength')!,
        bloomEnabled: uniformNumber(draw, 'uBloomEnabled')!,
        passes: drawStates.length - before,
        framebuffer: draw.framebuffer,
      };
      backend.dispose();
      return result;
    };

    expect(compositeFor([]).hit).toBe(0);

    const recent = compositeFor([{ type: 'hit', x: 60, y: 300, t: 5.9 }]);
    expect(recent.hit).toBeCloseTo(0.8, 6);
    expect(recent.exposure).toBeCloseTo(1.1, 6);
    expect(recent.bloomStrength).toBeCloseTo(0.55, 6);
    expect(recent.bloomEnabled).toBe(1);

    // A hit only scales the bloom multiplier: exposure, bloom strength,
    // enablement, pass count and the present target are all unchanged (no
    // luminance flash and no extra full-screen pass).
    const noHit = compositeFor([]);
    expect(recent.exposure).toBe(noHit.exposure);
    expect(recent.bloomStrength).toBe(noHit.bloomStrength);
    expect(recent.bloomEnabled).toBe(noHit.bloomEnabled);
    expect(recent.passes).toBe(noHit.passes);
    expect(recent.framebuffer).toBeNull();
    expect(noHit.framebuffer).toBeNull();

    // Past the one-shot window the swell is gone.
    expect(compositeFor([{ type: 'hit', x: 60, y: 300, t: 5.4 }]).hit).toBe(0);
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
