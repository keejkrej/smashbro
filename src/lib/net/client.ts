import { parseEvent, type ClientEvent, type ServerEvent } from "./protocol";

export type RoomClient = {
  send: (event: ClientEvent) => void;
  close: () => void;
};

export function connectRoom(opts: {
  room: string;
  name: string;
  clientId: string;
  onEvent: (event: ServerEvent) => void;
}): RoomClient {
  let closed = false;
  let ws: WebSocket | null = null;
  let es: EventSource | null = null;
  let mode: "ws" | "sse" | null = null;
  let opened = false;

  const proto = location.protocol === "https:" ? "wss" : "ws";
  const wsUrl = `${proto}://${location.host}/api/ws`;

  const send = (event: ClientEvent) => {
    if (closed) return;
    if (mode === "ws" && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
      return;
    }
    if (mode === "sse") {
      void fetch(`/api/rooms/${opts.room}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...event, clientId: opts.clientId }),
      });
    }
  };

  const join = () =>
    send({
      type: "join",
      clientId: opts.clientId,
      name: opts.name,
      room: opts.room,
    });

  const fallbackSse = () => {
    if (closed || mode === "sse") return;
    mode = "sse";
    const url = `/api/rooms/${encodeURIComponent(opts.room)}/events?clientId=${encodeURIComponent(opts.clientId)}&name=${encodeURIComponent(opts.name)}`;
    es = new EventSource(url);
    es.onmessage = (ev) => {
      const event = parseEvent<ServerEvent>(ev.data);
      if (event) opts.onEvent(event);
    };
    es.onerror = () => {
      /* EventSource retries on its own */
    };
  };

  const startWs = () => {
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      fallbackSse();
      return;
    }
    const timer = window.setTimeout(() => {
      if (!opened) {
        ws?.close();
        fallbackSse();
      }
    }, 1200);
    ws.onopen = () => {
      opened = true;
      mode = "ws";
      window.clearTimeout(timer);
      join();
    };
    ws.onmessage = (ev) => {
      const event = parseEvent<ServerEvent>(String(ev.data));
      if (event) opts.onEvent(event);
    };
    ws.onerror = () => {
      window.clearTimeout(timer);
      if (!opened) fallbackSse();
    };
    ws.onclose = () => {
      window.clearTimeout(timer);
      if (!closed && !opened) fallbackSse();
    };
  };

  startWs();

  return {
    send,
    close: () => {
      closed = true;
      ws?.close();
      es?.close();
    },
  };
}

export function clientId(): string {
  const key = "smashbro.clientId";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}
