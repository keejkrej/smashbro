import {
  DT,
  FIGHTER_H,
  FIGHTER_W,
  IN,
  STAGE,
  STOCKS,
  type Fighter,
  type InputBits,
  type Match,
  type Projectile,
  type Snapshot,
} from "./types";

const SHIELD_MAX = 60;
const SHIELD_KB = 0.35;
const SHIELD_REGEN = 0.2;
const SHIELD_BREAK_STUN = 96;
const SMASH_HOLD = 12;
const SMASH_CAP = 45;
const SMASH_DUR = 24;
const JAB_DUR = 18;
const DODGE_INVULN = 12;
const DODGE_ENDLAG = 20;

function fighter(x: number, facing: 1 | -1): Fighter {
  return {
    x,
    y: 0,
    vx: 0,
    vy: 0,
    facing,
    grounded: true,
    jumps: 1,
    percent: 0,
    stocks: STOCKS,
    hitstun: 0,
    invuln: 0,
    attack: 0,
    attackKind: 0,
    specialCd: 0,
    alive: true,
    respawn: 0,
    squash: 1,
    smashCharge: 0,
    shielding: false,
    shieldHp: SHIELD_MAX,
    dodge: 0,
    airDodge: false,
  };
}

function hydrateFighter(f: Fighter): Fighter {
  if (typeof f.smashCharge !== "number") f.smashCharge = 0;
  if (typeof f.shielding !== "boolean") f.shielding = false;
  if (typeof f.shieldHp !== "number") f.shieldHp = SHIELD_MAX;
  if (typeof f.dodge !== "number") f.dodge = 0;
  if (typeof f.airDodge !== "boolean") f.airDodge = false;
  return f;
}

function projectile(): Projectile {
  return { x: 0, y: 0, vx: 0, owner: 0, life: 0, active: false };
}

export function createMatch(): Match {
  return {
    tick: 0,
    fighters: [fighter(-3.2, 1), fighter(3.2, -1)],
    projectiles: [projectile(), projectile()],
    prevInput: [0, 0],
    countdown: 3,
    winner: null,
    hitlag: 0,
    shake: 0,
    flash: 0,
    hitX: 0,
    hitY: 0,
    hitAge: 99,
    started: false,
    sfx: [],
  };
}

export function cloneSnapshot(match: Match): Snapshot {
  const fighters = structuredClone(match.fighters);
  hydrateFighter(fighters[0]);
  hydrateFighter(fighters[1]);
  return {
    tick: match.tick,
    fighters,
    projectiles: structuredClone(match.projectiles),
    countdown: match.countdown,
    winner: match.winner,
    hitlag: match.hitlag,
    shake: match.shake,
    flash: match.flash,
    hitX: match.hitX,
    hitY: match.hitY,
    hitAge: match.hitAge,
    started: match.started,
    sfx: Array.isArray(match.sfx) ? match.sfx.slice() : [],
  };
}

export function applySnapshot(match: Match, snap: Snapshot): void {
  match.tick = snap.tick;
  match.fighters = structuredClone(snap.fighters);
  hydrateFighter(match.fighters[0]);
  hydrateFighter(match.fighters[1]);
  match.projectiles = structuredClone(snap.projectiles);
  match.countdown = snap.countdown;
  match.winner = snap.winner;
  match.hitlag = snap.hitlag;
  match.shake = snap.shake;
  match.flash = snap.flash;
  match.hitX = snap.hitX;
  match.hitY = snap.hitY;
  match.hitAge = snap.hitAge;
  match.started = snap.started;
  match.sfx = Array.isArray(snap.sfx) ? snap.sfx.slice() : [];
}

function onPlatform(x: number, y: number, vy: number): boolean {
  return (
    y <= STAGE.y + 0.02 &&
    y >= STAGE.y - 0.35 &&
    vy <= 0.4 &&
    x >= STAGE.xMin &&
    x <= STAGE.xMax
  );
}

function aabbHit(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return Math.abs(ax - bx) < (aw + bw) * 0.5 && Math.abs(ay - by) < (ah + bh) * 0.5;
}

