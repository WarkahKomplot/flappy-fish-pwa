#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uScene;
uniform float uThreshold;
uniform float uHeadroom;
void main() {
  vec3 color = texture(uScene, vUv).rgb;
  vec3 bright = max(color - uThreshold, vec3(0.0));
  // RGBA8 fallback: store min(color - uThreshold, 4) / 4; composite x4.
  bright = min(bright, vec3(4.0)) / max(uHeadroom, 1.0);
  fragColor = vec4(bright, 1.0);
}
