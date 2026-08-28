import { createClient } from "@supabase/supabase-js";
import { processAction } from "../../src/poker/gameEngine.js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { userId, roomId } = req.body;

  // Devolver fichas al balance del perfil
  const { data: player } = await supabase.from("poker_players")
    .select("chips_stack").eq("room_id", roomId).eq("user_id", userId).single();

  if (player?.chips_stack > 0) {
    await supabase.from("profiles")
      .update({ balance: supabase.rpc("increment", { x: player.chips_stack }) })
      .eq("id", userId);
  }

  // Marcar como sitting_out
  await supabase.from("poker_players")
    .update({ status: "sitting_out", chips_stack: 0 })
    .eq("room_id", roomId).eq("user_id", userId);

  // Broadcast
  await supabase.channel(`poker:${roomId}`).send({
    type: "broadcast", event: "PLAYER_LEFT",
    payload: { userId },
  });

  // Si quedan menos de 2, pausar sala
  const { data: remaining } = await supabase.from("poker_players")
    .select("id").eq("room_id", roomId)
    .not("status", "eq", "sitting_out");

  if (remaining.length < 2) {
    await supabase.from("poker_rooms")
      .update({ status: "waiting" }).eq("id", roomId);
  }

  return res.status(200).json({ ok: true });
}