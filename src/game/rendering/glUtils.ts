/**
 * Small WebGL2 helpers shared by the backend. Compilation and link failures
 * throw with the driver log so `WebGLBackend.init` can report it and fall
 * back; nothing here silently hands back a broken program.
 */

export interface Quad {
  vao: WebGLVertexArrayObject;
  buffer: WebGLBuffer;
}

export interface Framebuffer {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

export function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error(`Unable to create shader (type ${type})`);
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown compile error';
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log}`);
  }

  return shader;
}

export function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string
): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  let fragmentShader: WebGLShader | null = null;

  try {
    fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

    const program = gl.createProgram();
    if (!program) {
      throw new Error('Unable to create program');
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? 'unknown link error';
      gl.deleteProgram(program);
      throw new Error(`Program link failed: ${log}`);
    }

    return program;
  } finally {
    gl.deleteShader(vertexShader);
    if (fragmentShader) {
      gl.deleteShader(fragmentShader);
    }
  }
}

/**
 * One unit quad shared by every pass. `aPos` and `aUv` both run 0..1 with a
 * top-left origin; each shader maps that into its own space.
 */
export function createQuad(gl: WebGL2RenderingContext): Quad {
  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();
  if (!vao || !buffer) {
    if (vao) gl.deleteVertexArray(vao);
    if (buffer) gl.deleteBuffer(buffer);
    throw new Error('Unable to create the quad geometry');
  }

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      // aPos.x, aPos.y, aUv.x, aUv.y
      0, 0, 0, 0,
      1, 0, 1, 0,
      0, 1, 0, 1,
      0, 1, 0, 1,
      1, 0, 1, 0,
      1, 1, 1, 1,
    ]),
    gl.STATIC_DRAW
  );

  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  return { vao, buffer };
}

export function createTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) {
    throw new Error('Unable to create texture');
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return texture;
}

/**
 * Colour-only render target. The scene pass composites into this in linear
 * light; the composite encodes to sRGB. `type` defaults to UNSIGNED_BYTE;
 * pass HALF_FLOAT together with RGBA16F for the half-float path.
 */
export function createFbo(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  internalFormat: number,
  type: number = gl.UNSIGNED_BYTE
): Framebuffer {
  const texture = createTexture(gl);
  const framebuffer = gl.createFramebuffer();

  if (!framebuffer) {
    gl.deleteTexture(texture);
    throw new Error('Unable to create framebuffer');
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    internalFormat,
    width,
    height,
    0,
    gl.RGBA,
    type,
    null
  );
  gl.bindTexture(gl.TEXTURE_2D, null);

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0
  );

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
    throw new Error(`Framebuffer incomplete: 0x${status.toString(16)}`);
  }

  return { framebuffer, texture, width, height };
}

/**
 * Last uploaded canvas dimensions per texture, so a constant-size capture can
 * reuse the existing texture storage instead of reallocating every frame.
 */
const uploadedCanvasSizes = new WeakMap<WebGLTexture, { width: number; height: number }>();

/**
 * Uploads the Canvas 2D capture as an sRGB texture with premultiplied alpha.
 * The pixel-store flags are set on every upload on purpose: premultiplication
 * must never silently flip between frames. Same-size uploads use
 * texSubImage2D; only a real dimension change reallocates storage.
 */
export function uploadCanvas(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  canvas: HTMLCanvasElement
): void {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

  const previous = uploadedCanvasSizes.get(texture);
  if (
    previous &&
    previous.width === canvas.width &&
    previous.height === canvas.height
  ) {
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      canvas
    );
  } else {
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.SRGB8_ALPHA8,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      canvas
    );
    uploadedCanvasSizes.set(texture, {
      width: canvas.width,
      height: canvas.height,
    });
  }

  gl.bindTexture(gl.TEXTURE_2D, null);
}
