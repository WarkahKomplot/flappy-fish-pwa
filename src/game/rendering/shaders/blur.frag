#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uImage;
uniform vec2 uTexelSize; // 1 / target size; widens the kernel as a mip shrinks
uniform vec2 uDirection; // (1,0) horizontal, (0,1) vertical, (0,0) upsample
uniform float uWeight;   // 1.0 for a blur pass, 0.5 for an additive upsample

void main() {
  // Separable 9-tap Gaussian (5 weights, mirrored). Written as explicit taps
  // so no dynamic array indexing is required.
  vec2 stepUv = uTexelSize * uDirection;
  vec4 sum = texture(uImage, vUv) * 0.2270270270;
  sum += texture(uImage, vUv + stepUv * 1.0) * 0.1945945946;
  sum += texture(uImage, vUv - stepUv * 1.0) * 0.1945945946;
  sum += texture(uImage, vUv + stepUv * 2.0) * 0.1216216216;
  sum += texture(uImage, vUv - stepUv * 2.0) * 0.1216216216;
  sum += texture(uImage, vUv + stepUv * 3.0) * 0.0540540541;
  sum += texture(uImage, vUv - stepUv * 3.0) * 0.0540540541;
  sum += texture(uImage, vUv + stepUv * 4.0) * 0.0162162162;
  sum += texture(uImage, vUv - stepUv * 4.0) * 0.0162162162;

  // A weighted tap keeps the additive upsample from double-counting energy.
  fragColor = vec4((sum * uWeight).rgb, 1.0);
}
