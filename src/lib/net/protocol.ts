import type { Snapshot } from "@/lib/game/types";

export type ClientEvent =
  | { type: "join"; clientId: string; name: string; room: string }
  | { type: "input"; bits: number; seq: number }
  | { type: "state"; snapshot: Snapshot }
  | { type: "rematch" };

export type ServerEvent =
  | { type: "welcome"; slot: 0 | 1; room: string; clientId: string }
  | {
      type: "roster";
      names: [string | null, string | null];
      filled: [boolean, boolean];
    }
  | { type: "relay"; from: 0 | 1; event: ClientEvent }
  | { type: "left"; slot: 0 | 1 }
  | { type: "error"; message: string };

export function parseEvent<T>(raw: unknown): T | null {
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!obj || typeof obj !== "object") return null;
    return obj as T;
  } catch {
    return null;
  }
}
