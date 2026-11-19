#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uImage;
uniform vec2 uTexelSize;
uniform vec2 uDirection;
uniform float uWeight;
void main() {
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
