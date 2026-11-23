#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uImage;
uniform vec2 uTexelSize;
uniform vec2 uDirection;
uniform float uWeight;
// 1 = additive upsample pass: a 3x3 tent over the source texel grid. The old
// direction-(0,0) degenerate kernel sampled the same point 9 times, which
// bilinear-blocked the coarser mip and made the glow flicker when it moved.
uniform float uUpsample;
void main() {
  if (uUpsample > 0.5) {
    vec2 t = uTexelSize;
    vec4 sum = texture(uImage, vUv) * 4.0;
    sum += texture(uImage, vUv + vec2(t.x, 0.0)) * 2.0;
    sum += texture(uImage, vUv - vec2(t.x, 0.0)) * 2.0;
    sum += texture(uImage, vUv + vec2(0.0, t.y)) * 2.0;
    sum += texture(uImage, vUv - vec2(0.0, t.y)) * 2.0;
    sum += texture(uImage, vUv + t);
    sum += texture(uImage, vUv - t);
    sum += texture(uImage, vUv + vec2(t.x, -t.y));
    sum += texture(uImage, vUv + vec2(-t.x, t.y));
    fragColor = vec4((sum * (1.0 / 16.0) * uWeight).rgb, 1.0);
    return;
  }
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
  fragColor = vec4((sum * uWeight).rgb, 1.0);
}
