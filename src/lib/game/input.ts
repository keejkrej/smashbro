import { IN, type InputBits } from "./types";

const P1: Record<string, number> = {
  KeyA: IN.LEFT,
  KeyD: IN.RIGHT,
  KeyS: IN.DOWN,
  KeyW: IN.JUMP,
  Space: IN.JUMP,
  KeyJ: IN.ATTACK,
  KeyK: IN.SPECIAL,
  KeyL: IN.SHIELD,
  ShiftLeft: IN.SHIELD,
};

const P2: Record<string, number> = {
  ArrowLeft: IN.LEFT,
  ArrowRight: IN.RIGHT,
  ArrowDown: IN.DOWN,
  ArrowUp: IN.JUMP,
  Numpad1: IN.ATTACK,
  Period: IN.ATTACK,
  Numpad2: IN.SPECIAL,
  Slash: IN.SPECIAL,
  ShiftRight: IN.SHIELD,
  Numpad0: IN.SHIELD,
};

export type InputSampler = {
  readP1: () => InputBits;
  readP2: () => InputBits;
  dispose: () => void;
};

export function createInputSampler(el: Window | HTMLElement = window): InputSampler {
  const down = new Set<string>();

  const onDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (e.code in P1 || e.code in P2) e.preventDefault();
    down.add(e.code);
  };
  const onUp = (e: KeyboardEvent) => {
    down.delete(e.code);
  };
  const onBlur = () => down.clear();

  el.addEventListener("keydown", onDown as EventListener);
  el.addEventListener("keyup", onUp as EventListener);
  window.addEventListener("blur", onBlur);

  const pack = (map: Record<string, number>) => {
    let bits = 0;
    for (const [code, bit] of Object.entries(map)) {
      if (down.has(code)) bits |= bit;
    }
    return bits;
  };

  return {
    readP1: () => pack(P1),
    readP2: () => pack(P2),
    dispose: () => {
      el.removeEventListener("keydown", onDown as EventListener);
      el.removeEventListener("keyup", onUp as EventListener);
      window.removeEventListener("blur", onBlur);
    },
  };
}
