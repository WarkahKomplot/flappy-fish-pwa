#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aUv;
uniform vec2 uResolution;
uniform vec2 uShake;
uniform vec2 uCenter;
uniform vec2 uSize;
uniform vec4 uColor;
uniform float uKind;
out vec2 vUv;
out vec4 vColor;
out float vKind;
void main() {
  vUv = aUv;
  vColor = uColor;
  vKind = uKind;
  vec2 px = uCenter + uShake + (aPos - vec2(0.5)) * uSize;
  gl_Position = vec4(
    px.x / max(uResolution.x, 1.0) * 2.0 - 1.0,
    1.0 - px.y / max(uResolution.y, 1.0) * 2.0,
    0.0,
    1.0
  );
}
