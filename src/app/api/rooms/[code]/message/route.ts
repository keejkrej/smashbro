import { handleRaw } from "@/lib/net/hub";
import { parseEvent, type ClientEvent } from "@/lib/net/protocol";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const event = parseEvent<ClientEvent & { clientId?: string }>(body);
  if (!event || event.type === "join") {
    return Response.json({ ok: false }, { status: 400 });
  }
  const clientId =
    typeof (event as { clientId?: string }).clientId === "string"
      ? (event as { clientId: string }).clientId
      : "";
  if (!clientId) return Response.json({ ok: false }, { status: 400 });
  await handleRaw(clientId, JSON.stringify(event));
  return Response.json({ ok: true });
}
