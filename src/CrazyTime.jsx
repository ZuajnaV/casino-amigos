import { useState, useEffect, useRef, useCallback } from "react";

// ─── WHEEL CONFIGURATION ────────────────────────────────────────────────────
// 54 segments in order matching the real Crazy Time wheel
const WHEEL_SEGMENTS = [
  { type: "1", label: "1", color: "#3a7bd5", textColor: "#fff" },
  { type: "2", label: "2", color: "#f7c948", textColor: "#000" },
  { type: "1", label: "1", color: "#e8e8e8", textColor: "#000" },
  { type: "coin_flip", label: "COIN\nFLIP", color: "#e84393", textColor: "#fff" },
  { type: "1", label: "1", color: "#3a7bd5", textColor: "#fff" },
  { type: "2", label: "2", color: "#f7c948", textColor: "#000" },
  { type: "5", label: "5", color: "#7ed321", textColor: "#fff" },
  { type: "1", label: "1", color: "#e8e8e8", textColor: "#000" },
  { type: "cash_hunt", label: "CASH\nHUNT", color: "#f5a623", textColor: "#fff" },
  { type: "1", label: "1", color: "#3a7bd5", textColor: "#fff" },
  { type: "2", label: "2", color: "#f7c948", textColor: "#000" },
  { type: "1", label: "1", color: "#e8e8e8", textColor: "#000" },
  { type: "coin_flip", label: "COIN\nFLIP", color: "#e84393", textColor: "#fff" },
  { type: "1", label: "1", color: "#3a7bd5", textColor: "#fff" },
  { type: "10", label: "10", color: "#d0021b", textColor: "#fff" },
  { type: "1", label: "1", color: "#e8e8e8", textColor: "#000" },
  { type: "2", label: "2", color: "#f7c948", textColor: "#000" },
  { type: "pachinko", label: "PACHI-\nNKO", color: "#9b59b6", textColor: "#fff" },
  { type: "1", label: "1", color: "#3a7bd5", textColor: "#fff" },
  { type: "2", label: "2", color: "#f7c948", textColor: "#000" },
  { type: "1", label: "1", color: "#e8e8e8", textColor: "#000" },
  { type: "5", label: "5", color: "#7ed321", textColor: "#fff" },
  { type: "coin_flip", label: "COIN\nFLIP", color: "#e84393", textColor: "#fff" },
  { type: "1", label: "1", color: "#3a7bd5", textColor: "#fff" },
  { type: "2", label: "2", color: "#f7c948", textColor: "#000" },
  { type: "1", label: "1", color: "#e8e8e8", textColor: "#000" },
  { type: "crazy_time", label: "CRAZY\nTIME", color: "#ff6b00", textColor: "#fff" },
  { type: "1", label: "1", color: "#3a7bd5", textColor: "#fff" },
  { type: "2", label: "2", color: "#f7c948", textColor: "#000" },
  { type: "5", label: "5", color: "#7ed321", textColor: "#fff" },
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
  { type: "5", label: "5", color: "#7ed321", textColor: "#fff" },
  { type: "1", label: "1", color: "#e8e8e8", textColor: "#000" },
  { type: "1", label: "1", color: "#3a7bd5", textColor: "#fff" },
  { type: "pachinko", label: "PACHI-\nNKO", color: "#9b59b6", textColor: "#fff" },
  { type: "1", label: "1", color: "#e8e8e8", textColor: "#000" },
  { type: "2", label: "2", color: "#f7c948", textColor: "#000" },
  { type: "1", label: "1", color: "#3a7bd5", textColor: "#fff" },
  { type: "5", label: "5", color: "#7ed321", textColor: "#fff" },
  { type: "coin_flip", label: "COIN\nFLIP", color: "#e84393", textColor: "#fff" },
  { type: "1", label: "1", color: "#e8e8e8", textColor: "#000" },
  { type: "2", label: "2", color: "#f7c948", textColor: "#000" },
  { type: "1", label: "1", color: "#3a7bd5", textColor: "#fff" },
  { type: "10", label: "10", color: "#d0021b", textColor: "#fff" },
  { type: "1", label: "1", color: "#e8e8e8", textColor: "#000" },
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
  const [phase, setPhase] = useState("reveal"); // reveal → result
  const [redMult] = useState(() => TOP_SLOT_MULTIPLIERS[Math.floor(Math.random() * TOP_SLOT_MULTIPLIERS.length)]);
  const [blueMult] = useState(() => TOP_SLOT_MULTIPLIERS[Math.floor(Math.random() * TOP_SLOT_MULTIPLIERS.length)]);
  const [chosen, setChosen] = useState(null);
  const [result, setResult] = useState(null);
  const [flipping, setFlipping] = useState(false);
  const WHEEL_OFFSET = 0;
  const rotRef = useRef(0);

  function selectColor(color) {
    if (chosen) return;
    setChosen(color);
  }

  function flip() {
    if (!chosen || flipping) return;
    setFlipping(true);
    setTimeout(() => {
      const landed = Math.random() < 0.5 ? "red" : "blue";
      setResult(landed);
      setFlipping(false);
    }, 1800);
  }

  useEffect(() => {
    if (result !== null) {
      const mult = result === "red" ? redMult : blueMult;
      const won = result === chosen;
      setTimeout(() => onComplete(won ? bet * mult : 0, mult, result, chosen), 2000);
    }
  }, [result]);

  return (
    <div style={bonusStyles.wrap}>
      <div style={bonusStyles.title}>🪙 COIN FLIP</div>
      <div style={{ color: "#aaa", marginBottom: 20, fontSize: 14 }}>
        Elige un color y lanza la moneda
      </div>

      <div style={{ display: "flex", gap: 20, justifyContent: "center", marginBottom: 30 }}>
        <div
          onClick={() => selectColor("red")}
          style={{
            ...bonusStyles.coinSide,
            background: "linear-gradient(135deg, #e84747, #a00)",
            border: chosen === "red" ? "4px solid #fff" : "4px solid transparent",
            transform: chosen === "red" ? "scale(1.1)" : "scale(1)",
          }}
        >
          <div style={{ fontSize: 32 }}>🔴</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{redMult}x</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>ROJO</div>
        </div>
        <div
          onClick={() => selectColor("blue")}
          style={{
            ...bonusStyles.coinSide,
            background: "linear-gradient(135deg, #4785e8, #005faa)",
            border: chosen === "blue" ? "4px solid #fff" : "4px solid transparent",
            transform: chosen === "blue" ? "scale(1.1)" : "scale(1)",
          }}
        >
          <div style={{ fontSize: 32 }}>🔵</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{blueMult}x</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>AZUL</div>
        </div>
      </div>

      {chosen && !result && (
        <button onClick={flip} disabled={flipping} style={bonusStyles.actionBtn}>
          {flipping ? "🪙 Lanzando..." : "🚀 Lanzar Moneda"}
        </button>
      )}

      {result && (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48 }}>{result === "red" ? "🔴" : "🔵"}</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 8 }}>
            {result === chosen
              ? <span style={{ color: "#7ed321" }}>✅ ¡Ganaste {result === "red" ? redMult : blueMult}x!</span>
              : <span style={{ color: "#e84747" }}>❌ Perdiste</span>
            }
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CASH HUNT BONUS ─────────────────────────────────────────────────────────
const CASH_HUNT_SYMBOLS = ["🐰", "🎩", "⭐", "🎪", "🎭", "🍀", "🎲", "🎯", "🌟", "🦋", "🎨", "🔮", "🎸", "🌈", "🦄"];

