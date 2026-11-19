#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uResolution;
uniform float uTime;
uniform float uExposure;
uniform float uBloomScale;
uniform float uBloomStrength;
uniform float uBloomEnabled;
uniform float uVignette;
uniform float uGrain;
uniform float uCA;
uniform float uDither;
uniform float uGradeStrength;
uniform vec4 uGradeShadow;
uniform vec4 uGradeHighlight;
vec3 acesFilm(vec3 x) {
  vec3 numerator = x * (2.51 * x + 0.03);
  vec3 denominator = x * (2.43 * x + 0.59) + 0.14;
  return clamp(numerator / denominator, 0.0, 1.0);
}
vec3 linearToSrgb(vec3 c) {
  vec3 low = c * 12.92;
  vec3 high = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  return mix(low, high, step(vec3(0.0031308), c));
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x * 0.5 + a.y * a.y * 0.75);
}
float bayer4(vec2 a) {
  return bayer2(a * 0.5) * 0.25 + bayer2(a);
}
float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}
void main() {
  vec3 scene = texture(uScene, vUv).rgb;
  if (uCA > 0.0) {
    vec2 caOffset = (vUv - 0.5) * uCA * 2.0;
    scene.r = texture(uScene, clamp(vUv + caOffset, 0.0, 1.0)).r;
    scene.g = texture(uScene, vUv).g;
    scene.b = texture(uScene, clamp(vUv - caOffset, 0.0, 1.0)).b;
  }
  vec3 color = scene;
  if (uBloomEnabled > 0.5) {
    color += texture(uBloom, vUv).rgb * uBloomScale * uBloomStrength;
  }
  color = acesFilm(color * uExposure);
  float l = luma(color);
  vec3 tint = mix(
    uGradeShadow.rgb,
    uGradeHighlight.rgb,
    smoothstep(uGradeShadow.a, uGradeHighlight.a, l)
  );
  color *= mix(vec3(1.0), tint, uGradeStrength);
  float vig = smoothstep(0.28, 0.82, length(vUv - 0.5));
  color *= 1.0 - uVignette * vig;
  vec3 srgb = linearToSrgb(clamp(color, 0.0, 1.0));
  float grain = (hash12(vUv * uResolution + fract(uTime) * 113.0) - 0.5) * uGrain;
  srgb += grain;
  srgb += (bayer4(gl_FragCoord.xy) - 0.5) * uDither;
  fragColor = vec4(clamp(srgb, 0.0, 1.0), 1.0);
}
