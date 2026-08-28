"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { initSfx, play, unlockSfx } from "@/lib/audio/sfx";
import { createInputSampler } from "@/lib/game/input";
import { applySnapshot, cloneSnapshot, createMatch, dummyInput, resetMatch, stepMatch } from "@/lib/game/sim";
import { TICK_HZ, type Match, type Snapshot } from "@/lib/game/types";
import { clientId, connectRoom, type RoomClient } from "@/lib/net/client";
import { startRenderer } from "@/lib/render/engine";
import { describeGpuError } from "@/lib/render/gpu-error";
import { HUD, type HudInfo } from "./HUD";

const subscribeOrigin = () => () => {};
const getOrigin = () => window.location.origin;
const getServerOrigin = () => "";

function playSfx(names: readonly string[] | undefined): void {
  if (!names || names.length === 0) return;
  for (const name of names) play(name);
}

export type PlayMode = "online" | "local" | "training";

export function GameView({ mode, room }: { mode: PlayMode; room?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const matchRef = useRef<Match>(createMatch());
  const rematchRef = useRef<() => void>(() => {});
  const [view, setView] = useState<Snapshot>(() => cloneSnapshot(createMatch()));
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const origin = useSyncExternalStore(subscribeOrigin, getOrigin, getServerOrigin);
  const shareUrl = mode === "online" && room && origin ? `${origin}/r/${room}` : undefined;
  const [hudExtra, setHudExtra] = useState<{
    names: [string, string];
    slot: 0 | 1 | null;
    waiting: boolean;
    status: string;
  }>({
    names: mode === "online" ? ["Ember", "Volt"] : ["Ember", mode === "training" ? "Dummy" : "Volt"],
    slot: mode === "online" ? null : 0,
    waiting: mode === "online",
    status: mode === "online" ? "Connecting…" : "Fight!",
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const match = createMatch();
    matchRef.current = match;
    if (mode !== "online") match.countdown = 3;

    initSfx();
    const unlockAudio = () => {
      initSfx();
      unlockSfx();
    };
    window.addEventListener("pointerdown", unlockAudio);
    window.addEventListener("keydown", unlockAudio);
    window.addEventListener("touchstart", unlockAudio);

    const input = createInputSampler();
    let sfxRead = 0;
    let slot: 0 | 1 = 0;
    let filled: [boolean, boolean] = mode === "online" ? [false, false] : [true, true];
    let names: [string, string] = [
      "Ember",
      mode === "training" ? "Dummy" : "Volt",
    ];
    let remoteBits = 0;
    let hostReady = mode !== "online";
    let client: RoomClient | null = null;
    let ticks = 0;
    let stopped = false;
    let rendererStop: (() => void) | null = null;
    rematchRef.current = () => {
      resetMatch(match);
      sfxRead = 0;
      client?.send({ type: "rematch" });
      setView(cloneSnapshot(match));
    };

    const refreshHud = (status: string, waiting = !filled[0] || !filled[1]) => {
      setHudExtra({
        names,
        slot: mode === "online" ? slot : 0,
        waiting: mode === "online" && waiting,
        status,
      });
      setView(cloneSnapshot(match));
    };

    if (mode === "online" && room) {
      const id = clientId();
      client = connectRoom({
        room,
        name: "Fighter",
        clientId: id,
        onEvent: (event) => {
          if (event.type === "welcome") {
            slot = event.slot;
            filled[slot] = true;
            names = ["Ember", "Volt"];
            refreshHud(event.slot === 0 ? "You host this room" : "Joined — waiting for host state");
          } else if (event.type === "roster") {
            const wasReady = filled[0] && filled[1];
            filled = event.filled;
            names = ["Ember", "Volt"];
            hostReady = filled[0] && filled[1];
            if (!wasReady && hostReady && slot === 0) {
              resetMatch(match);
              sfxRead = 0;
            }
            refreshHud(hostReady ? "Get ready" : "Waiting for a challenger", !hostReady);
          } else if (event.type === "relay") {
            if (event.event.type === "input" && slot === 0) {
              remoteBits = event.event.bits;
            } else if (event.event.type === "state" && slot === 1) {
              applySnapshot(match, event.event.snapshot);
              playSfx(match.sfx);
              match.sfx.length = 0;
              sfxRead = 0;
            } else if (event.event.type === "rematch") {
              resetMatch(match);
              sfxRead = 0;
              remoteBits = 0;
              setView(cloneSnapshot(match));
            }
          } else if (event.type === "left") {
            filled[event.slot] = false;
            hostReady = false;
            refreshHud("Opponent left", true);
          } else if (event.type === "error") {
            setError(event.message);
          }
        },
      });
    }

    void (async () => {
      try {
        const renderer = await startRenderer(canvas, () => matchRef.current);
        if (stopped) {
          renderer.stop();
          return;
        }
        rendererStop = renderer.stop;
      } catch (err) {
        console.error(err);
        setError(describeGpuError(err));
      }
    })();

    const simId = window.setInterval(() => {
      if (stopped) return;
      const online = mode === "online";
      const isHost = !online || slot === 0;

      if (online && (!filled[0] || !filled[1])) return;

      if (isHost) {
        const p1 = input.readP1();
        const p2 =
          mode === "local"
            ? input.readP2()
            : mode === "training"
              ? dummyInput(match.fighters[1], match.fighters[0])
              : remoteBits;
        const inputs: [number, number] = online && slot === 1 ? [remoteBits, p1] : [p1, p2];
        stepMatch(match, inputs);
        ticks += 1;
        playSfx(match.sfx.slice(sfxRead));
        sfxRead = match.sfx.length;
        if (online && ticks % 2 === 0) {
          client?.send({ type: "state", snapshot: cloneSnapshot(match) });
          match.sfx.length = 0;
          sfxRead = 0;
        } else if (!online) {
          match.sfx.length = 0;
          sfxRead = 0;
        }
      } else {
        client?.send({ type: "input", bits: input.readP1(), seq: ticks++ });
      }

      if (ticks % 4 === 0) {
        refreshHud(
          match.winner !== null
            ? "Match over"
            : match.started
              ? "Fight!"
              : "Get ready",
          online && (!filled[0] || !filled[1]),
        );
      }
    }, 1000 / TICK_HZ);

    return () => {
      stopped = true;
      window.clearInterval(simId);
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);
      input.dispose();
      client?.close();
      rendererStop?.();
    };
  }, [mode, room]);

  const info: HudInfo = {
    names: hudExtra.names,
    slot: hudExtra.slot,
    status: copied ? "Link copied" : hudExtra.status,
    shareUrl,
    waiting: hudExtra.waiting,
  };

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-black">
      <canvas ref={canvasRef} className="block h-full w-full" />
      {!error && (
        <HUD
          match={view}
          info={info}
          onCopy={() => {
            if (!shareUrl) return;
            void navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          }}
          onRematch={() => rematchRef.current()}
        />
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black p-6 text-center">
          <p className="max-w-lg text-lg text-amber-100">{error}</p>
        </div>
      )}
    </div>
  );
}
