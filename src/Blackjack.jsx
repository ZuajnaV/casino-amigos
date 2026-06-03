// Blackjack.jsx
import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";

// ─── Mazo ────────────────────────────────────────────────────────────────────
const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const SUITS = ["♠","♥","♦","♣"];

function buildShuffledDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ r, s });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function cardValue(card) {
  if (card.r === "A") return 11;
  if (["J","Q","K"].includes(card.r)) return 10;
  return parseInt(card.r);
}

function handTotal(hand) {
  let total = hand.reduce((a, c) => a + cardValue(c), 0);
  let aces  = hand.filter(c => c.r === "A").length;
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function isBlackjack(hand) {
  return hand.length === 2 && handTotal(hand) === 21;
}

// ─── CSS de animaciones ───────────────────────────────────────────────────────
const CARD_ANIMATION_CSS = `
  @keyframes dealCard {
    0% {
      transform: translate(290px, -210px) scale(0.60) rotate(22deg);
      opacity: 0.50;
      filter: blur(3px);
      box-shadow: 0 40px 80px rgba(0,0,0,0.95);
    }
    58% {
      transform: translate(-16px, 9px) scale(1.07) rotate(-1.8deg);
      opacity: 1;
      filter: blur(0);
      box-shadow: 0 16px 32px rgba(0,0,0,0.55);
    }
    70% {
      transform: translate(6px, 1px) scale(1.01) rotate(-4deg);
      box-shadow: 0 8px 16px rgba(0,0,0,0.42);
    }
    81% {
      transform: translate(-4px, 0) scale(1) rotate(2.8deg);
      box-shadow: 0 5px 10px rgba(0,0,0,0.38);
    }
    91% {
      transform: translate(1px, 0) scale(1) rotate(-0.9deg);
      box-shadow: 0 3px 7px rgba(0,0,0,0.36);
    }
    100% {
      transform: translate(0, 0) scale(1) rotate(0deg);
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    }
  }

  @keyframes flipReveal {
    0%   { transform: rotateY(180deg) translateZ(0);   box-shadow: 0 2px 6px rgba(0,0,0,0.4); }
    38%  { transform: rotateY(90deg)  translateZ(32px); box-shadow: 0 32px 64px rgba(0,0,0,0.88); }
    62%  { transform: rotateY(90deg)  translateZ(32px); box-shadow: 0 32px 64px rgba(0,0,0,0.88); }
    88%  { transform: rotateY(-7deg)  translateZ(4px);  box-shadow: 0 6px 14px rgba(0,0,0,0.45); }
    94%  { transform: rotateY(3deg)   translateZ(1px); }
    100% { transform: rotateY(0deg)   translateZ(0);   box-shadow: 0 2px 6px rgba(0,0,0,0.4); }
  }
`;

// ─── Carta visual ─────────────────────────────────────────────────────────────
function Card({ card, hidden = false, highlight = false, dealDelay = 0 }) {
  const [revealState, setRevealState] = useState(hidden ? "back" : "front");
  const prevHiddenRef = useRef(hidden);

  useEffect(() => {
    if (prevHiddenRef.current === true && hidden === false) {
      setRevealState("flipping");
      const t = setTimeout(() => setRevealState("front"), 780);
      return () => clearTimeout(t);
    }
    prevHiddenRef.current = hidden;
  }, [hidden]);

  if (!card) return null;

  const red        = ["♥","♦"].includes(card.s);
  const isBack     = revealState === "back";
  const isFlipping = revealState === "flipping";

  return (
    <div style={{
      width: 125, height: 165,
      flexShrink: 0,
      perspective: "900px",
      animation: `dealCard 0.60s cubic-bezier(0.22, 0.61, 0.36, 1) ${dealDelay}ms both`,
    }}>
      <div style={{
        width: "100%", height: "100%",
        position: "relative",
        transformStyle: "preserve-3d",
        transform: isBack ? "rotateY(180deg)" : undefined,
        animation: isFlipping
          ? "flipReveal 0.78s cubic-bezier(0.4, 0, 0.2, 1) forwards"
          : "none",
      }}>
        {/* Cara frontal */}
        <div style={{
          position: "absolute", inset: 0,
          borderRadius: 8,
          background: "#f8f8f0",
          border: `2px solid ${highlight ? "#fbbf24" : "#ccc"}`,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
          fontWeight: 700,
          color: red ? "#c0392b" : "#1a1a1a",
          userSelect: "none",
          boxShadow: highlight ? "0 0 10px #fbbf2488" : "0 2px 6px rgba(0,0,0,0.4)",
        }}>
          <div style={{ fontSize: 40, alignSelf: "flex-start", paddingLeft: 5, lineHeight: 1 }}>{card.r}</div>
          <div style={{ fontSize: 60, lineHeight: 1.1 }}>{card.s}</div>
          <div style={{ fontSize: 40, alignSelf: "flex-end", paddingRight: 5, lineHeight: 1, transform: "rotate(180deg)" }}>{card.r}</div>
        </div>

        {/* Cara trasera */}
        <div style={{
          position: "absolute", inset: 0,
          borderRadius: 8,
          background: "linear-gradient(135deg, #1e3a5f 0%, #0d1f3a 100%)",
          border: "2px solid #2a5a8a",
          display: "flex", alignItems: "center", justifyContent: "center",
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
          transform: "rotateY(180deg)",
          userSelect: "none",
          boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
        }}>
          <div style={{
            width: "80%", height: "80%",
            border: "2px solid #4a7ab5",
            borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "repeating-linear-gradient(45deg, #1e3a5f, #1e3a5f 5px, #16305a 5px, #16305a 10px)",
          }}>
            <span style={{ fontSize: 36, opacity: 0.6 }}>🂠</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Panel de apuesta ─────────────────────────────────────────────────────────
const BET_OPTIONS = [1000, 5000, 10000, 50000, 100000, 1000000, 5000000];
const MIN_BET = 1000;

function BetPanel({ balance, onStart, lastBet }) {
  const [bet, setBet] = useState(0);
  const [err, setErr] = useState("");

  function addChip(v) {
    setErr("");
    const next = bet + v;
    if (next > balance) { setErr("Supera tu saldo disponible"); return; }
    setBet(next);
  }

  function confirm() {
    if (bet < MIN_BET)      { setErr(`Apuesta mínima: $${MIN_BET.toLocaleString()}`); return; }
    if (bet % 1000 !== 0)   { setErr("La apuesta debe ser múltiplo de $1.000"); return; }
    if (bet > balance)      { setErr("Saldo insuficiente"); return; }
    onStart(bet);
  }

  const quickActions = [
    { label: "Mínima",   fn: () => { setErr(""); setBet(MIN_BET); } },
    { label: "Mitad",    fn: () => { setErr(""); setBet(Math.max(MIN_BET, Math.floor(balance / 2 / 1000) * 1000)); } },
    { label: "Anterior", fn: () => {
        if (!lastBet)          { setErr("Sin apuesta anterior"); return; }
        if (lastBet > balance) { setErr("Saldo insuficiente");   return; }
        setErr(""); setBet(lastBet);
    }},
    { label: "All-in",   fn: () => { setErr(""); setBet(Math.floor(balance / 1000) * 1000); } },
    { label: "Borrar",   fn: () => { setErr(""); setBet(0); } },
  ];

  return (
    <div style={{ maxWidth: 380, margin: "0 auto" }}>
      <h3 style={{ color: "#00d4aa", marginBottom: 14, fontSize: 18 }}>💰 Elige tu apuesta</h3>

      <div style={{ marginBottom: 12 }}>
        <div style={{ color: "#555", fontSize: 11, letterSpacing: 1.5, marginBottom: 6 }}>FICHAS</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {BET_OPTIONS.map(v => (
            <button key={v} onClick={() => addChip(v)}
              style={{ border: "none", borderRadius: 6, padding: "7px 13px", color: "#fff",
                fontSize: 13, fontWeight: 700, cursor: "pointer", background: "#1e1e2e" }}>
              +{v >= 1000 ? `${v/1000}k` : v}
            </button>
          ))}
        </div>
      </div>

      <div style={{ textAlign: "center", margin: "16px 0" }}>
        <div style={{ color: "#555", fontSize: 11, letterSpacing: 1.5 }}>APUESTA ACTUAL</div>
        <div style={{ fontSize: 36, fontWeight: 900, color: bet > 0 ? "#fbbf24" : "#333", marginTop: 4 }}>
          ${bet.toLocaleString()}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {quickActions.map(a => (
          <button key={a.label} onClick={a.fn}
            style={{ background: "#2a2a3a", border: "1px solid #3a3a4a", borderRadius: 6,
              padding: "5px 11px", color: "#aaa", fontSize: 11, cursor: "pointer" }}>
            {a.label}
          </button>
        ))}
      </div>

      {err && (
        <div style={{ background: "#2a1a1a", border: "1px solid #5a2a2a", borderRadius: 6,
          padding: "8px 12px", color: "#ff6b35", fontSize: 13, marginBottom: 10, textAlign: "center" }}>
          {err}
        </div>
      )}

      <button onClick={confirm}
        style={{ width: "100%", border: "none", borderRadius: 8, padding: 13,
          color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer",
          background: bet >= MIN_BET ? "#00d4aa" : "#2a2a3a", opacity: bet >= MIN_BET ? 1 : 0.5 }}>
        🃏 REPARTIR
      </button>

      <div style={{ color: "#333", fontSize: 11, marginTop: 10, textAlign: "center" }}>
        Saldo: <span style={{ color: "#fbbf24" }}>${balance.toLocaleString()}</span>
        &nbsp;·&nbsp; Mínima: ${MIN_BET.toLocaleString()}
      </div>
    </div>
  );
}

// ─── Mano (sub-componente visual) ─────────────────────────────────────────────
function HandDisplay({ hand, label, score, isActive, hideSecond = false }) {
  return (
    <div style={{
      padding: "10px 12px", borderRadius: 10,
      background: isActive ? "#1a1f2e" : "transparent",
      border: isActive ? "1px solid #3b82f6" : "1px solid transparent",
      transition: "all 0.2s",
    }}>
      <div style={{ color: isActive ? "#3b82f6" : "#ff0000", fontSize: 20,
        letterSpacing: 1.5, marginBottom: 6, textAlign: "center" }}>
        {label} {score !== null
          ? `— ${score > 21 ? `BUST (${score})` : score}`
          : ""}
        {hand.length === 2 && score === 21 ? " — BLACKJACK 🃏" : ""}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
        {hand.map((c, i) => (
          <Card
            key={i}
            card={c}
            hidden={hideSecond && i === 1}
            highlight={isActive && i === hand.length - 1}
            dealDelay={c.dealDelay ?? 0}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Juego principal ──────────────────────────────────────────────────────────
export default function BlackjackGame({ balance, setBalance, onBack }) {
  const [phase, setPhase]         = useState("bet");
  const [deck, setDeck]           = useState([]);
  const [deckIdx, setDeckIdx]     = useState(0);
  const [dealer, setDealer]       = useState([]);
  const [bet, setBet]             = useState(0);
  const [lastBet, setLastBet]     = useState(0);
  const [doubled, setDoubled]     = useState(false);
  const [insured, setInsured]     = useState(false);
  const [resultMsg, setResultMsg] = useState("");
  const [stats, setStats]         = useState({ wins: 0, losses: 0, ties: 0, bj: 0 });

  const [hands, setHands]                 = useState([]);
  const [activeHandIdx, setActiveHandIdx] = useState(0);

  // ── Mirror deck in a ref so setTimeout closures never see stale state ──────
  const deckRef = useRef([]);
  useEffect(() => { deckRef.current = deck; }, [deck]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const { data } = await supabase.from("blackjack_stats")
        .select("*").eq("user_id", session.user.id).single();
      if (data) setStats({ wins: data.wins, losses: data.losses, ties: data.ties, bj: data.blackjacks });
    });
  }, []);

  const activeHand   = hands[activeHandIdx];
  const currentCards = activeHand?.cards ?? [];

  const canDouble = phase === "play" &&
    currentCards.length === 2 &&
    balance >= (activeHand?.bet ?? 0) &&
    !activeHand?.isAceSplit;

  const canSplit = phase === "play" &&
    currentCards.length === 2 &&
    currentCards[0].r === currentCards[1].r &&
    balance >= (activeHand?.bet ?? 0) &&
    hands.length === 1;

  // ─── Iniciar partida ─────────────────────────────────────────────────────
  function startGame(betAmount) {
    const newDeck = buildShuffledDeck();
    let idx = 0;

    const playerHand = [
      { ...newDeck[idx++], dealDelay: 0   },
      { ...newDeck[idx++], dealDelay: 400 },
    ];
    const dealerHand = [
      { ...newDeck[idx++], dealDelay: 200 },
      { ...newDeck[idx++], dealDelay: 600 },
    ];

    setDeck(newDeck);
    deckRef.current = newDeck;   // sync ref immediately
    setDeckIdx(idx);
    setDealer(dealerHand);
    setBet(betAmount);
    setLastBet(betAmount);
    setDoubled(false);
    setInsured(false);
    setResultMsg("");
    setHands([{ cards: playerHand, bet: betAmount, done: false, result: null, isAceSplit: false }]);
    setActiveHandIdx(0);
    setBalance(b => b - betAmount);

    if (isBlackjack(playerHand)) {
      resolveAll([{ cards: playerHand, bet: betAmount, done: true, isAceSplit: false }], dealerHand, true);
      return;
    }

    if (dealerHand[0].r === "A") setPhase("insurance");
    else setPhase("play");
  }

  // ─── Seguro ───────────────────────────────────────────────────────────────
  function takeInsurance() {
    setInsured(true);
    setBalance(b => b - Math.floor(bet / 2));
    setPhase("play");
  }

  // ─── Hit ─────────────────────────────────────────────────────────────────
  function hit() {
    const newCard  = { ...deck[deckIdx], dealDelay: 0 };
    const newCards = [...currentCards, newCard];
    const newIdx   = deckIdx + 1;
    setDeckIdx(newIdx);

    const newHands = hands.map((h, i) =>
      i === activeHandIdx ? { ...h, cards: newCards } : h
    );
    setHands(newHands);

    if (handTotal(newCards) > 21) {
      advanceOrFinish(newHands, newIdx, activeHandIdx);
    }
  }

  // ─── Stand ───────────────────────────────────────────────────────────────
  function stand() {
    const newHands = hands.map((h, i) =>
      i === activeHandIdx ? { ...h, done: true } : h
    );
    setHands(newHands);
    advanceOrFinish(newHands, deckIdx, activeHandIdx);
  }

  // ─── Doblar ──────────────────────────────────────────────────────────────
  function double() {
    setBalance(b => b - activeHand.bet);
    setDoubled(true);

    const newCard  = { ...deck[deckIdx], dealDelay: 0 };
    const newCards = [...currentCards, newCard];
    const newIdx   = deckIdx + 1;
    setDeckIdx(newIdx);

    const newHands = hands.map((h, i) =>
      i === activeHandIdx ? { ...h, cards: newCards, bet: h.bet * 2, done: true } : h
    );
    setHands(newHands);
    advanceOrFinish(newHands, newIdx, activeHandIdx);
  }

  // ─── Split ───────────────────────────────────────────────────────────────
  function split() {
    const isAce    = currentCards[0].r === "A";
    const extraBet = activeHand.bet;
    setBalance(b => b - extraBet);

    let idx = deckIdx;
    const hand0Cards = [currentCards[0], { ...deck[idx++], dealDelay: 0   }];
    const hand1Cards = [currentCards[1], { ...deck[idx++], dealDelay: 200 }];
    setDeckIdx(idx);

    const newHands = [
      { cards: hand0Cards, bet: activeHand.bet, done: isAce,  result: null, isAceSplit: isAce },
      { cards: hand1Cards, bet: extraBet,        done: false, result: null, isAceSplit: isAce },
    ];
    setHands(newHands);

    if (isAce) advanceOrFinish(newHands, idx, 0);
    else setActiveHandIdx(0);
  }

  // ─── Avanzar o terminar ───────────────────────────────────────────────────
  // Cuando todas las manos del jugador terminan, arranca el turno del dealer:
  //   1. Cambia a phase "dealer_turn" → hideSecond pasa a false → animación de volteo
  //   2. Espera 900ms para que termine la animación del volteo
  //   3. Reparte cartas adicionales una por una cada 750ms
  //   4. Cuando el dealer llega a 17+, llama a resolveAll
  function advanceOrFinish(currentHands, idx, currentIdx) {
    const updatedHands = currentHands.map((h, i) =>
      i === currentIdx ? { ...h, done: true } : h
    );

    const nextIdx = updatedHands.findIndex((h, i) => i > currentIdx && !h.done);

    if (nextIdx !== -1) {
      // Todavía hay manos del jugador pendientes
      setHands(updatedHands);
      setActiveHandIdx(nextIdx);
      return;
    }

    // Todas las manos terminaron → turno del dealer
    setHands(updatedHands);
    setPhase("dealer_turn"); // hace que hideSecond = false → flip animation

    // Snapshot del dealer actual (pasado por parámetro implícito, usamos dealer state)
    const initialDealerHand = [...dealer];

    // Función recursiva: comprueba si el dealer necesita otra carta y la reparte
    const drawNext = (dealerHand, cardIdx) => {
      if (handTotal(dealerHand) >= 17) {
        // Dealer plantado: actualizar deckIdx y resolver
        setDeckIdx(cardIdx);
        resolveAll(updatedHands, dealerHand, false);
        return;
      }

      // Repartir una carta nueva al dealer con animación de deal
      const newCard   = { ...deckRef.current[cardIdx], dealDelay: 0 };
      const newHand   = [...dealerHand, newCard];
      setDealer(newHand);

      // Esperar a que la animación de la carta aterrice (~700ms) y seguir
      setTimeout(() => drawNext(newHand, cardIdx + 1), 750);
    };

    // 900ms = duración de flipReveal para la carta oculta del dealer
    setTimeout(() => drawNext(initialDealerHand, idx), 900);
  }

  // ─── Resolver todas las manos ─────────────────────────────────────────────
  function resolveAll(finalHands, dealerHand, playerBJ) {
    const dv       = handTotal(dealerHand);
    const dealerBJ = isBlackjack(dealerHand);
    let totalPayout = 0;
    let wins = 0, losses = 0, ties = 0, bjs = 0;
    const messages = [];

    finalHands.forEach((h, i) => {
      const pv    = handTotal(h.cards);
      const label = finalHands.length > 1 ? ` (Mano ${i+1})` : "";
      let payout  = 0;

      if (playerBJ && !dealerBJ) {
        payout = h.bet + Math.floor(h.bet * 1.5);
        messages.push(`🃏 BLACKJACK${label} — Ganas 3:2`);
        wins++; bjs++;
      } else if (playerBJ && dealerBJ) {
        payout = h.bet;
        messages.push(`🤝 Empate${label} — ambos BJ`);
        ties++;
      } else if (dealerBJ) {
        payout = insured ? h.bet : 0;
        messages.push(insured ? `🛡️ BJ banca${label} — seguro cubre` : `🏦 BJ banca${label} — Pierdes`);
        if (!insured) losses++; else ties++;
      } else if (pv > 21) {
        payout = 0;
        messages.push(`💥 Bust${label} — Pierdes`);
        losses++;
      } else if (dv > 21) {
        payout = h.bet * 2;
        messages.push(`🎉 Banca bust${label} — Ganas`);
        wins++;
      } else if (pv > dv) {
        payout = h.bet * 2;
        messages.push(`🎉 Ganaste${label}`);
        wins++;
      } else if (dv > pv) {
        payout = 0;
        messages.push(`😔 Gana banca${label}`);
        losses++;
      } else {
        payout = h.bet;
        messages.push(`🤝 Empate${label}`);
        ties++;
      }

      totalPayout += payout;
    });

    //setBalance(b => b + totalPayout);



    setBalance(b => {
  const finalBalance = b + totalPayout;
  // Guardar en Supabase directamente
  supabase.auth.getSession().then(async ({ data: { session } }) => {
    if (!session) return;
    await supabase.from("profiles")
      .update({ balance: finalBalance })
      .eq("id", session.user.id);
  });
  return finalBalance;
});













    setResultMsg(messages.join("  ·  "));
    setStats(s => ({
      wins:   s.wins   + wins,
      losses: s.losses + losses,
      ties:   s.ties   + ties,
      bj:     s.bj     + bjs,
    }));
    setPhase("result");

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      await supabase.from("blackjack_stats").update({
        wins:       stats.wins   + wins,
        losses:     stats.losses + losses,
        ties:       stats.ties   + ties,
        blackjacks: stats.bj     + bjs,
      }).eq("user_id", session.user.id);
    });
  }

  function newHand() {
    setPhase("bet");
    setHands([]); setDealer([]); setBet(0);
    setResultMsg(""); setDoubled(false); setInsured(false);
    setActiveHandIdx(0);
  }

  const dv       = handTotal(dealer);
  const isResult = phase === "result";

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", fontFamily: "Georgia, serif" }}>
      <style>{CARD_ANIMATION_CSS}</style>

      <button onClick={onBack} style={{ background:"transparent", border:"none", color:"#555", fontSize:14, cursor:"pointer", marginBottom:10, padding:0 }}>
        ← Lobby
      </button>

      {/* Estadísticas */}
      <div style={{ background:"#16161f", border:"1px solid #1e1e2e", borderRadius:10, padding:"10px 16px", marginBottom:10, display:"flex", alignItems:"center", gap:20, flexWrap:"wrap" }}>
        {[["🎉","Ganadas",stats.wins],["😔","Perdidas",stats.losses],["🤝","Empates",stats.ties],["🃏","Blackjacks",stats.bj]].map(([ic,lb,v])=>(
          <div key={lb} style={{ textAlign:"center" }}>
            <div style={{ fontSize:20 }}>{ic}</div>
            <div style={{ color:"#fbbf24", fontWeight:700, fontSize:20 }}>{v}</div>
            <div style={{ color:"#ffffff", fontSize:13 }}>{lb}</div>
          </div>
        ))}
        <div style={{ marginLeft:"auto" }}>
          <div style={{ color:"#ffffff", fontSize:15 }}>SALDO</div>
          <div style={{ color:"#fbbf24", fontWeight:700, fontSize:20 }}>${balance.toLocaleString()}</div>
        </div>
      </div>

      <div style={{ background:"#16161f", border:"1px solid #1e1e2e", borderRadius:14, padding:20 }}>

        {phase === "bet" && <BetPanel balance={balance} onStart={startGame} lastBet={lastBet} />}

        {phase === "insurance" && (
          <div style={{ textAlign:"center", padding:20 }}>
            <div style={{ fontSize:44, marginBottom:10 }}>🛡️</div>
            <h3 style={{ color:"#fbbf24", marginBottom:8 }}>La banca muestra un As</h3>
            <p style={{ color:"#aaa", fontSize:14, marginBottom:20 }}>
              ¿Tomar seguro por <strong style={{ color:"#fff" }}>${Math.floor(bet/2).toLocaleString()}</strong>?<br/>
              Si la banca tiene Blackjack, el seguro paga 2:1.
            </p>
            <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
              <button onClick={takeInsurance} style={{ border:"none", borderRadius:8, padding:"12px 28px", color:"#000", background:"#fbbf24", fontSize:14, fontWeight:700, cursor:"pointer" }}>
                Sí, asegurarme
              </button>
              <button onClick={() => { setInsured(false); setPhase("play"); }} style={{ border:"none", borderRadius:8, padding:"12px 28px", color:"#fff", background:"#2a2a3a", fontSize:14, fontWeight:700, cursor:"pointer" }}>
                No, continuar
              </button>
            </div>
          </div>
        )}

        {(phase === "play" || phase === "dealer_turn" || phase === "result") && (
          <div>
            {/* ── Mano de la banca ──
                hideSecond: solo durante "play" e "insurance" (carta boca abajo)
                Al pasar a "dealer_turn" hideSecond = false → dispara flipReveal en Card
                score: visible en dealer_turn (se actualiza carta a carta) y en result */}
            <HandDisplay
              hand={dealer}
              label="BANCA"
              score={phase === "dealer_turn" || isResult ? dv : null}
              isActive={false}
              hideSecond={phase === "play" || phase === "insurance"}
            />

            <div style={{ borderTop:"1px solid #1e1e2e", margin:"12px 0" }}/>

            {/* Manos del jugador */}
            {hands.map((h, i) => (
              <HandDisplay
                key={i}
                hand={h.cards}
                label={hands.length > 1 ? `MANO ${i+1}` : "TÚ"}
                score={handTotal(h.cards)}
                isActive={phase === "play" && i === activeHandIdx}
              />
            ))}

            {/* Info apuesta */}
            <div style={{ color:"#ffffff", fontSize:20, marginTop:8 }}>
              {hands.map((h, i) => (
                <span key={i} style={{ marginRight:12 }}>
                  {hands.length>1?`Mano ${i+1}: `:"Apuesta: "}
                  <span style={{ color:"#fbbf24", fontWeight:700 }}>${h.bet.toLocaleString()}</span>
                </span>
              ))}
              {insured && <span style={{ color:"#888" }}> + Seguro (${Math.floor(bet/2).toLocaleString()})</span>}
            </div>

            {/* Resultado */}
            {resultMsg && (
              <div style={{
                textAlign:"center", fontWeight:700, fontSize:16,
                padding:"12px", background:"#0d0d14", borderRadius:8, marginTop:10,
                color: resultMsg.includes("Ganas")||resultMsg.includes("Ganaste")||resultMsg.includes("BLACKJACK") ? "#00d4aa"
                     : resultMsg.includes("Empate")||resultMsg.includes("seguro") ? "#fbbf24"
                     : "#ff6b35"
              }}>
                {resultMsg}
              </div>
            )}

            {/* Botones de acción — solo en fase "play" */}
            {phase === "play" && (
              <div style={{ display:"flex", gap:8, marginTop:14, flexWrap:"wrap" }}>
                <button onClick={hit} style={{ flex:1, border:"none", borderRadius:8, padding:12, color:"#fff", fontSize:20, fontWeight:700, cursor:"pointer", background:"#ff6b35" }}>
                  Pedir carta
                </button>
                <button onClick={stand} style={{ flex:1, border:"none", borderRadius:8, padding:12, color:"#fff", fontSize:20, fontWeight:700, cursor:"pointer", background:"#00d4aa" }}>
                  Plantarse
                </button>
                {canDouble && (
                  <button onClick={double} style={{ flex:1, border:"none", borderRadius:8, padding:12, color:"#fff", fontSize:20, fontWeight:700, cursor:"pointer", background:"#7c3aed" }}>
                    Doblar
                  </button>
                )}
                {canSplit && (
                  <button onClick={split} style={{ flex:1, border:"none", borderRadius:8, padding:12, color:"#000", fontSize:20, fontWeight:700, cursor:"pointer", background:"#fbbf24" }}>
                    Dividir
                  </button>
                )}
              </div>
            )}

            {/* Indicador visual mientras el dealer juega */}
            {phase === "dealer_turn" && (
              <div style={{ textAlign:"center", color:"#aaa", fontSize:14, marginTop:12 }}>
                🎴 La banca está jugando...
              </div>
            )}

            {phase === "result" && (
              <div style={{ display:"flex", gap:8, marginTop:14 }}>
                <button onClick={newHand} style={{ flex:1, border:"none", borderRadius:8, padding:13, color:"#fff", fontSize:25, fontWeight:700, cursor:"pointer", background:"#00d4aa" }}>
                  Nueva mano
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
