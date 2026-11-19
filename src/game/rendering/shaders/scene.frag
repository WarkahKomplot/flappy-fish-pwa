#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uScene;
uniform vec2 uSceneSize;

void main() {
  // uScene is uploaded as SRGB8_ALPHA8 with UNPACK_PREMULTIPLY_ALPHA_WEBGL,
  // so the sample is linear and premultiplied. The caller blends
  // ONE / ONE_MINUS_SRC_ALPHA; do not unpremultiply here or shadowBlur art
  // grows halos.
  vec2 texel = 1.0 / max(uSceneSize, vec2(1.0));
  vec2 uv = clamp(vUv, texel * 0.5, 1.0 - texel * 0.5);
  fragColor = texture(uScene, uv);
}
