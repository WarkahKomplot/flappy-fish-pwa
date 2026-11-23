#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uScene;
uniform vec2 uSceneSize;
// 1/255 on 8-bit targets, 0 on half-float: dither on write so re-quantizing
// the linear scene capture cannot band the deep-water range.
uniform float uWriteDither;
float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x * 0.5 + a.y * a.y * 0.75);
}
float bayer4(vec2 a) {
  return bayer2(a * 0.5) * 0.25 + bayer2(a);
}
void main() {
  vec2 texel = 1.0 / max(uSceneSize, vec2(1.0));
  vec2 uv = clamp(vUv, texel * 0.5, 1.0 - texel * 0.5);
  vec3 color = texture(uScene, uv).rgb;
  color += (bayer4(gl_FragCoord.xy) - 0.5) * uWriteDither;
  fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
