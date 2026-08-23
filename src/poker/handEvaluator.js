import { Hand } from "pokersolver";

// Convierte formato interno ("As", "Kh") al que acepta pokersolver ("As", "Kh") — ya compatible

export function evaluateHand(holeCards, communityCards) {
  const all7 = [...holeCards, ...communityCards];
  const hand = Hand.solve(all7);
  return {
    hand,
    name:        hand.name,           // "Flush", "Full House", etc.
    description: hand.descr,          // "Full House, Aces over Kings"
    rank:        hand.rank,           // número para comparar (mayor = mejor)
  };
}

// Recibe array de { userId, holeCards }
// Devuelve array de ganadores (puede ser más de uno en caso de empate)
export function determineWinners(players, communityCards) {
  const evaluated = players.map(p => ({
    ...p,
    result: evaluateHand(p.holeCards, communityCards),
  }));

  const hands   = evaluated.map(p => p.result.hand);
  const winners = Hand.winners(hands);

  return evaluated.filter(p => winners.includes(p.result.hand));
}