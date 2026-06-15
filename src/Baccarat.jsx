import { useState, useEffect } from "react";
import { supabase } from "./supabase";

// ═══════════════════════════════════════════════════════════════
//  LÓGICA PURA DEL JUEGO
// ═══════════════════════════════════════════════════════════════
const SUITS = ["♠","♥","♦","♣"];
const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const sleep  = ms => new Promise(r => setTimeout(r, ms));

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

// Aplica el Tableau y devuelve las manos completas + siguiente índice
function playBaccarat(deck, startIdx) {
  let idx = startIdx;
  const draw = () => deck[idx++];

  const playerCards = [draw(), draw()];
  const bankerCards = [draw(), draw()];
  const ps = handScore(playerCards);
  const bs = handScore(bankerCards);

  if (ps >= 8 || bs >= 8)
    return { playerCards, bankerCards, nextIdx: idx };

  let playerThird = null;
  if (ps <= 5) { playerThird = draw(); playerCards.push(playerThird); }

  const bs2 = handScore(bankerCards);
  if (playerThird === null) {
    if (bs2 <= 5) bankerCards.push(draw());
  } else {
    const ptv = cardValue(playerThird);
    let bankerDraws = false;
    if      (bs2 <= 2) bankerDraws = true;
    else if (bs2 === 3) bankerDraws = (ptv !== 8);
    else if (bs2 === 4) bankerDraws = [2,3,4,5,6,7].includes(ptv);
    else if (bs2 === 5) bankerDraws = [4,5,6,7].includes(ptv);
    else if (bs2 === 6) bankerDraws = [6,7].includes(ptv);
    if (bankerDraws) bankerCards.push(draw());
  }
  return { playerCards, bankerCards, nextIdx: idx };
}

// Dragon 7: banca gana con 7 puntos en exactamente 3 cartas
function checkDragon7(bankerCards, playerScore, bankerScore) {
  return bankerCards.length === 3 && bankerScore === 7 && bankerScore > playerScore;
}

// Panda 8: jugador gana con 8 puntos en exactamente 3 cartas
function checkPanda8(playerCards, playerScore, bankerScore) {
  return playerCards.length === 3 && playerScore === 8 && playerScore > bankerScore;
}

function calcPayout(bets, playerCards, bankerCards) {
  const ps = handScore(playerCards);
  const bs = handScore(bankerCards);
  const d7 = checkDragon7(bankerCards, ps, bs);
  const p8 = checkPanda8(playerCards, ps, bs);

  let outcome;
  if      (ps > bs) outcome = "player";
  else if (bs > ps) outcome = "banker";
  else              outcome = "tie";

  let winnings = 0;
  const results = {};

  // JUGADOR
  if (bets.player > 0) {
    if      (outcome === "player") { winnings += bets.player * 2; results.player = `+${bets.player}`; }
    else if (outcome === "tie")    { winnings += bets.player;     results.player = "push"; }
    else                           {                               results.player = `-${bets.player}`; }
  }

  // BANCA (EZ: sin comisión, Dragon 7 = push)
  if (bets.banker > 0) {
    if (outcome === "banker") {
      if (d7) { winnings += bets.banker; results.banker = "push (Dragon 7)"; }
      else    { winnings += bets.banker * 2; results.banker = `+${bets.banker}`; }
    } else if (outcome === "tie") {
      winnings += bets.banker; results.banker = "push";
    } else {
      results.banker = `-${bets.banker}`;
    }
  }

  // EMPATE (8:1)
  if (bets.tie > 0) {
    if (outcome === "tie") { winnings += bets.tie * 9; results.tie = `+${bets.tie * 8}`; }
    else                   { results.tie = `-${bets.tie}`; }
  }

  // PANDA 8 (25:1 — side bet)
  if (bets.panda > 0) {
    if (p8) { winnings += bets.panda * 26; results.panda = `+${bets.panda * 25}`; }
    else    { results.panda = `-${bets.panda}`; }
  }

  return { winnings, results, outcome, dragon7: d7, panda8: p8 };
}

