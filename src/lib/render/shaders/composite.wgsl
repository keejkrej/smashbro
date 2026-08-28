@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

struct Grade {
  flash: f32,
  shake: f32,
  _p0: f32,
  _p1: f32,
}

@group(0) @binding(2) var<uniform> grade: Grade;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let jitter = vec2f(grade.shake * 0.01, grade.shake * -0.006);
  let r = textureSampleLevel(src, samp, uv + jitter + vec2f(0.0015 * grade.shake, 0.0), 0.0).r;
  let g = textureSampleLevel(src, samp, uv + jitter, 0.0).g;
  let b = textureSampleLevel(src, samp, uv + jitter - vec2f(0.0015 * grade.shake, 0.0), 0.0).b;
  var col = vec3f(r, g, b);
  let vignette = 1.0 - 0.45 * pow(length(uv - vec2f(0.5)), 1.6);
  col *= vignette;
  col += vec3f(grade.flash * 0.35);
  return vec4f(col, 1.0);
}
