#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uScene; // linear light, premultiplied alpha (alpha is opaque)
uniform sampler2D uBloom; // additive mip chain, already thresholded
uniform vec2 uResolution;
uniform float uTime;
uniform float uExposure;
uniform float uBloomScale;    // 1.0 half-float, 4.0 RGBA8 headroom
uniform float uBloomStrength;
uniform float uBloomEnabled;  // 0 when the profile disables bloom
uniform float uVignette;
uniform float uGrain;
uniform float uCA;
uniform float uDither;        // 0 on half-float, ~1/255 on RGBA8
uniform float uGradeStrength;
uniform vec4 uGradeShadow;    // rgb = teal shadow tint, a = shadow luma pivot
uniform vec4 uGradeHighlight; // rgb = warm highlight tint, a = highlight luma pivot

// Narkowicz 2015 fitted ACES curve. Output is display-referred but still
// linear; the sRGB encode happens at the very end.
vec3 acesFilm(vec3 x) {
  vec3 numerator = x * (2.51 * x + 0.03);
  vec3 denominator = x * (2.43 * x + 0.59) + 0.14;
  return clamp(numerator / denominator, 0.0, 1.0);
}

// Exact sRGB encode, the inverse of background.frag's palette decode. Keep
// the two in sync; a pow(2.2) approximation breaks the known-colour check.
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

// 4x4 ordered Bayer pattern in 0..1, built from two 2x2 levels.
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
  // Chromatic aberration is a radial sample offset on the linear scene. The
  // profile (and reduced motion) zero uCA, which makes this an exact sample.
  vec2 fromCenter = vUv - 0.5;
  vec2 caOffset = fromCenter * uCA * 2.0;
  vec3 scene;
  scene.r = texture(uScene, clamp(vUv + caOffset, 0.0, 1.0)).r;
  scene.g = texture(uScene, vUv).g;
  scene.b = texture(uScene, clamp(vUv - caOffset, 0.0, 1.0)).b;

  vec3 bloom = texture(uBloom, vUv).rgb * uBloomScale;
  vec3 color = scene + bloom * (uBloomStrength * uBloomEnabled);

  // Exposure and tonemap in linear light.
  color = acesFilm(color * uExposure);

  // Grade: teal shadows into warm highlights, mixed by display luminance.
  float l = luma(color);
  vec3 tint = mix(
    uGradeShadow.rgb,
    uGradeHighlight.rgb,
    smoothstep(uGradeShadow.a, uGradeHighlight.a, l)
  );
  color *= mix(vec3(1.0), tint, uGradeStrength);

  // Vignette (0.25 strength), applied before the encode.
  float vig = smoothstep(0.28, 0.82, length(vUv - 0.5));
  color *= 1.0 - uVignette * vig;

  vec3 srgb = linearToSrgb(clamp(color, 0.0, 1.0));

  // Grain and the ordered dither belong in display space, where the final
  // 8-bit quantization happens. The dither breaks up the dark-end banding of
  // the RGBA8 fallback; half-float targets turn it off.
  float grain = (hash12(vUv * uResolution + fract(uTime) * 113.0) - 0.5) * uGrain;
  srgb += grain;
  srgb += (bayer4(gl_FragCoord.xy) - 0.5) * uDither;

  fragColor = vec4(clamp(srgb, 0.0, 1.0), 1.0);
}
