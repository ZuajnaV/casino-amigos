import { createClient }        from "@supabase/supabase-js";
import { createDeck, shuffleDeck, dealCards } from "./deck.js";
import { determineWinners }    from "./handEvaluator.js";
import { calculateSidePots, resolvePayouts } from "./sidePots.js";
import { advanceTurn, clearTurnTimer, isBettingRoundComplete, getNextActivePlayer } from "./turnManager.js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PHASE_ORDER = ["pre-flop", "flop", "turn", "river", "showdown"];

// ── Iniciar nueva mano ────────────────────────────────────────────────────────
export async function startNewHand(roomId) {
  // 1. Leer sala y jugadores
  const { data: room }    = await supabase.from("poker_rooms").select("*").eq("id", roomId).single();
  const { data: players } = await supabase.from("poker_players")
    .select("*").eq("room_id", roomId)
    .not("status", "eq", "sitting_out")
    .order("seat_index");

  if (players.length < 2) return;

  // 2. Rotar dealer
  const nextDealer = (room.dealer_seat + 1) % players.length;
  const sbIdx      = (nextDealer + 1) % players.length;
  const bbIdx      = (nextDealer + 2) % players.length;

  // 3. Mezclar y repartir hole cards
  const deck      = shuffleDeck(createDeck());
  const holeCards = {};
  for (const p of players) {
    holeCards[p.user_id] = dealCards(deck, 2);
  }

  // 4. Guardar deck residual (sin las cartas repartidas) en la sala
  await supabase.from("poker_rooms").update({
    deck_state:           deck,           // 52 - 2*N cartas
    phase:                "pre-flop",
    community_cards:      [],
    pot_total:            0,
    side_pots:            [],
    dealer_seat:          nextDealer,
    current_turn_user_id: players[(bbIdx + 1) % players.length].user_id,
    turn_started_at:      new Date().toISOString(),
  }).eq("id", roomId);

  // 5. Resetear estado de jugadores y guardar hole cards (cada uno solo ve las suyas gracias a RLS)
  for (const p of players) {
    await supabase.from("poker_players").update({
      hole_cards:      holeCards[p.user_id],
      current_bet:     0,
      total_bet_round: 0,
      status:          "active",
    }).eq("id", p.id);
  }

  // 6. Cobrar blinds
  const sb = players[sbIdx];
  const bb = players[bbIdx];
  await postBlind(roomId, sb, room.small_blind);
  await postBlind(roomId, bb, room.big_blind);

  // 7. Broadcast: nueva mano iniciada (sin hole cards)
  await supabase.channel(`poker:${roomId}`).send({
    type:    "broadcast",
    event:   "HAND_STARTED",
    payload: {
      dealerSeat:  nextDealer,
      sbUserId:    sb.user_id,
      bbUserId:    bb.user_id,
      firstToAct:  players[(bbIdx + 1) % players.length].user_id,
      expiresAt:   Date.now() + 20_000,
    },
  });

  // 8. Enviar hole cards individualmente por canal privado
  for (const [userId, cards] of Object.entries(holeCards)) {
    await supabase.channel(`poker:${roomId}:${userId}`).send({
      type:    "broadcast",
      event:   "YOUR_HOLE_CARDS",
      payload: { cards },
    });
  }

  // 9. Iniciar temporizador
  await advanceTurn(
    roomId,
    players[(bbIdx + 1) % players.length],
    handleTurnExpired
  );
}

// ── Cobrar blind ──────────────────────────────────────────────────────────────
async function postBlind(roomId, player, amount) {
  const actual = Math.min(amount, player.chips_stack);
  await supabase.from("poker_players").update({
    chips_stack:     player.chips_stack - actual,
    current_bet:     actual,
    total_bet_round: actual,
    status:          player.chips_stack <= amount ? "all_in" : "active",
  }).eq("id", player.id);

  await supabase.from("poker_rooms")
    .update({ pot_total: supabase.rpc("increment", { x: actual }) })
    .eq("id", roomId);
}