function launch(f: Fighter, dir: number, dmg: number, base: number, sfx: string[]): void {
  if (f.shielding && f.shieldHp > 0) {
    f.shieldHp = Math.max(0, f.shieldHp - dmg);
    const kb = (base + f.percent * 0.16 + dmg * 0.08) * SHIELD_KB;
    const angle = 0.72;
    f.vx = dir * kb * Math.cos(angle);
    if (f.grounded) {
      f.vy = 0;
      f.vx = dir * kb * 0.9;
    } else {
      f.vy = kb * Math.sin(angle) * 0.5;
    }
    if (f.shieldHp <= 0) {
      f.shieldHp = 0;
      f.shielding = false;
      f.hitstun = SHIELD_BREAK_STUN;
      f.grounded = false;
      f.vy = 14;
      f.vx = dir * 2.2;
      f.attack = 0;
      f.attackKind = 0;
      f.smashCharge = 0;
      f.dodge = 0;
      sfx.push("shieldbreak");
    }
    return;
  }

  f.percent += dmg;
  const kb = base + f.percent * 0.16 + dmg * 0.08;
  const angle = 0.72;
  f.vx = dir * kb * Math.cos(angle);
  f.vy = kb * Math.sin(angle) + 2.4;
  f.hitstun = Math.min(48, 7 + kb * 0.55);
  f.grounded = false;
  f.attack = 0;
  f.attackKind = 0;
  f.smashCharge = 0;
  f.shielding = false;
  f.dodge = 0;
}

function respawn(f: Fighter, slot: 0 | 1): void {
  f.x = slot === 0 ? -3.2 : 3.2;
  f.y = 4.2;
  f.vx = 0;
  f.vy = 0;
  f.percent = 0;
  f.alive = true;
  f.invuln = 90;
  f.hitstun = 0;
  f.attack = 0;
  f.attackKind = 0;
  f.respawn = 0;
  f.grounded = false;
  f.jumps = 1;
  f.facing = slot === 0 ? 1 : -1;
  f.smashCharge = 0;
  f.shielding = false;
  f.shieldHp = SHIELD_MAX;
  f.dodge = 0;
  f.airDodge = false;
}

function fireSmash(f: Fighter, sfx: string[]): void {
  f.attack = SMASH_DUR;
  f.attackKind = 3;
  sfx.push("smash");
}

function stepFighter(f: Fighter, input: InputBits, prev: InputBits, slot: 0 | 1, sfx: string[]): void {
  if (!f.alive) {
    if (f.stocks <= 0) return;
    f.respawn -= 1;
    if (f.respawn <= 0) respawn(f, slot);
    return;
  }

  f.invuln = Math.max(0, f.invuln - 1);
  f.specialCd = Math.max(0, f.specialCd - 1);
  f.squash += (1 - f.squash) * 0.25;

  if (!f.shielding) {
    f.shieldHp = Math.min(SHIELD_MAX, f.shieldHp + SHIELD_REGEN);
  }

  if (f.hitstun > 0) {
    f.hitstun -= 1;
    f.shielding = false;
    if (input & IN.LEFT) f.vx -= 8 * DT;
    if (input & IN.RIGHT) f.vx += 8 * DT;
  } else if (f.dodge > 0) {
    f.shielding = false;
    f.vx *= 0.88;
  } else {
    const left = (input & IN.LEFT) !== 0;
    const right = (input & IN.RIGHT) !== 0;
    const shieldHeld = (input & IN.SHIELD) !== 0;
    const shieldEdge = shieldHeld && (prev & IN.SHIELD) === 0;
    const charging = f.smashCharge >= SMASH_HOLD && f.attack <= 0;
    const busy = f.attack > 0 || f.smashCharge > 0;

    if (
      shieldEdge &&
      (left || right || (input & IN.DOWN) !== 0) &&
      !busy &&
      (f.grounded || !f.airDodge)
    ) {
      f.dodge = DODGE_INVULN + DODGE_ENDLAG;
      f.invuln = Math.max(f.invuln, DODGE_INVULN);
      f.shielding = false;
      sfx.push("dodge");
      if (!f.grounded) f.airDodge = true;
      if (left !== right) {
        f.facing = left ? -1 : 1;
        f.vx = (left ? -1 : 1) * (f.grounded ? 10.5 : 8.5);
        if (!f.grounded) f.vy = Math.max(f.vy, 2.2);
      } else if (input & IN.DOWN) {
        f.vx *= 0.2;
        if (!f.grounded) f.vy = Math.min(f.vy, -8);
      }
    } else if (shieldHeld && !busy) {
      if (!f.shielding) sfx.push("shield");
      f.shielding = true;
    } else {
      f.shielding = false;
    }

    if (f.dodge <= 0) {
      const slow = f.shielding || charging ? 0.38 : 1;
      if (left !== right && !charging) {
        f.facing = left ? -1 : 1;
        const accel = (f.grounded ? 70 : 38) * slow;
        const cap = (f.grounded ? 7.4 : 5.6) * (f.shielding ? 0.4 : 1);
        f.vx += (left ? -1 : 1) * accel * DT;
        f.vx = Math.max(-cap, Math.min(cap, f.vx));
      } else if (f.grounded) {
        f.vx *= charging ? 0.7 : 0.78;
      } else {
        f.vx *= 0.985;
      }

      const jumpEdge = (input & IN.JUMP) !== 0 && (prev & IN.JUMP) === 0;
      if (jumpEdge && !charging) {
        if (f.grounded) {
          f.vy = 16.8;
          f.grounded = false;
          f.jumps = 1;
          f.squash = 0.72;
          f.shielding = false;
          sfx.push("jump");
        } else if (f.jumps > 0) {
          f.vy = 13.6;
          f.jumps -= 1;
          f.squash = 0.78;
          f.shielding = false;
          sfx.push("doublejump");
        }
      }

      if (f.attack <= 0 && !f.shielding) {
        const atkHeld = (input & IN.ATTACK) !== 0;
        const spEdge = (input & IN.SPECIAL) !== 0 && (prev & IN.SPECIAL) === 0;
        if (atkHeld) {
          f.smashCharge += 1;
          if (f.smashCharge === SMASH_HOLD) {
            f.attackKind = 3;
            sfx.push("smashcharge");
          }
          if (f.smashCharge >= SMASH_CAP) fireSmash(f, sfx);
        } else if (f.smashCharge > 0) {
          if (f.smashCharge >= SMASH_HOLD) fireSmash(f, sfx);
          else {
            f.attack = JAB_DUR;
            f.attackKind = 1;
            f.smashCharge = 0;
            sfx.push("jab");
          }
        } else if (spEdge && f.specialCd <= 0) {
          f.attack = 16;
          f.attackKind = 2;
          f.specialCd = 42;
          sfx.push("special");
        }
      }
    }
  }

  if (f.attack > 0) {
    f.attack -= 1;
    if (f.attack <= 0) {
      f.attackKind = 0;
      f.smashCharge = 0;
    }
  }
  if (f.dodge > 0) f.dodge -= 1;

  if (!f.grounded && (input & IN.DOWN) && f.vy < 4 && f.dodge <= 0 && !f.shielding) {
    f.vy -= 42 * DT;
  }

  f.vy -= (f.grounded ? 0 : 48) * DT;
  if (f.vy < -19) f.vy = -19;

  f.x += f.vx * DT;
  f.y += f.vy * DT;

  if (onPlatform(f.x, f.y, f.vy)) {
    f.y = STAGE.y;
    if (f.vy < -8) {
      f.squash = 0.7;
      sfx.push("land");
    }
    f.vy = 0;
    f.grounded = true;
    f.jumps = 1;
    f.airDodge = false;
  } else {
    f.grounded = false;
  }

  if (
    Math.abs(f.x) > STAGE.blastX ||
    f.y < STAGE.blastYMin ||
    f.y > STAGE.blastYMax
  ) {
    f.alive = false;
    f.stocks -= 1;
    f.respawn = 70;
    f.vx = 0;
    f.vy = 0;
    f.attack = 0;
    f.attackKind = 0;
    f.smashCharge = 0;
    f.shielding = false;
    f.dodge = 0;
    sfx.push("ko", "blast");
  }
}