// ═══════════════════════════════════════════════════════════════
//  CSS DE ANIMACIONES
// ═══════════════════════════════════════════════════════════════
const CARD_CSS = `
  @keyframes bacDeal {
    0%   { transform: translateY(-70px) scale(0.65) rotate(-10deg); opacity: 0; }
    65%  { transform: translateY(5px) scale(1.05) rotate(1.5deg); opacity: 1; }
    82%  { transform: translateY(-2px) scale(1.01) rotate(-0.5deg); }
    100% { transform: translateY(0) scale(1) rotate(0deg); opacity: 1; }
  }
  @keyframes bacFlip {
    0%   { transform: rotateY(90deg) scale(0.85); opacity: 0.2; }
    100% { transform: rotateY(0deg)  scale(1);    opacity: 1; }
  }
  @keyframes bacGlowGold {
    0%,100% { box-shadow: 0 0 6px rgba(251,191,36,0.4); }
    50%      { box-shadow: 0 0 20px rgba(251,191,36,0.9); }
  }
  @keyframes bacGlowBlue {
    0%,100% { box-shadow: 0 0 6px rgba(59,130,246,0.4); }
    50%      { box-shadow: 0 0 20px rgba(59,130,246,0.9); }
  }
  @keyframes bacGlowRed {
    0%,100% { box-shadow: 0 0 6px rgba(239,68,68,0.4); }
    50%      { box-shadow: 0 0 20px rgba(239,68,68,0.9); }
  }
  @keyframes bacShimmer {
    0%   { background-position: -200% center; }
    100% { background-position:  200% center; }
  }
  @keyframes bacPulse {
    0%,100% { transform: scale(1); }
    50%     { transform: scale(1.03); }
  }
`;

