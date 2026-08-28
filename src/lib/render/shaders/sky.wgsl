struct Params {
  time: f32,
  shake: f32,
  flash: f32,
  _pad: f32,
}

@group(0) @binding(0) var<uniform> params: Params;

struct Out {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

fn hash21(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

@vertex fn vs_main(@builtin(vertex_index) vi: u32) -> Out {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var out: Out;
  out.position = vec4f(p[vi], 0.999, 1.0);
  out.uv = p[vi] * vec2f(0.5, -0.5) + vec2f(0.5);
  return out;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = uv + vec2f(params.shake * 0.012, params.shake * 0.008);
  let y = p.y;

  var col = mix(vec3f(0.02, 0.03, 0.1), vec3f(0.78, 0.32, 0.16), smoothstep(0.18, 0.72, y));
  col = mix(col, vec3f(0.06, 0.05, 0.12), smoothstep(0.74, 1.0, y));
  col += vec3f(1.0, 0.52, 0.2) * exp(-pow((y - 0.62) * 7.0, 2.0)) * 0.55;

  let sun = vec2f(0.78, 0.6);
  let d = length(p - sun);
  col += vec3f(1.0, 0.75, 0.4) * exp(-d * d * 42.0);
  col += vec3f(1.0, 0.45, 0.15) * exp(-d * d * 8.0) * 0.35;

  let cell = floor(p * vec2f(90.0, 50.0));
  let star = hash21(cell);
  if (star > 0.985 && y < 0.5) {
    col += vec3f(0.8, 0.88, 1.0) * ((star - 0.985) * 40.0);
  }

  let grid = abs(sin(p.x * 18.0 + params.time * 0.15)) * 0.015 * (1.0 - y);
  col += vec3f(0.15, 0.2, 0.4) * grid;

  col += vec3f(params.flash);
  return vec4f(col, 1.0);
}
