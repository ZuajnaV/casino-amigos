import { createClient } from "@supabase/supabase-js";
//import { startNewHand  } from "../../poker/gameEngine.js";
import { startNewHand } from "../../src/poker/gameEngine.js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { userId, roomId, seatIndex, buyIn, username, avatar } = req.body;
  if (!userId) return res.status(401).json({ error: "No autorizado" });

  // Verificar saldo
  const { data: profile } = await supabase.from("profiles")
    .select("balance").eq("id", userId).single();
  if (!profile || profile.balance < buyIn)
    return res.status(400).json({ error: "Saldo insuficiente" });

  // Verificar asiento libre
  const { data: taken } = await supabase.from("poker_players")
    .select("id").eq("room_id", roomId).eq("seat_index", seatIndex).single();
  if (taken) return res.status(400).json({ error: "Asiento ocupado" });

  // Transacción: descontar balance + sentar jugador
  const { error } = await supabase.rpc("sit_at_poker_table", {
    p_user_id:  userId,
    p_room_id:  roomId,
    p_seat:     seatIndex,
    p_buy_in:   buyIn,
    p_username: username,
    p_avatar:   avatar || "🎰",
  });
  if (error) return res.status(500).json({ error: error.message });

  // Broadcast: nuevo jugador se unió
  await supabase.channel(`poker:${roomId}`).send({
    type:    "broadcast",
    event:   "PLAYER_JOINED",
    payload: { userId, username, seatIndex, chips: buyIn },
  });

  // Ver cuántos jugadores hay ahora
  const { data: players } = await supabase.from("poker_players")
    .select("*").eq("room_id", roomId)
    .not("status", "eq", "sitting_out");

  // Iniciar mano automáticamente si hay 2+ jugadores y la sala está esperando
  const { data: room } = await supabase.from("poker_rooms")
    .select("status").eq("id", roomId).single();

  if (players.length >= 2 && room.status === "waiting") {
    await supabase.from("poker_rooms")
      .update({ status: "playing" }).eq("id", roomId);
    await startNewHand(roomId);
  }

  return res.status(200).json({ ok: true });
}