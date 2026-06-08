import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase";
import CrazyTimeDoor from "./CrazyTimeDoor.jsx";


// ─── WHEEL CONFIGURATION ────────────────────────────────────────────────────
// 54 segments in order matching the real Crazy Time wheel
const WHEEL_SEGMENTS = [
  { type: "crazy_time", label: "CRAZY\nTIME", color: "#ff6b00", textColor: "#fff" },
  { type: "1", label: "1", color: "#3a7bd5", textColor: "#fff" },
  { type: "5", label: "5", color: "#7ed321", textColor: "#fff" },
  { type: "1", label: "1", color: "#e8e8e8", textColor: "#000" },
  { type: "2", label: "2", color: "#f7c948", textColor: "#000" },
  { type: "pachinko", label: "PACHI-\nNKO", color: "#9b59b6", textColor: "#fff" },
  { type: "1", label: "1", color: "#3a7bd5", textColor: "#fff" },
  { type: "5", label: "5", color: "#7ed321", textColor: "#fff" },
  { type: "1", label: "1", color: "#3a7bd5", textColor: "#fff" },
  { type: "2", label: "2", color: "#f7c948", textColor: "#000" },
  { type: "1", label: "1", color: "#e8e8e8", textColor: "#000" },
  { type: "coin_flip", label: "COIN\nFLIP", color: "#e84393", textColor: "#fff" },
  { type: "1", label: "1", color: "#3a7bd5", textColor: "#fff" },
  { type: "2", label: "2", color: "#f7c948", textColor: "#000" },
  { type: "1", label: "1", color: "#e8e8e8", textColor: "#000" },
  { type: "10", label: "10", color: "#d0021b", textColor: "#fff" },
  { type: "2", label: "2", color: "#f7c948", textColor: "#000" },
  { type: "cash_hunt", label: "CASH\nHUNT", color: "#f5a623", textColor: "#fff" },
  { type: "1", label: "1", color: "#3a7bd5", textColor: "#fff" },
  { type: "2", label: "2", color: "#f7c948", textColor: "#000" },
  { type: "1", label: "1", color: "#e8e8e8", textColor: "#000" },
  { type: "5", label: "5", color: "#7ed321", textColor: "#fff" },
  { type: "1", label: "1", color: "#3a7bd5", textColor: "#fff" },
  { type: "coin_flip", label: "COIN\nFLIP", color: "#e84393", textColor: "#fff" },
  { type: "1", label: "1", color: "#e8e8e8", textColor: "#000" },
  { type: "5", label: "5", color: "#7ed321", textColor: "#fff" },
  { type: "2", label: "2", color: "#f7c948", textColor: "#000" },
  { type: "10", label: "10", color: "#d0021b", textColor: "#fff" },
  { type: "1", label: "1", color: "#3a7bd5", textColor: "#fff" },
  { type: "pachinko", label: "PACHI-\nNKO", color: "#9b59b6", textColor: "#fff" },
  { type: "1", label: "1", color: "#e8e8e8", textColor: "#000" },
  { type: "2", label: "2", color: "#f7c948", textColor: "#000" },
  { type: "5", label: "5", color: "#7ed321", textColor: "#fff" },
  { type: "1", label: "1", color: "#e8e8e8", textColor: "#000" },
  { type: "2", label: "2", color: "#f7c948", textColor: "#000" },
  { type: "coin_flip", label: "COIN\nFLIP", color: "#e84393", textColor: "#fff" },
  { type: "1", label: "1", color: "#3a7bd5", textColor: "#fff" },
  { type: "10", label: "10", color: "#d0021b", textColor: "#fff" },
  { type: "1", label: "1", color: "#3a7bd5", textColor: "#fff" },
  { type: "5", label: "5", color: "#7ed321", textColor: "#fff" },
  { type: "1", label: "1", color: "#3a7bd5", textColor: "#fff" },
  { type: "cash_hunt", label: "CASH\nHUNT", color: "#f5a623", textColor: "#fff" },
  { type: "1", label: "1", color: "#3a7bd5", textColor: "#fff" },
  { type: "2", label: "2", color: "#f7c948", textColor: "#000" },
  { type: "5", label: "5", color: "#7ed321", textColor: "#fff" },
  { type: "1", label: "1", color: "#3a7bd5", textColor: "#fff" },
  { type: "2", label: "2", color: "#f7c948", textColor: "#000" },
  { type: "coin_flip", label: "COIN\nFLIP", color: "#e84393", textColor: "#fff" },
  { type: "2", label: "2", color: "#f7c948", textColor: "#000" },
  { type: "1", label: "1", color: "#3a7bd5", textColor: "#fff" },
  { type: "10", label: "10", color: "#d0021b", textColor: "#fff" },
  { type: "2", label: "2", color: "#f7c948", textColor: "#000" },
  { type: "1", label: "1", color: "#3a7bd5", textColor: "#fff" },
  ];

const TOP_SLOT_MULTIPLIERS = [2, 3, 5, 7, 10, 15, 20, 25, 40, 50];
const SEGMENT_TYPES = ["1", "2", "5", "10", "coin_flip", "cash_hunt", "pachinko", "crazy_time"];

const SEGMENT_INFO = {
  "1":          { label: "1",          color: "#3a7bd5", emoji: "1️⃣" },
  "2":          { label: "2",          color: "#f7c948", emoji: "2️⃣" },
  "5":          { label: "5",          color: "#7ed321", emoji: "5️⃣" },
  "10":         { label: "10",         color: "#d0021b", emoji: "🔟" },
  "coin_flip":  { label: "Coin Flip",  color: "#e84393", emoji: "🪙" },
  "cash_hunt":  { label: "Cash Hunt",  color: "#f5a623", emoji: "🎯" },
  "pachinko":   { label: "Pachinko",   color: "#9b59b6", emoji: "🎳" },
  "crazy_time": { label: "Crazy Time", color: "#ff6b00", emoji: "🎡" },
};