function CashHuntBonus({ bet, onComplete }) {
  const GRID_SIZE = 108;
  const COLS = 12;

  const [multipliers] = useState(() => {
    const mults = [];
    for (let i = 0; i < GRID_SIZE; i++) {
      mults.push(Math.floor(Math.random() * 200) + 5);
    }
    return mults;
  });

  const [symbols] = useState(() => {
    return Array.from({ length: GRID_SIZE }, () =>
      CASH_HUNT_SYMBOLS[Math.floor(Math.random() * CASH_HUNT_SYMBOLS.length)]
    );
  });

  const [chosen, setChosen] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [timeLeft, setTimeLeft] = useState(20);

  useEffect(() => {
    if (revealed) return;
    const t = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(t);
          if (chosen === null) onComplete(0, 0);
          else setRevealed(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [revealed, chosen]);

  useEffect(() => {
    if (revealed && chosen !== null) {
      const mult = multipliers[chosen];
      setTimeout(() => onComplete(bet * mult, mult), 2500);
    }
  }, [revealed]);

  function shoot() {
    if (chosen === null) { onComplete(0, 0); return; }
    setRevealed(true);
  }

  return (
    <div style={bonusStyles.wrap}>
      <div style={bonusStyles.title}>🎯 CASH HUNT</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ color: "#aaa", fontSize: 13 }}>Elige un objetivo para disparar</div>
        <div style={{
          background: timeLeft <= 5 ? "#e84747" : "#1e1e2e",
          border: "1px solid #333",
          borderRadius: 8,
          padding: "4px 12px",
          color: timeLeft <= 5 ? "#fff" : "#fbbf24",
          fontWeight: 700,
          fontSize: 18,
        }}>⏱ {timeLeft}s</div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${COLS}, 1fr)`,
        gap: 3,
        marginBottom: 16,
        maxWidth: 500,
        margin: "0 auto 16px",
      }}>
        {symbols.map((sym, i) => (
          <div
            key={i}
            onClick={() => !revealed && setChosen(i)}
            style={{
              fontSize: 18,
              width: 38,
              height: 38,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 6,
              cursor: revealed ? "default" : "crosshair",
              background: revealed
                ? (i === chosen ? "#7ed321" : "#1a1a2e")
                : chosen === i ? "#fbbf2444" : "#1a1a2e",
              border: chosen === i ? "2px solid #fbbf24" : "2px solid #2a2a3a",
              transition: "all 0.2s",
              position: "relative",
            }}
          >
            {revealed ? (
              <span style={{ fontSize: 12, fontWeight: 700, color: i === chosen ? "#000" : "#888" }}>
                {multipliers[i]}x
              </span>
            ) : sym}
          </div>
        ))}
      </div>

      {!revealed && (
        <button onClick={shoot} style={bonusStyles.actionBtn}>
          🎯 ¡Disparar!
        </button>
      )}

      {revealed && chosen !== null && (
        <div style={{ textAlign: "center", fontSize: 22, fontWeight: 700, color: "#7ed321" }}>
          ✅ ¡Ganaste {multipliers[chosen]}x! (+{(bet * multipliers[chosen]).toLocaleString()})
        </div>
      )}
    </div>
  );
}

// ─── PACHINKO BONUS ──────────────────────────────────────────────────────────
function PachinkoBonus({ bet, onComplete }) {
  const SLOTS = 10;
  const [baseMults] = useState(() =>
    Array.from({ length: SLOTS }, (_, i) => {
      if (i === SLOTS - 1) return "DOUBLE";
      return [2, 3, 5, 8, 10, 15, 20, 25, 50][Math.floor(Math.random() * 9)];
    })
  );
  const [mults, setMults] = useState(baseMults);
  const [ballPos, setBallPos] = useState(50); // percent
  const [dropping, setDropping] = useState(false);
  const [landed, setLanded] = useState(null);
  const [doublesCount, setDoublesCount] = useState(0);
  const [ballY, setBallY] = useState(0);

  function drop() {
    if (dropping) return;
    setDropping(true);
    setBallY(0);
    setBallPos(50);
    let pos = 50;

    const steps = 20;
    let step = 0;
    const interval = setInterval(() => {
      step++;
      pos += (Math.random() - 0.5) * 15;
      pos = Math.max(5, Math.min(95, pos));
      setBallPos(pos);
      setBallY(step * (100 / steps));

      if (step >= steps) {
        clearInterval(interval);
        const slot = Math.min(SLOTS - 1, Math.floor(pos / (100 / SLOTS)));
        setLanded(slot);
        setDropping(false);

        const value = mults[slot];
        if (value === "DOUBLE") {
          setDoublesCount(d => d + 1);
          const newMults = mults.map(m => (m === "DOUBLE" ? "DOUBLE" : m * 2));
          setMults(newMults);
          setTimeout(() => {
            setLanded(null);
            setBallY(0);
            drop();
          }, 1500);
        } else {
          setTimeout(() => onComplete(bet * value, value), 2000);
        }
      }
    }, 120);
  }

  useEffect(() => { drop(); }, []);





useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  return (
    <div style={bonusStyles.wrap}>
      <div style={bonusStyles.title}>🎳 PACHINKO</div>
      {doublesCount > 0 && (
        <div style={{ color: "#fbbf24", textAlign: "center", marginBottom: 8, fontWeight: 700 }}>
          🔥 ×2 aplicado {doublesCount} {doublesCount === 1 ? "vez" : "veces"}
        </div>
      )}

      {/* Ball */}
      <div style={{ position: "relative", height: 200, background: "#0d0d14", borderRadius: 12, marginBottom: 12, overflow: "hidden", border: "1px solid #2a2a3a" }}>
        {/* Pins */}
        {Array.from({ length: 5 }, (_, row) => (
          Array.from({ length: 8 - (row % 2) }, (_, col) => (
            <div key={`${row}-${col}`} style={{
              position: "absolute",
              width: 8, height: 8,
              background: "#4a4a6a",
              borderRadius: "50%",
              left: `${(row % 2 === 0 ? 6 : 12) + col * 12}%`,
              top: `${15 + row * 16}%`,
            }} />
          ))
        ))}

        {/* Ball */}
        <div style={{
          position: "absolute",
          width: 20, height: 20,
          background: "radial-gradient(circle at 35% 35%, #fff, #fbbf24)",
          borderRadius: "50%",
          left: `${ballPos - 2}%`,
          top: `${ballY}%`,
          transition: "top 0.12s, left 0.12s",
          zIndex: 10,
          boxShadow: "0 0 8px #fbbf24",
        }} />
      </div>

      {/* Slots */}
      <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
        {mults.map((m, i) => (
          <div key={i} style={{
            flex: 1,
            padding: "8px 2px",
            background: landed === i ? "#fbbf24" : m === "DOUBLE" ? "#e84747" : "#1e1e2e",
            border: landed === i ? "2px solid #fff" : "2px solid #2a2a3a",
            borderRadius: 6,
            textAlign: "center",
            color: landed === i ? "#000" : m === "DOUBLE" ? "#fff" : "#ccc",
            fontSize: 10,
            fontWeight: 700,
            transition: "all 0.3s",
          }}>
            {m === "DOUBLE" ? "×2" : `${m}x`}
          </div>
        ))}
      </div>

      {landed !== null && mults[landed] !== "DOUBLE" && (
        <div style={{ textAlign: "center", fontSize: 22, fontWeight: 700, color: "#7ed321", marginTop: 12 }}>
          ✅ ¡{mults[landed]}x! (+{(bet * mults[landed]).toLocaleString()})
        </div>
      )}
      {dropping && (
        <div style={{ textAlign: "center", color: "#aaa", fontSize: 13, marginTop: 8 }}>
          🔮 El disco está cayendo...
        </div>
      )}
    </div>
  );
}

// ─── CRAZY TIME BONUS ─────────────────────────────────────────────────────────
const CT_WHEEL_SEGMENTS = [
  { value: 10 }, { value: "DOUBLE" }, { value: 20 }, { value: 40 },
  { value: "TRIPLE" }, { value: 10 }, { value: 5 }, { value: "DOUBLE" },
  { value: 100 }, { value: 20 }, { value: "DOUBLE" }, { value: 50 },
  { value: 10 }, { value: "TRIPLE" }, { value: 20 }, { value: 5 },
  { value: "DOUBLE" }, { value: 10 }, { value: 1000 }, { value: "DOUBLE" },
  { value: 20 }, { value: 5 }, { value: "TRIPLE" }, { value: 40 },
  { value: 10 }, { value: "DOUBLE" }, { value: 20 }, { value: 5 },
  { value: "DOUBLE" }, { value: 100 }, { value: 10 }, { value: 20 },
  { value: 5 }, { value: "TRIPLE" }, { value: 50 }, { value: 10 },
  { value: "DOUBLE" }, { value: 20 }, { value: 5 }, { value: 40 },
  { value: "DOUBLE" }, { value: 10 }, { value: 20 }, { value: "TRIPLE" },
  { value: 5 }, { value: 10 }, { value: "DOUBLE" }, { value: 20 },
  { value: 500 }, { value: "DOUBLE" }, { value: 10 }, { value: 5 },
  { value: 20 }, { value: "TRIPLE" }, { value: 40 }, { value: 10 },
  { value: "DOUBLE" }, { value: 20 }, { value: 5 }, { value: 100 },
  { value: "DOUBLE" }, { value: 10 }, { value: 20 }, { value: 5 },
];

function CrazyTimeBonus({ bet, onComplete }) {
  const ARROWS = ["green", "blue", "yellow"];
  const [chosen, setChosen] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [landedIndex, setLandedIndex] = useState(null);
  const [doublesCount, setDoublesCount] = useState(0);
  const [currentMults, setCurrentMults] = useState(CT_WHEEL_SEGMENTS.map(s => s.value));
  const [phase, setPhase] = useState("choose"); // choose → spin → result

  const segCount = CT_WHEEL_SEGMENTS.length;
  const segAngle = 360 / segCount;
  const radius = 120;        // ← agregar
  const cx = 150, cy = 150;  // ← agregar


  function segPath(i) {       // ← agregar
  const startAngle = (i * segAngle - 90) * (Math.PI / 180);
  const endAngle = ((i + 1) * segAngle - 90) * (Math.PI / 180);
  const x1 = cx + radius * Math.cos(startAngle);
  const y1 = cy + radius * Math.sin(startAngle);
  const x2 = cx + radius * Math.cos(endAngle);
  const y2 = cy + radius * Math.sin(endAngle);
  return `M${cx},${cy} L${x1},${y1} A${radius},${radius} 0 0,1 ${x2},${y2} Z`;
}




  function spinWheel() {
    if (spinning || chosen === null) return;
    setSpinning(true);
    setPhase("spin");

    const targetSeg = Math.floor(Math.random() * segCount);
    const extraSpins = 5 + Math.floor(Math.random() * 5);
    const totalDeg = extraSpins * 360 + (segCount - targetSeg) * segAngle - segAngle / 2;

    //setRotation(prev => prev + totalDeg);




setRotation(rotRef.current);




    setTimeout(() => {
      setSpinning(false);
      setLandedIndex(targetSeg);
      const value = currentMults[targetSeg];

      if (value === "DOUBLE" || value === "TRIPLE") {
        const factor = value === "DOUBLE" ? 2 : 3;
        setDoublesCount(d => d + 1);
        setCurrentMults(prev => prev.map(m =>
          m === "DOUBLE" || m === "TRIPLE" ? m : m * factor
        ));
        setTimeout(() => {
          setLandedIndex(null);
          setSpinning(false);
          setPhase("spin");
          spinWheel();
        }, 2000);
      } else {
        setPhase("result");
        setTimeout(() => onComplete(bet * value, value), 2500);
      }
    }, 4000);
  }
  const COLORS = ["#3a7bd5", "#f7c948", "#7ed321", "#e84393", "#9b59b6", "#f5a623", "#d0021b", "#00d4aa"];

  return (
    <div style={bonusStyles.wrap}>
      <div style={bonusStyles.title}>🎡 CRAZY TIME</div>
      {doublesCount > 0 && (
        <div style={{ color: "#fbbf24", textAlign: "center", marginBottom: 8, fontWeight: 700 }}>
          🔥 Multiplicadores elevados {doublesCount} {doublesCount === 1 ? "vez" : "veces"}
        </div>
      )}

      {phase === "choose" && (
        <>
          <div style={{ color: "#aaa", textAlign: "center", marginBottom: 16, fontSize: 14 }}>
            Elige tu indicador (flecha)
          </div>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 20 }}>
            {[
              { id: "green", label: "Verde 🟢", color: "#7ed321" },
              { id: "blue", label: "Azul 🔵", color: "#3a7bd5" },
              { id: "yellow", label: "Amarilla 🟡", color: "#fbbf24" },
            ].map(a => (
              <div
                key={a.id}
                onClick={() => setChosen(a.id)}
                style={{
                  padding: "12px 18px",
                  borderRadius: 10,
                  background: chosen === a.id ? a.color + "33" : "#1e1e2e",
                  border: `3px solid ${chosen === a.id ? a.color : "#2a2a3a"}`,
                  color: a.color,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                {a.label}
              </div>
            ))}
          </div>
          {chosen && (
            <button onClick={spinWheel} style={bonusStyles.actionBtn}>
              🎡 ¡Girar Ruleta!
            </button>
          )}
        </>
      )}

      {/* Wheel SVG */}
      <div style={{ display: "flex", justifyContent: "center", margin: "12px 0", position: "relative" }}>
        {/* Arrow */}
        <div style={{
          position: "absolute",
          top: -4,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
          fontSize: 24,
          filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.8))",
        }}>▼</div>

        <svg
          width="300" height="300"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? "transform 4s cubic-bezier(0.17,0.67,0.12,1)" : "none",
          }}
        >
          {CT_WHEEL_SEGMENTS.map((seg, i) => {
            const value = currentMults[i];
            const color = value === "DOUBLE" ? "#e84747"
              : value === "TRIPLE" ? "#ff6b00"
              : COLORS[i % COLORS.length];
            const midAngle = ((i + 0.5) * segAngle - 90) * (Math.PI / 180);
            const textR = radius * 0.65;
            const tx = cx + textR * Math.cos(midAngle);
            const ty = cy + textR * Math.sin(midAngle);

            return (
              <g key={i}>
                <path
                  d={segPath(i)}
                  fill={landedIndex === i ? "#fff" : color}
                  stroke="#0d0d14"
                  strokeWidth={1}
                />
                <text
                  x={tx} y={ty}
                  fill={landedIndex === i ? "#000" : "#fff"}
                  fontSize={value === "DOUBLE" || value === "TRIPLE" ? 6 : 8}
                  fontWeight="bold"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(${(i + 0.5) * segAngle}, ${tx}, ${ty})`}
                >
                  {value === "DOUBLE" ? "×2" : value === "TRIPLE" ? "×3" : `${value}x`}
                </text>
              </g>
            );
          })}
          <circle cx={cx} cy={cy} r={20} fill="#1a1a2e" stroke="#fbbf24" strokeWidth={3} />
          <text x={cx} y={cy} fill="#fbbf24" fontSize={8} fontWeight="bold" textAnchor="middle" dominantBaseline="middle">CT</text>
        </svg>
      </div>

      {phase === "result" && landedIndex !== null && (
        <div style={{ textAlign: "center", fontSize: 22, fontWeight: 700, color: "#7ed321" }}>
          ✅ ¡{currentMults[landedIndex]}x! (+{(bet * currentMults[landedIndex]).toLocaleString()})
        </div>
      )}

      {spinning && (
        <div style={{ textAlign: "center", color: "#aaa", fontSize: 13 }}>
          🌀 La ruleta está girando...
        </div>
      )}
    </div>
  );
}

