// ─── Cálculo de Side Pots ─────────────────────────────────────────────────────
// players: [{ userId, totalBetRound, status }]
// Devuelve: [{ amount, eligibleUserIds }]
export function calculateSidePots(players) {
  // Solo los que apostaron algo
  const active = players
    .filter(p => p.totalBetRound > 0)
    .sort((a, b) => a.totalBetRound - b.totalBetRound);

  const pots   = [];
  let previous = 0;

  for (let i = 0; i < active.length; i++) {
    const level = active[i].totalBetRound;
    if (level === previous) continue;

    const eligible  = active.slice(i);   // pueden ganar este pot los que apostaron >= level
    const allIn     = active[i];
    const cap       = level - previous;
    const potAmount = cap * players.filter(p => p.totalBetRound >= level).length;

    pots.push({
      amount:          potAmount,
      eligibleUserIds: players
        .filter(p => p.totalBetRound >= level && p.status !== "folded")
        .map(p => p.userId),
    });

    previous = level;
  }

  // Consolidar pots con los mismos elegibles (por si hay igualdad)
  const merged = [];
  for (const pot of pots) {
    const existing = merged.find(m =>
      JSON.stringify(m.eligibleUserIds.sort()) ===
      JSON.stringify(pot.eligibleUserIds.sort())
    );
    if (existing) existing.amount += pot.amount;
    else merged.push({ ...pot });
  }

  return merged;
}

// Dada la lista de side pots y los ganadores por pot, devuelve los awards
// winners: [{ potIndex, userId }]
export function resolvePayouts(sidePots, determineWinnerFn) {
  return sidePots.map((pot, i) => {
    const winners = determineWinnerFn(pot.eligibleUserIds, i);
    const share   = Math.floor(pot.amount / winners.length);
    const remainder = pot.amount - share * winners.length;
    return winners.map((userId, wi) => ({
      userId,
      amount: share + (wi === 0 ? remainder : 0), // el sobrante va al primer ganador
    }));
  }).flat();
}