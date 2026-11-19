#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aUv;

uniform vec4 uGameRect;   // x, y, width, height in framebuffer pixels, top-left origin
uniform vec2 uResolution; // framebuffer size in pixels

out vec2 vUv;

void main() {
  // Map the unit quad into the 9:16 game rect, then to clip space. The rect
  // keeps its fractional stage origin so the composite has no seam.
  vec2 stagePx = uGameRect.xy + aPos * uGameRect.zw;
  vec2 clip = vec2(
    stagePx.x / uResolution.x * 2.0 - 1.0,
    1.0 - stagePx.y / uResolution.y * 2.0
  );

  vUv = aUv;
  gl_Position = vec4(clip, 0.0, 1.0);
}