// ═══════════════════════════════════════════════════════════════
//  COMPONENTE CARTA
// ═══════════════════════════════════════════════════════════════
function BacCard({ card }) {
  const isRed = card && ["♥","♦"].includes(card.s);
  return (
    <div style={{
      width: 120, height: 157,
      borderRadius: 8,
      border: "1px solid rgba(255,255,255,0.2)",
      boxShadow: "0 4px 14px rgba(0,0,0,0.65)",
      flexShrink: 0,
      overflow: "hidden",
      // Cada carta que aparece en el DOM activa bacDeal inmediatamente (delay 0)
      animation: "bacDeal 0.42s cubic-bezier(.22,.61,.36,1) both",
    }}>
      <div style={{
        width:"100%", height:"100%",
        background: "#f7f7ed",
        display:"flex", flexDirection:"column",
        padding:"4px 5px", boxSizing:"border-box",
        animation: "bacFlip 0.32s ease 60ms both",
      }}>
        <div style={{ fontSize:25, fontWeight:700, color:isRed?"#c0392b":"#1a1a1a", lineHeight:1 }}>{card.r}</div>
        <div style={{ fontSize:25, color:isRed?"#c0392b":"#1a1a1a", lineHeight:1 }}>{card.s}</div>
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", fontSize:35, color:isRed?"#c0392b":"#1a1a1a" }}>{card.s}</div>
        <div style={{ fontSize:25, fontWeight:700, color:isRed?"#c0392b":"#1a1a1a", lineHeight:1, alignSelf:"flex-end", transform:"rotate(180deg)" }}>{card.r}</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  COMPONENTE MANO
// ═══════════════════════════════════════════════════════════════
function HandArea({ label, cards, score, showScore, accentColor, isWinner, glowAnim, dragon7, panda8 }) {
  return (
    <div style={{
      flex:1,
      background: isWinner
        ? `linear-gradient(155deg, ${accentColor}28, rgba(0,0,0,0.35))`
        : "rgba(0,0,0,0.22)",
      border: `2px solid ${isWinner ? accentColor : "rgba(255,255,255,0.07)"}`,
      borderRadius:14, padding:"14px 12px",
      transition:"border 0.4s, background 0.4s, box-shadow 0.4s",
      boxShadow: isWinner ? `0 0 32px ${accentColor}55` : "none",
      animation: isWinner ? `${glowAnim} 1.8s ease-in-out infinite` : "none",
      minWidth:0,
    }}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <div>
          <div style={{ fontSize:20, fontWeight:700, color:accentColor, letterSpacing:2, textTransform:"uppercase" }}>
            {label}
          </div>
          {dragon7 && <div style={{ fontSize:15, color:"#fbbf24", marginTop:1 }}>🐉 Dragon 7</div>}
          {panda8  && <div style={{ fontSize:15, color:"#22c55e", marginTop:1 }}>🐼 Panda 8</div>}
        </div>
{/*{showScore && (*/}

        {cards.length && (
          <div style={{
            fontSize:24, fontWeight:900, color:"#fff",
            background: isWinner ? accentColor : "rgba(255,255,255,0.12)",
            borderRadius:8, padding:"2px 12px",
            minWidth:36, textAlign:"center",
            transition:"background 0.3s",
          }}>
            {score}
          </div>
        )}
      </div>

      {/* Cartas */}
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", minHeight:157 }}>
        {cards.map((c, i) => (
          <BacCard key={i} card={c} />
        ))}
        {cards.length === 0 && (
          <div style={{ width:120, height:157, border:"2px dashed rgba(255,255,255,0.07)", borderRadius:8 }} />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  FICHAS Y ZONAS DE APUESTA
// ═══════════════════════════════════════════════════════════════
const CHIP_VALUES = [1_000, 5_000, 10_000, 50_000, 100_000, 500_000];
const CHIP_COLORS = {
  1_000:   "#9ca3af",
  5_000:   "#3b82f6",
  10_000:  "#ef4444",
  50_000:  "#22c55e",
  100_000: "#a855f7",
  500_000: "#fbbf24",
};

function BetSpot({ label, sublabel, accent, amount, onClick, disabled, isActive, payLabel, small }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      flex:1,
      padding: small ? "10px 8px 8px" : "14px 10px 12px",
      border:`2px solid ${isActive ? accent : "rgba(255,255,255,0.09)"}`,
      borderRadius:12,
      background: isActive
        ? `linear-gradient(155deg, ${accent}22, rgba(0,0,0,0.4))`
        : "rgba(0,0,0,0.28)",
      cursor: disabled ? "default" : "pointer",
      textAlign:"center",
      transition:"all 0.2s",
      boxShadow: isActive ? `0 0 16px ${accent}44` : "none",
      position:"relative", minWidth:0,
    }}>
      <div style={{ fontSize: small ? 15 : 17, color:accent, fontWeight:800, letterSpacing:1.5, textTransform:"uppercase" }}>{label}</div>
      {sublabel && <div style={{ fontSize:12, color:"rgba(208, 208, 208, 0.78)", marginTop:2 }}>{sublabel}</div>}
      {amount > 0 && (
        <div style={{
          position:"absolute", top:-10, left:"50%", transform:"translateX(-50%)",
          background:accent, color:"#000",
          fontSize:10, fontWeight:900, borderRadius:10,
          padding:"2px 7px", whiteSpace:"nowrap",
          boxShadow:`0 2px 8px ${accent}88`,
        }}>
          ${amount.toLocaleString()}
        </div>
      )}
      <div style={{ fontSize:12, color:"rgba(208, 208, 208, 0.78)", marginTop: small ? 4 : 6 }}>{payLabel}</div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════
//  HISTORIAL
// ═══════════════════════════════════════════════════════════════
function History({ rounds }) {
  if (!rounds.length) return null;
  return (
    <div style={{ marginTop:16 }}>
      <div style={{ fontSize:12, color:"rgba(194, 194, 194, 0.8)", letterSpacing:2, textTransform:"uppercase", marginBottom:6 }}>Historial</div>
      <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
        {rounds.slice(-35).reverse().map((r, i) => {
          const col   = r==="player"?"#3b82f6": r==="banker"?"#ef4444":"#fbbf24";
          const label = r==="player"?"J": r==="banker"?"B":"E";
          return (
            <div key={i} style={{
              width:30, height:30, borderRadius:"50%",
              background:col+"2a", border:`2px solid ${col}`,
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:15, fontWeight:900, color:col,
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
  const [deck,     setDeck]     = useState(() => buildShuffledDeck(8));
  const [deckIdx,  setDeckIdx]  = useState(0);
  const [phase,    setPhase]    = useState("betting"); // "betting" | "dealing" | "result"
  // ── Apuestas: incluye panda (side bet) ─────────────────────────────
  const [bets,     setBets]     = useState({ player:0, banker:0, tie:0, panda:0 });
  const [chipVal,  setChipVal]  = useState(1_000);
  const [lastBets, setLastBets] = useState(null);
  // ── Estado "espejo": cartas mostradas en pantalla ───────────────────
  const [dispPlayer, setDispPlayer] = useState([]); // displayed player cards
  const [dispBanker, setDispBanker] = useState([]); // displayed banker cards
  // ── Resultado ───────────────────────────────────────────────────────
  const [showScore, setShowScore] = useState(false);
  const [outcome,   setOutcome]   = useState(null);
  const [dragon7,   setDragon7]   = useState(false);
  const [panda8,    setPanda8]    = useState(false);
  const [results,   setResults]   = useState({});
  const [history,   setHistory]   = useState([]);
  const [msg,       setMsg]       = useState("");

  const totalBet = bets.player + bets.banker + bets.tie + bets.panda;
  const ps = dispPlayer.length ? handScore(dispPlayer) : null;
  const bs = dispBanker.length ? handScore(dispBanker) : null;

  // Reshufflear cuando quedan pocas cartas
  useEffect(() => {
    if (deck.length - deckIdx < 100) { setDeck(buildShuffledDeck(8)); setDeckIdx(0); }
  }, [deckIdx]);

  // ── Modificación 2: exclusión mutua jugador↔banca ────────────────────
  function placeBet(spot) {
    if (phase !== "betting") return;
    setMsg("");

    const nb = { ...bets };
    if (spot === "player") {
      nb.player += chipVal;
      nb.banker  = 0;         // ← limpia banca
    } else if (spot === "banker") {
      nb.banker += chipVal;
      nb.player  = 0;         // ← limpia jugador
    } else {
      nb[spot] = (nb[spot] || 0) + chipVal;
    }

    const newTotal = nb.player + nb.banker + nb.tie + nb.panda;
    if (newTotal > balance) { setMsg("Saldo insuficiente"); return; }
    setBets(nb);
  }

  function clearBets() { setBets({ player:0, banker:0, tie:0, panda:0 }); setMsg(""); }

  function rebet() {
    if (!lastBets) return;
    const tot = lastBets.player + lastBets.banker + lastBets.tie + lastBets.panda;
    if (tot > balance) { setMsg("Saldo insuficiente para repetir apuesta"); return; }
    setBets({ ...lastBets }); setMsg("");
  }

  // ── Modificación 3: animación de repartición secuencial ─────────────
  async function deal() {
    if (totalBet === 0) { setMsg("Elige una apuesta primero"); return; }
    if (totalBet > balance) { setMsg("Saldo insuficiente"); return; }

    // Capturar apuestas actuales antes de resetear
    const currentBets = { ...bets };
    setLastBets(currentBets);

    // Descontar apuesta
    setBalance(prev => prev - totalBet);

    // Resetear pantalla
    setPhase("dealing");
    setDispPlayer([]);
    setDispBanker([]);
    //setShowScore(false);
    setOutcome(null);
    setDragon7(false);
    setPanda8(false);
    setResults({});
    setMsg("");

    // Calcular la ronda completa (toda la lógica ocurre aquí, invisible)
    const { playerCards: pc, bankerCards: bc, nextIdx } = playBaccarat(deck, deckIdx);
    setDeckIdx(nextIdx);

    // ── LÍNEA DE TIEMPO DE LA ANIMACIÓN ─────────────────────────────
    // 1. Carta 1 → Jugador
    setDispPlayer([pc[0]]);
    await sleep(420);

    // 2. Carta 1 → Banca
    setDispBanker([bc[0]]);
    await sleep(420);

    // 3. Carta 2 → Jugador
    setDispPlayer([pc[0], pc[1]]);
    await sleep(420);

    // 4. Carta 2 → Banca
    setDispBanker([bc[0], bc[1]]);

    // 5. Pausa global (el suspense)
    await sleep(1050);

    // 6. Tercera carta del Jugador (si aplica)
    if (pc.length === 3) {
      setDispPlayer([...pc]);
      await sleep(520);
    }

    // 7. Tercera carta de la Banca (si aplica)
    if (bc.length === 3) {
      setDispBanker([...bc]);
      await sleep(520);
    }

    // ── Revelar puntuaciones ─────────────────────────────────────────
    //setShowScore(true);
    //await sleep(350);

    // ── Calcular resultado y pagar ───────────────────────────────────
    const { winnings, results: res, outcome: oc, dragon7: d7, panda8: p8 } =
      calcPayout(currentBets, pc, bc);

    setOutcome(oc);
    setDragon7(d7);
    setPanda8(p8);
    setResults(res);
    setBalance(prev => prev + winnings);
    setHistory(prev => [...prev, oc]);
    setPhase("result");

    const net = winnings - totalBet;
    setMsg(
      winnings > totalBet ? `🏆 ¡Ganaste! +${net.toLocaleString()} fichas`
      : winnings === totalBet ? `🤝 Push — apuesta devuelta`
      : `Perdiste ${totalBet.toLocaleString()} fichas`
    );
  }

  function newRound() {
    setPhase("betting");
    setDispPlayer([]); setDispBanker([]);
    setShowScore(false); setOutcome(null);
    setDragon7(false); setPanda8(false);
    setResults({});
    setBets({ player:0, banker:0, tie:0, panda:0 });
    setMsg("");
  }

  // ── Ayuda para mostrar resultado de cada apuesta ─────────────────────
  const SPOT_LABELS = { player:"Jugador", banker:"Banca", tie:"Empate", panda:"Panda 8" };
  function resultColor(res) {
    if (res.startsWith("+")) return "#22c55e";
    if (res.includes("push")) return "#fbbf24";
    return "#ef4444";
  }
  function resultText(res) {
    if (res.includes("push")) return "Push";
    if (res.startsWith("+")) return `+${res.slice(1)}`;
    return res;
  }

  return (
    <div style={{ maxWidth:900, margin:"0 auto", fontFamily:"'Georgia', serif", color:"#fff" }}>  {/*maxWidth:640 */}
      <style>{CARD_CSS}</style>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 0 16px", borderBottom:"1px solid rgba(255,255,255,0.07)", marginBottom:20 }}>
        <button onClick={onBack} style={{ background:"transparent", border:"1px solid rgba(255,255,255,0.14)", borderRadius:8, color:"#777", fontSize:13, padding:"6px 12px", cursor:"pointer" }}>← Lobby</button>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:22, fontWeight:900, letterSpacing:3, background:"linear-gradient(90deg,#fbbf24,#f97316,#fbbf24)", backgroundSize:"200% auto", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", animation:"bacShimmer 3s linear infinite" }}>BACCARAT</div>
          <div style={{ fontSize:11, color:"rgb(190, 190, 190)", letterSpacing:2 }}>EZ · 8 MAZOS · PUNTO BANCO</div>
        </div>
        <div style={{ background:"rgba(251,191,36,0.1)", border:"1px solid rgba(251,191,36,0.3)", borderRadius:20, padding:"6px 14px", fontSize:16, fontWeight:700, color:"#fbbf24" }}>
          💰 {balance.toLocaleString()}
        </div>
      </div>

      {/* ── Mesa ───────────────────────────────────────────────────── */}
      <div style={{ background:"radial-gradient(ellipse at 50% 55%, #0b3a1a 0%, #061308 100%)", border:"2px solid rgba(255,255,255,0.07)", borderRadius:18, padding:"20px 28px", marginBottom:16, position:"relative", overflow:"hidden" }}>  {/*padding:"20px 14px" */}
        {/* Patrón de tapete */}
        <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(45deg, rgba(255,255,255,0.012) 0, rgba(255,255,255,0.012) 1px, transparent 1px, transparent 18px)", pointerEvents:"none" }} />

        {/* Manos */}
        <div style={{ display:"flex", gap:12, marginBottom:16 }}>
          <HandArea
            label="JUGADOR" cards={dispPlayer}
            score={ps} showScore={showScore}
            accentColor="#3b82f6"
            isWinner={showScore && outcome === "player"}
            glowAnim="bacGlowBlue"
            dragon7={false} panda8={panda8 && outcome === "player"}
          />
          <HandArea
            label="BANCA" cards={dispBanker}
            score={bs} showScore={showScore}
            accentColor="#ef4444"
            isWinner={showScore && outcome === "banker"}
            glowAnim="bacGlowRed"
            dragon7={dragon7} panda8={false}
          />
        </div>

        {/* Título del resultado */}
        {phase === "result" && (
          <div style={{ textAlign:"center", fontSize:25, fontWeight:900, letterSpacing:2, padding:"6px 0 2px",
            color: outcome==="player"?"#3b82f6": outcome==="banker"?"#ef4444":"#fbbf24",
            animation:"bacPulse 1.2s ease-in-out 2",
          }}>
            {outcome==="player" && (panda8 ? "🐼 PANDA 8 — JUGADOR GANA" : "🃏 JUGADOR GANA")}
            {outcome==="banker" && (dragon7 ? "🐉 DRAGON 7 — BANCA GANA"  : "🏦 BANCA GANA")}
            {outcome==="tie"    && "🤝 EMPATE"}
          </div>
        )}

        {/* Desglose por apuesta */}
        {phase === "result" && Object.keys(results).length > 0 && (
          <div style={{ display:"flex", gap:6, justifyContent:"center", marginTop:8, flexWrap:"wrap" }}>
            {Object.entries(results).map(([spot, res]) => (
              <div key={spot} style={{
                background: resultColor(res)+"18",
                border:`1px solid ${resultColor(res)}44`,
                borderRadius:8, padding:"4px 10px",
                fontSize:15, color:resultColor(res), fontWeight:700,
              }}>
                {SPOT_LABELS[spot]}: {resultText(res)} fichas
              </div>
            ))}
          </div>
        )}

        {/* Indicador "repartiendo" */}
        {phase === "dealing" && !showScore && (
          <div style={{ textAlign:"center", fontSize:15, color:"rgb(161, 161, 161)", marginTop:4, letterSpacing:1 }}>
            ● ● ●
          </div>
        )}
      </div>

      {/* ── Zonas de apuesta principales ───────────────────────────── */}
      <div style={{ display:"flex", gap:10, marginBottom:10, paddingTop:6 }}>
        <BetSpot label="Jugador" sublabel="Player" accent="#3b82f6"
          amount={bets.player} onClick={()=>placeBet("player")}
          disabled={phase!=="betting"} isActive={bets.player>0} payLabel="1:1" />
        <BetSpot label="Empate"  sublabel="Tie"    accent="#fbbf24"
          amount={bets.tie}    onClick={()=>placeBet("tie")}
          disabled={phase!=="betting"} isActive={bets.tie>0}    payLabel="8:1" />
        <BetSpot label="Banca"   sublabel="Banker" accent="#ef4444"
          amount={bets.banker} onClick={()=>placeBet("banker")}
          disabled={phase!=="betting"} isActive={bets.banker>0} payLabel="1:1 · EZ" />
      </div>

      {/* ── PANDA 8: side bet ───────────────────────────────────────── */}
      <div style={{ display:"flex", gap:10, marginBottom:14 }}>
        <BetSpot label="🐼 Panda 8" sublabel="Side bet — Jugador gana con 8 en 3 cartas"
          accent="#22c55e"
          amount={bets.panda} onClick={()=>placeBet("panda")}
          disabled={phase!=="betting"} isActive={bets.panda>0}
          payLabel="25:1" small />
      </div>

      {/* ── Fichas ─────────────────────────────────────────────────── */}
      {phase === "betting" && (
        <div style={{ display:"flex", gap:8, justifyContent:"center", marginBottom:14, flexWrap:"wrap" }}>
          {CHIP_VALUES.map(v => (
            <button key={v} onClick={()=>setChipVal(v)} style={{
              width:55, height:55, borderRadius:"50%",
              background: chipVal===v ? CHIP_COLORS[v] : CHIP_COLORS[v]+"2a",
              border:`3px solid ${CHIP_COLORS[v]}`,
              color: chipVal===v ? "#000" : CHIP_COLORS[v],
              fontWeight:900, fontSize:15, cursor:"pointer",
              transform: chipVal===v ? "scale(1.16)" : "scale(1)",
              transition:"all 0.14s",
              boxShadow: chipVal===v ? `0 0 14px ${CHIP_COLORS[v]}88` : "none",
            }}>
              {v>=1_000_000?`${v/1_000_000}M`: v>=1_000?`${v/1_000}k`:v}
            </button>
          ))}
        </div>
      )}

      {/* ── Mensaje ─────────────────────────────────────────────────── */}
      {msg && (
        <div style={{
          textAlign:"center", fontSize:20, fontWeight:700,
          color: msg.startsWith("🏆")?"#22c55e": msg.startsWith("🤝")?"#fbbf24":"#ff6666",
          marginBottom:12, padding:"8px 12px",
          background:"rgba(0,0,0,0.32)", borderRadius:8,
        }}>
          {msg}
        </div>
      )}

      {/* ── Botones de acción ───────────────────────────────────────── */}
      <div style={{ display:"flex", gap:10 }}>
        {phase === "betting" && (<>
          <button onClick={clearBets} disabled={totalBet===0} style={{
            flex:1, padding:"13px",
            background: totalBet>0?"rgba(255,255,255,0.08)":"rgba(255,255,255,0.03)",
            border:"1px solid rgba(255,255,255,0.11)", borderRadius:10,
            color: totalBet>0?"#fff":"#444", fontSize:20, fontWeight:700,
            cursor: totalBet>0?"pointer":"default",
          }}>🗑 Borrar</button>
          <button onClick={rebet} disabled={!lastBets} style={{
            flex:1, padding:"13px",
            background: lastBets?"rgba(255,255,255,0.08)":"rgba(255,255,255,0.03)",
            border:"1px solid rgba(255,255,255,0.11)", borderRadius:10,
            color: lastBets?"#fff":"#444", fontSize:20, fontWeight:700,
            cursor: lastBets?"pointer":"default",
          }}>🔁 Repetir</button>
          <button onClick={deal} disabled={totalBet===0} style={{
            flex:2, padding:"13px",
            background: totalBet>0?"linear-gradient(135deg,#fbbf24,#f97316)":"rgba(255,255,255,0.05)",
            border:"none", borderRadius:10,
            color: totalBet>0?"#000":"#444", fontSize:20, fontWeight:900,
            cursor: totalBet>0?"pointer":"default",
            boxShadow: totalBet>0?"0 4px 20px rgba(251,191,36,0.32)":"none",
            transition:"all 0.2s",
          }}>
            {totalBet>0?`🃏 Repartir ($${totalBet.toLocaleString()})`:"Elige una apuesta"}
          </button>
        </>)}

        {phase === "dealing" && (
          <div style={{ flex:1, textAlign:"center", color:"rgba(255,255,255,0.4)", fontSize:20, padding:"13px", letterSpacing:1 }}>
            Repartiendo...
          </div>
        )}

        {phase === "result" && (
          <button onClick={newRound} style={{
            flex:1, padding:"13px",
            background:"linear-gradient(135deg,#fbbf24,#f97316)",
            border:"none", borderRadius:10,
            color:"#000", fontSize:20, fontWeight:900, cursor:"pointer",
            boxShadow:"0 4px 20px rgba(251,191,36,0.28)",
          }}>
            Nueva ronda →
          </button>
        )}
      </div>

      {/* ── Nota de reglas ──────────────────────────────────────────── */}
      <div style={{ marginTop:14, padding:"10px 14px", background:"rgba(0,0,0,0.22)", borderRadius:10, fontSize:14, color:"rgb(172, 172, 172)", lineHeight:1.7 }}>
        <strong style={{color:"rgba(255,255,255,0.38)"}}>EZ Baccarat:</strong>{" "}
        Sin comisión en Banca. Si Banca gana con 7 en 3 cartas → <span style={{color:"#fbbf24"}}>Dragon 7 🐉</span> (apuesta Banca = Push).
        {" "}<strong style={{color:"rgba(255,255,255,0.38)"}}>Panda 8 🐼:</strong>{" "}
        Jugador gana con 8 puntos en exactamente 3 cartas → paga <span style={{color:"#22c55e"}}>25:1</span>.
        {" "}No se puede apostar a Jugador y Banca al mismo tiempo.
      </div>

      {/* ── Historial ───────────────────────────────────────────────── */}
      <History rounds={history} />
    </div>
  );
}