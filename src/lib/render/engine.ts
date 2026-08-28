import {
  clock,
  draw,
  effect,
  frameLoop,
  geometry,
  init,
  sampler,
  surface,
  target,
  type Draw,
  type Gpu,
  type Surface,
  type Target,
} from "vgpu";
import { box, capsule, cone, perspectiveCamera, sphere } from "vgpu/scene";
import { compose } from "@/lib/game/mat4";
import { STAGE, type Fighter, type Match } from "@/lib/game/types";
import skySource from "./shaders/sky.wgsl";
import meshSource from "./shaders/mesh.wgsl";
import particleSource from "./shaders/particles.wgsl";
import compositeSource from "./shaders/composite.wgsl";

export type Renderer = {
  stop: () => void;
};

const P1 = [0.96, 0.34, 0.16, 1] as const;
const P2 = [0.18, 0.72, 1.0, 1] as const;
const SKIN = [1, 0.92, 0.85, 1] as const;
const STAGE_COL = [0.16, 0.15, 0.22, 1] as const;
const EDGE_COL = [1.0, 0.82, 0.32, 1] as const;
const FLAME = [1.0, 0.55, 0.12, 1] as const;
const VISOR = [0.42, 0.92, 1.0, 1] as const;
const SHIELD_EMBER = [0.16, 0.05, 0.02, 1] as const;
const SHIELD_VOLT = [0.03, 0.1, 0.16, 1] as const;

