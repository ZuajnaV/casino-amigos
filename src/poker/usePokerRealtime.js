import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";

export function usePokerRealtime(roomId, userId, onEvent) {
  const channelRef     = useRef(null);
  const privateRef     = useRef(null);
  const [room,    setRoom]    = useState(null);
  const [players, setPlayers] = useState([]);

  // ── Carga inicial ────────────────────────────────────────────
  async function loadState() {
    const [{ data: r }, { data: p }] = await Promise.all([
      supabase.from("poker_rooms").select("*").eq("id", roomId).single(),
      supabase.from("poker_players_public").select("*").eq("room_id", roomId).order("seat_index"),
    ]);
    if (r) setRoom(r);
    if (p) setPlayers(p);
  }

  useEffect(() => {
    if (!roomId || !userId) return;
    loadState();

    // ── Canal público de la sala ─────────────────────────────
    channelRef.current = supabase
  .channel(`poker:${roomId}`, { config: { broadcast: { self: true } } })
  .on("broadcast", { event: "*" }, ({ event, payload }) => {
        onEvent?.(event, payload);

        // Re-cargar estado de sala/jugadores ante cualquier evento
        if (["PLAYER_ACTION","NEXT_TURN","DEAL_COMMUNITY_CARDS",
             "HAND_STARTED","SHOWDOWN_REVEAL","SHOWDOWN_WINNER",
             "PLAYER_JOINED","PLAYER_LEFT"].includes(event)) {
          loadState();
        }
      })
      .on("postgres_changes", {
        event:  "UPDATE",
        schema: "public",
        table:  "poker_rooms",
        filter: `id=eq.${roomId}`,
      }, ({ new: newRoom }) => {
        setRoom(newRoom);
      })
      .on("postgres_changes", {
        event:  "*",
        schema: "public",
        table:  "poker_players",
        filter: `room_id=eq.${roomId}`,
      }, () => {
        // Recargar usando la VIEW (que aplica RLS de hole_cards)
        supabase.from("poker_players_public")
          .select("*").eq("room_id", roomId).order("seat_index")
          .then(({ data }) => { if (data) setPlayers(data); });
      })
      .subscribe();

    // ── Canal privado: solo mis hole cards ───────────────────
    privateRef.current = supabase
      .channel(`poker:${roomId}:${userId}`)
      .on("broadcast", { event: "YOUR_HOLE_CARDS" }, ({ payload }) => {
        onEvent?.("YOUR_HOLE_CARDS", payload);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channelRef.current);
      supabase.removeChannel(privateRef.current);
    };
  }, [roomId, userId]);

  // ── Helpers de acción ────────────────────────────────────────
  async function sendAction(action, amount = 0) {
    await fetch("/api/poker/action", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ userId, roomId, action, amount }),
    });
  }

  return { room, players, sendAction, reload: loadState };
}