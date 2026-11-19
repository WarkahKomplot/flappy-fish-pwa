#version 300 es
precision highp float;
in vec2 vUv;
in vec4 vColor;
in float vKind;
out vec4 fragColor;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float d = length(p);
  float soft = pow(max(1.0 - d, 0.0), 2.0);
  float ring = smoothstep(0.58, 0.82, d) * (1.0 - smoothstep(0.86, 1.0, d));
  float star = pow(max(1.0 - abs(p.x), 0.0), 6.0) +
    pow(max(1.0 - abs(p.y), 0.0), 6.0);
  float shape = vKind < 0.5 ? soft : (vKind < 1.5 ? ring : soft * 0.4 + star * 0.6);
  float alpha = clamp(
    vColor.a * shape * (1.0 - smoothstep(0.96, 1.0, d)),
    0.0,
    1.0
  );
  fragColor = vec4(vColor.rgb * alpha, alpha);
}
