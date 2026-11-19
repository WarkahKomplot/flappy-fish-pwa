#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aUv;

out vec2 vUv;

void main() {
  // Unit quad (0..1, top-left origin) covering the whole viewport.
  vUv = aUv;
  gl_Position = vec4(aPos * 2.0 - 1.0, 0.0, 1.0);
}