// ─── MAIN WHEEL COMPONENT ────────────────────────────────────────────────────


// En el JSX:


// En el componente MainWheel, acepta el prop:
function MainWheel({ wheelRef }) {
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <div style={{ position: "absolute", top: -8, left: "50%",
        transform: "translateX(-50%)", zIndex: 20, fontSize: 28,
        filter: "drop-shadow(0 2px 8px rgba(255,200,0,0.8))" }}>🔻</div>
      <img
        ref={wheelRef}                    // ← ref aquí
        src="/CrazyTime.png"
        alt="CrazyTime"
        style={{
          width: 500, height: 500,
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
  const [bets, setBets] = useState({});
  const [betInput, setBetInput] = useState("1000");
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [topSlotResult, setTopSlotResult] = useState(null);
  const [landedSegment, setLandedSegment] = useState(null);
  const [bonus, setBonus] = useState(null); // { type, bet }
  const [message, setMessage] = useState(null);
  const [history, setHistory] = useState([]);
  const [phase, setPhase] = useState("betting"); // betting → spinning → bonus → result
  const rotRef = useRef(0);           // ← agregar
  const WHEEL_OFFSET = 0; // 0
  const wheelRef = useRef(null);   // ← agregar
const animRef  = useRef(null);   // ← agregar




  const totalBet = Object.values(bets).reduce((a, b) => a + b, 0);

  function placeBet(type) {
    const amount = parseInt(betInput) || 1000;
    if (amount <= 0 || amount > balance) return;
    setBets(prev => ({ ...prev, [type]: (prev[type] || 0) + amount }));
    setBalance(balance - amount);
  }

  function clearBets() {
    setBalance(prev => prev + totalBet);
    setBets({});
  }

  function spin() {
  if (totalBet === 0 || spinning) return;
  setSpinning(true);
  setPhase("spinning");
  setLandedSegment(null);
  setTopSlotResult(null);
  setMessage(null);

  const tsSegment = SEGMENT_TYPES[Math.floor(Math.random() * SEGMENT_TYPES.length)];
  const tsMult    = TOP_SLOT_MULTIPLIERS[Math.floor(Math.random() * TOP_SLOT_MULTIPLIERS.length)];
  const tsRes     = { segment: tsSegment, multiplier: tsMult };
  setTimeout(() => setTopSlotResult(tsRes), 500);

  // ── Calcular destino ──────────────────────────────────────────────────
  const SEG   = 360 / WHEEL_SEGMENTS.length;          // 6.666...°
  const targetIdx = Math.floor(Math.random() * WHEEL_SEGMENTS.length);

  // Queremos que el CENTRO del segmento quede bajo el puntero (arriba = 0°)
  const targetAngle = targetIdx * SEG + SEG / 2;
  const currentMod  = rotRef.current % 360;
  let delta = ((targetAngle - currentMod) % 360 + 360) % 360;
  if (delta < SEG) delta += 360;                      // al menos 1 vuelta extra de margen

  const extraSpins = 5 + Math.floor(Math.random() * 4);
  const totalDeg   = extraSpins * 360 + delta;
  const startAngle = rotRef.current;
  const endAngle   = rotRef.current + totalDeg;
  rotRef.current   = endAngle;

  // ── Animación con requestAnimationFrame (igual que Ruleta) ───────────
  const DURATION = 5000;
  const t0 = performance.now();

  cancelAnimationFrame(animRef.current);

  function frame(now) {
    const t      = Math.min(1, (now - t0) / DURATION);
    const eased  = 1 - Math.pow(1 - t, 4);            // quartic ease-out
    const angle  = startAngle + totalDeg * eased;

    if (wheelRef.current)
      wheelRef.current.style.transform = `rotate(${angle}deg)`;

    if (t < 1) {
      animRef.current = requestAnimationFrame(frame);
      return;
    }

    // ── Fin de animación ──────────────────────────────────────────────
    setSpinning(false);
    const landed = WHEEL_SEGMENTS[targetIdx];
    setLandedSegment({ ...landed, index: targetIdx });

    const userBetOnLanded = bets[landed.type] || 0;
    const isBonus = ["coin_flip","cash_hunt","pachinko","crazy_time"].includes(landed.type);

    if (isBonus && userBetOnLanded > 0) {
      setPhase("bonus");
      setBonus({ type: landed.type, bet: userBetOnLanded });
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
      setHistory(h => [{ type: landed.type, win: winnings > 0, amount: winnings }, ...h.slice(0, 9)]);
      setBets({});
      setPhase("result");
      setTimeout(() => { setPhase("betting"); setMessage(null); }, 3000);
    }
  }

  animRef.current = requestAnimationFrame(frame);
}

  function handleBonusComplete(payout, mult, ...args) {
    setBalance(prev => prev + payout + (bets[bonus.type] || 0));
    setHistory(h => [{ type: bonus.type, win: payout > 0, amount: payout }, ...h.slice(0, 9)]);
    setBonus(null);
    setBets({});
    setPhase("result");
    setMessage(payout > 0
      ? `🎉 ¡Bonificación completada! +${payout.toLocaleString()} fichas (${mult}x)`
      : "❌ Sin premio en el bonificador."
    );
    setTimeout(() => { setPhase("betting"); setMessage(null); }, 3500);
  }

  const quickAmounts = [500, 1000, 5000, 10000, 25000];

  return (
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
          <div style={{ color: "#fbbf24", fontSize: 12 }}>¡El juego más loco del casino!</div>
        </div>
        <div style={styles.balancePill}>💰 {balance.toLocaleString()}</div>
      </div>

      {/* Bonus overlay */}
      {bonus && (
        <div style={styles.bonusOverlay}>
          {bonus.type === "coin_flip" && <CoinFlipBonus bet={bonus.bet} onComplete={handleBonusComplete} />}
          {bonus.type === "cash_hunt" && <CashHuntBonus bet={bonus.bet} onComplete={handleBonusComplete} />}
          {bonus.type === "pachinko" && <PachinkoBonus bet={bonus.bet} onComplete={handleBonusComplete} />}
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
          fontSize: 13,
        }}
      >
        {v >= 1000 ? `${v / 1000}k` : v}
      </button>
    ))}
  </div>
</div>



            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {quickAmounts.map(a => (
                <button key={a} onClick={() => setBetInput(String(a))} style={styles.quickBtn}>
                  {a >= 1000 ? `${a / 1000}k` : a}
                </button>
              ))}
            </div>
          </div>

          {/* Segments to bet on */}
          <div style={styles.card}>
            <div style={styles.sectionTitle}>🎲 Apostar en segmento</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {SEGMENT_TYPES.map(type => {
                const info = SEGMENT_INFO[type];
                const myBet = bets[type] || 0;
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
                    <div style={{ fontSize: 20 }}>{info.emoji}</div>
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
              disabled={totalBet === 0 || phase !== "betting"}
              style={{ ...styles.btn, background: "#2a2a3a", flex: 1 }}
            >
              🗑 Borrar
            </button>
            <button
              onClick={spin}
              disabled={totalBet === 0 || phase !== "betting"}
              style={{
                ...styles.btn,
                flex: 2,
                background: totalBet > 0 && phase === "betting"
                  ? "linear-gradient(135deg, #ff6b00, #ff9500)"
                  : "#2a2a3a",
                animation: totalBet > 0 && phase === "betting" ? "glow 2s infinite" : "none",
              }}
            >
              {spinning ? "🌀 Girando..." : `🎡 Girar (${totalBet.toLocaleString()})`}
            </button>
          </div>
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div style={{ ...styles.card, marginTop: 16 }}>
          <div style={styles.sectionTitle}>📜 Historial reciente</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {history.map((h, i) => {
              const info = SEGMENT_INFO[h.type];
              return (
                <div key={i} style={{
                  background: h.win ? info.color + "22" : "#1e1e2e",
                  border: `1px solid ${h.win ? info.color : "#2a2a3a"}`,
                  borderRadius: 8,
                  padding: "6px 10px",
                  fontSize: 12,
                  textAlign: "center",
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
  sectionTitle: { color: "#666", fontSize: 11, letterSpacing: 1, marginBottom: 8, textTransform: "uppercase" },
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
    color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer",
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