function activeHitbox(f: Fighter): { x: number; y: number; w: number; h: number; dmg: number; kb: number } | null {
  if (f.attackKind === 1) {
    const frame = JAB_DUR - f.attack;
    if (frame < 4 || frame > 10) return null;
    return {
      x: f.x + f.facing * 0.72,
      y: f.y + 0.78,
      w: 0.85,
      h: 0.7,
      dmg: 9,
      kb: 7.5,
    };
  }
  if (f.attackKind === 3 && f.attack > 0) {
    const frame = SMASH_DUR - f.attack;
    if (frame < 6 || frame > 16) return null;
    const charge = Math.max(0, Math.min(1, (f.smashCharge - SMASH_HOLD) / (SMASH_CAP - SMASH_HOLD)));
    return {
      x: f.x + f.facing * (0.88 + charge * 0.18),
      y: f.y + 0.82,
      w: 1.15 + charge * 0.5,
      h: 0.9 + charge * 0.28,
      dmg: 14 + charge * 14,
      kb: 11 + charge * 9,
    };
  }
  return null;
}

export function stepMatch(match: Match, inputs: [InputBits, InputBits]): void {
  if (!match.sfx) match.sfx = [];
  if (match.winner !== null) {
    match.shake *= 0.9;
    match.flash *= 0.9;
    match.hitAge += DT;
    return;
  }

  if (!match.started) {
    const prevCeil = Math.ceil(match.countdown);
    const opening = match.countdown === 3;
    match.countdown -= DT;
    if (match.countdown <= 0) {
      match.started = true;
      match.countdown = 0;
      match.sfx.push("go");
    } else if (opening || Math.ceil(match.countdown) !== prevCeil) {
      match.sfx.push("tick");
    }
  }

  match.shake *= 0.86;
  match.flash *= 0.84;
  match.hitAge += DT;

  if (!match.started) {
    match.prevInput = inputs;
    return;
  }

  if (match.hitlag > 0) {
    match.hitlag -= 1;
    match.prevInput = inputs;
    return;
  }

  match.tick += 1;
  const [a, b] = match.fighters;

  stepFighter(a, inputs[0], match.prevInput[0], 0, match.sfx);
  stepFighter(b, inputs[1], match.prevInput[1], 1, match.sfx);

  for (let i = 0; i < 2; i++) {
    const f = match.fighters[i];
    const p = match.projectiles[i];
    if (f.attackKind === 2 && f.attack === 10 && !p.active) {
      p.active = true;
      p.owner = i as 0 | 1;
      p.x = f.x + f.facing * 0.7;
      p.y = f.y + 0.85;
      p.vx = f.facing * 11;
      p.life = 0.7;
    }
    if (p.active) {
      p.x += p.vx * DT;
      p.life -= DT;
      if (p.life <= 0 || Math.abs(p.x) > STAGE.blastX) p.active = false;
    }
  }

  for (let i = 0; i < 2; i++) {
    const attacker = match.fighters[i];
    const victim = match.fighters[1 - i];
    if (!attacker.alive || !victim.alive || victim.invuln > 0) continue;

    const hb = activeHitbox(attacker);
    if (hb && aabbHit(hb.x, hb.y, hb.w, hb.h, victim.x, victim.y + FIGHTER_H * 0.5, FIGHTER_W, FIGHTER_H)) {
      const shielded = victim.shielding && victim.shieldHp > 0;
      launch(victim, attacker.facing, hb.dmg, hb.kb, match.sfx);
      match.hitlag = shielded ? 3 : 5;
      match.shake = shielded ? 0.25 : 0.55;
      match.flash = shielded ? 0.45 : 0.8;
      match.hitX = hb.x;
      match.hitY = hb.y;
      match.hitAge = 0;
      attacker.squash = 1.12;
      match.sfx.push("hit");
    }

    const p = match.projectiles[i];
    if (
      p.active &&
      aabbHit(p.x, p.y, 0.5, 0.5, victim.x, victim.y + FIGHTER_H * 0.5, FIGHTER_W, FIGHTER_H)
    ) {
      const shielded = victim.shielding && victim.shieldHp > 0;
      launch(victim, Math.sign(p.vx) || attacker.facing, 7, 6.2, match.sfx);
      p.active = false;
      match.hitlag = shielded ? 2 : 4;
      match.shake = shielded ? 0.18 : 0.4;
      match.flash = shielded ? 0.3 : 0.55;
      match.hitX = p.x;
      match.hitY = p.y;
      match.hitAge = 0;
      match.sfx.push("hit");
    }
  }

  if (a.stocks <= 0 && !a.alive) match.winner = 1;
  if (b.stocks <= 0 && !b.alive) match.winner = 0;
  if (a.stocks <= 0 && b.stocks <= 0) match.winner = 0;
  if (match.winner !== null) match.sfx.push("win");

  match.prevInput = inputs;
}

