export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;
export const STOCKS = 3;

export const IN = {
  LEFT: 1 << 0,
  RIGHT: 1 << 1,
  DOWN: 1 << 2,
  JUMP: 1 << 3,
  ATTACK: 1 << 4,
  SPECIAL: 1 << 5,
} as const;

export type InputBits = number;

export type Fighter = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  jumps: number;
  percent: number;
  stocks: number;
  hitstun: number;
  invuln: number;
  attack: number;
  attackKind: 0 | 1 | 2;
  specialCd: number;
  alive: boolean;
  respawn: number;
  squash: number;
};

export type Projectile = {
  x: number;
  y: number;
  vx: number;
  owner: 0 | 1;
  life: number;
  active: boolean;
};

export type Match = {
  tick: number;
  fighters: [Fighter, Fighter];
  projectiles: [Projectile, Projectile];
  prevInput: [InputBits, InputBits];
  countdown: number;
  winner: 0 | 1 | null;
  hitlag: number;
  shake: number;
  flash: number;
  hitX: number;
  hitY: number;
  hitAge: number;
  started: boolean;
};

export type Snapshot = {
  tick: number;
  fighters: [Fighter, Fighter];
  projectiles: [Projectile, Projectile];
  countdown: number;
  winner: 0 | 1 | null;
  hitlag: number;
  shake: number;
  flash: number;
  hitX: number;
  hitY: number;
  hitAge: number;
  started: boolean;
};

export const FIGHTER_W = 0.72;
export const FIGHTER_H = 1.55;

export const STAGE = {
  xMin: -7,
  xMax: 7,
  y: 0,
  thickness: 0.55,
  depth: 3.2,
  blastX: 16,
  blastYMin: -9,
  blastYMax: 13,
};
