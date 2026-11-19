#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uScene;
uniform vec2 uSceneSize;
void main() {
  vec2 texel = 1.0 / max(uSceneSize, vec2(1.0));
  vec2 uv = clamp(vUv, texel * 0.5, 1.0 - texel * 0.5);
  fragColor = texture(uScene, uv);
}
