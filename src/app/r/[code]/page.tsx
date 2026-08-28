import { GameView } from "@/components/GameView";
import { normalizeRoomCode } from "@/lib/game/codes";
import { notFound } from "next/navigation";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const room = normalizeRoomCode(code);
  if (room.length < 4) notFound();
  return <GameView mode="online" room={room} />;
}
