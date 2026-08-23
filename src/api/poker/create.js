import { createClient } from "@supabase/supabase-js";
import { startNewHand } from "../../poker/gameEngine.js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { name, smallBlind, bigBlind, buyInMin, buyInMax, maxSeats, userId } = req.body;

  if (!userId) return res.status(401).json({ error: "No autorizado" });

  const { data: room, error } = await supabase.from("poker_rooms").insert({
    name:        name || "Mesa de Póquer",
    small_blind: smallBlind || 500,
    big_blind:   bigBlind   || 1000,
    buy_in_min:  buyInMin   || 10000,
    buy_in_max:  buyInMax   || 100000,
    max_seats:   maxSeats   || 6,
    status:      "waiting",
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ room });
}