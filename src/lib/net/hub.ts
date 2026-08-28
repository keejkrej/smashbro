import type { WebSocket } from "ws";
import type Redis from "ioredis";
import { parseEvent, type ClientEvent, type ServerEvent } from "./protocol";
import { fieldsToObject, redis } from "./redis";

export type Sink = {
  send: (data: string) => void;
  ready: () => boolean;
};

type Conn = {
  id: string;
  clientId: string;
  name: string;
  room: string;
  slot: 0 | 1 | null;
  sink: Sink;
};

type Room = {
  code: string;
  slots: [Conn | null, Conn | null];
};

type Hub = {
  instanceId: string;
  conns: Map<Sink, Conn>;
  rooms: Map<string, Room>;
  streamClient: Redis | null;
  streaming: boolean;
  lastId: string;
};

const STREAM = "smash:relay";
const STREAM_MAX = 400;
const BLOCK_MS = 4000;

const globalForHub = globalThis as unknown as { __smashHub?: Hub };

const hub: Hub =
  globalForHub.__smashHub ??
  (globalForHub.__smashHub = {
    instanceId: crypto.randomUUID(),
    conns: new Map(),
    rooms: new Map(),
    streamClient: null,
    streaming: false,
    lastId: "0-0",
  });

function send(conn: Conn, event: ServerEvent): void {
  if (!conn.sink.ready()) return;
  try {
    conn.sink.send(JSON.stringify(event));
  } catch {
    /* close follows */
  }
}

function roomOf(code: string): Room {
  let room = hub.rooms.get(code);
  if (!room) {
    room = { code, slots: [null, null] };
    hub.rooms.set(code, room);
  }
  return room;
}

function roster(room: Room): ServerEvent {
  return {
    type: "roster",
    names: [room.slots[0]?.name ?? null, room.slots[1]?.name ?? null],
    filled: [Boolean(room.slots[0]), Boolean(room.slots[1])],
  };
}

type SlotRecord = { clientId: string; name: string };

function slotKey(code: string, slot: 0 | 1): string {
  return `smash:room:${code}:${slot}`;
}

async function readSlots(code: string): Promise<[SlotRecord | null, SlotRecord | null]> {
  if (!redis) return [null, null];
  try {
    const raw = await redis.mget(slotKey(code, 0), slotKey(code, 1));
    return raw.map((value) => parseEvent<SlotRecord>(value)) as [
      SlotRecord | null,
      SlotRecord | null,
    ];
  } catch {
    return [null, null];
  }
}

async function claimSlot(
  code: string,
  clientId: string,
  name: string,
  local: Room,
): Promise<0 | 1 | null> {
  const payload = JSON.stringify({ clientId, name } satisfies SlotRecord);

  if (!redis) {
    const existing = local.slots.find((s) => s?.clientId === clientId);
    if (existing?.slot !== null && existing?.slot !== undefined) return existing.slot;
    if (!local.slots[0]) return 0;
    if (!local.slots[1]) return 1;
    return null;
  }

  const remote = await readSlots(code);
  if (remote[0]?.clientId === clientId) {
    await redis.set(slotKey(code, 0), payload, "EX", 600);
    return 0;
  }
  if (remote[1]?.clientId === clientId) {
    await redis.set(slotKey(code, 1), payload, "EX", 600);
    return 1;
  }
  if ((await redis.set(slotKey(code, 0), payload, "EX", 600, "NX")) === "OK") return 0;
  if ((await redis.set(slotKey(code, 1), payload, "EX", 600, "NX")) === "OK") return 1;
  return null;
}

async function rosterEvent(code: string, local: Room): Promise<ServerEvent> {
  if (!redis) return roster(local);
  const remote = await readSlots(code);
  return {
    type: "roster",
    names: [remote[0]?.name ?? local.slots[0]?.name ?? null, remote[1]?.name ?? local.slots[1]?.name ?? null],
    filled: [Boolean(remote[0] || local.slots[0]), Boolean(remote[1] || local.slots[1])],
  };
}

function broadcastRoom(room: Room, event: ServerEvent): void {
  for (const slot of room.slots) {
    if (slot) send(slot, event);
  }
}

const wsSinks = new WeakMap<WebSocket, Sink>();

function wsSink(ws: WebSocket): Sink {
  const existing = wsSinks.get(ws);
  if (existing) return existing;
  const sink: Sink = {
    send: (data) => ws.send(data),
    ready: () => ws.readyState === 1,
  };
  wsSinks.set(ws, sink);
  return sink;
}

export function register(ws: WebSocket): void {
  registerSink(wsSink(ws));
}

export async function handleWsMessage(ws: WebSocket, data: string): Promise<void> {
  await handleMessage(wsSink(ws), data);
}

export function registerSink(sink: Sink): Conn {
  const conn: Conn = {
    id: crypto.randomUUID(),
    clientId: "",
    name: "",
    room: "",
    slot: null,
    sink,
  };
  hub.conns.set(sink, conn);
  void startStream();
  return conn;
}

export function connFor(sink: Sink): Conn | undefined {
  return hub.conns.get(sink);
}