function optNum(f: Fighter, key: string): number {
  const v = (f as unknown as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function optOn(f: Fighter, key: string): boolean {
  const v = (f as unknown as Record<string, unknown>)[key];
  if (v === true) return true;
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

function smashPulse(f: Fighter, tick: number): number {
  const charge = optNum(f, "smashCharge");
  const swinging = Number(f.attackKind) === 3;
  if (charge <= 0 && !swinging) return 0;
  const amt = swinging ? 1 : Math.min(1, charge / 45);
  return amt * (0.34 + 0.52 * (0.5 + 0.5 * Math.sin(tick * 0.48)));
}

function makeMesh(gpu: Gpu, geom: ReturnType<typeof geometry>): Draw {
  return draw(gpu, {
    shader: meshSource,
    geometry: geom,
    cull: "back",
    depth: { write: true, compare: "less-equal" },
  });
}

function makeGlow(gpu: Gpu, geom: ReturnType<typeof geometry>): Draw {
  return draw(gpu, {
    shader: meshSource,
    geometry: geom,
    cull: "back",
    blend: "additive",
    depth: { write: false, compare: "less-equal" },
  });
}

function paint(
  item: Draw,
  viewProjection: Float32Array,
  model: Float32Array,
  color: readonly [number, number, number, number],
  emissive = 0,
): void {
  item.set({
    camera: { viewProjection },
    model: { model },
    material: { color, emissive, _p0: 0, _p1: 0, _p2: 0 },
  });
}

/** Column-major T * Rz * Ry * S so world lean follows facing yaw. */
function trs(
  x: number,
  y: number,
  z: number,
  rotY: number,
  rotZ: number,
  sx: number,
  sy: number,
  sz: number,
): Float32Array {
  const cy = Math.cos(rotY);
  const syr = Math.sin(rotY);
  const cz = Math.cos(rotZ);
  const szr = Math.sin(rotZ);
  return new Float32Array([
    cz * cy * sx,
    szr * cy * sx,
    -syr * sx,
    0,
    -szr * sy,
    cz * sy,
    0,
    0,
    cz * syr * sz,
    szr * syr * sz,
    cy * sz,
    0,
    x,
    y,
    z,
    1,
  ]);
}

function leanXY(x: number, y: number, rotZ: number): [number, number] {
  const c = Math.cos(rotZ);
  const s = Math.sin(rotZ);
  return [x * c - y * s, x * s + y * c];
}

type FighterAnim = {
  sx: number;
  sy: number;
  bob: number;
  breath: number;
  lean: number;
  yaw: number;
  headX: number;
  headY: number;
  headZ: number;
  leadX: number;
  leadY: number;
  leadZ: number;
  rearX: number;
  rearY: number;
  rearZ: number;
  leadGlow: number;
};

function fighterAnim(f: Fighter, tick: number): FighterAnim {
  const face = f.facing;
  const speed = Math.abs(f.vx);
  const air = !f.grounded;
  const jab = f.attackKind === 1;
  const special = f.attackKind === 2;
  const stunned = f.hitstun > 0;
  const runAmt =
    f.grounded && !jab && !special && !stunned ? Math.min(1, Math.max(0, (speed - 0.45) / 3.4)) : 0;
  const idle = f.grounded && runAmt < 0.12 && !jab && !special && !stunned;

  const breath = Math.sin(tick * 0.085) * (idle ? 0.038 : 0.012);
  const headDriftX = idle ? Math.sin(tick * 0.053) * 0.032 : 0;
  const headDriftZ = idle ? Math.cos(tick * 0.041) * 0.036 : 0;

  let sx: number;
  let sy: number;
  if (air) {
    const takeoff = Math.max(0, 1 - f.squash);
    sy = 1 + takeoff * 0.95;
    sx = 1 - takeoff * 0.38;
    if (f.y > 1.15) {
      const loft = Math.min(0.14, (f.y - 1.15) * 0.035);
      sy += loft;
      sx -= loft * 0.45;
    }
  } else {
    sy = f.squash;
    sx = 2 - f.squash;
  }

  const phase = tick * (0.3 + 0.1 * runAmt);
  const swing = Math.sin(phase) * runAmt;
  const pump = Math.cos(phase) * runAmt;
  const bob = Math.abs(Math.sin(phase)) * 0.05 * runAmt;

  let lean = Math.max(-0.48, Math.min(0.48, -f.vx * 0.042));
  if (air) lean *= 0.4;

  let twist = 0;
  let leadX = 0.16 + swing * 0.34;
  let leadY = 0.7 + pump * 0.09;
  let leadZ = 0.22;
  let rearX = -0.14 - swing * 0.34;
  let rearY = 0.68 - pump * 0.09;
  let rearZ = -0.18;
  let leadGlow = 0;

  if (air && !jab && !special && !stunned) {
    const lift = Math.min(1, 0.4 + Math.max(0, f.y) * 0.1);
    leadX = 0.14;
    leadY = 0.86 + lift * 0.14;
    leadZ = 0.26;
    rearX = -0.16;
    rearY = 0.8 + lift * 0.12;
    rearZ = -0.22;
  }

  if (jab) {
    const frame = 18 - f.attack;
    const punch =
      frame < 3 ? (frame / 3) * 0.22 : frame < 5 ? 0.22 + ((frame - 3) / 2) * 0.78 : frame <= 10 ? 1 : Math.max(0, 1 - (frame - 10) / 7);
    twist = 0.52 * punch;
    lean += -face * 0.14 * punch;
    leadX = 0.16 + punch * 0.5;
    leadY = 0.72 + punch * 0.05;
    leadZ = 0.16;
    rearX = -0.18 - punch * 0.2;
    rearY = 0.62 - punch * 0.04;
    rearZ = -0.1;
    leadGlow = frame >= 4 && frame <= 10 ? 0.4 : punch * 0.12;
  } else if (special) {
    const frame = 16 - f.attack;
    if (frame < 6) {
      const wind = (frame / 6) * (frame / 6);
      twist = -0.28 * wind;
      lean += face * 0.22 * wind;
      leadX = 0.1 - wind * 0.32;
      leadY = 0.74 + wind * 0.16;
      leadZ = 0.12;
      rearX = -0.08 + wind * 0.06;
      rearY = 0.64;
      rearZ = -0.14;
      sy *= 1 - wind * 0.08;
      sx *= 1 + wind * 0.06;
      leadGlow = 0.08 * wind;
    } else {
      const thrust = Math.min(1, (frame - 6) / 4);
      twist = 0.38 * thrust;
      lean += -face * 0.26 * thrust;
      leadX = -0.22 + thrust * 0.78;
      leadY = 0.9 - thrust * 0.12;
      leadZ = 0.18;
      rearX = -0.16 - thrust * 0.1;
      rearY = 0.6;
      rearZ = -0.12;
      leadGlow = 0.12 + thrust * 0.28;
    }
  }

  if (stunned) {
    const k = Math.min(1, f.hitstun / 20);
    const knock = Math.abs(f.vx) > 0.25 ? Math.sign(f.vx) : -face;
    lean = -knock * 0.42 * k + lean * 0.2;
    twist = Math.sin(tick * 0.55) * 0.18 * k;
    leadX = -0.06 + Math.sin(tick * 0.72) * 0.14 * k;
    leadY = 0.9 + Math.cos(tick * 0.8) * 0.1 * k;
    leadZ = 0.24;
    rearX = 0.04 + Math.cos(tick * 0.72) * 0.14 * k;
    rearY = 0.86 + Math.sin(tick * 0.8) * 0.1 * k;
    rearZ = -0.2;
    leadGlow = 0;
  }

  const dodge = optNum(f, "dodge") || (optOn(f, "dodge") ? 12 : 0);
  if (dodge > 0) {
    const amt = Math.min(1, dodge / 12);
    const speed = Math.hypot(f.vx, f.vy);
    if (speed > 0.05) {
      const ax = Math.abs(f.vx) / speed;
      const ay = Math.abs(f.vy) / speed;
      sx *= 1 + amt * 0.62 * ax - amt * 0.28 * ay;
      sy *= 1 + amt * 0.62 * ay - amt * 0.28 * ax;
    } else {
      sx *= 1 + amt * 0.45;
      sy *= 1 - amt * 0.2;
    }
  }

  const yaw = (face < 0 ? Math.PI : 0) + twist;
  return {
    sx,
    sy,
    bob,
    breath,
    lean,
    yaw,
    headX: face * (0.04 + headDriftX + twist * 0.14),
    headY: 1.28 * sy + breath * 1.35 + bob,
    headZ: 0.08 + headDriftZ,
    leadX: face * leadX,
    leadY: leadY * sy + breath + bob,
    leadZ,
    rearX: face * rearX,
    rearY: rearY * sy + breath + bob,
    rearZ,
    leadGlow,
  };
}

let rendererEpoch = 0;
let activeStop: (() => void) | null = null;

function pixelSize(canvas: HTMLCanvasElement): { dpr: number; size: [number, number] } {
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const width = Math.max(1, Math.round((canvas.clientWidth || 960) * dpr));
  const height = Math.max(1, Math.round((canvas.clientHeight || 540) * dpr));
  return { dpr, size: [width, height] };
}

function swapchainUsage(): GPUTextureUsageFlags | undefined {
  const usage = globalThis.GPUTextureUsage;
  if (!usage) return undefined;
  return usage.RENDER_ATTACHMENT | usage.TEXTURE_BINDING | usage.COPY_SRC;
}

function configureSwapchain(gpu: Gpu, canvasSurface: Surface): void {
  const usage = swapchainUsage();
  canvasSurface.context.configure({
    device: gpu.gpu,
    format: canvasSurface.format,
    alphaMode: "opaque",
    colorSpace: "srgb",
    ...(usage !== undefined ? { usage } : {}),
  });
}

export async function startRenderer(
  canvas: HTMLCanvasElement,
  getMatch: () => Match,
): Promise<Renderer> {
  const myEpoch = ++rendererEpoch;
  activeStop?.();
  activeStop = null;

  if (canvas.clientWidth < 2 || canvas.clientHeight < 2) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  if (myEpoch !== rendererEpoch) return { stop() {} };

  const { dpr, size } = pixelSize(canvas);
  canvas.width = size[0];
  canvas.height = size[1];

  const gpu: Gpu = await init();
  if (myEpoch !== rendererEpoch) {
    gpu.dispose();
    return { stop() {} };
  }
  gpu.onError((err) => console.error("[vgpu]", err));

  const canvasSurface: Surface = surface(gpu, canvas, {
    dpr,
    size,
    autoResize: false,
    alphaMode: "opaque",
  });
  configureSwapchain(gpu, canvasSurface);

  const sceneTarget: Target = target(gpu, {
    size,
    depth: true,
    label: "arena",
  });

  const camera = perspectiveCamera({
    fov: 36,
    aspect: canvasSurface.size[0] / Math.max(1, canvasSurface.size[1]),
    near: 0.1,
    far: 80,
    position: [0, 3.4, 16],
    target: [0, 1.1, 0],
  });

  const boxGeom = geometry(gpu, box({ size: 1 }));
  const bodyGeom = geometry(gpu, capsule({ radius: 0.5, height: 1, radialSegments: 18, heightSegments: 4 }));
  const ballGeom = geometry(gpu, sphere({ radius: 0.5, widthSegments: 16, heightSegments: 10 }));
  const coneGeom = geometry(gpu, cone({ radius: 0.5, height: 1, radialSegments: 12, heightSegments: 1 }));

  const sky = draw(gpu, {
    shader: skySource,
    depth: { write: false, compare: "always" },
  });
  const platform = makeMesh(gpu, boxGeom);
  const lip = makeMesh(gpu, boxGeom);
  const pillarL = makeMesh(gpu, boxGeom);
  const pillarR = makeMesh(gpu, boxGeom);
  const bodies = [makeMesh(gpu, bodyGeom), makeMesh(gpu, bodyGeom)];
  const heads = [makeMesh(gpu, ballGeom), makeMesh(gpu, ballGeom)];
  const leadFists = [makeMesh(gpu, ballGeom), makeMesh(gpu, ballGeom)];
  const rearFists = [makeMesh(gpu, ballGeom), makeMesh(gpu, ballGeom)];
  const orbs = [makeMesh(gpu, ballGeom), makeMesh(gpu, ballGeom)];
  const emberCrest = makeMesh(gpu, coneGeom);
  const voltFins = [makeMesh(gpu, boxGeom), makeMesh(gpu, boxGeom)];
  const shields = [makeGlow(gpu, ballGeom), makeGlow(gpu, ballGeom)];

  const sparks = draw(gpu, {
    shader: particleSource,
    instances: 48,
    blend: "additive",
    depth: { write: false, compare: "less-equal" },
  });

  const grade = sampler(gpu, { minFilter: "linear", magFilter: "linear" });
  const composite = effect(gpu, compositeSource, {
    set: {
      src: sceneTarget,
      samp: grade,
      grade: { flash: 0, shake: 0, _p0: 0, _p1: 0 },
    },
  });

  // Surfaces are swapchain textures and only exist inside frame(gpu).
  // Warm the offscreen 3D signature here; the canvas composite compiles on first present.
  await Promise.all([
    sky.compile(sceneTarget),
    platform.compile(sceneTarget),
    sparks.compile(sceneTarget),
    composite.compile({ colors: [canvasSurface.format] }),
  ]);

  const time = clock(gpu);

  const syncSize = () => {
    const next = pixelSize(canvas);
    const [width, height] = next.size;
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    sceneTarget.resize([width, height]);
    camera.set({ aspect: width / Math.max(1, height) });
    composite.set({ src: sceneTarget, samp: grade });
    configureSwapchain(gpu, canvasSurface);
  };

  let sizeDirty = false;
  const resizeObserver = new ResizeObserver(() => {
    sizeDirty = true;
  });
  resizeObserver.observe(canvas);

  const loop = frameLoop(gpu, (frame) => {
    const match = getMatch();
    const [a, b] = match.fighters;
    const midX = (a.x + b.x) * 0.5;
    const span = Math.min(10, Math.abs(a.x - b.x));
    const camX = midX * 0.85;
    const camZ = 14.5 + span * 0.45 + match.shake * 0.4;
    const camY = 3.2 + Math.max(a.y, b.y) * 0.12 + match.shake * 0.2;
    camera.set({ position: [camX, camY, camZ] });
    camera.lookAt([camX, 1.05, 0]);
    const vp = camera.viewProjection;

    sky.set({
      params: {
        time: time.time,
        shake: match.shake,
        flash: match.flash,
        _pad: 0,
      },
    });

    paint(platform, vp, compose(0, -STAGE.thickness * 0.5, 0, 0, 14.2, STAGE.thickness, STAGE.depth), STAGE_COL);
    paint(lip, vp, compose(0, 0.04, 0, 0, 14.4, 0.08, 3.4), EDGE_COL, 0.35);
    paint(pillarL, vp, compose(-6.6, -1.6, -0.2, 0.2, 0.45, 3.2, 0.45), [0.12, 0.11, 0.16, 1], 0.05);
    paint(pillarR, vp, compose(6.6, -1.6, -0.2, -0.2, 0.45, 3.2, 0.45), [0.12, 0.11, 0.16, 1], 0.05);

    const colors = [P1, P2] as const;
    for (let i = 0; i < 2; i++) {
      const f = match.fighters[i];
      const vis = f.alive && (f.invuln <= 0 || Math.floor(match.tick / 4) % 2 === 0);
      const hide = vis ? 1 : 0.0001;
      const pose = fighterAnim(f, match.tick);
      const pulse = smashPulse(f, match.tick);
      const bodyGlow = (i === 0 ? 0.12 : 0.16) + pulse;
      const headGlow = (i === 0 ? 0.18 : 0.22) + pulse * 1.15;
      const bodyH = 0.8 * pose.sy * hide;
      const bodyR = 0.7 * pose.sx * hide;
      const [bx, by] = leanXY(0, bodyH + pose.breath + pose.bob, pose.lean);
      paint(
        bodies[i],
        vp,
        trs(f.x + bx, f.y + by, 0, pose.yaw, pose.lean, bodyR, bodyH, bodyR),
        colors[i],
        bodyGlow,
      );
      const [hx, hy] = leanXY(pose.headX, pose.headY, pose.lean);
      const hs = 0.42 * hide;
      paint(
        heads[i],
        vp,
        compose(f.x + hx, f.y + hy, pose.headZ, pose.yaw, hs * pose.sx, hs * pose.sy, hs * pose.sx),
        colors[i],
        headGlow,
      );
      if (i === 0) {
        const flicker = 1 + 0.1 * Math.sin(match.tick * 0.73) + 0.06 * Math.sin(match.tick * 1.91);
        const crestH = 0.4 * hide * pose.sy * flicker;
        const crestR = 0.22 * hide * pose.sx;
        const [cx, cy] = leanXY(pose.headX, pose.headY + 0.22 * pose.sy + crestH * 0.45, pose.lean);
        paint(
          emberCrest,
          vp,
          trs(f.x + cx, f.y + cy, pose.headZ, pose.yaw, pose.lean, crestR, crestH, crestR),
          FLAME,
          0.55 + 0.28 * flicker + pulse,
        );
      } else {
        const finW = 0.07 * hide * pose.sx;
        const finH = 0.2 * hide * pose.sy;
        const finD = 0.36 * hide * pose.sx;
        const finOff = 0.2 * pose.sx;
        const [flx, fly] = leanXY(pose.headX - finOff, pose.headY + 0.02, pose.lean);
        const [frx, fry] = leanXY(pose.headX + finOff, pose.headY + 0.02, pose.lean);
        paint(
          voltFins[0],
          vp,
          trs(f.x + flx, f.y + fly, pose.headZ + 0.02, pose.yaw, pose.lean, finW, finH, finD),
          VISOR,
          headGlow + 0.28 + pulse * 0.4,
        );
        paint(
          voltFins[1],
          vp,
          trs(f.x + frx, f.y + fry, pose.headZ + 0.02, pose.yaw, pose.lean, finW, finH, finD),
          VISOR,
          headGlow + 0.28 + pulse * 0.4,
        );
      }
      const [lx, ly] = leanXY(pose.leadX, pose.leadY, pose.lean);
      const fs = 0.22 * hide;
      paint(
        leadFists[i],
        vp,
        compose(f.x + lx, f.y + ly, pose.leadZ, 0, fs * pose.sx, fs * pose.sy, fs * pose.sx),
        SKIN,
        pose.leadGlow + pulse * 0.6,
      );
      const [rx, ry] = leanXY(pose.rearX, pose.rearY, pose.lean);
      const rs = 0.2 * hide;
      paint(
        rearFists[i],
        vp,
        compose(f.x + rx, f.y + ry, pose.rearZ, 0, rs * pose.sx, rs * pose.sy, rs * pose.sx),
        SKIN,
        pulse * 0.25,
      );
      const p = match.projectiles[i];
      const ps = p.active ? 0.38 : 0.0001;
      paint(orbs[i], vp, compose(p.x, p.y, 0, time.time * 4, ps, ps, ps), colors[i], 0.8);
      if (optOn(f, "shielding") && f.alive) {
        paint(
          shields[i],
          vp,
          trs(f.x + bx, f.y + by + 0.18 * pose.sy, 0, 0, pose.lean, 1.9, 2.4, 1.9),
          i === 0 ? SHIELD_EMBER : SHIELD_VOLT,
          0.22,
        );
      }
    }

    sparks.set({
      params: {
        time: time.time,
        hitAge: match.hitAge,
        hitX: match.hitX,
        hitY: match.hitY,
        shake: match.shake,
        _p0: 0,
        _p1: 0,
        _p2: 0,
        viewProjection: vp,
      },
    });

    composite.set({
      src: sceneTarget,
      samp: grade,
      grade: { flash: match.flash, shake: match.shake, _p0: 0, _p1: 0 },
    });

    try {
      if (sizeDirty) {
        sizeDirty = false;
        syncSize();
      }
      frame.pass({ target: sceneTarget, clear: [0.03, 0.04, 0.1, 1], clearDepth: 1 }, (pass) => {
        pass.draw(sky);
        pass.draw(platform);
        pass.draw(lip);
        pass.draw(pillarL);
        pass.draw(pillarR);
        for (let i = 0; i < 2; i++) {
          pass.draw(bodies[i]);
          pass.draw(heads[i]);
          if (i === 0) pass.draw(emberCrest);
          else {
            pass.draw(voltFins[0]);
            pass.draw(voltFins[1]);
          }
          pass.draw(rearFists[i]);
          pass.draw(leadFists[i]);
          if (match.projectiles[i].active) pass.draw(orbs[i]);
        }
        for (let i = 0; i < 2; i++) {
          if (optOn(match.fighters[i], "shielding") && match.fighters[i].alive) pass.draw(shields[i]);
        }
        if (match.hitAge < 0.5) pass.draw(sparks);
      });
      frame.pass({ target: canvasSurface, clear: [0.03, 0.04, 0.1, 1] }, (pass) => {
        pass.draw(composite);
      });
    } catch (err) {
      console.error("[smashbro] frame", err);
      try {
        configureSwapchain(gpu, canvasSurface);
      } catch {
        /* next tick retries */
      }
    }
  });

  const stop = () => {
    if (myEpoch !== rendererEpoch && activeStop !== stop) return;
    loop.stop();
    resizeObserver.disconnect();
    canvasSurface.dispose();
    gpu.dispose();
    if (activeStop === stop) activeStop = null;
  };
  if (myEpoch !== rendererEpoch) {
    stop();
    return { stop() {} };
  }
  activeStop = stop;
  return { stop };
}
