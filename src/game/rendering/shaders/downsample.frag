#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uImage;
// Texel size of the (larger) SOURCE mip, so the tent is measured in source
// texels even when the size ratio is not exactly 2 (floor() rounding).
uniform vec2 uSourceTexelSize;
void main() {
  // 4 bilinear taps at the 2x2 source-texel group corners: with LINEAR
  // filtering each fetch averages a 2x2, so the result is a smooth 4x4 tent.
  // Point-sampling the source here aliases high-frequency glow into shimmer.
  vec2 h = uSourceTexelSize * 0.5;
  vec4 sum = texture(uImage, vUv + vec2(-h.x, -h.y));
  sum += texture(uImage, vUv + vec2(h.x, -h.y));
  sum += texture(uImage, vUv + vec2(-h.x, h.y));
  sum += texture(uImage, vUv + vec2(h.x, h.y));
  fragColor = vec4((sum * 0.25).rgb, 1.0);
}
