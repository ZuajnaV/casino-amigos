// Spaceman.jsx
import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

// ─── Constantes (igual que VBA) ──────────────────────────────────────────────
const SP_TICK   = 100;      //150 ms por tick (VBA: 0.2s = 200ms, reducido para fluidez)
const SP_STEP   = 0.02;    // 0.006 incremento multiplicador por tick
const SKY_H     = 425;      //260 altura del área de vuelo en px
const ROCKET_H  = 200;       // 80 alto de la imagen del cohete en px

// ─── Calcular crash point (SpCalcCrash en VBA) ───────────────────────────────
// Fórmula: 970000 / (1000000 - X), con 3% de crash instantáneo en x1.00
function calcCrash() {
  const x = Math.floor(Math.random() * 1000000) + 1;
  if (x <= 30000) return 1.00;                        // ~3% crash en x1
  const res = 970000 / (1000000 - x);
  return Math.max(1.00, Math.round(res * 100) / 100);
}

// ─── Color del multiplicador según nivel ─────────────────────────────────────
function multColor(m) {
  if (m < 2)  return "#ffffff";
  if (m < 5)  return "#5aff73";
  if (m < 10) return "#ffd700";
  if (m < 25) return "#ff8c00";
  return "#ff3737";
}

// ─── Posición vertical del cohete (0 = fondo, 1 = techo) ────────────────────
function rocketTop(mult) {
  // Mismo cálculo VBA: desplazamiento = (mult - 1) * 80, limitado por la altura
  const maxDisp = SKY_H - ROCKET_H - 10;
  const disp = Math.min((mult - 1) * 80, maxDisp);
  return SKY_H - ROCKET_H - disp;
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function SpacemanGame({ balance, setBalance, onBack }) {
  // Estado del juego
  const [phase, setPhase]       = useState("idle");   // idle | flying | crashed | cashout
  const [mult, setMult]         = useState(1.00);
  const [crashAt, setCrashAt]   = useState(null);
  const [bet, setBet]           = useState(100);
  const [autoAt, setAutoAt]     = useState(0);        // 0 = desactivado
  const [halfDone, setHalfDone] = useState(false);
  const [halfAmt, setHalfAmt]   = useState(0);
  const [activeBet, setActiveBet] = useState(0);      // apuesta viva (mitad tras parcial)
  const [potWin, setPotWin]     = useState(0);
  const [msg, setMsg]           = useState("");
  const [history, setHistory]   = useState([]);       // [{mult, win}]
  const [chartData, setChartData] = useState([1]);





  const [netoTotal, setNetoTotal] = useState(0);




  // Refs para acceso en el intervalo sin closures viejas
  const gameRef = useRef({
    phase: "idle", mult: 1, crashAt: 0,
    activeBet: 0, autoAt: 0, halfDone: false, halfAmt: 0,
  });
  const intervalRef = useRef(null);
  const rocketRef   = useRef(null);  

  // ── Sincronizar ref con estado ──────────────────────────────────────────────
  function syncRef(patch) {
    Object.assign(gameRef.current, patch);
  }

  // ── LIMPIAR intervalo al desmontar ──────────────────────────────────────────
  useEffect(() => () => clearInterval(intervalRef.current), []);

  // ── NUEVA RONDA (SpNewRound) ────────────────────────────────────────────────
  function newRound() {
    if (bet <= 0)        { setMsg("La apuesta debe ser mayor a 0"); return; }
    if (bet > balance)   { setMsg("Saldo insuficiente");            return; }

    clearInterval(intervalRef.current);

    const crash = calcCrash();
    setBalance((b) => b - bet);
    setCrashAt(crash);
    setMult(1.00);
    setHalfDone(false);
    setHalfAmt(0);
    setActiveBet(bet);
    setPotWin(bet);
    setChartData([1]);
    setPhase("flying");
    setMsg(`Despegando · Apuesta: $${bet} · Auto CO: ${autoAt > 0 ? "x" + autoAt : "OFF"}`);

    syncRef({ phase: "flying", mult: 1, crashAt: crash,
              activeBet: bet, autoAt, halfDone: false, halfAmt: 0 });

    // ── TICK (SpTick) ──────────────────────────────────────────────────────
    intervalRef.current = setInterval(() => {
      const g = gameRef.current;
      if (g.phase !== "flying") { clearInterval(intervalRef.current); return; }

      const newMult = parseFloat((g.mult + SP_STEP).toFixed(3));
      g.mult = newMult;

      // ── CRASH ─────────────────────────────────────────────────────────
      if (newMult >= g.crashAt) {
        g.phase = "crashed";
        clearInterval(intervalRef.current);
        setMult(g.crashAt);
        setPhase("crashed");
        setPotWin(0);

        // Si hubo parcial, el halfAmt ya fue acreditado; solo registramos pérdida del resto
        const origBet = g.halfDone ? g.activeBet * 2 : g.activeBet;
        const net     = g.halfAmt - origBet;
        setHistory((h) => [{ m: g.crashAt, net, crash: true }, ...h.slice(0, 11)]);





        setNetoTotal(n => n + net);
        supabase.auth.getSession().then(async ({ data: { session } }) => {
          if (!session) return;
          await supabase.from("spaceman_history").insert({
            user_id: session.user.id,
            crash: true,
            multiplier: g.crashAt,
            net: net,
          });
        });








        setMsg(`💥 CRASH en x${g.crashAt.toFixed(2)} · Perdiste $${g.activeBet.toFixed(2)}${g.halfDone ? ` (parcial salvado: $${g.halfAmt.toFixed(2)})` : ""}`);
        return;
      }

      // ── AUTO CASH-OUT ──────────────────────────────────────────────────
      if (g.autoAt > 0 && newMult >= g.autoAt) {
        g.phase = "cashout";
        clearInterval(intervalRef.current);
        doCashOut(newMult, true);
        return;
      }

      // ── Actualizar display ────────────────────────────────────────────
      setMult(newMult);

      // Vibración directa al DOM 
      const maxDisp = SKY_H - ROCKET_H - 10;
      const enTecho = (newMult - 1) * 80 >= maxDisp;

      if (newMult >= 3 || enTecho) {
        const vx = (Math.random() * 4) - 5;   // entre -5 y +5 px
        if (rocketRef.current) {
          rocketRef.current.style.transform = `translateX(calc(-50% + ${vx}px))`;
        }
      } else {
        if (rocketRef.current) {
          rocketRef.current.style.transform = `translateX(-50%)`;
        }
      }

      setPotWin(parseFloat((g.activeBet * newMult).toFixed(2)));
      setChartData((d) => [...d.slice(-79), newMult]);   // máx 80 puntos

    }, SP_TICK);
  }

  // ── COBRAR (SpCashOut + SpDoCashOutCore) ────────────────────────────────────
  const doCashOut = useCallback((currentMult, isAuto = false) => {
    const g = gameRef.current;
    clearInterval(intervalRef.current);
    g.phase = "cashout";

    const winAmt  = parseFloat((g.activeBet * currentMult).toFixed(2));
    const origBet = g.halfDone ? g.activeBet * 2 : g.activeBet;
    const net     = (winAmt + g.halfAmt) - origBet;

    setBalance((b) => b + winAmt);
    setPhase("cashout");
    setMult(currentMult);
    setPotWin(winAmt);
    setHistory((h) => [{ m: currentMult, net, crash: false }, ...h.slice(0, 11)]);




    setNetoTotal(n => n + net);
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      await supabase.from("spaceman_history").insert({
        user_id: session.user.id,
        crash: false,
        multiplier: currentMult,
        net: net,
      });
    });










    setMsg(
      isAuto
        ? `🤖 AUTO CO en x${currentMult.toFixed(2)} · Total: $${(winAmt + g.halfAmt).toFixed(2)}`
        : `💰 COBRADO en x${currentMult.toFixed(2)} · Total: $${(winAmt + g.halfAmt).toFixed(2)}`
    );
  }, [setBalance]);

  function handleCashOut() {
    if (gameRef.current.phase !== "flying") return;
    const g = gameRef.current;
    g.phase = "cashout";
    clearInterval(intervalRef.current);
    doCashOut(g.mult, false);
  }

  // ── PARCIAL 50% (SpPartialCashOut) ─────────────────────────────────────────
  function handlePartial() {
    const g = gameRef.current;
    if (g.phase !== "flying")  return;
    if (g.halfDone)            { setMsg("Ya usaste el parcial en esta ronda"); return; }

    const halfVal   = parseFloat((g.activeBet * g.mult * 0.5).toFixed(2));
    g.halfDone      = true;
    g.halfAmt       = halfVal;
    g.activeBet     = g.activeBet * 0.5;   // la mitad sigue volando

    setBalance((b) => b + halfVal);
    setHalfDone(true);
    setHalfAmt(halfVal);
    setActiveBet(g.activeBet);
    setMsg(`⚡ 50% cobrado: $${halfVal.toFixed(2)} · Resto desde x${g.mult.toFixed(2)}...`);
  }

  // ─── Posición del cohete ────────────────────────────────────────────────────
  const rkTop   = rocketTop(mult);
  const isFly   = phase === "flying";
  const isCrash = phase === "crashed";
  const isWon   = phase === "cashout";

  // ─── Mini gráfico ───────────────────────────────────────────────────────────
  const maxChart = Math.max(...chartData, 2);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 560, margin: "0 auto", fontFamily: "Georgia, serif" }}>
      <button onClick={onBack} style={S.back}>← Lobby</button>

      <div style={S.card}>
        <h2 style={{ color: "#ffd700", marginBottom: 12, fontSize: 24, letterSpacing: 3 }}>
          🚀 SPACEMAN
        </h2>

        {/* Mensaje de estado */}
        <div style={{
          ...S.msgBox,
          color: isCrash ? "#ff4444" : isWon ? "#ffd700" : "#80c8ff",
        }}>
          {msg || "Configura apuesta y pulsa NUEVA RONDA"}
        </div>

        {/* ── Fila principal: zona de vuelo + panel ── */}
        <div style={S.mainRow}>

          {/* Zona de vuelo */}
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* Cielo */}
            <div style={{
              ...S.sky,
              background: isCrash ? "#320303" : isWon ? "#031a0c" : "#050a23",
            }}>
              {/* Estrellas decorativas */}
              {[...Array(18)].map((_, i) => (
                <div key={i} style={{
                  position: "absolute",
                  width: i % 3 === 0 ? 3 : 2,
                  height: i % 3 === 0 ? 3 : 2,
                  borderRadius: "50%",
                  background: "#fff",
                  opacity: 0.4 + (i % 4) * 0.15,
                  left: `${(i * 17 + 5) % 95}%`,
                  top:  `${(i * 23 + 7) % 90}%`,
                }} />
              ))}

              {/* Cohete */}
              {!isCrash && (
                <img
                  ref={rocketRef} 
                  src="/barra.png"
                  alt="cohete"
                  style={{
                    position: "absolute",
                    height: ROCKET_H,
                    left: "50%",
                    transform: "translateX(-50%)", 
                    top: rkTop,
                    transition: isFly ? `top ${SP_TICK}ms linear` : "none",
                    filter: isWon ? "drop-shadow(0 0 8px #ffd700)" : "none",
                  }}
                />
              )}

              {/* Explosión */}
              {isCrash && (
                <img
                  src="/explosion.png"
                  alt="explosion"
                  style={{
                    position: "absolute",
                    height: 300,    //110
                    left: "50%",
                    transform: "translateX(-50%)",
                    top: Math.max(rkTop - 15, 0),
                    animation: "popIn 0.25s ease-out",
                  }}
                />
              )}

              {/* Multiplicador flotante */}
              <div style={{
                position: "absolute", bottom: 10, left: 0, right: 0,
                textAlign: "center", fontSize: 42, fontWeight: 900,
                color: multColor(mult),
                textShadow: `0 0 20px ${multColor(mult)}88`,
                letterSpacing: 2,
              }}>
                x{mult.toFixed(2)}
              </div>
            </div>

            {/* Mini gráfico */}
            <div style={S.chartWrap}>
              <svg width="100%" height="48" style={{ display: "block" }}>
                <polyline
                  points={chartData.map((v, i) =>
                    `${(i / Math.max(chartData.length - 1, 1)) * 100}%,${48 - ((v - 1) / (maxChart - 1 + 0.001)) * 42}`
                  ).join(" ")}
                  fill="none"
                  stroke={isCrash ? "#ff4444" : "#ffd700"}
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            {/* Botones de acción */}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                onClick={handleCashOut}
                disabled={!isFly}
                style={{ ...S.btnCash, flex: 2, opacity: isFly ? 1 : 0.35 }}
              >
                💰 CASH OUT  ${potWin.toFixed(2)}
              </button>
              <button
                onClick={handlePartial}
                disabled={!isFly || halfDone}
                style={{ ...S.btnPartial, flex: 1, opacity: isFly && !halfDone ? 1 : 0.35 }}
              >
                ⚡ 50%
              </button>
            </div>
          </div>

          {/* ── Panel derecho ── */}
          <div style={S.rightCol}>

            {/* Config (solo cuando no vuela) */}
            {!isFly ? (
              <div style={S.configBox}>
                {/* Apuesta */}
                <div style={{ marginBottom: 12 }}>
                  <div style={S.label}>APUESTA</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {[100, 500, 1000, 5000, 10000, 50000, 100000].map((v) => (
                      <button
                        key={v}
                        onClick={() => setBet(v)}
                        style={{
                          ...S.chip,
                          background: bet === v ? "#ffd700" : "#1e1e2e",
                          color:      bet === v ? "#000"    : "#aaa",
                          border:     bet === v ? "1px solid #ffd700" : "1px solid #2a2a3a",
                        }}
                      >
                        ${v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Auto Cash-Out */}
                <div>
                  <div style={S.label}>AUTO CASH-OUT</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {[0, 1.5, 2, 3, 5, 10].map((v) => (
                      <button
                        key={v}
                        onClick={() => setAutoAt(v)}
                        style={{
                          ...S.chip,
                          background: autoAt === v ? "#00b4ff" : "#1e1e2e",
                          color:      autoAt === v ? "#000"    : "#aaa",
                          border:     autoAt === v ? "1px solid #00b4ff" : "1px solid #2a2a3a",
                        }}
                      >
                        {v === 0 ? "OFF" : `x${v}`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* Info ronda activa */
              <div style={S.configBox}>
                <div style={S.label}>RONDA ACTIVA</div>
                <div style={S.infoRow}><span style={S.infoKey}>Apuesta</span>   <span style={S.infoVal}>${activeBet.toFixed(2)}</span></div>
                <div style={S.infoRow}><span style={S.infoKey}>Auto CO</span>   <span style={S.infoVal}>{autoAt > 0 ? `x${autoAt}` : "OFF"}</span></div>
                {halfDone && (
                  <div style={S.infoRow}><span style={S.infoKey}>Parcial</span> <span style={{ ...S.infoVal, color: "#00d4aa" }}>+${halfAmt.toFixed(2)}</span></div>
                )}
                <div style={{ ...S.infoRow, marginTop: 8 }}>
                  <span style={S.infoKey}>Cobrar ya</span>
                  <span style={{ ...S.infoVal, color: multColor(mult) }}>${potWin.toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* Botón Nueva Ronda */}
            <button
              onClick={newRound}
              disabled={isFly}
              style={{ ...S.btnNew, marginTop: 10, opacity: isFly ? 0.35 : 1 }}
            >
              NUEVA RONDA
            </button>

            {/* Historial */}
            {history.length > 0 && (





              <div style={{ marginTop: 14 }}>
                <div style={S.label}>HISTORIAL</div>
                
                
                
                
                <div style={{ color: netoTotal >= 0 ? "#00d4aa" : "#ff4444", fontSize: 13, fontWeight: 700, textAlign: "right", marginBottom: 4 }}>
                Neto sesión: {netoTotal >= 0 ? "+" : ""}{netoTotal.toFixed(2)}
                </div>



                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 5 }}>
                  {history.map((h, i) => (
                    <div key={i} style={S.histRow}>
                      <span style={{ color: h.crash ? "#ff4444" : "#5aff73", fontSize: 20 }}>
                        {h.crash ? "💥" : "💰"} x{h.m.toFixed(2)}
                      </span>
                      <span style={{ color: h.net >= 0 ? "#00d4aa" : "#ff4444", fontWeight: 700, fontSize: 20 }}>
                        {h.net >= 0 ? "+" : ""}{h.net.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* CSS para animación de explosión */}
      <style>{`
        @keyframes popIn {
          0%   { transform: translateX(-50%) scale(0.3); opacity: 0.5; }
          60%  { transform: translateX(-50%) scale(1.15); opacity: 1; }
          100% { transform: translateX(-50%) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const S = {
  back:      { background: "transparent", border: "none", color: "#555", fontSize: 14, cursor: "pointer", marginBottom: 12, padding: 0 },
  card:      { background: "#16161f", border: "1px solid #1e1e2e", borderRadius: 14, padding: 20, width: "94vw", maxWidth: "1400px", margin: "20px auto", position: "relative", left: "50%", transform: "translateX(-50%)", boxSizing: "border-box", textAlign: "center"},
  msgBox:    { background: "#0d0d14", borderRadius: 8, padding: "10px 14px", fontSize: 20, fontWeight: 700, marginBottom: 12, textAlign: "center", minHeight: 34 },

  mainRow:   { display: "flex", gap: 14, alignItems: "flex-start" },
  rightCol:  { flex: "0 0 300px", display: "flex", flexDirection: "column" },   //148px

  // zona de vuelo
  sky: {
    position: "relative", height: SKY_H, borderRadius: 10,
    overflow: "hidden", border: "1px solid #1e1e2e",
    transition: "background 0.5s",
    width: "100%",   //100%
  },
  chartWrap: { background: "#0d0d14", borderRadius: "0 0 8px 8px", padding: "4px 6px 2px", marginTop: -1 },

  // panel derecho
  configBox: { background: "#0d0d14", borderRadius: 8, padding: "12px 10px" },
  label:     { color: "#ffffff", fontSize: 15, letterSpacing: 1.5, marginBottom: 4, display: "block", textAlign: "center" },
  chip:      { width: "100%", borderRadius: 6, padding: "6px 8px", fontSize: 15, cursor: "pointer", fontWeight: 700, textAlign: "center" },
  infoRow:   { display: "flex", justifyContent: "space-between", marginBottom: 7 },
  infoKey:   { color: "#ffffff", fontSize: 20 },
  infoVal:   { color: "#fff", fontSize: 20, fontWeight: 700 },

  // botones
  btnNew:    { width: "100%", background: "linear-gradient(135deg,#003f8a,#006bc8)", border: "1px solid #006bc8", borderRadius: 8, padding: "11px 0", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  btnCash:   { background: "linear-gradient(135deg,#065f2e,#00a854)", border: "1px solid #00a854", borderRadius: 8, padding: "12px 0", color: "#fff", fontSize: 30, fontWeight: 700, cursor: "pointer" },
  btnPartial:{ background: "linear-gradient(135deg,#7a5200,#e6a800)", border: "1px solid #e6a800", borderRadius: 8, padding: "12px 0", color: "#fff", fontSize: 30, fontWeight: 700, cursor: "pointer" },

  // historial
  histRow:   { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0d0d14", borderRadius: 6, padding: "4px 8px" },
};
