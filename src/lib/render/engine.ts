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
import { box, capsule, perspectiveCamera, sphere } from "vgpu/scene";
import { compose } from "@/lib/game/mat4";
import { STAGE, type Match } from "@/lib/game/types";
import skySource from "./shaders/sky.wgsl";
import meshSource from "./shaders/mesh.wgsl";
import particleSource from "./shaders/particles.wgsl";
import compositeSource from "./shaders/composite.wgsl";

export type Renderer = {
  stop: () => void;
};

const P1 = [0.96, 0.34, 0.16, 1] as const;
const P2 = [0.18, 0.72, 1.0, 1] as const;
const STAGE_COL = [0.16, 0.15, 0.22, 1] as const;
const EDGE_COL = [1.0, 0.82, 0.32, 1] as const;

function makeMesh(gpu: Gpu, geom: ReturnType<typeof geometry>): Draw {
  return draw(gpu, {
    shader: meshSource,
    geometry: geom,
    cull: "back",
    depth: { write: true, compare: "less-equal" },
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
  const fists = [makeMesh(gpu, ballGeom), makeMesh(gpu, ballGeom)];
  const orbs = [makeMesh(gpu, ballGeom), makeMesh(gpu, ballGeom)];

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
      const s = vis ? f.squash : 0.0001;
      const bodyH = 0.8 * s;
      paint(
        bodies[i],
        vp,
        compose(f.x, f.y + bodyH, 0, f.facing < 0 ? Math.PI : 0, 0.7 * s, bodyH, 0.7 * s),
        colors[i],
      );
      paint(
        heads[i],
        vp,
        compose(f.x + f.facing * 0.04, f.y + 1.28 * s, 0.08, 0, 0.42 * s, 0.42 * s, 0.42 * s),
        colors[i],
        0.08,
      );
      const punch = f.attackKind === 1 ? 0.55 : 0.18;
      paint(
        fists[i],
        vp,
        compose(
          f.x + f.facing * punch,
          f.y + 0.72 * s,
          0.22,
          0,
          0.22 * s,
          0.22 * s,
          0.22 * s,
        ),
        [1, 0.92, 0.85, 1],
        f.attackKind === 1 ? 0.4 : 0,
      );
      const p = match.projectiles[i];
      const ps = p.active ? 0.38 : 0.0001;
      paint(orbs[i], vp, compose(p.x, p.y, 0, time.time * 4, ps, ps, ps), colors[i], 0.8);
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
          pass.draw(fists[i]);
          if (match.projectiles[i].active) pass.draw(orbs[i]);
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