// ─── COIN FLIP BONUS ─────────────────────────────────────────────────────────
function CoinFlipBonus({ bet, onComplete }) {
  const [redMult]  = useState(() => TOP_SLOT_MULTIPLIERS[Math.floor(Math.random() * TOP_SLOT_MULTIPLIERS.length)]);
  const [blueMult] = useState(() => TOP_SLOT_MULTIPLIERS[Math.floor(Math.random() * TOP_SLOT_MULTIPLIERS.length)]);
  const [chosen,   setChosen]   = useState(null);
  const [result,   setResult]   = useState(null);
  const [flipping, setFlipping] = useState(false);
  const [animState, setAnimState] = useState("idle"); // idle | flipping | done-red | done-blue



  /*useEffect(() => {
  supabase.auth.getSession().then(async ({ data: { session } }) => {
    if (!session) return;
    const { data } = await supabase
      .from("crazytime_history")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) {
      setHistory(data.map(h => ({
        type: h.segment,
        win: h.won,
        amount: h.payout,
      })));
    }
  });
}, []);*/



  function selectColor(color) {
    if (chosen || flipping) return;
    setChosen(color);
  }

  function flip() {
    if (!chosen || flipping) return;
    setFlipping(true);
    setAnimState("flipping");

    setTimeout(() => {
      const landed = Math.random() < 0.5 ? "red" : "blue";
      setAnimState("done-" + landed);
      setResult(landed);
      setFlipping(false);
    }, 1900);
  }

  useEffect(() => {
    if (result !== null) {
      const mult = result === "red" ? redMult : blueMult;
      const won  = result === chosen;
      setTimeout(() => onComplete(won ? bet * mult : 0, mult, result, chosen), 3200);
    }
  }, [result]);

  // Animación:
  // - coinJump: sube y baja (en el wrapper externo)
  // - coinRotateToRed: termina en 0°/360° = cara roja visible
  // - coinRotateToBlue: termina en 180° = cara azul visible
  const SPIN_DURATION = "1.9s";

  return (
    <div style={bonusStyles.wrap}>
      <style>{`
        @keyframes coinJump {
          0%   { transform: translateY(0px);    }
          25%  { transform: translateY(-100px); }
          55%  { transform: translateY(-110px); }
          82%  { transform: translateY(-8px);   }
          91%  { transform: translateY(5px);    }
          100% { transform: translateY(0px);    }
        }
        @keyframes coinRotateRed {
          0%   { transform: rotateY(0deg);    }
          100% { transform: rotateY(1440deg); }
        }
        @keyframes coinRotateBlue {
          0%   { transform: rotateY(0deg);    }
          100% { transform: rotateY(1620deg); }
        }
        @keyframes glowRed  { 0%,100%{box-shadow:0 0 18px #e8474788} 50%{box-shadow:0 0 36px #e84747cc} }
        @keyframes glowBlue { 0%,100%{box-shadow:0 0 18px #4785e888} 50%{box-shadow:0 0 36px #4785e8cc} }
      `}</style>

      <div style={bonusStyles.title}>🪙 COIN FLIP</div>
      <div style={{ color: "#aaa", marginBottom: 20, fontSize: 14, textAlign: "center" }}>
        Elige un color y lanza la moneda
      </div>

      {/* ── Moneda con dos caras ── */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 28, perspective: "600px" }}>

        {/* Wrapper vertical (sube/baja) */}
        <div style={{
          animation: animState === "flipping"
            ? `coinJump ${SPIN_DURATION} ease-in-out forwards`
            : "none",
        }}>
          {/* Inner: rotación Y (muestra cara roja o azul) */}
          <div style={{
            width: 130, height: 130,
            position: "relative",
            transformStyle: "preserve-3d",
            animation: animState === "flipping"
              ? `coinRotateRed ${SPIN_DURATION} ease-in-out forwards`  // placeholder, se sobreescribe
              : animState === "done-red"
                ? `coinRotateRed ${SPIN_DURATION} ease-in-out forwards`
                : animState === "done-blue"
                  ? `coinRotateBlue ${SPIN_DURATION} ease-in-out forwards`
                  : "none",
            // Cuando ya terminó, fijar la rotación final
            transform: animState === "done-blue" ? "rotateY(1620deg)" : undefined,
          }}>

            {/* CARA FRONTAL — Rojo */}
            <div style={{
              position: "absolute", inset: 0,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #e84747, #a00)",
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              animation: animState === "done-red" ? "glowRed 1s 1.9s infinite" : "none",
              boxShadow: "0 4px 20px #0008",
            }}>
              <div style={{ fontSize: 34 }}>🔴</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>{redMult}x</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>ROJO</div>
            </div>

            {/* CARA TRASERA — Azul (rotada 180° en Y) */}
            <div style={{
              position: "absolute", inset: 0,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #4785e8, #005faa)",
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              animation: animState === "done-blue" ? "glowBlue 1s 1.9s infinite" : "none",
              boxShadow: "0 4px 20px #0008",
            }}>
              <div style={{ fontSize: 34 }}>🔵</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>{blueMult}x</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>AZUL</div>
            </div>

          </div>
        </div>
      </div>

      {/* ── Selector de color ── */}
      {!result && (
        <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 24 }}>
          {[
            { color: "red",  bg: "linear-gradient(135deg,#e84747,#a00)",    emoji: "🔴", mult: redMult,  label: "ROJO" },
            { color: "blue", bg: "linear-gradient(135deg,#4785e8,#005faa)", emoji: "🔵", mult: blueMult, label: "AZUL" },
          ].map(({ color, bg, emoji, mult, label }) => (
            <div
              key={color}
              onClick={() => selectColor(color)}
              style={{
                ...bonusStyles.coinSide,
                background: bg,
                border: chosen === color ? "4px solid #fff" : "4px solid transparent",
                transform: chosen === color ? "scale(1.08)" : "scale(1)",
                opacity: flipping ? 0.55 : 1,
                cursor: flipping ? "default" : "pointer",
                transition: "transform 0.2s, border 0.2s",
              }}
            >
              <div style={{ fontSize: 32 }}>{emoji}</div>
              <div style={{ fontSize: 26, fontWeight: 900 }}>{mult}x</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Botón lanzar ── */}
      {chosen && !result && (
        <button onClick={flip} disabled={flipping} style={{
          ...bonusStyles.actionBtn, opacity: flipping ? 0.5 : 1,
        }}>
          {flipping ? "🪙 Lanzando..." : "🚀 Lanzar Moneda"}
        </button>
      )}

      {/* ── Resultado ── */}
      {result && (
        <div style={{ textAlign: "center", marginTop: 8 }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            {result === chosen
              ? <span style={{ color: "#7ed321" }}>✅ ¡Ganaste {result === "red" ? redMult : blueMult}x!</span>
              : <span style={{ color: "#e84747" }}>❌ No era ese color</span>
            }
          </div>
          <div style={{ color: "#aaa", fontSize: 13, marginTop: 6 }}>
            Cayó: {result === "red" ? "🔴 Rojo" : "🔵 Azul"}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CASH HUNT BONUS ─────────────────────────────────────────────────────────
  // ─── CASH HUNT BONUS ─────────────────────────────────────────────────────────
const CASH_HUNT_SYMBOLS = ["🐰", "🎩", "⭐", "🎪", "🎭", "🍀", "🎲", "🎯", "🌟", "🦋", "🎨", "🔮", "🎸", "🌈", "🦄"];
const GRID_COLS = 12;
const GRID_ROWS = 9;
const GRID_SIZE = GRID_COLS * GRID_ROWS; // 108

function generateCashHuntBoard(topSlotMult = 1) {
  const board = [];

  // En lugar de rangos puros, usa pesos para una distribución más natural
  // Esto simula mejor la "tensión" entre premios pequeños y premios grandes
  
  // Tier Bajo (75%): valores más frecuentes cercanos a 5x-10x
  for (let i = 0; i < 75; i++) {
    board.push(Math.floor(Math.random() * 10) + 5); 
  }
  
  // Tier Medio (23%): valores entre 25x-100x
  for (let i = 0; i < 25; i++) {
    board.push(Math.floor(Math.random() * 75) + 25);
  }
  
  // Tier Alto (2%): premios "jackpot"
  for (let i = 0; i < 8; i++) {
    board.push(Math.floor(Math.random() * 400) + 100);
  }

  // Fisher-Yates shuffle (Tu implementación es correcta)
  for (let i = board.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [board[i], board[j]] = [board[j], board[i]];
  }

  return board.map(m => Math.min(25000, m * topSlotMult));
}

function CashHuntBonus({ bet, topSlotMult = 1, onComplete }) {
  const [multipliers] = useState(() => generateCashHuntBoard(topSlotMult));
  const [symbols] = useState(() =>
    Array.from({ length: GRID_SIZE }, () =>
      CASH_HUNT_SYMBOLS[Math.floor(Math.random() * CASH_HUNT_SYMBOLS.length)]
    )
  );

  const [chosen, setChosen] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const [fired, setFired] = useState(false);

  // Countdown
  useEffect(() => {
    if (revealed || fired) return;
    if (timeLeft <= 0) {
      // Tiempo agotado: disparo automático en celda aleatoria
      const auto = Math.floor(Math.random() * GRID_SIZE);
      setChosen(auto);
      setFired(true);
      setRevealed(true);
      return;
    }
    const t = setTimeout(() => setTimeLeft(prev => prev - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, revealed, fired]);

  // Resolver resultado
  useEffect(() => {
    if (!revealed || chosen === null) return;
    const mult = multipliers[chosen];
    setTimeout(() => onComplete(bet * mult, mult), 2800);
  }, [revealed]);

  function shoot() {
    if (fired) return;
    setFired(true);
    if (chosen === null) {
      // Disparó sin elegir → celda aleatoria
      const auto = Math.floor(Math.random() * GRID_SIZE);
      setChosen(auto);
    }
    setRevealed(true);
  }

  const timerColor = timeLeft <= 5 ? "#e84747" : timeLeft <= 10 ? "#f5a623" : "#fbbf24";

  return (
    <div style={bonusStyles.wrap}>
      <div style={bonusStyles.title}>🎯 CASH HUNT</div>

      {/* Header: instrucción + timer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ color: "#aaa", fontSize: 18 }}>
          {revealed ? "¡Revelando multiplicadores!" : "Apunta y dispara a un objetivo"}
        </div>
        {!revealed && (
          <div style={{
            background: timeLeft <= 5 ? "#2a0a0a" : "#1e1e2e",
            border: `1px solid ${timerColor}`,
            borderRadius: 8, padding: "4px 14px",
            color: timerColor, fontWeight: 900, fontSize: 20,
            transition: "all 0.3s",
          }}>
            ⏱ {timeLeft}s
          </div>
        )}
        {topSlotMult > 1 && (
          <div style={{ color: "#f5a623", fontWeight: 700, fontSize: 20 }}>
            ⭐ Top Slot ×{topSlotMult} aplicado
          </div>
        )}
      </div>

      {/* Cuadrícula 12×9 */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
        gap: 3,
        marginBottom: 14,
        userSelect: "none",
      }}>
        {Array.from({ length: GRID_SIZE }, (_, i) => {
          const isChosen = chosen === i;
          const mult = multipliers[i];
          const tier = mult >= 100 ? "high" : mult >= 25 ? "mid" : "low";
          const tierColor = tier === "high" ? "#fbbf24" : tier === "mid" ? "#7ed321" : "#aaa";

          return (
            <div
              key={i}
              onClick={() => {
                if (revealed || fired) return;
                setChosen(i);
              }}
              style={{
                aspectRatio: "1",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 5,
                cursor: revealed || fired ? "default" : "crosshair",
                fontSize: revealed ? 16 : 30,
                fontWeight: 700,
                transition: "all 0.25s",
                background: revealed
                  ? (isChosen ? tierColor : "#111122")
                  : isChosen
                    ? "#fbbf2422"
                    : "#1a1a2e",
                border: isChosen
                  ? `2px solid ${revealed ? tierColor : "#fbbf24"}`
                  : "2px solid #2a2a3a",
                color: revealed
                  ? (isChosen ? "#000" : tier === "high" ? "#fbbf2488" : tier === "mid" ? "#7ed32166" : "#ffffff22")
                  : "#fff",
                boxShadow: isChosen && !revealed ? "0 0 8px #fbbf2466" : "none",
                transform: isChosen && !revealed ? "scale(1.12)" : "scale(1)",
              }}
            >
              {revealed
                ? (isChosen
                    ? `${mult >= 1000 ? `${(mult/1000).toFixed(1)}k` : mult}x`
                    : `${mult >= 1000 ? `${(mult/1000).toFixed(1)}k` : mult}x`
                  )
                : symbols[i]
              }
            </div>
          );
        })}
      </div>

      {/* Botón disparar */}
      {!revealed && (
        <button
          onClick={shoot}
          style={{
            ...bonusStyles.actionBtn,
            background: chosen !== null
              ? "linear-gradient(135deg, #e84747, #a00)"
              : "linear-gradient(135deg, #555, #333)",
            cursor: chosen !== null ? "pointer" : "default",
          }}
        >
          {chosen !== null ? "🎯 ¡DISPARAR!" : "👆 Selecciona un objetivo primero"}
        </button>
      )}

      {/* Resultado */}
      {revealed && chosen !== null && (
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <div style={{ fontSize: 20, color: "#aaa", marginBottom: 4 }}>
            Multiplicador obtenido
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, color: "#fbbf24" }}>
            {multipliers[chosen]}x
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#7ed321", marginTop: 4 }}>
            🎉 +{(bet * multipliers[chosen]).toLocaleString()} fichas
          </div>
          {topSlotMult > 1 && (
            <div style={{ fontSize: 16, color: "#f5a623", marginTop: 4 }}>
              (incluye ×{topSlotMult} del Top Slot)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── PACHINKO BONUS ──────────────────────────────────────────────────────────
const MAX_MULT = 10000;
const SLOTS    = 16;

function generateMults(topSlotMult = 1) {
  const low    = [2, 3, 4, 5, 7];
  const mid    = [10, 15, 20, 25, 30];
  const high   = [50, 100, 200];
  const pool   = [...low, ...low, ...low,...mid, ...mid, ...high]; // pesos

  const mults  = Array.from({ length: SLOTS }, () =>
    pool[Math.floor(Math.random() * pool.length)]
  );

  // Colocar entre 1 y 3 DOUBLE en posiciones aleatorias
  const numDoubles = 1 + Math.floor(Math.random() * 3); // 1 a 3 DOUBLE
  const positions  = new Set();
  while (positions.size < numDoubles) {
    positions.add(Math.floor(Math.random() * SLOTS));
  }
  positions.forEach(p => { mults[p] = "DOUBLE"; });

  // Aplicar Top Slot multiplier a todos los valores numéricos
  return mults.map(m =>
    m === "DOUBLE" ? "DOUBLE" : Math.min(MAX_MULT, m * topSlotMult)
  );
}

function PachinkoBonus({ bet, topSlotMult = 1, onComplete }) {
  const [mults, setMults]         = useState(() => generateMults(topSlotMult));
  const [ballPos, setBallPos]     = useState(50);
  const [ballY, setBallY]         = useState(-10);
  const [phase, setPhase]         = useState("ready");   // ready | dropping | landed
  const [landed, setLanded]       = useState(null);
  const [doublesCount, setDoublesCount] = useState(0);
  const multsRef   = useRef(mults);
  const intervalRef = useRef(null);

  useEffect(() => () => clearInterval(intervalRef.current), []);

  function dropBall(currentMults) {
    setPhase("dropping");
    setLanded(null);

    // Punto de inicio aleatorio entre columnas 4 y 12 (de 16)
    const startPct = ((3 + Math.random() * 9) / SLOTS) * 100;
    setBallPos(startPct);
    setBallY(0);

    let pos   = startPct;
    let steps = 0;
    const TOTAL_STEPS = 28;

    intervalRef.current = setInterval(() => {
      steps++;

      // Física de rebote: pequeños desvíos aleatorios en cada peg
      const deviation = (Math.random() - 0.48) * 12;   // leve sesgo centrador
      pos += deviation;
      pos  = Math.max(2, Math.min(98, pos));

      setBallPos(pos);
      setBallY((steps / TOTAL_STEPS) * 100);

      if (steps >= TOTAL_STEPS) {
        clearInterval(intervalRef.current);

        // Mapear posición (0-100%) a slot (0-15)
        const slot = Math.min(SLOTS - 1, Math.floor((pos / 100) * SLOTS));
        setLanded(slot);
        setPhase("landed");

        const value = currentMults[slot];

          if (value === "DOUBLE") {
  // Duplicar todos los valores numéricos
  const newMults = currentMults.map(m =>
    m === "DOUBLE" ? "DOUBLE" : Math.min(MAX_MULT, m * 2)
  );
  multsRef.current = newMults;
  setMults(newMults);
  setDoublesCount(d => d + 1);

  // Auto-relanzar pasando newMults directamente (sin pasar por "ready" ni el botón)
  setTimeout(() => {
    setLanded(null);
    setBallY(-10);
    dropBall(newMults); // ← newMults directo, no multsRef ni state
  }, 1800);

        } else {
          setTimeout(() => onComplete(bet * value, value), 2000);
        }
      }
    }, 100);
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  const ROWS = 8;   // filas de pegs

  return (
    <div style={bonusStyles.wrap}>
      <div style={bonusStyles.title}>🎳 PACHINKO</div>

      {topSlotMult > 1 && (
        <div style={{ color: "#f5a623", textAlign: "center", marginBottom: 6, fontWeight: 700, fontSize: 18 }}>
          ⭐ Top Slot ×{topSlotMult} aplicado a todos los valores
        </div>
      )}
      {doublesCount > 0 && (
        <div style={{ color: "#fbbf24", textAlign: "center", marginBottom: 8, fontWeight: 700, fontSize: 18 }}>
          🔥 DOUBLE activado {doublesCount} {doublesCount === 1 ? "vez" : "veces"}
          {" — "}todos los valores ×{Math.pow(2, doublesCount)}
        </div>
      )}

      {/* Tablero */}
      <div style={{
        position: "relative", height: 500,
        background: "linear-gradient(180deg, #0a0a1e 0%, #0d0d20 100%)",
        borderRadius: 12, marginBottom: 10,
        overflow: "hidden", border: "1px solid #2a2a3a",
      }}>
        {/* Pegs */}
        {Array.from({ length: ROWS }, (_, row) => {
          const cols = row % 2 === 0 ? 9 : 8;
          return Array.from({ length: cols }, (_, col) => {
            const offsetX = row % 2 === 0 ? 5 : 10;
            return (
              <div key={`${row}-${col}`} style={{
                position: "absolute",
                width: 7, height: 7,
                background: "#6a6a9a",
                borderRadius: "50%",
                boxShadow: "0 0 4px #8888cc44",
                left: `${offsetX + col * (90 / (cols - 1))}%`,
                top:  `${8 + row * 10}%`,
              }} />
            );
          });
        })}

        {/* Líneas guía de columnas (tenues) */}
        {Array.from({ length: SLOTS + 1 }, (_, i) => (
          <div key={i} style={{
            position: "absolute",
            width: 1, bottom: 0, top: "75%",
            left: `${(i / SLOTS) * 100}%`,
            background: "#ffffff0a",
          }} />
        ))}

        {/* Bola */}
        {phase !== "ready" && (
          <div style={{
            position: "absolute",
            width: 18, height: 18,
            background: "radial-gradient(circle at 35% 35%, #fff, #fbbf24)",
            borderRadius: "50%",
            left: `calc(${ballPos}% - 9px)`,
            top:  `${ballY}%`,
            transition: "top 0.1s linear, left 0.1s ease",
            zIndex: 10,
            boxShadow: "0 0 10px #fbbf24cc",
          }} />
        )}
      </div>

      {/* Slots — 16 ranuras */}
      <div style={{ display: "flex", gap: 3, marginBottom: 14 }}>
        {mults.map((m, i) => (
          <div key={i} style={{
            flex: 1,
            padding: "6px 1px",
            background: landed === i
              ? (m === "DOUBLE" ? "#ff4400" : "#fbbf24")
              : m === "DOUBLE" ? "#e84747" : "#1e1e2e",
            border: landed === i ? "2px solid #fff" : "1px solid #2a2a3a",
            borderRadius: 5,
            textAlign: "center",
            color: landed === i ? "#000" : m === "DOUBLE" ? "#fff" : "#ccc",
            fontSize: m === "DOUBLE" ? 20 : 15,
            fontWeight: 700,
            transition: "all 0.3s",
            minWidth: 0,
          }}>
            {m === "DOUBLE" ? "×2" : m >= 1000 ? `${m/1000}k` : `${m}x`}
          </div>
        ))}
      </div>


{/* Botón lanzar — solo en la primera tirada */}
{phase === "ready" && doublesCount === 0 && (
  <button onClick={() => dropBall(multsRef.current)} style={bonusStyles.actionBtn}>
    🎳 ¡Lanzar disco!
  </button>
)}

{/* Mensaje mientras se relanza tras DOUBLE */}
{phase === "dropping" && doublesCount > 0 && (
  <div style={{ textAlign: "center", color: "#fbbf24", fontSize: 15, fontWeight: 700 }}>
    🔄 Relanzando con valores ×{Math.pow(2, doublesCount)}...
  </div>
)}


      {/* Mensajes */}
      {phase === "dropping" && (
        <div style={{ textAlign: "center", color: "#aaa", fontSize: 20 }}>
          🔮 El disco está cayendo...
        </div>
      )}
      {phase === "landed" && landed !== null && mults[landed] === "DOUBLE" && (
        <div style={{ textAlign: "center", fontSize: 20, fontWeight: 700, color: "#e84747", marginTop: 4 }}>
          ×2 — ¡Todos los valores se duplicaron! Preparando nueva tirada...
        </div>
      )}
      {phase === "landed" && landed !== null && mults[landed] !== "DOUBLE" && (
        <div style={{ textAlign: "center", fontSize: 22, fontWeight: 700, color: "#7ed321", marginTop: 4 }}>
          ✅ ¡{mults[landed]}x! (+{(bet * mults[landed]).toLocaleString()})
        </div>
      )}
    </div>
  );
}


// ─── CRAZY TIME BONUS ─────────────────────────────────────────────────────────
// ─── CRAZY TIME BONUS WHEEL SEGMENTS ─────────────────────────────────────────
// Distribución de probabilidades de los 64 segmentos (como el juego real)


const CT_WHEEL_LAYOUT = [
  10, "DOUBLE", 20, 40, "TRIPLE", 10, 5, "DOUBLE",
  100, 20, "DOUBLE", 50, 10, "TRIPLE", 20, 5,
  "DOUBLE", 10, 1000, "DOUBLE", 20, 5, "TRIPLE", 40,
  10, "DOUBLE", 20, 5, "DOUBLE", 100, 10, 20,
  5, "TRIPLE", 50, 10, "DOUBLE", 20, 5, 40,
  "DOUBLE", 10, 20, "TRIPLE", 5, 10, "DOUBLE", 20,
  500, "DOUBLE", 10, 5, 20, "TRIPLE", 40, 10,
  "DOUBLE", 20, 5, 100, "DOUBLE", 10, 20, 5,
];

function CrazyTimeBonus({ bet, onComplete }) {
  // La rueda se genera una sola vez al montar el componente

  const [currentMults, setCurrentMults] = useState([...CT_WHEEL_LAYOUT]);
  const [chosen, setChosen]             = useState(null);   // "green" | "blue" | "yellow"
  const [spinning, setSpinning]         = useState(false);
  const [landedIndexes, setLandedIndexes] = useState(null); // { green, blue, yellow }
  const [doublesCount, setDoublesCount] = useState(0);
  const multsRef = useRef([...CT_WHEEL_LAYOUT]);
  const [phase, setPhase]               = useState("choose");
  const [finalResult, setFinalResult]   = useState(null);

  const wheelSvgRef  = useRef(null);
  const rotRef       = useRef(0);
  const animFrameRef = useRef(null);


  useEffect(() => () => cancelAnimationFrame(animFrameRef.current), []);

  const WHEEL_SIZE = 900;   //860
  const RADIUS     = 420;   //390
  const cx = WHEEL_SIZE / 2;
  const cy = WHEEL_SIZE / 2;
  const segCount = 64;
  const segAngle = 360 / segCount; // 5.625°

  // Más altura visible → se ve más arco superior (como en la imagen real)
  const VISIBLE_H = 480;

  const FLAPPERS = [
    { id: "green",  color: "#7ed321", label: "Verde 🟢",    offsetDeg: -12 },
    { id: "blue",   color: "#3a7bd5", label: "Azul 🔵",     offsetDeg: 0   },
    { id: "yellow", color: "#fbbf24", label: "Amarilla 🟡", offsetDeg: 12  },
  ];

  const COLORS = [
    "#1e4fa3", "#c49a00", "#2e7d00", "#a0005e",
    "#5b1fa3", "#a05a00", "#8b0010", "#007a66",
    "#3a7bd5", "#f7c948", "#7ed321", "#e84393",
    "#9b59b6", "#f5a623", "#d0021b", "#00d4aa",
  ];

  function segPath(i) {
    const s = (i * segAngle - 90) * (Math.PI / 180);
    const e = ((i + 1) * segAngle - 90) * (Math.PI / 180);
    const x1 = cx + RADIUS * Math.cos(s), y1 = cy + RADIUS * Math.sin(s);
    const x2 = cx + RADIUS * Math.cos(e), y2 = cy + RADIUS * Math.sin(e);
    return `M${cx},${cy} L${x1},${y1} A${RADIUS},${RADIUS} 0 0,1 ${x2},${y2} Z`;
  }

  // Dado el ángulo de rotación de la rueda, ¿qué segmento apunta cada aleta?
  function getSegmentAtAngle(wheelRotation, flapperOffsetDeg) {
    // La aleta está a (flapperOffsetDeg) grados del centro (0° = arriba)
    // El segmento apuntado = qué segmento quedó en esa posición
    const normalizedRot = ((wheelRotation % 360) + 360) % 360;
    const pointerAngle  = (flapperOffsetDeg + 360) % 360;
    // Ángulo en el sistema de la rueda que está ahora arriba
    const angleInWheel  = (pointerAngle - normalizedRot + 360) % 360;
    return Math.floor(angleInWheel / segAngle) % segCount;
  }

  function doSpin(multsToUse) {
    const mults = multsToUse || multsRef.current;
    setSpinning(true);
    setPhase("spinning");
    setLandedIndexes(null);

    // El segmento destino de la aleta del jugador (offset 0 = azul central)
    // La aleta elegida determinará el resultado
    const chosenFlapper = FLAPPERS.find(f => f.id === chosen) || FLAPPERS[1];
    const targetSeg = Math.floor(Math.random() * segCount);

    // Calcular cuánto rotar para que targetSeg quede en la posición de la aleta elegida
    const flapperPos = ((chosenFlapper.offsetDeg % 360) + 360) % 360;
    const segCenter  = targetSeg * segAngle + segAngle / 2;
    // Para que segCenter esté en flapperPos: rotation = segCenter - flapperPos
    const currentMod = ((rotRef.current % 360) + 360) % 360;
    const targetMod  = ((segCenter - flapperPos) % 360 + 360) % 360;
    let delta = (targetMod - currentMod + 360) % 360;
    if (delta < segAngle * 3) delta += 360;

    const extraSpins = 6 + Math.floor(Math.random() * 5);
    const totalDeg   = extraSpins * 360 + delta;
    const startAngle = rotRef.current;
    rotRef.current   = startAngle + totalDeg;

    const DURATION = 5500;
    const t0 = performance.now();
    cancelAnimationFrame(animFrameRef.current);

    function frame(now) {
      const t     = Math.min(1, (now - t0) / DURATION);
      const eased = 1 - Math.pow(1 - t, 4);
      const angle = startAngle + totalDeg * eased;
      if (wheelSvgRef.current)
        wheelSvgRef.current.style.transform = `rotate(${angle}deg)`;
      if (t < 1) { animFrameRef.current = requestAnimationFrame(frame); return; }

      // ── Calcular dónde quedó cada aleta ──
      const finalRot = rotRef.current;
      const indexes  = {};
      FLAPPERS.forEach(f => {
        indexes[f.id] = getSegmentAtAngle(finalRot, f.offsetDeg);
      });
      setLandedIndexes(indexes);
      setSpinning(false);

      // El resultado lo determina la aleta del jugador
      const myIdx   = indexes[chosen];
      const myValue = mults[myIdx];

      if (myValue === "DOUBLE" || myValue === "TRIPLE") {
        const factor   = myValue === "DOUBLE" ? 2 : 3;
        const newMults = mults.map(m =>
          m === "DOUBLE" || m === "TRIPLE" ? m : Math.min(20000, m * factor)
        );
        multsRef.current = newMults;
        setCurrentMults(newMults);
        setDoublesCount(d => d + 1);
        setTimeout(() => { setLandedIndexes(null); doSpin(newMults); }, 6000);    //2800
      } else {
        setPhase("result");
        setFinalResult(myValue);
        setTimeout(() => onComplete(bet * myValue, myValue), 6000);     //2500
      }
    }
    animFrameRef.current = requestAnimationFrame(frame);
  }

  return (
    <div style={{ ...bonusStyles.wrap, maxWidth: 920 }}>
      <div style={bonusStyles.title}>🎡 CRAZY TIME</div>

      {doublesCount > 0 && (
        <div style={{ color: "#fbbf24", textAlign: "center", marginBottom: 8, fontWeight: 700, fontSize: 15 }}>
          🔥 {doublesCount} {doublesCount === 1 ? "multiplicador" : "multiplicadores"} encadenados
        </div>
      )}

      {/* ── Selección de aleta ── */}
      {phase === "choose" && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: "#aaa", textAlign: "center", marginBottom: 12, fontSize: 20 }}>
            Elige tu aleta antes de girar
          </div>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 16 }}>
            {FLAPPERS.map(a => (
              <div key={a.id} onClick={() => setChosen(a.id)} style={{
                padding: "12px 22px", borderRadius: 10, cursor: "pointer",
                background: chosen === a.id ? a.color + "33" : "#1e1e2e",
                border: `3px solid ${chosen === a.id ? a.color : "#2a2a3a"}`,
                color: a.color, fontWeight: 700, fontSize: 15, textAlign: "center",
                transition: "all 0.2s",
              }}>
                {a.label}
              </div>
            ))}
          </div>
          {chosen && (
            <button onClick={() => doSpin()} style={bonusStyles.actionBtn}>
              🎡 ¡Girar Ruleta!
            </button>
          )}
        </div>
      )}

      {/* ── Rueda ── */}
      <div style={{
        position: "relative",
        height: VISIBLE_H,
        overflow: "hidden",
        display: "flex",
        justifyContent: "center",
        background: "radial-gradient(ellipse at 50% 130%, #1a1a3e 0%, #07070f 100%)",
        borderRadius: 14,
        border: "1px solid #2a2a4a",
        marginBottom: 12,
      }}>
        {/* Las 3 aletas — posicionadas según su offset */}
        {FLAPPERS.map(f => {
          const myIdx = landedIndexes?.[f.id];
          const myVal = myIdx !== undefined ? currentMults[myIdx] : null;
          const isChosen = f.id === chosen;
          return (
            <div key={f.id} style={{
              position: "absolute",
              top: 2,
              left: `calc(50% + ${f.offsetDeg * 5}px)`,  // separación visual
              transform: "translateX(-50%)",
              zIndex: 20,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              filter: isChosen
                ? `drop-shadow(0 0 12px ${f.color})`
                : "none",
              opacity: isChosen ? 1 : 0.6,
            }}>
              {/* Triángulo aleta */}
              <div style={{
                width: 0, height: 0,
                borderLeft: "16px solid transparent",
                borderRight: "16px solid transparent",
                borderTop: `32px solid ${f.color}`,
                filter: isChosen ? `drop-shadow(0 4px 8px ${f.color})` : "none",
              }} />
              {/* Valor que marca (solo cuando aterrizó) */}
              {myVal !== null && (
                <div style={{
                  marginTop: 4,
                  background: f.color,
                  color: "#000",
                  fontWeight: 900,
                  fontSize: 20,
                  borderRadius: 4,
                  padding: "2px 6px",
                  whiteSpace: "nowrap",
                }}>
                  {myVal === "DOUBLE" ? "x2" : myVal === "TRIPLE" ? "x3" : `${myVal}X`}
                </div>
              )}
            </div>
          );
        })}

        <svg
          ref={wheelSvgRef}
          width={WHEEL_SIZE}
          height={WHEEL_SIZE}
          style={{
            transformOrigin: `${cx}px ${cy}px`,
            flexShrink: 0,
            position: "absolute",
            // Más arriba → más segmentos visibles (ajustado para mostrar ~40% del arco)
            top: VISIBLE_H - cy - 20, //+ 60
          }}
        >
          <circle cx={cx} cy={cy} r={RADIUS + 18} fill="none" stroke="#5a3a00" strokeWidth={14} />
          <circle cx={cx} cy={cy} r={RADIUS + 10} fill="none" stroke="#fbbf24" strokeWidth={3} />
          <circle cx={cx} cy={cy} r={RADIUS + 4}  fill="none" stroke="#8b6914" strokeWidth={4} />

          {CT_WHEEL_LAYOUT.map((_, i) => {
            const value    = currentMults[i];
            const isDouble = value === "DOUBLE";
            const isTriple = value === "TRIPLE";
            const myIdx    = landedIndexes?.[chosen];
            const isMyLanded = myIdx === i;
            const isAnyLanded = landedIndexes
              ? Object.values(landedIndexes).includes(i)
              : false;

            const color = isMyLanded ? "#ffffff"
              : isAnyLanded ? "#ffffffaa"
              : isDouble    ? "#00fffb"
              : isTriple    ? "#ff00d9"
              : COLORS[i % COLORS.length];

            const midDeg = (i + 0.5) * segAngle - 90;
            const midRad = midDeg * (Math.PI / 180);
            const textR  = RADIUS * 0.73;
            const tx     = cx + textR * Math.cos(midRad);
            const ty     = cy + textR * Math.sin(midRad);

            const label = isDouble ? "2X"
              : isTriple           ? "3X"
              : value >= 10000     ? "MAX"
              : value >= 1000      ? `x${(value / 1000).toFixed(0)}k`
              : `x${value}`;

            return (
              <g key={i}>
                <path d={segPath(i)} fill={color} stroke="#07070f" strokeWidth={0.6} />
                <text
                  x={tx} y={ty}
                  fill={isMyLanded ? "#000" : "#fff"}
                  //fontSize={15} fontWeight="900"
                  fontSize={
  isDouble || isTriple ? 20
  : value >= 100       ? 12
  : value >= 10        ? 15
  : 13
}
                  textAnchor="middle" dominantBaseline="middle"
                  transform={`rotate(${midDeg + 90}, ${tx}, ${ty})`}
                  style={{ letterSpacing: "-0.5px", paintOrder: "stroke" }}
                  stroke={isMyLanded ? "none" : "#0004"}
                  strokeWidth="2"
                >
                  {label}
                </text>
              </g>
            );
          })}

          <circle cx={cx} cy={cy} r={46} fill="#0d0d1a" stroke="#fbbf24" strokeWidth={6} />
          <circle cx={cx} cy={cy} r={38} fill="#16161f" />
          <text x={cx} y={cy} fill="#fbbf24" fontSize={60} fontWeight="900"
            textAnchor="middle" dominantBaseline="middle">🎡</text>
        </svg>

        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: 80,
          background: "linear-gradient(to top, #07070f, transparent)",
          pointerEvents: "none",
        }} />
      </div>

      {/* ── Resultado de cada aleta cuando aterrizó ── */}
      {landedIndexes && phase !== "choose" && (
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 10 }}>
          {FLAPPERS.map(f => {
            const idx = landedIndexes[f.id];
            const val = currentMults[idx];
            const isChosen = f.id === chosen;
            return (
              <div key={f.id} style={{
                background: isChosen ? f.color + "22" : "#1e1e2e",
                border: `2px solid ${isChosen ? f.color : "#2a2a3a"}`,
                borderRadius: 10,
                padding: "8px 14px",
                textAlign: "center",
                minWidth: 80,
                opacity: isChosen ? 1 : 0.5,
              }}>
                <div style={{ color: f.color, fontWeight: 700, fontSize: 20 }}>{f.label}</div>
                <div style={{ color: "#fff", fontWeight: 900, fontSize: 20 }}>
                  {val === "DOUBLE" ? "x2" : val === "TRIPLE" ? "x3" : `${val}X`}
                </div>
                {isChosen && <div style={{ color: "#fbbf24", fontSize: 20 }}>← tu aleta</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Mensajes ── */}
      <div style={{ minHeight: 60, textAlign: "center" }}>
        {spinning && <div style={{ color: "#aaa", fontSize: 20 }}>🌀 La ruleta está girando...</div>}
        {!spinning && landedIndexes && chosen && (() => {
          const myVal = currentMults[landedIndexes[chosen]];
          if (myVal === "DOUBLE" || myVal === "TRIPLE") {
            return (
              <div style={{ fontSize: 20, fontWeight: 900, color: myVal === "DOUBLE" ? "#e84747" : "#f5a623" }}>
                {myVal === "DOUBLE" ? "×2 DOUBLE" : "×3 TRIPLE"} — ¡Volviendo a girar con valores multiplicados!
              </div>
            );
          }
          return null;
        })()}
        {phase === "result" && finalResult && (
          <>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#fbbf24" }}>
              {finalResult >= 1000 ? `${(finalResult / 1000).toFixed(0)}k` : finalResult}x
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#7ed321", marginTop: 4 }}>
              🎉 +{(bet * finalResult).toLocaleString()} fichas
            </div>
          </>
        )}
      </div>
    </div>
  );
}




// ─── MAIN WHEEL COMPONENT ────────────────────────────────────────────────────
// En el componente MainWheel, acepta el prop:
function MainWheel({ wheelRef }) {
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <div style={{ position: "absolute", top: -35, left: "50%",
        transform: "translateX(-50%)", zIndex: 20, fontSize: 80,
        filter: "drop-shadow(0 2px 8px rgba(255,200,0,0.8))" }}>🔻</div>
      <img
        ref={wheelRef}                    // ← ref aquí
        src="/CrazyTime.png"
        alt="CrazyTime"
        style={{
          width: 600, height: 600,
          borderRadius: "50%",
          border: "3px solid #8b6914",
          boxShadow: "0 0 32px #ff6b0055",
          transformOrigin: "center center",
          // SIN transform ni transition — los maneja el animFrame
        }}
      />
    </div>
  );
}

// ─── TOP SLOT ─────────────────────────────────────────────────────────────────
function TopSlot({ result }) {
  if (!result) return (
    <div style={{
      background: "#1e1e2e",
      border: "2px solid #2a2a3a",
      borderRadius: 12,
      padding: "10px 20px",
      textAlign: "center",
      marginBottom: 12,
    }}>
      <div style={{ color: "#555", fontSize: 13 }}>TOP SLOT</div>
      <div style={{ color: "#333", fontSize: 20, fontWeight: 700 }}>— × —</div>
    </div>
  );

  return (
    <div style={{
      background: "linear-gradient(135deg, #1e1e2e, #2a1a3e)",
      border: `2px solid ${SEGMENT_INFO[result.segment]?.color || "#fbbf24"}`,
      borderRadius: 12,
      padding: "10px 20px",
      textAlign: "center",
      marginBottom: 12,
      animation: "pulse 0.5s ease",
    }}>
      <div style={{ color: "#aaa", fontSize: 11, letterSpacing: 2 }}>TOP SLOT</div>
      <div style={{ fontSize: 20, fontWeight: 900, color: SEGMENT_INFO[result.segment]?.color || "#fbbf24" }}>
        {SEGMENT_INFO[result.segment]?.emoji} {SEGMENT_INFO[result.segment]?.label}
        <span style={{ color: "#fff", marginLeft: 8 }}>× {result.multiplier}x</span>
      </div>
    </div>
  );
}


// ─── MAIN GAME ────────────────────────────────────────────────────────────────
export default function CrazyTimeGame({ balance, setBalance, onBack }) {
  const [bets, setBets]               = useState({});
  const [betInput, setBetInput]       = useState("1000");
  const [spinning, setSpinning]       = useState(false);
  const [topSlotResult, setTopSlotResult] = useState(null);
  const [landedSegment, setLandedSegment] = useState(null);
  const [bonus, setBonus]             = useState(null);
  const [message, setMessage]         = useState(null);
  const [history, setHistory]         = useState([]);
  const [phase, setPhase]             = useState("betting");
  const [pendingBets, setPendingBets] = useState({});




  //const [showIntro, setShowIntro] = useState(true);
  const [showCrazyTimeDoor, setShowCrazyTimeDoor] = useState(false);


  // Cargar últimos 20 registros globales para el historial visual
useEffect(() => {
  supabase.from("crazytime_history")
    .select("segment, won, payout")
    .order("created_at", { ascending: false })
    .limit(20)
    .then(({ data }) => {
      if (data) setHistory(data.map(h => ({
        type: h.segment, win: h.won, amount: h.payout,
      })));
    });
}, []);

// Cargar conteo total de todos los registros para proporciones
const [segmentCounts, setSegmentCounts] = useState({});
const [totalCount, setTotalCount]       = useState(0);

useEffect(() => {
  supabase.from("crazytime_history")
    .select("segment")
    .then(({ data }) => {
      if (!data) return;
      const counts = {};
      data.forEach(h => { counts[h.segment] = (counts[h.segment] || 0) + 1; });
      setSegmentCounts(counts);
      setTotalCount(data.length);
    });
}, [history]); // se recalcula cuando cambia el historial


const totalPending = Object.values(pendingBets).reduce((a, b) => a + b, 0); 
  const rotRef   = useRef(0);
const wheelRef = useRef(null);
const animRef  = useRef(null);


function placeBet(type) {
  const amount = parseInt(betInput) || 1000;
  if (amount <= 0) return;
  setPendingBets(prev => ({ ...prev, [type]: (prev[type] || 0) + amount }));
}


function clearBets() {
  setPendingBets({});
}


  const activeBetsRef = useRef({});


function spin() {
  if (totalPending === 0 || spinning) return;
  if (totalPending > balance) { setMessage("❌ Saldo insuficiente"); return; }
  const activeBets = { ...pendingBets };
  activeBetsRef.current = activeBets;

  setBalance(prev => prev - totalPending);
  
  setBets(activeBets);
  setPendingBets({});

  setSpinning(true);
  setPhase("spinning");
  setLandedSegment(null);
  setTopSlotResult(null);
  setMessage(null);

  const tsSegment = SEGMENT_TYPES[Math.floor(Math.random() * SEGMENT_TYPES.length)];
  const tsMult    = TOP_SLOT_MULTIPLIERS[Math.floor(Math.random() * TOP_SLOT_MULTIPLIERS.length)];
  const tsRes     = { segment: tsSegment, multiplier: tsMult };
  setTimeout(() => setTopSlotResult(tsRes), 500);

  const SEG = 360 / WHEEL_SEGMENTS.length;
  const targetIdx = Math.floor(Math.random() * WHEEL_SEGMENTS.length);

  // Centro del segmento destino en coordenadas de la rueda (sin rotar)
  const segCenter = targetIdx * SEG + SEG / 2;

  // Rotación actual normalizada a [0, 360)
  const currentMod = ((rotRef.current % 360) + 360) % 360;

  // Rotación necesaria para que segCenter quede en 0° (arriba)
  const targetMod = (360 - (segCenter % 360)) % 360;

  // Delta mínimo para llegar al destino desde la posición actual
  let delta = ((targetMod - currentMod) + 360) % 360;
  if (delta < SEG) delta += 360; // evitar ángulo casi-cero

  const extraSpins = 5 + Math.floor(Math.random() * 4);
  const totalDeg   = extraSpins * 360 + delta;
  const startAngle = rotRef.current;
  rotRef.current   = rotRef.current + totalDeg;

  const DURATION = 5000;
  const t0 = performance.now();
  cancelAnimationFrame(animRef.current);

  function frame(now) {
    const t     = Math.min(1, (now - t0) / DURATION);
    const eased = 1 - Math.pow(1 - t, 4);
    const angle = startAngle + totalDeg * eased;

    if (wheelRef.current)
      wheelRef.current.style.transform = `rotate(${angle}deg)`;

    if (t < 1) {
      animRef.current = requestAnimationFrame(frame);
      return;
    }

    setSpinning(false);
    const landed = WHEEL_SEGMENTS[targetIdx];
    setLandedSegment({ ...landed, index: targetIdx });

    const userBetOnLanded = activeBetsRef.current[landed.type] || 0;
    const isBonus = ["coin_flip","cash_hunt","pachinko","crazy_time"].includes(landed.type);
/*
    if (isBonus && userBetOnLanded > 0) {
      setPhase("bonus");
      setBonus({ type: landed.type, bet: userBetOnLanded });
    } 
    
    */
    
    
    if (isBonus && userBetOnLanded > 0) {
  if (landed.type === "crazy_time") {
    // Mostrar la animación de puerta ANTES de abrir el minijuego
    setShowCrazyTimeDoor(true);
  } else {
    setPhase("bonus");
    setBonus({ type: landed.type, bet: userBetOnLanded });
  }   //el else { de abajo iba acompañando al componente comentado arriba
} else {
      let winnings = 0;
      const numValue = parseInt(landed.type);
      if (!isNaN(numValue) && userBetOnLanded > 0) {
        let mult = numValue;
        if (tsRes.segment === landed.type) mult *= tsRes.multiplier;
        winnings = userBetOnLanded * mult + userBetOnLanded;
      }

      setBalance(prev => prev + winnings);
const info = SEGMENT_INFO[landed.type];
setMessage(winnings > 0
  ? `✅ ¡Cayó ${info?.label}! Ganaste ${winnings.toLocaleString()} fichas!`
  : `❌ Cayó ${info?.label}. Sin premio esta ronda.`
);
const newEntry = { type: landed.type, win: winnings > 0, amount: winnings };
setHistory(h => [newEntry, ...h.slice(0, 19)]);

  supabase.auth.getSession().then(async ({ data: { session } }) => {
  await supabase.rpc("insert_crazytime_and_trim", {
  p_user_id:    session.user.id,
  p_segment:    landed.type,
  p_won:        winnings > 0,
  p_payout:     winnings,
  p_multiplier: winnings > 0 ? parseInt(landed.type) : 0,
});
});

setBets({});
setPhase("result");
setTimeout(() => { setPhase("betting"); setMessage(null); }, 3000);
    }
  }

  animRef.current = requestAnimationFrame(frame);
}

  // ── En handleBonusComplete ──
function handleBonusComplete(payout, mult, ...args) {
  setBalance(prev => prev + payout + (bets[bonus.type] || 0));
  const newEntry = { type: bonus.type, win: payout > 0, amount: payout };
  setHistory(h => [newEntry, ...h.slice(0, 19)]);
  supabase.auth.getSession().then(async ({ data: { session } }) => {

  await supabase.rpc("insert_crazytime_and_trim", {
  p_user_id:    session.user.id,
  p_segment:    bonus.type,
  p_won:        payout > 0,
  p_payout:     payout + (bets[bonus.type] || 0),
  p_multiplier: mult || 0,
});

});


  setBonus(null);
  setBets({});
  setPhase("result");
  setMessage(payout > 0
    ? `🎉 ¡Bonificación completada! +${payout.toLocaleString()} fichas (${mult}x)`
    : "❌ Sin premio en el bonificador."
  );
  setTimeout(() => { setPhase("betting"); setMessage(null); }, 3500);
}

  return (


<>
    {/*{showIntro && <CrazyTimeDoor onComplete={() => setShowIntro(false)} />}{*/}

    {showCrazyTimeDoor && (
      <CrazyTimeDoor onComplete={() => {
        setShowCrazyTimeDoor(false);
        setPhase("bonus");
        setBonus({ type: "crazy_time", bet: activeBetsRef.current["crazy_time"] || 0 });
      }} />
    )}











    <div style={styles.wrap}>
      <style>{`
        @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
        @keyframes glow { 0%,100%{box-shadow:0 0 10px #ff6b00} 50%{box-shadow:0 0 30px #ff6b00,0 0 60px #ff6b00} }
        @keyframes shimmer { 0%{opacity:0.7} 50%{opacity:1} 100%{opacity:0.7} }
      `}</style>

      {/* Header */}
      <div style={styles.header}>
        <button onClick={onBack} style={styles.backBtn}>← Volver</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: "#ff6b00", letterSpacing: -1 }}>💥 CRAZY TIME</div>
          <div style={{ color: "#fbbf24", fontSize: 15 }}>¡El juego más loco del casino!</div>
        </div>
        <div style={styles.balancePill}>💰 {balance.toLocaleString()}</div>
      </div>

      {/* Bonus overlay */}
      {bonus && (
        <div style={styles.bonusOverlay}>
          {bonus.type === "coin_flip" && <CoinFlipBonus bet={bonus.bet} onComplete={handleBonusComplete} />}
          {bonus.type === "cash_hunt" && (
  <CashHuntBonus
    bet={bonus.bet}
    topSlotMult={topSlotResult?.segment === "cash_hunt" ? topSlotResult.multiplier : 1}
    onComplete={handleBonusComplete}
  />
)}
          {bonus.type === "pachinko" && (
      <PachinkoBonus
        bet={bonus.bet}
        topSlotMult={topSlotResult?.segment === "pachinko" ? topSlotResult.multiplier : 1}
        onComplete={handleBonusComplete}
      />
    )}
          {bonus.type === "crazy_time" && <CrazyTimeBonus bet={bonus.bet} onComplete={handleBonusComplete} />}
        </div>
      )}

      {/* Top Slot */}
      <TopSlot result={topSlotResult} />

      {/* Message */}
      {message && (
        <div style={{
          background: message.startsWith("✅") || message.startsWith("🎉") ? "#0d2e1a" : "#2e0d0d",
          border: `1px solid ${message.startsWith("✅") || message.startsWith("🎉") ? "#7ed321" : "#e84747"}`,
          borderRadius: 10,
          padding: "10px 16px",
          textAlign: "center",
          fontSize: 15,
          fontWeight: 700,
          marginBottom: 12,
          animation: "pulse 0.5s ease",
        }}>
          {message}
        </div>
      )}

      {/* Wheel + Betting */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {/* Wheel */}
        <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <MainWheel wheelRef={wheelRef} />

          {landedSegment && (
            <div style={{
              marginTop: 8,
              background: SEGMENT_INFO[landedSegment.type]?.color + "22",
              border: `2px solid ${SEGMENT_INFO[landedSegment.type]?.color}`,
              borderRadius: 10,
              padding: "6px 16px",
              color: SEGMENT_INFO[landedSegment.type]?.color,
              fontWeight: 700,
              fontSize: 16,
              animation: "pulse 0.5s ease",
            }}>
              {SEGMENT_INFO[landedSegment.type]?.emoji} {SEGMENT_INFO[landedSegment.type]?.label}
            </div>
          )}
        </div>


        {/* Betting Panel */}
        <div style={{ flex: 1, minWidth: 260 }}>
          {/* Bet amount */}
          <div style={styles.card}>
            <div style={styles.sectionTitle}>💵 Monto de apuesta</div>

            {/* Selector de fichas */}
<div style={styles.card}>
  <div style={styles.sectionTitle}>🪙 Ficha activa</div>
  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
    {[500, 1000, 5000, 10000, 50000, 100000].map(v => (
      <button
        key={v}
        onClick={() => setBetInput(String(v))}
        style={{
          ...styles.quickBtn,
          background: betInput === String(v) ? "#ff6b00" : "#0d0d14",
          color: betInput === String(v) ? "#fff" : "#aaa",
          border: betInput === String(v) ? "2px solid #ff9500" : "1px solid #2a2a3a",
          fontWeight: betInput === String(v) ? 700 : 400,
          padding: "8px 12px",
          borderRadius: 20,
          fontSize: 20,
        }}
      >
        {v >= 1000 ? `${v / 1000}k` : v}
      </button>
    ))}
  </div>
</div>

          </div>

          {/* Segments to bet on */}
<div style={styles.card}>
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
    <div style={styles.sectionTitle}>🎲 Apostar en segmento</div>

    {/* Botones rápidos al lado del título */}
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {/* Botón: apostar en todos los multiplicadores */}
      <button
        onClick={() => {
          if (phase !== "betting") return;
          ["1","2","5","10"].forEach(t => placeBet(t));
        }}
        disabled={phase !== "betting"}
        style={{
          background: "#0d0d14",
          border: "1px solid #3a7bd5",
          borderRadius: 6,
          padding: "4px 8px",
          color: "#3a7bd5",
          fontSize: 20,
          fontWeight: 700,
          cursor: phase === "betting" ? "pointer" : "default",
          whiteSpace: "nowrap",
        }}
      >
        1️⃣2️⃣5️⃣🔟
      </button>

      <div style={{ width: 1, height: 20, background: "#2a2a3a" }} />

      {/* Botón: apostar en todos los bonus */}
      <button
        onClick={() => {
          if (phase !== "betting") return;
          ["coin_flip","cash_hunt","pachinko","crazy_time"].forEach(t => placeBet(t));
        }}
        disabled={phase !== "betting"}
        style={{
          background: "#0d0d14",
          border: "1px solid #ff6b00",
          borderRadius: 6,
          padding: "4px 8px",
          color: "#ff6b00",
          fontSize: 20,
          fontWeight: 700,
          cursor: phase === "betting" ? "pointer" : "default",
          whiteSpace: "nowrap",
        }}
      >
        🪙🎯🎳🎡
      </button>
    </div>
  </div>

  {/* Grid de segmentos */}
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
    {SEGMENT_TYPES.map(type => {
      const info = SEGMENT_INFO[type];
      const myBet = pendingBets[type] || 0;
      return (
        <button
          key={type}
          onClick={() => phase === "betting" && placeBet(type)}
          disabled={phase !== "betting"}
          style={{
            background: myBet > 0 ? info.color + "33" : "#1e1e2e",
            border: `2px solid ${myBet > 0 ? info.color : "#2a2a3a"}`,
            borderRadius: 10,
            padding: "10px 8px",
            cursor: phase === "betting" ? "pointer" : "default",
            textAlign: "center",
            transition: "all 0.2s",
          }}
        >
          <div style={{ fontSize: 32 }}>{info.emoji}</div>
          <div style={{ color: info.color, fontWeight: 700, fontSize: 13 }}>{info.label}</div>
          {myBet > 0 && (
            <div style={{ color: "#fbbf24", fontSize: 11, marginTop: 2 }}>
              {myBet.toLocaleString()}
            </div>
          )}
        </button>
      );
    })}
  </div>
</div>

          {/* Action buttons */}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
  <button
    onClick={clearBets}
    disabled={totalPending === 0 || phase !== "betting"}
    style={{ ...styles.btn, background: "#2a2a3a", flex: 1 }}
  >
    🗑 Borrar
  </button>
  <button
    onClick={spin}
    disabled={totalPending === 0 || phase !== "betting"}
    style={{
      ...styles.btn,
      flex: 2,
      background: totalPending > 0 && phase === "betting"
        ? "linear-gradient(135deg, #ff6b00, #ff9500)"
        : "#2a2a3a",
      animation: totalPending > 0 && phase === "betting" ? "glow 2s infinite" : "none",
    }}
  >
    {spinning ? "🌀 Girando..." : `🎡 Girar (${totalPending.toLocaleString()})`}
  </button>
</div>
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
  <div style={{ ...styles.card, marginTop: 16 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
      <div style={styles.sectionTitle}>
        📜 Historial reciente
        <span style={{ color: "#c8c8c8", fontSize: 15, fontWeight: 400, marginLeft: 8 }}>
          (proporciones sobre {totalCount} tiradas totales)
        </span>
      </div>

      {/* Proporciones globales */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {Object.entries(segmentCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([type, count]) => {
            const info = SEGMENT_INFO[type];
            if (!info) return null;
            const pct = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
            return (
              <div key={type} style={{
                background: info.color + "22",
                border: `1px solid ${info.color}66`,
                borderRadius: 6, padding: "2px 8px",
                fontSize: 15, color: info.color, fontWeight: 700,
                display: "flex", alignItems: "center", gap: 4,
              }}>
                {info.emoji} {pct}%
              </div>
            );
          })}
      </div>
    </div>

    {/* Últimos 20 registros globales */}
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {history.map((h, i) => {
        const info = SEGMENT_INFO[h.type];
        if (!info) return null;
        return (
          <div key={i} style={{
            background: h.win ? info.color + "22" : "#1e1e2e",
            border: `1px solid ${h.win ? info.color : "#2a2a3a"}`,
            borderRadius: 8, padding: "6px 10px",
            fontSize: 20, textAlign: "center",
          }}>
            <div>{info.emoji}</div>
            <div style={{ color: h.win ? "#7ed321" : "#666", fontWeight: 700 }}>
              {h.win ? `+${h.amount.toLocaleString()}` : "❌"}
            </div>
          </div>
        );
      })}
    </div>
  </div>
)}
        {/* RTP info */}
        <div style={{ color: "#333", fontSize: 11, textAlign: "center", marginTop: 16 }}>
          RTP teórico: 95.41% · Juega responsablemente 🎰
        </div>


  </div>
    </>
    );






}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = {
  wrap: { maxWidth: 2000, margin: "0 auto", fontFamily: "'Georgia', serif", color: "#fff" },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    marginBottom: 16, background: "#16161f", borderRadius: 12,
    padding: "12px 16px", border: "1px solid #ff6b0033",
  },
  backBtn: {
    background: "transparent", border: "1px solid #2a2a3a", borderRadius: 8,
    color: "#aaa", fontSize: 13, padding: "6px 12px", cursor: "pointer",
  },
  balancePill: {
    background: "#1e1e2e", border: "1px solid #fbbf2444", borderRadius: 20,
    padding: "6px 14px", fontSize: 13, fontWeight: 700, color: "#fbbf24",
  },
  card: {
    background: "#16161f", border: "1px solid #1e1e2e", borderRadius: 12,
    padding: "12px 14px", marginBottom: 10,
  },
  sectionTitle: { color: "#ffffff", fontSize: 15, letterSpacing: 1, marginBottom: 8, textTransform: "uppercase" },
  input: {
    width: "100%", background: "#0d0d14", border: "1px solid #2a2a3a",
    borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 16,
    boxSizing: "border-box", outline: "none",
  },
  quickBtn: {
    background: "#0d0d14", border: "1px solid #2a2a3a", borderRadius: 6,
    color: "#aaa", fontSize: 12, padding: "5px 10px", cursor: "pointer",
  },
  btn: {
    border: "none", borderRadius: 10, padding: "14px 16px",
    color: "#fff", fontSize: 20, fontWeight: 700, cursor: "pointer",
    transition: "all 0.2s",
  },
  bonusOverlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)",
    zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
    padding: 16,
  },
};

const bonusStyles = {
  wrap: {
    background: "#16161f", border: "1px solid #2a2a3a", borderRadius: 16,
    padding: 24, maxWidth: 560, width: "100%", maxHeight: "90vh", overflowY: "auto",
  },
  title: {
    fontSize: 24, fontWeight: 900, textAlign: "center", marginBottom: 12,
    color: "#fbbf24", letterSpacing: -0.5,
  },
  coinSide: {
    borderRadius: 12, padding: "16px 24px", textAlign: "center",
    cursor: "pointer", transition: "all 0.2s", minWidth: 100,
  },
  actionBtn: {
    display: "block", margin: "0 auto", background: "linear-gradient(135deg, #ff6b00, #ff9500)",
    border: "none", borderRadius: 10, padding: "14px 32px",
    color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer",
  },
};