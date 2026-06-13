import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";

// ═══════════════════════════════════════════════════════════════
//  CONSTANTES Y LÓGICA DEL JUEGO
// ═══════════════════════════════════════════════════════════════

const SUITS  = ["♠","♥","♦","♣"];
const RANKS  = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const MIN_BET = 1_000;

function buildShuffledDeck(numDecks = 8) {
  const deck = [];
  for (let d = 0; d < numDecks; d++)
    for (const s of SUITS)
      for (const r of RANKS)
        deck.push({ r, s });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function cardValue(card) {
  if (card.r === "A") return 1;
  if (["10","J","Q","K"].includes(card.r)) return 0;
  return parseInt(card.r);
}

function handScore(cards) {
  return cards.reduce((sum, c) => sum + cardValue(c), 0) % 10;
}

// Devuelve { playerCards, bankerCards } completos tras aplicar el Tableau
function playBaccarat(deck, startIdx) {
  let idx = startIdx;
  const draw = () => deck[idx++];

  const playerCards = [draw(), draw()];
  const bankerCards = [draw(), draw()];

  const ps = handScore(playerCards);
  const bs = handScore(bankerCards);

  // Natural (8 o 9): fin inmediato
  if (ps >= 8 || bs >= 8)
    return { playerCards, bankerCards, nextIdx: idx };

  // Regla del Jugador
  let playerThird = null;
  if (ps <= 5) {
    playerThird = draw();
    playerCards.push(playerThird);
  }

  // Regla de la Banca (EZ Baccarat)
  const bs2 = handScore(bankerCards);
  if (playerThird === null) {
    // Jugador se plantó: banca sigue la misma regla simple
    if (bs2 <= 5) bankerCards.push(draw());
  } else {
    // Jugador robó: matriz algorítmica
    const ptv = cardValue(playerThird); // valor de la 3ª carta del jugador
    let bankerDraws = false;
    if      (bs2 <= 2) bankerDraws = true;
    else if (bs2 === 3) bankerDraws = (ptv !== 8);
    else if (bs2 === 4) bankerDraws = ([2,3,4,5,6,7].includes(ptv));
    else if (bs2 === 5) bankerDraws = ([4,5,6,7].includes(ptv));
    else if (bs2 === 6) bankerDraws = ([6,7].includes(ptv));
    // bs2 === 7 → siempre se planta
    if (bankerDraws) bankerCards.push(draw());
  }

  return { playerCards, bankerCards, nextIdx: idx };
}

// Dragon 7: banca gana con total 7 y exactamente 3 cartas
function isDragon7(bankerCards, playerFinalScore, bankerFinalScore) {
  return bankerCards.length === 3 && bankerFinalScore === 7 && bankerFinalScore > playerFinalScore;
}

// ── Cálculo de pagos (EZ Baccarat) ───────────────────────────────────────────
function calcPayout(bets, playerScore, bankerScore, bankerCards) {
  const dragon7 = isDragon7(bankerCards, playerScore, bankerScore);
  let winnings = 0;
  const results = {};

  // Determinar resultado
  let outcome; // "player" | "banker" | "tie"
  if (playerScore > bankerScore) outcome = "player";
  else if (bankerScore > playerScore) outcome = "banker";
  else outcome = "tie";

  // PLAYER
  if (bets.player > 0) {
    if (outcome === "player") { winnings += bets.player * 2; results.player = `+${bets.player}`; }
    else if (outcome === "tie") { winnings += bets.player; results.player = "push"; }  // devuelve la apuesta en empate
    else { results.player = `-${bets.player}`; }
  }

  // BANKER (EZ: sin comisión pero Dragon 7 = push)
  if (bets.banker > 0) {
    if (outcome === "banker") {
      if (dragon7) { winnings += bets.banker; results.banker = "push (Dragon 7)"; }
      else         { winnings += bets.banker * 2; results.banker = `+${bets.banker}`; }
    } else if (outcome === "tie") {
      winnings += bets.banker; results.banker = "push";
    } else {
      results.banker = `-${bets.banker}`;
    }
  }

  // TIE (paga 8:1)
  if (bets.tie > 0) {
    if (outcome === "tie") { winnings += bets.tie * 9; results.tie = `+${bets.tie * 8}`; }
    else                   { results.tie = `-${bets.tie}`; }
  }

  return { winnings, results, outcome, dragon7 };
}

// ═══════════════════════════════════════════════════════════════
//  COMPONENTE CARTA
// ═══════════════════════════════════════════════════════════════
const CARD_CSS = `
  @keyframes bacDeal {
    0%   { transform: translateY(-60px) scale(0.7) rotate(-8deg); opacity: 0; }
    70%  { transform: translateY(4px) scale(1.04) rotate(1deg); opacity: 1; }
    100% { transform: translateY(0) scale(1) rotate(0deg); opacity: 1; }
  }
  @keyframes bacFlip {
    0%   { transform: rotateY(90deg) scale(0.8); opacity: 0.3; }
    100% { transform: rotateY(0deg)  scale(1);   opacity: 1; }
  }
  @keyframes bacGlow {
    0%,100% { box-shadow: 0 0 8px rgba(251,191,36,0.3); }
    50%      { box-shadow: 0 0 22px rgba(251,191,36,0.8); }
  }
  @keyframes bacShimmer {
    0%   { background-position: -200% center; }
    100% { background-position:  200% center; }
  }
`;

function BacCard({ card, hidden = false, delay = 0, highlight = false }) {
  const isRed = card && ["♥","♦"].includes(card.s);

  return (
    <div style={{
      width: 70, height: 100,
      borderRadius: 8,
      border: highlight ? "2px solid #fbbf24" : "1px solid rgba(255,255,255,0.15)",
      boxShadow: highlight ? undefined : "0 4px 12px rgba(0,0,0,0.6)",
      animation: `bacDeal 0.45s cubic-bezier(.22,.61,.36,1) ${delay}ms both, ${highlight ? "bacGlow 1.6s ease-in-out infinite" : ""}`,
      flexShrink: 0,
      position: "relative",
      overflow: "hidden",
    }}>
      {hidden ? (
        // Carta boca abajo — patrón de damero dorado
        <div style={{
          width:"100%", height:"100%",
          background: "linear-gradient(135deg, #1a1226 25%, #221533 25%, #221533 50%, #1a1226 50%, #1a1226 75%, #221533 75%)",
          backgroundSize: "12px 12px",
          display:"flex", alignItems:"center", justifyContent:"center",
        }}>
          <div style={{
            width: 44, height: 66, borderRadius: 5,
            border: "2px solid rgba(251,191,36,0.5)",
            background: "linear-gradient(135deg, rgba(251,191,36,0.12), rgba(251,191,36,0.04))",
          }}/>
        </div>
      ) : (
        <div style={{
          width:"100%", height:"100%",
          background: "#f8f8f0",
          display:"flex", flexDirection:"column",
          padding:"4px 5px",
          animation: `bacFlip 0.35s ease ${delay + 50}ms both`,
          boxSizing:"border-box",
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: isRed ? "#c0392b" : "#1a1a1a", lineHeight: 1 }}>
            {card.r}
          </div>
          <div style={{ fontSize: 14, color: isRed ? "#c0392b" : "#1a1a1a", lineHeight: 1 }}>
            {card.s}
          </div>
          <div style={{ flex: 1, display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize: 22, color: isRed ? "#c0392b" : "#1a1a1a" }}>
            {card.s}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: isRed ? "#c0392b" : "#1a1a1a",
                        lineHeight: 1, alignSelf:"flex-end", transform:"rotate(180deg)" }}>
            {card.r}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  COMPONENTE MANO
// ═══════════════════════════════════════════════════════════════
function HandArea({ label, cards, score, revealed, accentColor, isWinner, isDragon }) {
  return (
    <div style={{
      flex: 1,
      background: isWinner
        ? `linear-gradient(160deg, ${accentColor}22, rgba(0,0,0,0.3))`
        : "rgba(0,0,0,0.25)",
      border: `2px solid ${isWinner ? accentColor : "rgba(255,255,255,0.07)"}`,
      borderRadius: 14,
      padding: "14px 12px",
      transition: "all 0.4s",
      boxShadow: isWinner ? `0 0 28px ${accentColor}44` : "none",
      minWidth: 0,
    }}>
      {/* Label */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: accentColor, letterSpacing: 2, textTransform:"uppercase" }}>
          {label}
          {isDragon && <span style={{ marginLeft: 6, color: "#fbbf24", fontSize: 10 }}>🐉 Dragon 7</span>}
        </div>
        {revealed && (
          <div style={{
            fontSize: 22, fontWeight: 900, color: "#fff",
            background: isWinner ? accentColor : "rgba(255,255,255,0.1)",
            borderRadius: 8, padding: "2px 10px",
            minWidth: 36, textAlign:"center",
          }}>
            {score}
          </div>
        )}
      </div>

      {/* Cartas */}
      <div style={{ display:"flex", gap: 6, flexWrap:"wrap" }}>
        {cards.map((c, i) => (
          <BacCard
            key={i}
            card={c}
            hidden={!revealed && i === 1 && label === "BANCA"}
            delay={i * 180}
            highlight={isWinner && i === cards.length - 1 && cards.length > 2}
          />
        ))}
        {/* Placeholder vacío */}
        {cards.length === 0 && (
          <div style={{ width: 70, height: 100, border: "2px dashed rgba(255,255,255,0.08)", borderRadius: 8 }} />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  PANEL DE APUESTAS
// ═══════════════════════════════════════════════════════════════
const CHIP_VALUES = [1_000, 5_000, 10_000, 50_000, 100_000, 500_000];
const CHIP_COLORS = {
  1_000:     "#888",
  5_000:   "#3b82f6",
  10_000:   "#ef4444",
  50_000:  "#22c55e",
  100_000:  "#a855f7",
  500_000: "#fbbf24",
};

function BetSpot({ label, sublabel, accent, amount, onClick, disabled, isActive, payLabel }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        padding: "14px 10px 12px",
        border: `2px solid ${isActive ? accent : "rgba(255,255,255,0.1)"}`,
        borderRadius: 12,
        background: isActive
          ? `linear-gradient(160deg, ${accent}22, rgba(0,0,0,0.4))`
          : "rgba(0,0,0,0.3)",
        cursor: disabled ? "default" : "pointer",
        textAlign: "center",
        transition: "all 0.2s",
        boxShadow: isActive ? `0 0 16px ${accent}44` : "none",
        position: "relative",
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 12, color: accent, fontWeight: 800, letterSpacing: 1.5, textTransform:"uppercase" }}>{label}</div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{sublabel}</div>
      {amount > 0 && (
        <div style={{
          position:"absolute", top:-10, left:"50%", transform:"translateX(-50%)",
          background: accent, color: "#000",
          fontSize: 11, fontWeight: 900, borderRadius: 10,
          padding: "2px 8px", whiteSpace:"nowrap",
          boxShadow: `0 2px 8px ${accent}88`,
        }}>
          ${amount.toLocaleString()}
        </div>
      )}
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 6 }}>{payLabel}</div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════
//  HISTORIAL (últimas rondas)
// ═══════════════════════════════════════════════════════════════
function History({ rounds }) {
  if (rounds.length === 0) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 10, color:"rgba(255,255,255,0.3)", letterSpacing:2, textTransform:"uppercase", marginBottom:6 }}>Historial</div>
      <div style={{ display:"flex", gap: 5, flexWrap:"wrap" }}>
        {rounds.slice(-30).reverse().map((r, i) => {
          const col = r === "player" ? "#3b82f6" : r === "banker" ? "#ef4444" : "#fbbf24";
          const label = r === "player" ? "J" : r === "banker" ? "B" : "E";
          return (
            <div key={i} style={{
              width: 26, height: 26, borderRadius: "50%",
              background: col + "33", border: `2px solid ${col}`,
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize: 11, fontWeight: 900, color: col,
            }}>{label}</div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════
export default function BaccaratGame({ balance, setBalance, onBack }) {
  const [deck,       setDeck]       = useState(() => buildShuffledDeck(8));
  const [deckIdx,    setDeckIdx]    = useState(0);
  const [phase,      setPhase]      = useState("betting"); // betting | dealing | reveal | result
  const [bets,       setBets]       = useState({ player: 0, banker: 0, tie: 0 });
  const [chipVal,    setChipVal]    = useState(1_000);
  const [playerCards, setPlayerCards] = useState([]);
  const [bankerCards, setBankerCards] = useState([]);
  const [revealed,   setRevealed]   = useState(false);
  const [outcome,    setOutcome]    = useState(null);   // "player"|"banker"|"tie"
  const [dragon7,    setDragon7]    = useState(false);
  const [results,    setResults]    = useState({});
  const [payout,     setPayout]     = useState(0);
  const [history,    setHistory]    = useState([]);
  const [lastBets,   setLastBets]   = useState(null);
  const [msg,        setMsg]        = useState("");

  const totalBet = bets.player + bets.banker + bets.tie;

  // Reshufflear si quedan menos de 100 cartas
  useEffect(() => {
    if (deck.length - deckIdx < 100) {
      setDeck(buildShuffledDeck(8));
      setDeckIdx(0);
    }
  }, [deckIdx]);

  function placeBet(spot) {
    if (phase !== "betting") return;
    if (balance - totalBet < chipVal) { setMsg("Saldo insuficiente"); return; }
    setMsg("");
    setBets(prev => ({ ...prev, [spot]: prev[spot] + chipVal }));
  }

  function clearBets() {
    setBets({ player: 0, banker: 0, tie: 0 });
    setMsg("");
  }

  function rebet() {
    if (!lastBets) return;
    const total = lastBets.player + lastBets.banker + lastBets.tie;
    if (total > balance) { setMsg("Saldo insuficiente para repetir apuesta"); return; }
    setBets({ ...lastBets });
    setMsg("");
  }

  async function deal() {
    if (totalBet === 0) { setMsg("Elige una apuesta primero"); return; }
    if (totalBet > balance) { setMsg("Saldo insuficiente"); return; }

    setLastBets({ ...bets });
    setBalance(prev => prev - totalBet);
    setPhase("dealing");
    setRevealed(false);
    setOutcome(null);
    setDragon7(false);
    setResults({});
    setPayout(0);
    setMsg("");

    const { playerCards: pc, bankerCards: bc, nextIdx } = playBaccarat(deck, deckIdx);
    setPlayerCards(pc);
    setBankerCards(bc);
    setDeckIdx(nextIdx);

    // Pequeño delay dramático antes de revelar
    await new Promise(r => setTimeout(r, 900 + pc.length * 180 + bc.length * 180));
    setRevealed(true);
    setPhase("reveal");

    await new Promise(r => setTimeout(r, 500));

    const ps = handScore(pc);
    const bs = handScore(bc);
    const { winnings, results: res, outcome: oc, dragon7: d7 } = calcPayout(bets, ps, bs, bc);

    setOutcome(oc);
    setDragon7(d7);
    setResults(res);
    setPayout(winnings);
    setBalance(prev => prev + winnings);
    setHistory(prev => [...prev, oc]);
    setPhase("result");

    const won = winnings > totalBet;
    const net = winnings - totalBet;
    setMsg(
      won
        ? `🏆 ¡Ganaste! +${net.toLocaleString()} fichas`
        : winnings === totalBet
        ? `🤝 Push — apuesta devuelta`
        : `Perdiste ${totalBet.toLocaleString()} fichas`
    );
  }

  function newRound() {
    setPhase("betting");
    setPlayerCards([]);
    setBankerCards([]);
    setRevealed(false);
    setOutcome(null);
    setDragon7(false);
    setResults({});
    setPayout(0);
    setBets({ player: 0, banker: 0, tie: 0 });
    setMsg("");
  }

  const ps = playerCards.length ? handScore(playerCards) : null;
  const bs = bankerCards.length ? handScore(bankerCards) : null;

  return (
    <div style={{
      maxWidth: 640,
      margin: "0 auto",
      fontFamily: "'Georgia', serif",
      color: "#fff",
      minHeight: "100vh",
    }}>
      <style>{CARD_CSS}</style>

      {/* ── Header ── */}
      <div style={{
        display:"flex", justifyContent:"space-between", alignItems:"center",
        padding: "12px 0 16px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        marginBottom: 20,
      }}>
        <button onClick={onBack} style={{
          background:"transparent", border:"1px solid rgba(255,255,255,0.15)",
          borderRadius:8, color:"#888", fontSize:13, padding:"6px 12px", cursor:"pointer",
        }}>← Lobby</button>

        <div style={{ textAlign:"center" }}>
          <div style={{
            fontSize: 22, fontWeight: 900, letterSpacing: 3,
            background: "linear-gradient(90deg, #fbbf24, #f97316, #fbbf24)",
            backgroundSize: "200% auto",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            animation: "bacShimmer 3s linear infinite",
          }}>BACCARAT</div>
          <div style={{ fontSize: 10, color:"rgba(255,255,255,0.3)", letterSpacing:2 }}>EZ · 8 MAZOS</div>
        </div>

        <div style={{
          background:"rgba(251,191,36,0.1)", border:"1px solid rgba(251,191,36,0.3)",
          borderRadius:20, padding:"6px 14px", fontSize:13, fontWeight:700, color:"#fbbf24",
        }}>
          💰 {balance.toLocaleString()}
        </div>
      </div>

      {/* ── Mesa ── */}
      <div style={{
        background: "radial-gradient(ellipse at 50% 60%, #0d3d1c 0%, #071a0d 100%)",
        border: "2px solid rgba(255,255,255,0.08)",
        borderRadius: 18,
        padding: "20px 16px",
        marginBottom: 16,
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Líneas decorativas del tapete */}
        <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(45deg, rgba(255,255,255,0.015) 0, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 20px)", pointerEvents:"none" }} />

        {/* Manos */}
        <div style={{ display:"flex", gap: 12, marginBottom: 16 }}>
          <HandArea
            label="JUGADOR"
            cards={playerCards}
            score={ps}
            revealed={revealed}
            accentColor="#3b82f6"
            isWinner={revealed && outcome === "player"}
            isDragon={false}
          />
          <HandArea
            label="BANCA"
            cards={bankerCards}
            score={bs}
            revealed={revealed}
            accentColor="#ef4444"
            isWinner={revealed && outcome === "banker"}
            isDragon={dragon7}
          />
        </div>

        {/* Mensaje de resultado */}
        {phase === "result" && (
          <div style={{
            textAlign:"center",
            fontSize: outcome === "tie" ? 18 : 22,
            fontWeight: 900,
            color: outcome === "player" ? "#3b82f6"
                 : outcome === "banker" ? "#ef4444"
                 : "#fbbf24",
            padding: "8px 0 4px",
            letterSpacing: 1,
          }}>
            {outcome === "player" && "🃏 JUGADOR GANA"}
            {outcome === "banker" && (dragon7 ? "🐉 DRAGON 7" : "🏦 BANCA GANA")}
            {outcome === "tie"    && "🤝 EMPATE"}
          </div>
        )}

        {/* Resultados por apuesta */}
        {phase === "result" && Object.keys(results).length > 0 && (
          <div style={{ display:"flex", gap: 8, justifyContent:"center", marginTop: 8, flexWrap:"wrap" }}>
            {Object.entries(results).map(([spot, res]) => {
              const isWin = res.startsWith("+");
              const isPush = res.includes("push");
              const col = isWin ? "#22c55e" : isPush ? "#fbbf24" : "#ef4444";
              const spotLabel = spot === "player" ? "Jugador" : spot === "banker" ? "Banca" : "Empate";
              return (
                <div key={spot} style={{
                  background: col + "15", border: `1px solid ${col}44`,
                  borderRadius: 8, padding: "5px 12px",
                  fontSize: 12, color: col, fontWeight: 700,
                }}>
                  {spotLabel}: {isPush ? "Push" : isWin ? `+${res.slice(1)} fichas` : `${res} fichas`}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Zonas de apuesta ── */}
      <div style={{ display:"flex", gap: 10, marginBottom: 14, paddingTop: 8 }}>
        <BetSpot
          label="Jugador"   sublabel="Player"   accent="#3b82f6"
          amount={bets.player}
          onClick={() => placeBet("player")}
          disabled={phase !== "betting"}
          isActive={bets.player > 0}
          payLabel="Paga 1:1"
        />
        <BetSpot
          label="Empate"    sublabel="Tie"       accent="#fbbf24"
          amount={bets.tie}
          onClick={() => placeBet("tie")}
          disabled={phase !== "betting"}
          isActive={bets.tie > 0}
          payLabel="Paga 8:1"
        />
        <BetSpot
          label="Banca"     sublabel="Banker"    accent="#ef4444"
          amount={bets.banker}
          onClick={() => placeBet("banker")}
          disabled={phase !== "betting"}
          isActive={bets.banker > 0}
          payLabel="Sin comisión (EZ)"
        />
      </div>

      {/* ── Fichas ── */}
      {phase === "betting" && (
        <div style={{ display:"flex", gap: 8, justifyContent:"center", marginBottom: 14, flexWrap:"wrap" }}>
          {CHIP_VALUES.map(v => (
            <button
              key={v}
              onClick={() => setChipVal(v)}
              style={{
                width: 48, height: 48, borderRadius:"50%",
                background: chipVal === v ? CHIP_COLORS[v] : CHIP_COLORS[v] + "33",
                border: `3px solid ${CHIP_COLORS[v]}`,
                color: chipVal === v ? "#000" : CHIP_COLORS[v],
                fontWeight: 900, fontSize: 10,
                cursor:"pointer",
                transform: chipVal === v ? "scale(1.15)" : "scale(1)",
                transition:"all 0.15s",
                boxShadow: chipVal === v ? `0 0 14px ${CHIP_COLORS[v]}88` : "none",
              }}
            >
              {v >= 1_000 ? `${v/1_000}k` : v}
            </button>
          ))}
        </div>
      )}

      {/* ── Mensaje ── */}
      {msg && (
        <div style={{
          textAlign:"center",
          fontSize: 14, fontWeight: 700,
          color: msg.startsWith("🏆") ? "#22c55e"
               : msg.startsWith("🤝") ? "#fbbf24"
               : "#ff6666",
          marginBottom: 12,
          padding: "8px",
          background: "rgba(0,0,0,0.3)",
          borderRadius: 8,
        }}>
          {msg}
        </div>
      )}

      {/* ── Botones de acción ── */}
      <div style={{ display:"flex", gap: 10 }}>
        {phase === "betting" && (
          <>
            <button
              onClick={clearBets}
              disabled={totalBet === 0}
              style={{
                flex: 1, padding:"13px",
                background: totalBet > 0 ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                border:"1px solid rgba(255,255,255,0.12)",
                borderRadius:10, color: totalBet > 0 ? "#fff" : "#444",
                fontSize:14, fontWeight:700, cursor: totalBet > 0 ? "pointer" : "default",
              }}
            >
              🗑 Borrar
            </button>
            <button
              onClick={rebet}
              disabled={!lastBets}
              style={{
                flex: 1, padding:"13px",
                background: lastBets ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                border:"1px solid rgba(255,255,255,0.12)",
                borderRadius:10, color: lastBets ? "#fff" : "#444",
                fontSize:14, fontWeight:700, cursor: lastBets ? "pointer" : "default",
              }}
            >
              🔁 Repetir
            </button>
            <button
              onClick={deal}
              disabled={totalBet === 0}
              style={{
                flex: 2, padding:"13px",
                background: totalBet > 0
                  ? "linear-gradient(135deg, #fbbf24, #f97316)"
                  : "rgba(255,255,255,0.05)",
                border:"none",
                borderRadius:10, color: totalBet > 0 ? "#000" : "#444",
                fontSize:15, fontWeight:900, cursor: totalBet > 0 ? "pointer" : "default",
                boxShadow: totalBet > 0 ? "0 4px 20px rgba(251,191,36,0.35)" : "none",
                transition:"all 0.2s",
              }}
            >
              {totalBet > 0 ? `🃏 Repartir ($${totalBet.toLocaleString()})` : "Elige una apuesta"}
            </button>
          </>
        )}

        {phase === "dealing" && (
          <div style={{ flex:1, textAlign:"center", color:"rgba(255,255,255,0.5)", fontSize:14, padding:"13px" }}>
            🎴 Repartiendo...
          </div>
        )}

        {(phase === "reveal" || phase === "result") && (
          <button
            onClick={newRound}
            style={{
              flex: 1, padding:"13px",
              background:"linear-gradient(135deg, #fbbf24, #f97316)",
              border:"none", borderRadius:10,
              color:"#000", fontSize:15, fontWeight:900, cursor:"pointer",
              boxShadow:"0 4px 20px rgba(251,191,36,0.3)",
            }}
          >
            Nueva ronda →
          </button>
        )}
      </div>

      {/* ── Nota EZ ── */}
      <div style={{ marginTop: 14, padding:"10px 14px", background:"rgba(0,0,0,0.25)", borderRadius:10, fontSize:11, color:"rgba(255,255,255,0.25)", lineHeight:1.6 }}>
        <strong style={{color:"rgba(255,255,255,0.4)"}}>EZ Baccarat:</strong> Sin comisión en apuestas a Banca.
        Si Banca gana con 7 puntos y 3 cartas (<span style={{color:"#fbbf24"}}>Dragon 7 🐉</span>), la apuesta a Banca es Push.
        Empate paga <strong style={{color:"rgba(255,255,255,0.4)"}}>8:1</strong>.
      </div>

      {/* ── Historial ── */}
      <History rounds={history} />
    </div>
  );
}