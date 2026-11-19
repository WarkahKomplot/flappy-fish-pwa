#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uResolution;
uniform float uTime;
uniform vec4 uGameRect; // x, y, width, height in framebuffer pixels, top-left origin
uniform vec2 uWorld;    // 360 x 640

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbmNoise(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * valueNoise(p);
    p = p * 2.02 + vec2(13.7, 7.3);
    amplitude *= 0.5;
  }
  return value;
}

vec3 toLinear(vec3 c) {
  // Palette is authored in sRGB; the compositor/present pair works in linear.
  return pow(c, vec3(2.2));
}

// Caustic-ish interference bands, warped by noise. Evaluated in world space.
float causticBands(vec2 p, float t) {
  vec2 q = p * 0.045;
  q += 0.35 * vec2(
    valueNoise(q * 1.3 + t * 0.05),
    valueNoise(q * 1.3 - t * 0.04 + 3.7)
  );
  float bands = sin(q.x * 9.0 + sin(q.y * 6.0 + t * 0.3) * 1.4 + t * 0.15);
  bands += sin(q.y * 8.0 - cos(q.x * 5.0 - t * 0.2) * 1.2 - t * 0.11);
  return pow(clamp(0.5 + 0.25 * bands, 0.0, 1.0), 3.0);
}

void main() {
  vec2 stagePx = vec2(vUv.x * uResolution.x, (1.0 - vUv.y) * uResolution.y);
  vec2 world = vec2(
    (stagePx.x - uGameRect.x) / max(uGameRect.z, 1.0) * uWorld.x,
    (stagePx.y - uGameRect.y) / max(uGameRect.w, 1.0) * uWorld.y
  );

  // 0 at the surface line (world y=0), 1 at the seabed (world y=640).
  float depth = world.y / uWorld.y;
  float above = 1.0 - smoothstep(-110.0, 6.0, world.y);
  float below = smoothstep(600.0, 720.0, world.y);

  // Base water column: teal near the surface, indigo at depth.
  vec3 shallow = toLinear(vec3(0.043, 0.235, 0.361));
  vec3 mid = toLinear(vec3(0.014, 0.118, 0.235));
  vec3 deep = toLinear(vec3(0.004, 0.027, 0.071));
  vec3 color = mix(shallow, mid, smoothstep(-0.05, 0.55, depth));
  color = mix(color, deep, smoothstep(0.45, 1.05, depth));

  // Bright underside of the surface in the top bars (world y < 0).
  float surfaceBand = exp(-abs(world.y + 18.0) * 0.035);
  color += toLinear(vec3(0.10, 0.48, 0.62)) *
    surfaceBand * (0.32 + 0.10 * sin(world.x * 0.02 + uTime * 0.5));
  color += toLinear(vec3(0.32, 0.76, 0.86)) * above * 0.08;

  // Slow volumetric shafts falling from the surface.
  float shaft = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float centerX = uWorld.x * (0.12 + fi * 0.19) +
      sin(uTime * 0.11 + fi * 1.7) * 34.0;
    float halfWidth = 18.0 + fi * 5.0;
    float band = 1.0 - smoothstep(
      0.0,
      halfWidth,
      abs(world.x - centerX - (world.y + 120.0) * 0.16)
    );
    float fade = smoothstep(-140.0, 30.0, world.y) *
      (1.0 - smoothstep(280.0, 640.0, world.y));
    float flicker = 0.62 + 0.38 * sin(uTime * 0.24 + fi * 2.1 + world.y * 0.012);
    shaft += band * fade * flicker * (0.55 - fi * 0.07);
  }
  color += toLinear(vec3(0.07, 0.38, 0.52)) * clamp(shaft, 0.0, 1.0) * 0.5;

  // Animated caustics projected under the surface.
  float ca = causticBands(world + vec2(uTime * 7.0, -uTime * 3.0), uTime);
  float causticMask =
    (1.0 - smoothstep(120.0, 470.0, world.y)) *
    smoothstep(-220.0, -10.0, world.y);
  color += toLinear(vec3(0.06, 0.42, 0.50)) * ca * causticMask * 0.55;

  // Distant trench silhouettes with a slow parallax.
  float ridgeNoise = fbmNoise(vec2(world.x * 0.010 + uTime * 0.004, 1.7));
  float ridgeDetail = fbmNoise(vec2(world.x * 0.030 - uTime * 0.006, 4.1));
  float ridgeTop = 520.0 - ridgeNoise * 116.0 - ridgeDetail * 30.0;
  float silhouette = smoothstep(ridgeTop - 6.0, ridgeTop + 8.0, world.y);
  color = mix(color, toLinear(vec3(0.007, 0.018, 0.030)), silhouette * 0.7);

  // A closer rock shelf along the seabed, with a faint silt glow below it.
  float shelfTop = 596.0 - fbmNoise(vec2(world.x * 0.014 + 8.0, 9.0)) * 46.0;
  float shelfMask = smoothstep(shelfTop - 4.0, shelfTop + 45.0, world.y);
  color = mix(color, toLinear(vec3(0.011, 0.030, 0.040)), shelfMask * 0.85);
  color += toLinear(vec3(0.015, 0.050, 0.052)) *
    below * (0.4 + 0.2 * fbmNoise(world * 0.02 + uTime * 0.03));

  // Depth fog pools below the playfield without veiling the reading area.
  float fog = smoothstep(240.0, 700.0, world.y);
  color = mix(color, toLinear(vec3(0.007, 0.042, 0.062)), fog * 0.35);

  // Marine snow: hash cells drift slowly and twinkle.
  vec2 snowUv = world * 0.11 + vec2(uTime * 0.035, -uTime * 0.045);
  vec2 cell = floor(snowUv);
  vec2 cellOffset = fract(snowUv) - 0.5;
  float rnd = hash12(cell);
  vec2 drift = (hash22(cell) - 0.5) * 0.35;
  float mote = (1.0 - smoothstep(0.0, 0.10, length(cellOffset - drift))) *
    step(0.72, rnd) *
    (0.5 + 0.5 * sin(uTime * 1.7 + rnd * 26.0));
  color += toLinear(vec3(0.35, 0.70, 0.78)) * mote * 0.35;

  // Vignette/grading stay in the Task 8 composite so the edges here are even.
  fragColor = vec4(color, 1.0);
}
