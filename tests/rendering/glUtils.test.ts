import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadCanvas } from '../../src/game/rendering/glUtils';

/**
 * uploadCanvas is the per-frame scene capture path. Reallocating texture
 * storage with texImage2D on every frame is unnecessary when the canvas
 * dimensions are unchanged; only the first upload and real dimension changes
 * may reallocate.
 */
describe('uploadCanvas texture storage reuse', () => {
  let gl: Record<string, ReturnType<typeof vi.fn> | number>;
  let canvas: { width: number; height: number };

  beforeEach(() => {
    gl = {
      TEXTURE_2D: 0x0de1,
      RGBA: 0x1908,
      UNSIGNED_BYTE: 0x1401,
      SRGB8_ALPHA8: 0x8c43,
      UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9240,
      UNPACK_FLIP_Y_WEBGL: 0x9241,
      bindTexture: vi.fn(),
      pixelStorei: vi.fn(),
      texImage2D: vi.fn(),
      texSubImage2D: vi.fn(),
    };
    canvas = { width: 360, height: 640 };
  });

  it('uploads with texImage2D on first sight and texSubImage2D while size is unchanged', () => {
    const texture = {} as WebGLTexture;

    uploadCanvas(gl as unknown as WebGL2RenderingContext, texture, canvas as HTMLCanvasElement);
    expect(gl.texImage2D).toHaveBeenCalledTimes(1);
    expect(gl.texSubImage2D).not.toHaveBeenCalled();

    uploadCanvas(gl as unknown as WebGL2RenderingContext, texture, canvas as HTMLCanvasElement);
    uploadCanvas(gl as unknown as WebGL2RenderingContext, texture, canvas as HTMLCanvasElement);
    expect(gl.texImage2D).toHaveBeenCalledTimes(1);
    expect(gl.texSubImage2D).toHaveBeenCalledTimes(2);
  });

  it('reallocates with texImage2D when the canvas dimensions change', () => {
    const texture = {} as WebGLTexture;

    uploadCanvas(gl as unknown as WebGL2RenderingContext, texture, canvas as HTMLCanvasElement);
    canvas.width = 720;
    canvas.height = 1280;
    uploadCanvas(gl as unknown as WebGL2RenderingContext, texture, canvas as HTMLCanvasElement);
    expect(gl.texImage2D).toHaveBeenCalledTimes(2);
    expect(gl.texSubImage2D).not.toHaveBeenCalled();

    // And the new size can go back to sub-uploads.
    uploadCanvas(gl as unknown as WebGL2RenderingContext, texture, canvas as HTMLCanvasElement);
    expect(gl.texImage2D).toHaveBeenCalledTimes(2);
    expect(gl.texSubImage2D).toHaveBeenCalledTimes(1);
  });

  it('tracks storage per texture', () => {
    const a = {} as WebGLTexture;
    const b = {} as WebGLTexture;

    uploadCanvas(gl as unknown as WebGL2RenderingContext, a, canvas as HTMLCanvasElement);
    uploadCanvas(gl as unknown as WebGL2RenderingContext, b, canvas as HTMLCanvasElement);
    expect(gl.texImage2D).toHaveBeenCalledTimes(2);
    expect(gl.texSubImage2D).not.toHaveBeenCalled();
  });
});
