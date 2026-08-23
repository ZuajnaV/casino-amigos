// ─── Baraja estándar de 52 cartas ────────────────────────────────────────────
const SUITS  = ["s","h","d","c"];        // spades, hearts, diamonds, clubs
const RANKS  = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];

export function createDeck() {
  const deck = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      deck.push(`${rank}${suit}`);
  return deck;
}

export function shuffleDeck(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// Reparte n cartas del tope del deck (muta el array)
export function dealCards(deck, n) {
  return deck.splice(0, n);
}

// Convierte carta interna ("As") a formato pokersolver ("As") — ya compatible
export function toDisplayCard(card) {
  const rank = card[0] === "T" ? "10" : card[0];
  const suitMap = { s:"♠", h:"♥", d:"♦", c:"♣" };
  return `${rank}${suitMap[card[1]]}`;
}