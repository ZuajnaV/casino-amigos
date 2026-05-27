// src/minigameRecords.js
import { supabase } from "./supabase";

/**
 * Guarda el récord del jugador si es mejor que el anterior.
 * @param {string} game  - 'snake' | 'dino' | 'minesweeper' | 'colordash' | 'blockbreaker' | 'geometrix'
 * @param {number} score - puntuación de la sesión (manzanas, pts, objetos...)
 * @param {number} earned - fichas ganadas en la sesión
 */
export async function saveMinigameRecord(game, score, earned = 0) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  await supabase.rpc("upsert_minigame_record", {
    p_user_id: session.user.id,
    p_game:    game,
    p_score:   score,
    p_earned:  earned,
  });
}

/**
 * Lee el récord actual del jugador para un juego.
 * @returns {{ best_score: number, best_earned: number } | null}
 */
export async function getMinigameRecord(game) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data } = await supabase
    .from("minigame_records")
    .select("best_score, best_earned")
    .eq("user_id", session.user.id)
    .eq("game", game)
    .single();

  return data || null;
}