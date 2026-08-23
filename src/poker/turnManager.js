import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY   // service role para escritura server-side
);

const TURN_SECONDS = 20;
const timers = new Map(); // roomId → timeoutId

export function startTurnTimer(roomId, userId, onExpire) {
  clearTurnTimer(roomId);
  const id = setTimeout(async () => {
    await onExpire(roomId, userId);
  }, TURN_SECONDS * 1000);
  timers.set(roomId, id);
}

export function clearTurnTimer(roomId) {
  if (timers.has(roomId)) {
    clearTimeout(timers.get(roomId));
    timers.delete(roomId);
  }
}

// Obtiene el siguiente jugador activo en sentido horario
export function getNextActivePlayer(players, currentSeatIndex) {
  const sorted  = [...players].sort((a, b) => a.seatIndex - b.seatIndex);
  const current = sorted.findIndex(p => p.seatIndex === currentSeatIndex);

  for (let i = 1; i <= sorted.length; i++) {
    const next = sorted[(current + i) % sorted.length];
    if (next.status === "active") return next;
  }
  return null; // todos foldaron o all-in
}

// Verifica si la fase de apuestas está completa
// (todos los activos han igualado la apuesta máxima)
export function isBettingRoundComplete(players, currentHighBet) {
  const actives = players.filter(p => p.status === "active");
  if (actives.length === 0) return true;
  return actives.every(p => p.currentBet === currentHighBet);
}

// Avanza el turno en Supabase y dispara el temporizador
export async function advanceTurn(roomId, nextPlayer, onExpire) {
  await supabase.from("poker_rooms").update({
    current_turn_user_id: nextPlayer.userId,
    turn_started_at:      new Date().toISOString(),
  }).eq("id", roomId);

  // Broadcast para que el cliente muestre la barra de tiempo
  await supabase.channel(`poker:${roomId}`).send({
    type:    "broadcast",
    event:   "NEXT_TURN",
    payload: {
      userId:    nextPlayer.userId,
      username:  nextPlayer.username,
      seatIndex: nextPlayer.seatIndex,
      expiresAt: Date.now() + TURN_SECONDS * 1000,
    },
  });

  startTurnTimer(roomId, nextPlayer.userId, onExpire);
}