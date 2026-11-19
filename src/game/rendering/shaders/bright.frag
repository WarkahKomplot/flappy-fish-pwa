#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uScene;
uniform float uThreshold; // linear-light threshold, ~0.8
uniform float uHeadroom;  // 1.0 on half-float targets, 4.0 on RGBA8

void main() {
  // The scene FBO holds linear light (the Canvas 2D capture was uploaded as
  // SRGB8_ALPHA8), so threshold in linear space before any tonemap.
  vec3 color = texture(uScene, vUv).rgb;
  vec3 bright = max(color - uThreshold, vec3(0.0));

  // RGBA8 fallback: keep 4x headroom by storing min(color, 4) / 4; the
  // composite multiplies it back. Half-float targets need no headroom scale.
  bright = min(bright, vec3(4.0)) / max(uHeadroom, 1.0);

  fragColor = vec4(bright, 1.0);
}
