"use client";

import Link from "next/link";
import type { Snapshot } from "@/lib/game/types";

export type HudInfo = {
  names: [string, string];
  slot: 0 | 1 | null;
  status: string;
  shareUrl?: string;
  waiting: boolean;
};

function stocks(n: number, color: string) {
  return (
    <span className="flex gap-1">
      {Array.from({ length: 3 }, (_, i) => (
        <span
          key={i}
          className="inline-block h-3 w-3 rounded-sm"
          style={{
            background: i < n ? color : "transparent",
            outline: `2px solid ${color}`,
            outlineOffset: 1,
            opacity: i < n ? 1 : 0.25,
          }}
        />
      ))}
    </span>
  );
}

export function HUD({ match, info, onCopy, onRematch }: {
  match: Snapshot;
  info: HudInfo;
  onCopy?: () => void;
  onRematch?: () => void;
}) {
  const [a, b] = match.fighters;
  const banner =
    match.winner !== null
      ? `${info.names[match.winner]} wins`
      : !match.started && match.countdown > 0 && !info.waiting
        ? String(Math.ceil(match.countdown))
        : null;

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <PlayerCard
          name={info.names[0]}
          you={info.slot === 0}
          percent={a.percent}
          stocks={a.stocks}
          color="#f05628"
          align="left"
        />
        <div className="pointer-events-auto flex flex-col items-center gap-2 text-center">
          <div className="text-[11px] font-semibold tracking-[0.35em] text-amber-200/80">
            SMASHBRO
          </div>
          {info.shareUrl && (
            <button
              type="button"
              onClick={onCopy}
              className="max-w-[16rem] truncate rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[11px] text-white/80 hover:bg-black/60"
            >
              Copy invite link
            </button>
          )}
          <p className="text-[11px] text-white/55">{info.status}</p>
        </div>
        <PlayerCard
          name={info.names[1]}
          you={info.slot === 1}
          percent={b.percent}
          stocks={b.stocks}
          color="#2ec8ff"
          align="right"
        />
      </div>

      {banner && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="text-7xl font-black tracking-tight text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.65)] sm:text-8xl">
              {banner}
            </p>
            {match.winner !== null && onRematch && (
              <button
                type="button"
                onClick={onRematch}
                className="pointer-events-auto mt-6 rounded-full bg-amber-300 px-6 py-2 text-sm font-bold tracking-wide text-black"
              >
                Rematch
              </button>
            )}
          </div>
        </div>
      )}

      {info.waiting && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/25">
          <div className="pointer-events-auto max-w-md rounded-2xl border border-white/10 bg-black/70 p-6 text-center backdrop-blur">
            <p className="text-xl font-bold">Waiting for a challenger</p>
            <p className="mt-2 text-sm text-white/70">
              Send the link to a friend. The match starts the moment they hop in.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3 text-[11px] text-white/55">
        <p>Move WASD · Jump W/Space · Attack J · Special K</p>
        <Link href="/" className="pointer-events-auto text-white/70 hover:text-white">
          Leave
        </Link>
      </div>
    </div>
  );
}

function PlayerCard({
  name,
  you,
  percent,
  stocks: stockCount,
  color,
  align,
}: {
  name: string;
  you: boolean;
  percent: number;
  stocks: number;
  color: string;
  align: "left" | "right";
}) {
  return (
    <div className={align === "right" ? "text-right" : "text-left"}>
      <p className="text-xs font-semibold uppercase tracking-widest text-white/70">
        {name}
        {you ? " · you" : ""}
      </p>
      <p
        className="font-black leading-none"
        style={{ color, fontSize: "clamp(2.4rem, 6vw, 4.2rem)" }}
      >
        {Math.floor(percent)}
        <span className="text-[0.45em] opacity-80">%</span>
      </p>
      <div className={align === "right" ? "flex justify-end" : ""}>
        {stocks(stockCount, color)}
      </div>
    </div>
  );
}
