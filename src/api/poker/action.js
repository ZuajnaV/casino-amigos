import { createClient }  from "@supabase/supabase-js";
import { processAction } from "../../poker/gameEngine.js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { userId, roomId, action, amount } = req.body;
  if (!userId) return res.status(401).json({ error: "No autorizado" });

  // Verificar que es el turno del jugador
  const { data: room } = await supabase.from("poker_rooms")
    .select("current_turn_user_id").eq("id", roomId).single();

  if (room?.current_turn_user_id !== userId)
    return res.status(403).json({ error: "No es tu turno" });

  try {
    await processAction(roomId, userId, action, amount || 0);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}