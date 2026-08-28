struct Camera { viewProjection: mat4x4f }
struct Model { model: mat4x4f }
struct Material { color: vec4f, emissive: f32, _p0: f32, _p1: f32, _p2: f32 }

@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<uniform> model: Model;
@group(0) @binding(2) var<uniform> material: Material;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) worldPos: vec3f,
}

@vertex fn vs_main(@location(0) position: vec3f, @location(1) normal: vec3f) -> VertexOut {
  var out: VertexOut;
  let world = model.model * vec4f(position, 1.0);
  out.position = camera.viewProjection * world;
  out.worldPos = world.xyz;
  out.normal = normalize((model.model * vec4f(normal, 0.0)).xyz);
  return out;
}

@fragment fn fs_main(@location(0) normal: vec3f, @location(1) worldPos: vec3f) -> @location(0) vec4f {
  let n = normalize(normal);
  let light = normalize(vec3f(0.45, 0.85, 0.55));
  let wrap = max(dot(n, light), 0.0) * 0.7 + 0.3;
  let rim = pow(1.0 - max(dot(n, normalize(vec3f(0.0, 0.2, 1.0))), 0.0), 3.0);
  let hemi = mix(vec3f(0.12, 0.08, 0.18), vec3f(1.0, 0.72, 0.45), n.y * 0.5 + 0.5);
  var rgb = material.color.rgb * wrap * hemi * 1.35;
  rgb += material.color.rgb * rim * 0.45;
  rgb += material.color.rgb * material.emissive;
  let fog = smoothstep(-8.0, -2.0, worldPos.y);
  rgb = mix(vec3f(0.05, 0.04, 0.1), rgb, fog);
  return vec4f(rgb, 1.0);
}
