#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uFrame;

vec3 linearToSrgb(vec3 c) {
  vec3 low = c * 12.92;
  vec3 high = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  return mix(low, high, step(vec3(0.0031308), c));
}

void main() {
  // Present pass: the scene FBO holds linear light; the default framebuffer
  // is authored in sRGB, so encode explicitly. Alpha stays opaque because the
  // FX canvas is created with alpha:false.
  vec3 color = texture(uFrame, vUv).rgb;
  fragColor = vec4(clamp(linearToSrgb(color), 0.0, 1.0), 1.0);
}
