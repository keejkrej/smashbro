const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function randomRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint32Array(6));
  let out = "";
  for (const n of bytes) out += ALPHABET[n % ALPHABET.length];
  return out;
}

export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}