// ── Procesar acción del jugador ───────────────────────────────────────────────
export async function processAction(roomId, userId, action, amount = 0) {
  clearTurnTimer(roomId);

  const { data: room }    = await supabase.from("poker_rooms").select("*").eq("id", roomId).single();
  const { data: players } = await supabase.from("poker_players")
    .select("*").eq("room_id", roomId).order("seat_index");
  const player = players.find(p => p.user_id === userId);

  if (!player || room.current_turn_user_id !== userId) return;

  const maxBet     = Math.max(...players.map(p => p.current_bet));
  const callAmount = maxBet - player.current_bet;

  let chipsDelta   = 0;
  let newStatus    = player.status;
  let newCurrentBet = player.current_bet;

  switch (action) {
    case "fold":
      newStatus = "folded";
      break;

    case "check":
      if (callAmount > 0) return; // no puede hacer check si hay apuesta
      break;

    case "call": {
      const toCall = Math.min(callAmount, player.chips_stack);
      chipsDelta   = -toCall;
      newCurrentBet = player.current_bet + toCall;
      if (player.chips_stack <= callAmount) newStatus = "all_in";
      break;
    }

    case "bet":
    case "raise": {
      const total = Math.min(amount, player.chips_stack);
      chipsDelta  = -total;
      newCurrentBet = player.current_bet + total;
      if (player.chips_stack <= amount) newStatus = "all_in";
      break;
    }

    case "all_in": {
      chipsDelta    = -player.chips_stack;
      newCurrentBet = player.current_bet + player.chips_stack;
      newStatus     = "all_in";
      break;
    }
  }

  // Guardar cambios del jugador
  await supabase.from("poker_players").update({
    chips_stack:     player.chips_stack + chipsDelta,
    current_bet:     newCurrentBet,
    total_bet_round: player.total_bet_round + Math.abs(chipsDelta),
    status:          newStatus,
  }).eq("id", player.id);

  // Actualizar pot
  if (chipsDelta < 0) {
    await supabase.from("poker_rooms")
      .update({ pot_total: room.pot_total + Math.abs(chipsDelta) })
      .eq("id", roomId);
  }

  // Guardar en historial de acciones
  await supabase.from("poker_actions").insert({
    room_id: roomId, user_id: userId,
    username: player.username, action, amount: Math.abs(chipsDelta),
    phase: room.phase,
  });

  // Broadcast de la acción
  await supabase.channel(`poker:${roomId}`).send({
    type: "broadcast", event: "PLAYER_ACTION",
    payload: { userId, username: player.username, action, amount: Math.abs(chipsDelta) },
  });

  // Recargar jugadores actualizados
  const { data: updatedPlayers } = await supabase.from("poker_players")
    .select("*").eq("room_id", roomId).order("seat_index");

  // Verificar si hay ganador por fold de todos
  const stillIn = updatedPlayers.filter(p => !["folded","sitting_out"].includes(p.status));
  if (stillIn.length === 1) {
    await awardPot(roomId, stillIn[0], room.pot_total, updatedPlayers, room.community_cards);
    return;
  }

  // Verificar si la ronda de apuestas terminó
  const highBet = Math.max(...updatedPlayers.map(p => p.current_bet));
  if (isBettingRoundComplete(updatedPlayers, highBet)) {
    await advancePhase(roomId, room, updatedPlayers);
  } else {
    const next = getNextActivePlayer(updatedPlayers, player.seat_index);
    if (next) await advanceTurn(roomId, next, handleTurnExpired);
  }
}

// ── Avanzar fase ──────────────────────────────────────────────────────────────
async function advancePhase(roomId, room, players) {
  const currentIdx = PHASE_ORDER.indexOf(room.phase);
  const nextPhase  = PHASE_ORDER[currentIdx + 1];

  // Resetear apuestas de la ronda
  for (const p of players) {
    await supabase.from("poker_players")
      .update({ current_bet: 0 })
      .eq("id", p.id);
  }

  // Leer deck actualizado
  const { data: freshRoom } = await supabase.from("poker_rooms").select("deck_state, community_cards").eq("id", roomId).single();
  const deck = freshRoom.deck_state;
  let communityCards = freshRoom.community_cards || [];

  let newCards = [];
  if (nextPhase === "flop")  { newCards = dealCards(deck, 3); communityCards = newCards; }
  if (nextPhase === "turn")  { newCards = dealCards(deck, 1); communityCards = [...communityCards, ...newCards]; }
  if (nextPhase === "river") { newCards = dealCards(deck, 1); communityCards = [...communityCards, ...newCards]; }

  await supabase.from("poker_rooms").update({
    phase:           nextPhase,
    deck_state:      deck,
    community_cards: communityCards,
  }).eq("id", roomId);

  if (nextPhase === "showdown") {
    await resolveShowdown(roomId, players, communityCards);
    return;
  }

  // Broadcast cartas comunitarias
  if (newCards.length > 0) {
    await supabase.channel(`poker:${roomId}`).send({
      type: "broadcast", event: "DEAL_COMMUNITY_CARDS",
      payload: { phase: nextPhase, newCards, communityCards },
    });
  }

  // Siguiente turno: primer activo después del dealer
  const { data: freshRoom2 } = await supabase.from("poker_rooms").select("dealer_seat").eq("id", roomId).single();
  const sorted = players.filter(p => p.status === "active").sort((a,b) => a.seat_index - b.seat_index);
  const firstAfterDealer = sorted.find(p => p.seat_index > freshRoom2.dealer_seat) || sorted[0];
  if (firstAfterDealer) await advanceTurn(roomId, firstAfterDealer, handleTurnExpired);
}

