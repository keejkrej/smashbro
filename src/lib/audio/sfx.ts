export type SfxName =
  | "jump"
  | "doublejump"
  | "land"
  | "jab"
  | "special"
  | "smash"
  | "smashcharge"
  | "shield"
  | "dodge"
  | "shieldbreak"
  | "hit"
  | "ko"
  | "blast"
  | "tick"
  | "go"
  | "win";

export type PlayOpts = {
  gain?: number;
  detune?: number;
};

type Voice = (
  ctx: AudioContext,
  dest: AudioNode,
  t0: number,
  opts: PlayOpts,
) => number;

const MUTE_KEY = "smashbro.sfx.muted";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let compressor: DynamicsCompressorNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = loadMuted();
let unlockInstalled = false;

function audioCtor(): typeof AudioContext | undefined {
  if (typeof globalThis === "undefined") return undefined;
  const g = globalThis as typeof globalThis & {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return g.AudioContext ?? g.webkitAudioContext;
}

function loadMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function persistMuted(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    /* private mode */
  }
}

function makeNoise(ac: AudioContext): AudioBuffer {
  const len = Math.floor(ac.sampleRate * 0.8);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  let acc = 0;
  for (let i = 0; i < len; i++) {
    acc = acc * 0.97 + (Math.random() * 2 - 1);
    const white = Math.random() * 2 - 1;
    data[i] = white * 0.55 + acc * 0.18;
  }
  return buf;
}

function ensureGraph(): AudioContext | null {
  const Ctor = audioCtor();
  if (!Ctor) return null;
  if (!ctx) {
    ctx = new Ctor();
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 10;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.09;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.42;
    compressor.connect(master);
    master.connect(ctx.destination);
    noiseBuf = makeNoise(ctx);
  }
  return ctx;
}

function installUnlock(): void {
  if (unlockInstalled || typeof window === "undefined") return;
  unlockInstalled = true;
  const once: AddEventListenerOptions = { once: true, capture: true, passive: true };
  const kick = () => {
    unlockSfx();
  };
  window.addEventListener("pointerdown", kick, once);
  window.addEventListener("keydown", kick, once);
  window.addEventListener("touchstart", kick, once);
}

function applyMute(): void {
  if (!master || !ctx) return;
  const now = ctx.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setTargetAtTime(muted ? 0 : 0.42, now, 0.012);
}

export function initSfx(): void {
  ensureGraph();
  installUnlock();
  void ctx?.resume();
}

export function unlockSfx(): void {
  initSfx();
  void ctx?.resume();
}

export function setMuted(value: boolean): void {
  muted = value;
  persistMuted(value);
  ensureGraph();
  applyMute();
}

export function isMuted(): boolean {
  return muted;
}

function envGain(
  ctx: AudioContext,
  t0: number,
  peak: number,
  attack: number,
  decay: number,
  sustain: number,
  release: number,
): GainNode {
  const g = ctx.createGain();
  const a = Math.max(0.002, attack);
  const d = Math.max(0.004, decay);
  const r = Math.max(0.01, release);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * sustain), t0 + a + d);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d + r);
  return g;
}

function osc(
  ctx: AudioContext,
  dest: AudioNode,
  t0: number,
  dur: number,
  type: OscillatorType,
  freq: number,
  freqEnd: number | undefined,
  detune: number,
  peak: number,
  attack: number,
  decay: number,
  sustain: number,
  release: number,
): void {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(20, freq), t0);
  if (freqEnd !== undefined) {
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
  }
  o.detune.setValueAtTime(detune, t0);
  const g = envGain(ctx, t0, peak, attack, decay, sustain, release);
  o.connect(g);
  g.connect(dest);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(
  ctx: AudioContext,
  dest: AudioNode,
  t0: number,
  dur: number,
  peak: number,
  attack: number,
  decay: number,
  filterType: BiquadFilterType,
  freq: number,
  freqEnd: number | undefined,
  q: number,
  detune: number,
): void {
  if (!noiseBuf) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  src.playbackRate.value = 2 ** (detune / 1200);
  const f = ctx.createBiquadFilter();
  f.type = filterType;
  f.frequency.setValueAtTime(Math.max(40, freq), t0);
  if (freqEnd !== undefined) {
    f.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), t0 + dur);
  }
  f.Q.value = q;
  const g = envGain(ctx, t0, peak, attack, decay, 0.35, Math.max(0.02, dur - attack - decay * 0.4));
  src.connect(f);
  f.connect(g);
  g.connect(dest);
  src.start(t0);
  src.stop(t0 + dur + 0.03);
}