async function startStream(): Promise<void> {
  if (hub.streaming || !redis) return;
  hub.streamClient = redis.duplicate();
  hub.streaming = true;
  try {
    const tail = await redis.xrevrange(STREAM, "+", "-", "COUNT", 1);
    hub.lastId = tail[0]?.[0] ?? "0-0";
  } catch {
    hub.lastId = "0-0";
  }
  void runReadLoop();
}

function stopStream(): void {
  hub.streaming = false;
  if (hub.streamClient) {
    void hub.streamClient.quit().catch(() => {});
    hub.streamClient = null;
  }
}

async function runReadLoop(): Promise<void> {
  const client = hub.streamClient;
  if (!client) return;
  while (hub.streaming) {
    try {
      const res = (await client.xread("BLOCK", BLOCK_MS, "STREAMS", STREAM, hub.lastId)) as
        | Array<[string, Array<[string, string[]]>]>
        | null;
      if (!res) continue;
      for (const [, entries] of res) {
        for (const [id, flat] of entries) {
          hub.lastId = id;
          const fields = fieldsToObject(flat);
          if (fields.o === hub.instanceId) continue;
          const packet = parseEvent<{
            room: string;
            event: ServerEvent;
          }>(fields.d);
          if (!packet) continue;
          const room = hub.rooms.get(packet.room);
          if (room) broadcastRoom(room, packet.event);
        }
      }
    } catch (err) {
      if (!hub.streaming) break;
      console.error("[smashbro] relay read failed", err);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function fanout(room: Room, event: ServerEvent): Promise<void> {
  broadcastRoom(room, event);
  if (!redis) return;
  try {
    await redis.xadd(
      STREAM,
      "MAXLEN",
      "~",
      STREAM_MAX,
      "*",
      "d",
      JSON.stringify({ room: room.code, event }),
      "o",
      hub.instanceId,
    );
  } catch (err) {
    console.error("[smashbro] relay xadd failed", err);
  }
}

export async function handleMessage(sink: Sink, data: string): Promise<void> {
  const conn = hub.conns.get(sink);
  if (!conn) return;
  const event = parseEvent<ClientEvent>(data);
  if (!event) return;

  if (event.type === "join") {
    const roomCode = event.room.trim().toUpperCase().slice(0, 8);
    const clientId = event.clientId.slice(0, 64) || crypto.randomUUID();
    const name = event.name.trim().slice(0, 24) || "Fighter";
    if (!roomCode) {
      send(conn, { type: "error", message: "Missing room code." });
      return;
    }

    const room = roomOf(roomCode);
    const slot = await claimSlot(roomCode, clientId, name, room);
    if (slot === null) {
      send(conn, { type: "error", message: "This room is full (2 fighters)." });
      return;
    }
    room.slots[slot] = conn;
    conn.clientId = clientId;
    conn.name = name;
    conn.room = roomCode;
    conn.slot = slot;
    send(conn, { type: "welcome", slot, room: roomCode, clientId });
    await fanout(room, await rosterEvent(roomCode, room));
    return;
  }

  if (conn.slot === null || !conn.room) return;
  const room = hub.rooms.get(conn.room);
  if (!room) return;

  const other = room.slots[conn.slot === 0 ? 1 : 0];
  const relay: ServerEvent = { type: "relay", from: conn.slot, event };
  if (other) send(other, relay);
  if (redis) {
    try {
      await redis.xadd(
        STREAM,
        "MAXLEN",
        "~",
        STREAM_MAX,
        "*",
        "d",
        JSON.stringify({ room: room.code, event: relay }),
        "o",
        hub.instanceId,
      );
    } catch (err) {
      console.error("[smashbro] input relay failed", err);
    }
  }
}

export async function unregister(ws: WebSocket): Promise<void> {
  await unregisterSink(wsSink(ws));
}

export async function unregisterSink(sink: Sink): Promise<void> {
  const conn = hub.conns.get(sink);
  hub.conns.delete(sink);
  if (!conn?.room || conn.slot === null) {
    if (hub.conns.size === 0) stopStream();
    return;
  }
  const room = hub.rooms.get(conn.room);
  if (room && room.slots[conn.slot]?.id === conn.id) {
    room.slots[conn.slot] = null;
    if (redis) {
      try {
        await redis.del(slotKey(conn.room, conn.slot));
      } catch (err) {
        console.error("[smashbro] slot del failed", err);
      }
    }
    await fanout(room, { type: "left", slot: conn.slot });
    await fanout(room, await rosterEvent(conn.room, room));
    if (!room.slots[0] && !room.slots[1]) hub.rooms.delete(room.code);
  }
  if (hub.conns.size === 0) stopStream();
}

/** Used by the HTTP fallback so POST bodies can address a room by clientId. */
export function sinkByClientId(clientId: string): Sink | undefined {
  for (const conn of hub.conns.values()) {
    if (conn.clientId === clientId) return conn.sink;
  }
  return undefined;
}

export async function handleRaw(clientId: string, data: string): Promise<void> {
  const sink = sinkByClientId(clientId);
  if (!sink) return;
  await handleMessage(sink, data);
}
