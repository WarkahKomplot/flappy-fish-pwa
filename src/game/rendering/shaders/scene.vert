#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aUv;
uniform vec4 uGameRect;
uniform vec2 uResolution;
out vec2 vUv;
void main() {
  vec2 stagePx = uGameRect.xy + aPos * uGameRect.zw;
  vec2 clip = vec2(
    stagePx.x / uResolution.x * 2.0 - 1.0,
    1.0 - stagePx.y / uResolution.y * 2.0
  );
  vUv = aUv;
  gl_Position = vec4(clip, 0.0, 1.0);
}
