import { handleMessage, registerSink, unregisterSink, type Sink } from "@/lib/net/hub";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const url = new URL(request.url);
  const clientId = url.searchParams.get("clientId") || crypto.randomUUID();
  const name = url.searchParams.get("name") || "Fighter";
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const sink: Sink = {
        send: (data) => {
          try {
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          } catch {
            /* closed */
          }
        },
        ready: () => true,
      };
      registerSink(sink);
      void handleMessage(
        sink,
        JSON.stringify({ type: "join", clientId, name, room: code }),
      );
      const close = () => {
        void unregisterSink(sink);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      request.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
