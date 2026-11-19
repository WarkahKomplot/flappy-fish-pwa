#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aSeed;
layout(location = 2) in vec4 aParams;
uniform vec2 uResolution;
uniform vec2 uShake;
uniform vec2 uFish;
uniform float uTime;
out vec2 vUv;
out vec4 vColor;
out float vKind;
void main() {
  vUv = aPos;
  vKind = 0.0;
  float layer = aParams.y;
  float size = aParams.x * mix(0.65, 1.7, layer);
  float speed = aParams.z * mix(9.0, 24.0, layer);
  vec2 stage = aSeed * uResolution;
  stage.y = mod(aSeed.y * uResolution.y - uTime * speed, uResolution.y);
  stage.x += sin(uTime * (0.3 + layer * 0.45) + aSeed.y * 21.0) *
    (3.0 + layer * 7.0);
  vec3 color = mix(vec3(0.10, 0.26, 0.30), vec3(0.16, 0.44, 0.50), layer);
  float alpha = mix(0.22, 0.42, layer) *
    (0.65 + 0.35 * sin(uTime * 1.7 + aSeed.x * 24.0));
  if (aParams.w > 0.5) {
    float k = fract(aSeed.x + uTime * 0.55);
    stage = uFish + vec2(
      -(8.0 + k * 44.0),
      (aSeed.y - 0.5) * 16.0 * (0.35 + k) +
        sin(uTime * 6.0 + aSeed.x * 18.0) * 2.5
    );
    color = vec3(0.30, 0.72, 0.80);
    alpha = (1.0 - k) * 0.28;
    size = 2.2;
  }
  vec2 px = stage + uShake + aPos * size;
  gl_Position = vec4(
    px.x / max(uResolution.x, 1.0) * 2.0 - 1.0,
    1.0 - px.y / max(uResolution.y, 1.0) * 2.0,
    0.0,
    1.0
  );
  vColor = vec4(color, alpha);
}