function click(
  ctx: AudioContext,
  dest: AudioNode,
  t0: number,
  freq: number,
  detune: number,
  peak: number,
): void {
  osc(ctx, dest, t0, 0.03, "square", freq, freq * 0.62, detune, peak, 0.002, 0.012, 0.12, 0.018);
}

function isSfxName(name: string): name is SfxName {
  return Object.prototype.hasOwnProperty.call(voices, name);
}

const voices: Record<SfxName, Voice> = {
  jump(ctx, dest, t0, opts) {
    const g = opts.gain ?? 1;
    const d = opts.detune ?? 0;
    osc(ctx, dest, t0, 0.1, "triangle", 242, 486, d, 0.38 * g, 0.004, 0.05, 0.18, 0.045);
    osc(ctx, dest, t0, 0.07, "sine", 484, 728, d, 0.12 * g, 0.003, 0.03, 0.1, 0.03);
    click(ctx, dest, t0, 920, d, 0.08 * g);
    return 0.12;
  },

  doublejump(ctx, dest, t0, opts) {
    const g = opts.gain ?? 1;
    const d = opts.detune ?? 0;
    osc(ctx, dest, t0, 0.07, "triangle", 360, 620, d, 0.3 * g, 0.003, 0.035, 0.16, 0.03);
    osc(ctx, dest, t0 + 0.045, 0.09, "triangle", 540, 920, d + 8, 0.34 * g, 0.003, 0.04, 0.14, 0.04);
    osc(ctx, dest, t0 + 0.045, 0.08, "sine", 1080, 1480, d, 0.09 * g, 0.002, 0.03, 0.1, 0.03);
    return 0.15;
  },

  land(ctx, dest, t0, opts) {
    const g = Math.max(0.15, opts.gain ?? 1);
    const d = opts.detune ?? 0;
    osc(ctx, dest, t0, 0.16, "sine", 78, 46, d, 0.55 * g, 0.003, 0.05, 0.22, 0.1);
    osc(ctx, dest, t0, 0.12, "triangle", 118, 62, d, 0.22 * g, 0.002, 0.04, 0.18, 0.07);
    noise(ctx, dest, t0, 0.1, 0.28 * g, 0.002, 0.035, "lowpass", 420, 140, 0.7, d);
    return 0.2;
  },

  jab(ctx, dest, t0, opts) {
    const g = opts.gain ?? 1;
    const d = (opts.detune ?? 0) + (Math.random() * 40 - 20);
    noise(ctx, dest, t0, 0.07, 0.32 * g, 0.004, 0.03, "bandpass", 2100, 620, 1.4, d);
    noise(ctx, dest, t0, 0.045, 0.14 * g, 0.002, 0.02, "highpass", 2800, 1600, 0.6, d);
    click(ctx, dest, t0 + 0.018, 1860, d, 0.22 * g);
    osc(ctx, dest, t0 + 0.016, 0.04, "square", 420, 260, d, 0.08 * g, 0.002, 0.012, 0.1, 0.02);
    return 0.1;
  },

  special(ctx, dest, t0, opts) {
    const g = opts.gain ?? 1;
    const d = opts.detune ?? 0;
    osc(ctx, dest, t0, 0.11, "sawtooth", 148, 780, d, 0.22 * g, 0.01, 0.05, 0.2, 0.04);
    noise(ctx, dest, t0 + 0.02, 0.1, 0.2 * g, 0.008, 0.04, "bandpass", 900, 2800, 3.2, d);
    osc(ctx, dest, t0 + 0.08, 0.09, "square", 1320, 420, d + 20, 0.16 * g, 0.002, 0.03, 0.12, 0.04);
    click(ctx, dest, t0 + 0.086, 2440, d, 0.14 * g);
    return 0.2;
  },

  smash(ctx, dest, t0, opts) {
    const g = opts.gain ?? 1;
    const d = (opts.detune ?? 0) + (Math.random() * 24 - 12);
    noise(ctx, dest, t0, 0.12, 0.48 * g, 0.004, 0.04, "bandpass", 1600, 380, 1.1, d);
    noise(ctx, dest, t0, 0.08, 0.22 * g, 0.002, 0.03, "highpass", 2400, 900, 0.5, d);
    osc(ctx, dest, t0, 0.16, "sawtooth", 220, 72, d, 0.32 * g, 0.003, 0.06, 0.22, 0.08);
    osc(ctx, dest, t0, 0.12, "square", 110, 48, d, 0.2 * g, 0.002, 0.05, 0.18, 0.06);
    click(ctx, dest, t0 + 0.022, 1480, d, 0.28 * g);
    return 0.18;
  },

  smashcharge(ctx, dest, t0, opts) {
    const g = opts.gain ?? 1;
    const d = opts.detune ?? 0;
    osc(ctx, dest, t0, 0.28, "sawtooth", 92, 420, d, 0.16 * g, 0.02, 0.12, 0.45, 0.1);
    osc(ctx, dest, t0, 0.3, "triangle", 184, 640, d + 6, 0.14 * g, 0.018, 0.12, 0.4, 0.12);
    noise(ctx, dest, t0 + 0.04, 0.22, 0.14 * g, 0.02, 0.1, "bandpass", 520, 1800, 2.4, d);
    return 0.32;
  },

  shield(ctx, dest, t0, opts) {
    const g = opts.gain ?? 1;
    const d = opts.detune ?? 0;
    osc(ctx, dest, t0, 0.14, "sine", 520, 880, d, 0.2 * g, 0.006, 0.05, 0.3, 0.08);
    osc(ctx, dest, t0, 0.16, "triangle", 780, 1240, d + 10, 0.12 * g, 0.008, 0.06, 0.28, 0.08);
    noise(ctx, dest, t0, 0.09, 0.1 * g, 0.006, 0.04, "bandpass", 2400, 1600, 2.8, d);
    return 0.18;
  },

  dodge(ctx, dest, t0, opts) {
    const g = opts.gain ?? 1;
    const d = opts.detune ?? 0;
    noise(ctx, dest, t0, 0.1, 0.28 * g, 0.004, 0.04, "bandpass", 1800, 480, 1.2, d);
    osc(ctx, dest, t0, 0.09, "triangle", 420, 180, d, 0.16 * g, 0.003, 0.035, 0.18, 0.04);
    osc(ctx, dest, t0, 0.07, "sine", 880, 240, d, 0.08 * g, 0.002, 0.03, 0.12, 0.03);
    return 0.12;
  },

  shieldbreak(ctx, dest, t0, opts) {
    const g = opts.gain ?? 1;
    const d = opts.detune ?? 0;
    noise(ctx, dest, t0, 0.18, 0.55 * g, 0.002, 0.05, "highpass", 3200, 700, 0.6, d);
    noise(ctx, dest, t0, 0.14, 0.32 * g, 0.002, 0.04, "bandpass", 1800, 400, 0.9, d);
    osc(ctx, dest, t0, 0.22, "square", 340, 70, d, 0.22 * g, 0.003, 0.08, 0.22, 0.1);
    osc(ctx, dest, t0, 0.18, "triangle", 980, 160, d + 12, 0.14 * g, 0.004, 0.07, 0.18, 0.08);
    click(ctx, dest, t0, 2100, d, 0.2 * g);
    click(ctx, dest, t0 + 0.03, 1540, d - 8, 0.14 * g);
    return 0.28;
  },

  hit(ctx, dest, t0, opts) {
    const g = opts.gain ?? 1;
    const d = opts.detune ?? 0;
    noise(ctx, dest, t0, 0.08, 0.55 * g, 0.002, 0.025, "bandpass", 1400, 380, 0.9, d);
    noise(ctx, dest, t0, 0.06, 0.28 * g, 0.001, 0.02, "highpass", 2400, 900, 0.5, d);
    osc(ctx, dest, t0, 0.11, "square", 188, 92, d, 0.28 * g, 0.002, 0.04, 0.16, 0.055);
    osc(ctx, dest, t0, 0.09, "sine", 94, 52, d, 0.2 * g, 0.002, 0.035, 0.2, 0.05);
    return 0.14;
  },

  ko(ctx, dest, t0, opts) {
    const g = opts.gain ?? 1;
    const d = opts.detune ?? 0;
    osc(ctx, dest, t0, 0.38, "sawtooth", 640, 72, d, 0.28 * g, 0.008, 0.16, 0.35, 0.18);
    osc(ctx, dest, t0, 0.34, "triangle", 960, 110, d + 14, 0.12 * g, 0.01, 0.14, 0.25, 0.14);
    noise(ctx, dest, t0 + 0.22, 0.16, 0.42 * g, 0.004, 0.05, "lowpass", 900, 180, 0.8, d);
    osc(ctx, dest, t0 + 0.24, 0.18, "sine", 68, 38, d, 0.48 * g, 0.004, 0.06, 0.28, 0.1);
    return 0.48;
  },

  blast(ctx, dest, t0, opts) {
    const g = opts.gain ?? 1;
    const d = opts.detune ?? 0;
    noise(ctx, dest, t0, 0.22, 0.62 * g, 0.003, 0.07, "lowpass", 1600, 220, 0.6, d);
    noise(ctx, dest, t0, 0.1, 0.28 * g, 0.002, 0.03, "highpass", 3200, 1200, 0.4, d);
    osc(ctx, dest, t0, 0.26, "sine", 240, 48, d, 0.5 * g, 0.004, 0.08, 0.3, 0.14);
    osc(ctx, dest, t0, 0.2, "triangle", 90, 40, d, 0.28 * g, 0.003, 0.06, 0.22, 0.1);
    click(ctx, dest, t0, 310, d, 0.16 * g);
    return 0.32;
  },

  tick(ctx, dest, t0, opts) {
    const g = (opts.gain ?? 1) * 0.7;
    const d = opts.detune ?? 0;
    osc(ctx, dest, t0, 0.055, "triangle", 1245, 990, d, 0.22 * g, 0.002, 0.02, 0.12, 0.025);
    click(ctx, dest, t0, 2480, d, 0.08 * g);
    return 0.07;
  },

  go(ctx, dest, t0, opts) {
    const g = opts.gain ?? 1;
    const d = opts.detune ?? 0;
    osc(ctx, dest, t0, 0.22, "square", 523.25, undefined, d, 0.16 * g, 0.004, 0.08, 0.35, 0.12);
    osc(ctx, dest, t0, 0.24, "square", 659.25, undefined, d, 0.14 * g, 0.004, 0.09, 0.32, 0.12);
    osc(ctx, dest, t0, 0.28, "triangle", 783.99, undefined, d, 0.2 * g, 0.005, 0.1, 0.3, 0.14);
    noise(ctx, dest, t0, 0.08, 0.1 * g, 0.003, 0.03, "bandpass", 1800, 900, 1.2, d);
    return 0.32;
  },

  win(ctx, dest, t0, opts) {
    const g = opts.gain ?? 1;
    const d = opts.detune ?? 0;
    const notes = [
      { t: 0, f: 523.25, p: 0.16 },
      { t: 0.11, f: 659.25, p: 0.16 },
      { t: 0.22, f: 783.99, p: 0.18 },
      { t: 0.36, f: 1046.5, p: 0.24 },
    ];
    for (const n of notes) {
      osc(ctx, dest, t0 + n.t, 0.22, "triangle", n.f, n.f * 1.01, d, n.p * g, 0.006, 0.08, 0.4, 0.12);
      osc(ctx, dest, t0 + n.t, 0.18, "square", n.f * 0.5, undefined, d, n.p * 0.22 * g, 0.008, 0.07, 0.3, 0.1);
    }
    osc(ctx, dest, t0 + 0.36, 0.38, "sine", 1318.5, 1046.5, d, 0.1 * g, 0.01, 0.12, 0.35, 0.18);
    return 0.78;
  },
};

export function play(name: string, opts: PlayOpts = {}): void {
  if (muted) return;
  if (!isSfxName(name)) return;
  const voice = voices[name];
  const ac = ensureGraph();
  if (!ac || !compressor) return;
  if (ac.state === "suspended") void ac.resume();
  const t0 = ac.currentTime + 0.008;
  voice(ac, compressor, t0, opts);
}
