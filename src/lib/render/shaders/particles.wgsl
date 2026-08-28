struct Params {
  time: f32,
  hitAge: f32,
  hitX: f32,
  hitY: f32,
  shake: f32,
  _p0: f32,
  _p1: f32,
  _p2: f32,
  viewProjection: mat4x4f,
}

@group(0) @binding(0) var<uniform> params: Params;

struct Out {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
}

fn hash(i: u32) -> vec3f {
  let n = f32(i) + 1.17;
  return fract(sin(vec3f(n, n * 1.3, n * 2.1)) * vec3f(43758.5453, 22421.123, 19283.45));
}

@vertex fn vs_main(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Out {
  var corners = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(0.0, 1.4));
  let rnd = hash(i);
  let life = clamp(params.hitAge / 0.45, 0.0, 1.0);
  let ang = rnd.x * 6.28318;
  let dist = (0.3 + rnd.y * 1.8) * life;
  let center = vec3f(
    params.hitX + cos(ang) * dist,
    params.hitY + sin(ang) * dist + (1.0 - life) * 0.4 + rnd.z * 0.3,
    (rnd.z - 0.5) * 0.8,
  );
  let size = (0.12 + rnd.y * 0.1) * (1.0 - life);

  var out: Out;
  out.position = params.viewProjection * vec4f(center + vec3f(corners[v] * size, 0.0), 1.0);
  let heat = mix(vec3f(1.0, 0.95, 0.7), vec3f(1.0, 0.35, 0.08), rnd.x);
  out.color = vec4f(heat, 1.0 - life);
  return out;
}

@fragment fn fs_main(@location(0) color: vec4f) -> @location(0) vec4f {
  return color;
}
