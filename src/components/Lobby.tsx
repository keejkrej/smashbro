"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { normalizeRoomCode, randomRoomCode } from "@/lib/game/codes";
import { PLAYER_NAME_KEY } from "@/lib/net/client";

const subscribeName = () => () => {};
const readStoredName = () => {
  try {
    return sessionStorage.getItem(PLAYER_NAME_KEY) ?? "";
  } catch {
    return "";
  }
};

export function Lobby() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const storedName = useSyncExternalStore(subscribeName, readStoredName, () => "");
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const name = nameDraft ?? storedName;

  const persistName = (value: string) => {
    const next = value.slice(0, 24);
    setNameDraft(next);
    try {
      sessionStorage.setItem(PLAYER_NAME_KEY, next.trim());
    } catch {
      /* private mode */
    }
  };

  const create = () => {
    persistName(name);
    router.push(`/r/${randomRoomCode()}`);
  };
  const join = () => {
    persistName(name);
    const next = normalizeRoomCode(code);
    if (next.length >= 4) router.push(`/r/${next}`);
  };

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-16">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(240,86,40,0.28),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(46,200,255,0.18),transparent_50%)]" />
      <div className="relative z-10 w-full max-w-lg text-center">
        <p className="text-xs font-semibold tracking-[0.45em] text-amber-200/80">
          PLATFORM FIGHTER
        </p>
        <h1 className="mt-3 font-display text-7xl leading-none tracking-tight text-white sm:text-8xl">
          SMASHBRO
        </h1>
        <p className="mx-auto mt-4 max-w-md text-base text-white/70">
          Open the page, create a room of two, send the link. First to three
          stocks — knock them off the stage.
        </p>

        <div className="mt-10 flex flex-col gap-3">
          <input
            value={name}
            onChange={(e) => persistName(e.target.value)}
            maxLength={24}
            placeholder="YOUR NAME"
            className="rounded-full border border-white/15 bg-black/40 px-4 py-3 text-center tracking-[0.2em] text-white outline-none placeholder:text-white/30"
          />
          <button
            type="button"
            onClick={create}
            className="rounded-full bg-amber-300 px-6 py-3 text-sm font-bold tracking-wide text-black hover:bg-amber-200"
          >
            Create a room
          </button>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") join();
              }}
              placeholder="ROOM CODE"
              className="flex-1 rounded-full border border-white/15 bg-black/40 px-4 py-3 text-center tracking-[0.3em] text-white outline-none placeholder:text-white/30"
            />
            <button
              type="button"
              onClick={join}
              className="rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              Join
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => router.push("/play/local")}
            className="rounded-full border border-white/15 px-5 py-2 text-xs font-semibold uppercase tracking-wider text-white/80 hover:bg-white/10"
          >
            Same keyboard
          </button>
          <button
            type="button"
            onClick={() => router.push("/play/training")}
            className="rounded-full border border-white/15 px-5 py-2 text-xs font-semibold uppercase tracking-wider text-white/80 hover:bg-white/10"
          >
            Training dummy
          </button>
        </div>

        <p className="mt-10 text-[11px] leading-relaxed text-white/40">
          Move WASD · Jump W / Space · Attack J · Special K
          <br />
          Player 2 on one keyboard: arrows · . attack · / special
        </p>
      </div>
    </main>
  );
}