// ── Showdown ──────────────────────────────────────────────────────────────────
async function resolveShowdown(roomId, players, communityCards) {
  const { data: room } = await supabase.from("poker_rooms").select("pot_total").eq("id", roomId).single();

  // Leer hole cards de todos (server tiene acceso total sin RLS)
  const activePlayers = players.filter(p => !["folded","sitting_out"].includes(p.status));
  const { data: freshPlayers } = await supabase.from("poker_players")
    .select("user_id, username, hole_cards, total_bet_round, status")
    .eq("room_id", roomId)
    .in("user_id", activePlayers.map(p => p.user_id));

  // Calcular side pots
  const allPlayersForPots = players.map(p => ({
    userId:         p.user_id,
    totalBetRound:  p.total_bet_round,
    status:         p.status,
  }));
  const sidePots = calculateSidePots(allPlayersForPots);

  // Resolver cada pot
  const payouts = resolvePayouts(sidePots, (eligibleIds) => {
    const eligible = freshPlayers.filter(p => eligibleIds.includes(p.user_id));
    const winners  = determineWinners(
      eligible.map(p => ({ userId: p.user_id, holeCards: p.hole_cards })),
      communityCards
    );
    return winners.map(w => w.userId);
  });

  // Pagar ganancias
  for (const payout of payouts) {
    await supabase.rpc("award_poker_pot", {
      p_room_id:   roomId,
      p_winner_id: payout.userId,
      p_amount:    payout.amount,
    });
  }

  // Revelar cartas de todos en broadcast
  await supabase.channel(`poker:${roomId}`).send({
    type: "broadcast", event: "SHOWDOWN_REVEAL",
    payload: {
      players: freshPlayers.map(p => ({
        userId:    p.user_id,
        username:  p.username,
        holeCards: p.hole_cards,
      })),
      communityCards,
      payouts,
    },
  });

  // Guardar mano en historial
  const mainWinner = freshPlayers.find(p => p.user_id === payouts[0]?.userId);
  if (mainWinner) {
    const result = determineWinners(
      [{ userId: mainWinner.user_id, holeCards: mainWinner.hole_cards }],
      communityCards
    );
    await supabase.from("poker_hands").insert({
      room_id:          roomId,
      winner_user_id:   mainWinner.user_id,
      winner_username:  mainWinner.username,
      winning_hand:     result[0]?.result?.description || "",
      pot_won:          payouts.filter(p => p.userId === mainWinner.user_id).reduce((s,p) => s+p.amount, 0),
      community_cards:  communityCards,
    });
  }

  // Esperar 5s y comenzar nueva mano
  setTimeout(() => startNewHand(roomId), 5000);
}

// ── Premio por folds ──────────────────────────────────────────────────────────
async function awardPot(roomId, winner, potTotal, players, communityCards) {
  await supabase.rpc("award_poker_pot", {
    p_room_id:   roomId,
    p_winner_id: winner.user_id,
    p_amount:    potTotal,
  });

  await supabase.channel(`poker:${roomId}`).send({
    type: "broadcast", event: "SHOWDOWN_WINNER",
    payload: {
      userId:   winner.user_id,
      username: winner.username,
      potWon:   potTotal,
      byFold:   true,
    },
  });

  setTimeout(() => startNewHand(roomId), 3000);
}

// ── Timeout de turno ──────────────────────────────────────────────────────────
async function handleTurnExpired(roomId, userId) {
  const { data: players } = await supabase.from("poker_players")
    .select("*").eq("room_id", roomId).order("seat_index");
  const player = players.find(p => p.user_id === userId);
  if (!player) return;

  const maxBet     = Math.max(...players.map(p => p.current_bet));
  const callAmount = maxBet - player.current_bet;

  // Auto check si puede, sino fold
  const autoAction = callAmount === 0 ? "check" : "fold";
  await processAction(roomId, userId, autoAction);
}