export function resetMatch(match: Match): void {
  const fresh = createMatch();
  Object.assign(match, fresh);
}

export function dummyInput(self: Fighter, foe: Fighter): InputBits {
  if (!self.alive || self.hitstun > 0 || self.dodge > 0) return 0;
  let bits = 0;
  const dx = foe.x - self.x;
  if (Math.abs(dx) > 1.3) bits |= dx < 0 ? IN.LEFT : IN.RIGHT;
  if (foe.y > self.y + 1.2 && self.jumps >= 0) bits |= IN.JUMP;

  const close = Math.abs(dx) < 1.5 && Math.abs(foe.y - self.y) < 1.2;
  if (foe.attack > 0 && Math.abs(dx) < 2.4 && Math.abs(foe.y - self.y) < 1.6) {
    bits |= IN.SHIELD;
    if (self.percent > 70 || foe.attackKind === 3) {
      bits |= dx >= 0 ? IN.LEFT : IN.RIGHT;
    } else {
      bits &= ~(IN.LEFT | IN.RIGHT);
    }
  } else if (close) {
    if (foe.percent >= 55 && self.smashCharge < SMASH_CAP && self.attack <= 0) {
      bits |= IN.ATTACK;
    } else if (self.smashCharge > 0 && self.smashCharge < 8) {
      bits |= IN.ATTACK;
    } else if (self.smashCharge === 0 && self.attack <= 0) {
      bits |= IN.ATTACK;
    }
  } else if (Math.abs(dx) > 2.4 && Math.abs(dx) < 7 && self.specialCd <= 0) {
    bits |= IN.SPECIAL;
  }
  return bits;
}
