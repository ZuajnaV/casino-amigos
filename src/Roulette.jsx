// Roulette.jsx
import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

// ─── Datos de la rueda ───────────────────────────────────────────────────────
const NUMBERS = [
  "0", "28", "9", "26", "30", "11", "7", "20", "32", "17",
  "5", "22", "34", "15", "3", "24", "36", "13", "1", "00",
  "27", "10", "25", "29", "12", "8", "19", "31", "18", "6",
  "21", "33", "16", "4", "23", "35", "14", "2"
];

const RED_NUMS = new Set([
  "1", "3", "5", "7", "9", "12", "14", "16", "18",
  "19", "21", "23", "25", "27", "30", "32", "34", "36"
]);

const ROW_TOP = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36];
const ROW_MID = [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35];
const ROW_BOT = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34];

function numBg(n) {
  const s = String(n);
  if (s === "0" || s === "00") return "#1a6b1a";
  return RED_NUMS.has(s) ? "#8b1c1c" : "#1a1a1a";
}

function getColorLabel(num) {
  if (num === "0" || num === "00") return "Verde";
  return RED_NUMS.has(num) ? "Rojo" : "Negro";
}

function histBg(num) {
  if (num === "0" || num === "00") return "#1a6b1a";
  return RED_NUMS.has(num) ? "#8b1c1c" : "#222";
}

// ─── Cálculo de pagos ────────────────────────────────────────────────────────
function calcPayout(resultNum, bets) {
  const total = Object.values(bets).reduce((a, b) => a + b, 0);
  let cobrado = 0;
  const n = parseInt(resultNum);

  for (const [id, amount] of Object.entries(bets)) {
    if (!amount) continue;
    if (id === resultNum) { cobrado += amount * 36; continue; }

    let win = false, mult = 2;
    switch (id) {
      case "red": win = RED_NUMS.has(resultNum); break;
      case "black": win = resultNum !== "0" && resultNum !== "00" && !RED_NUMS.has(resultNum); break;
      case "odd": win = resultNum !== "0" && resultNum !== "00" && n % 2 !== 0; break;
      case "even": win = resultNum !== "0" && resultNum !== "00" && n % 2 === 0; break;
      case "low": win = n >= 1 && n <= 18; break;
      case "high": win = n >= 19 && n <= 36; break;
      case "doz1": win = n >= 1 && n <= 12; mult = 3; break;
      case "doz2": win = n >= 13 && n <= 24; mult = 3; break;
      case "doz3": win = n >= 25 && n <= 36; mult = 3; break;
      case "col1": win = ROW_BOT.includes(n); mult = 3; break;
      case "col2": win = ROW_MID.includes(n); mult = 3; break;
      case "col3": win = ROW_TOP.includes(n); mult = 3; break;
    }
    if (win) cobrado += amount * mult;
  }
  return cobrado - total;
}

// ─── Dibujo de la bola ───────────────────────────────────────────────────────
const SLICE = (2 * Math.PI) / 38;

function drawBall(ctx, size, angle, radius) {
  ctx.clearRect(0, 0, size, size);
  if (radius <= 0) return;
  const cx = size / 2, cy = size / 2;
  const x = cx + radius * Math.cos(angle);
  const y = cy + radius * Math.sin(angle);
  const r = 8;
  ctx.beginPath();
  ctx.arc(x + 2, y + 2, r, 0, 2 * Math.PI);
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fill();
  const grad = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, r);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.5, "#e0e0e0");
  grad.addColorStop(1, "#999");
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fillStyle = grad;
  ctx.fill();
}

// ─── Gráfica circular SVG ────────────────────────────────────────────────────
function PieChart({ slices, label, size = 200 }) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  if (total === 0) return (
    <div style={{ textAlign: "center" }}>
      <div style={{ width: size, height: size, borderRadius: "50%", background: "#2a2a3a", margin: "0 auto" }} />
      <div style={{ color: "#555", fontSize: 11, marginTop: 6 }}>{label}</div>
    </div>
  );

  const cx = size / 2, cy = size / 2, r = size / 2 - 6;
  let cumAngle = -Math.PI / 2;

  const paths = slices.map(s => {
    const a = (s.value / total) * 2 * Math.PI;
    const start = cumAngle;
    cumAngle += a;
    const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(cumAngle), y2 = cy + r * Math.sin(cumAngle);
    const large = a > Math.PI ? 1 : 0;
    const midAngle = start + a / 2;
    const tx = cx + (r * 0.62) * Math.cos(midAngle);
    const ty = cy + (r * 0.62) * Math.sin(midAngle);
    const pct = Math.round((s.value / total) * 100);
    return { d: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`, color: s.color, tx, ty, pct, label: s.label };
  });

  return (
    <div style={{ textAlign: "center" }}>
      <svg width={size} height={size}>
        {paths.map((p, i) => (
          <g key={i}>
            <path d={p.d} fill={p.color} stroke="#16161f" strokeWidth={1.5} />
            {p.pct > 8 && (
              <text x={p.tx} y={p.ty} textAnchor="middle" dominantBaseline="middle"
                fill="#fff" fontSize={20} fontWeight="bold">{p.pct}%</text>
            )}
          </g>
        ))}
      </svg>
      <div style={{ color: "#aaa", fontSize: 17, marginTop: 4, fontWeight: 700 }}>{label}</div>
      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
        {slices.map((s, i) => (
          <span key={i} style={{ fontSize: 20, color: "#bbb", display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, display: "inline-block" }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function RouletteGame({ balance, setBalance, onBack }) {
  const WHEEL_SIZE = 500;
  const OUTER_R = WHEEL_SIZE / 2 - 2;
  const RADIO_GIRO = OUTER_R - 24;  //24
  const RADIO_FINAL = OUTER_R - 122;  //76

  const canvasRef = useRef(null);
  const wheelRef = useRef(null);
  const animRef = useRef(null);
  const stateRef = useRef({ wheelRot: 0, ballAngle: 0, ballRadius: 0 });

  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [msg, setMsg] = useState("");
  const [chipValue, setChipValue] = useState(500);
  const [bets, setBets] = useState({});






  const [lastBets, setLastBets] = useState({});

  const [eraseMode, setEraseMode] = useState(false);









  // fullHistory: hasta 114 tiradas para estadísticas
  const [fullHistory, setFullHistory] = useState([]);

  const totalBet = Object.values(bets).reduce((a, b) => a + b, 0);

  useEffect(() => {
    canvasRef.current?.getContext("2d").clearRect(0, 0, WHEEL_SIZE, WHEEL_SIZE);
  }, []);
  useEffect(() => () => cancelAnimationFrame(animRef.current), []);




  useEffect(() => {
  supabase.from("roulette_history")
    .select("*").order("created_at", { ascending: false }).limit(114)
    .then(({ data }) => {
      if (data) setFullHistory(data.map(h => ({ num: String(h.num), net: h.net })));
    });
}, []);






  const placeBet = useCallback((id) => {
    if (spinning) return;


    if (eraseMode) {
    setBets(prev => { const next = { ...prev }; delete next[id]; return next; });
    return;
  }




    if (balance < totalBet + chipValue) { setMsg("Saldo insuficiente"); return; }
    setMsg("");
    setBets(prev => ({ ...prev, [id]: (prev[id] || 0) + chipValue }));
  }, [spinning, balance, totalBet, chipValue, eraseMode]);

  function clearBets() { if (!spinning) setBets({}); }

  // ─── Estadísticas derivadas ─────────────────────────────────────────────
  const last38 = fullHistory.slice(0, 38);
  const last114 = fullHistory.slice(0, 114);

  // Números calientes: ≥5 veces en las últimas 38
  const countMap = {};
  last38.forEach(h => { countMap[h.num] = (countMap[h.num] || 0) + 1; });
  const hotNums = Object.entries(countMap)
    .filter(([, c]) => c >= 5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([n, c]) => ({ n, c }));

  // Números fríos: no aparecen en las últimas 114
  const appearedSet = new Set(last114.map(h => h.num));
  const coldNums = NUMBERS
    .filter(n => !appearedSet.has(n))
    .slice(0, 4)
    .map(n => ({ n }));

  // Gráficas: contar en todo el historial
  const redCount = fullHistory.filter(h => RED_NUMS.has(h.num)).length;
  const blackCount = fullHistory.filter(h => h.num !== "0" && h.num !== "00" && !RED_NUMS.has(h.num)).length;
  const greenCount = fullHistory.filter(h => h.num === "0" || h.num === "00").length;

  const evenCount = fullHistory.filter(h => h.num !== "0" && h.num !== "00" && parseInt(h.num) % 2 === 0).length;
  const oddCount = fullHistory.filter(h => h.num !== "0" && h.num !== "00" && parseInt(h.num) % 2 !== 0).length;

  // ─── Animación ──────────────────────────────────────────────────────────
  function spin() {
    if (totalBet === 0) { setMsg("Coloca al menos una apuesta"); return; }
    if (balance < totalBet) { setMsg("Saldo insuficiente"); return; }
    if (spinning) return;

    setSpinning(true);


    setEraseMode(false);



    setMsg("");
    setResult(null);
    setBalance(b => b - totalBet);

    const resultIdx = Math.floor(Math.random() * 38);
    const resultNum = NUMBERS[resultIdx];
    const ctx = canvasRef.current.getContext("2d");
    const s = stateRef.current;
    const VEL = 0.045, DECAY = 0.97, PHASE_A = 100, COAST = 55;

    let rotDesacel = 0, pasosDesacel = 0, tempInc = VEL;
    while (tempInc >= 0.003) { rotDesacel += tempInc; tempInc *= DECAY; pasosDesacel++; if (pasosDesacel > 3000) break; }

    const rotFinal = (s.wheelRot + PHASE_A * VEL + rotDesacel) % (2 * Math.PI);
    const anguloBase = SLICE * resultIdx + Math.PI / 2;
    let anguloDestino = anguloBase + rotFinal;
    let anguloBola = -(s.wheelRot % (2 * Math.PI));
    const anguloInicioEase = anguloBola - (PHASE_A + COAST) * VEL;

    while (anguloDestino > anguloInicioEase) anguloDestino -= 2 * Math.PI;
    while (anguloInicioEase - anguloDestino < Math.PI) anguloDestino -= 2 * Math.PI;

    const totalAngulo = Math.abs(anguloDestino - anguloInicioEase);
    let pasosEase = Math.round(totalAngulo * 3 / VEL);
    if (pasosEase < 40) pasosEase = 40;
    if (pasosEase > 500) pasosEase = 500;

    let incRuleta = VEL, j = 0;

    function frame() {
      if (j < PHASE_A) {
        s.wheelRot += VEL; anguloBola -= VEL;
        s.ballRadius = RADIO_GIRO + (RADIO_FINAL - RADIO_GIRO) * Math.pow(j / PHASE_A, 2);
        s.ballAngle = anguloBola;
      } else if (j < PHASE_A + pasosDesacel) {
        s.wheelRot += incRuleta; incRuleta *= DECAY;
        const localJ = j - PHASE_A;
        if (localJ < COAST) { anguloBola -= VEL; s.ballAngle = anguloBola; }
        else {
          let t = Math.min(1, (localJ - COAST) / pasosEase);
          s.ballAngle = anguloInicioEase + (anguloDestino - anguloInicioEase) * (1 - Math.pow(1 - t, 4));
        }
        s.ballRadius = RADIO_FINAL;
      } else {
        const jEase = Math.max(0, pasosDesacel - COAST) + (j - PHASE_A - pasosDesacel);
        let t = Math.min(1, jEase / pasosEase);
        t = 1 - Math.pow(1 - t, 4);
        s.ballAngle = anguloInicioEase + (anguloDestino - anguloInicioEase) * t;
        s.ballRadius = RADIO_FINAL;
        if (t >= 1 || j > PHASE_A + pasosDesacel + pasosEase + 20) {
          if (wheelRef.current) wheelRef.current.style.transform = `rotate(${s.wheelRot * 180 / Math.PI}deg)`;
          drawBall(ctx, WHEEL_SIZE, s.ballAngle, s.ballRadius);
          finishSpin(resultNum);
          return;
        }
      }
      if (wheelRef.current) wheelRef.current.style.transform = `rotate(${s.wheelRot * 180 / Math.PI}deg)`;
      drawBall(ctx, WHEEL_SIZE, s.ballAngle, s.ballRadius);
      j++;
      animRef.current = requestAnimationFrame(frame);
    }

    s.ballRadius = RADIO_GIRO;
    animRef.current = requestAnimationFrame(frame);
  }

  async function finishSpin(num) {
    const net = calcPayout(num, bets);
    setResult({ num, colorLabel: getColorLabel(num) });
    setBalance(b => b + totalBet + net);
    setFullHistory(h => [{ num, net }, ...h.slice(0, 113)]);


    const isRed = RED_NUMS.has(num);
const isGreen = num === "0" || num === "00";
const isEven = !isGreen && parseInt(num) % 2 === 0;

supabase.from("roulette_history").insert({ num, net });
supabase.from("roulette_stats").update({
  red_count: redCount + (isRed ? 1 : 0),
  black_count: blackCount + (!isRed && !isGreen ? 1 : 0),
  green_count: greenCount + (isGreen ? 1 : 0),
  even_count: evenCount + (isEven ? 1 : 0),
  odd_count: oddCount + (!isGreen && !isEven ? 1 : 0),
}).eq("id", 1);
    if (net > 0) setMsg(`🎉 ¡Ganaste ${net} fichas!`);
    else if (net === 0) setMsg("🤝 Recuperas tu apuesta");
    else setMsg(`😔 Perdiste ${Math.abs(net)} fichas`);
    //setBets({});






  setLastBets(bets);
setBets({});













    setSpinning(false);


  const { error: errHistory } = await supabase.from("roulette_history").insert({ num, net });
const { error: errStats } = await supabase.from("roulette_stats").update({
  red_count: redCount + (isRed ? 1 : 0),
  black_count: blackCount + (!isRed && !isGreen ? 1 : 0),
  green_count: greenCount + (isGreen ? 1 : 0),
  even_count: evenCount + (isEven ? 1 : 0),
  odd_count: oddCount + (!isGreen && !isEven ? 1 : 0),
}).eq("id", 1);
console.log("history error:", errHistory, "stats error:", errStats);
  }

  // ─── Celda de apuesta ───────────────────────────────────────────────────
  function Cell({ id, children, style }) {
    const amount = bets[id] || 0;
    return (
      <div onClick={() => placeBet(id)} style={{
        position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
        cursor: spinning ? "default" : "pointer", userSelect: "none",
        ...style,
      }}>
        {children}
        {amount > 0 && (
          <div style={{
            position: "absolute", top: 1, right: 1,
            background: "#fbbf24", color: "#000", borderRadius: "50%",
            width: 16, height: 16, fontSize: 9, fontWeight: 900,
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2,
          }}>
            {amount}
          </div>
        )}
      </div>
    );
  }

  const C = {
    num: { height: 32, border: "1px solid #555", fontSize: 13, fontWeight: 700, color: "#fff", boxSizing: "border-box" },
    green: { background: "#1a6b1a" },
    outside: { height: 26, border: "1px solid #555", fontSize: 11, fontWeight: 700, color: "#fff", boxSizing: "border-box", background: "#1a6b1a" },
  };

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", fontFamily: "Georgia, serif", color: "#fff" }}>
      <button onClick={onBack} style={S.back}>← Lobby</button>

      {/* ── Historial (full width, arriba) ── */}
      {fullHistory.length > 0 && (
        <div style={S.historyBar}>
          <span style={{ color: "#ffffff", fontSize: 20, letterSpacing: 1.5, marginRight: 8, flexShrink: 0 }}>HISTORIAL</span>
          <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 2 }}>
            {fullHistory.slice(0, 20).map((h, i) => (
              <div key={i} style={{ textAlign: "center", flexShrink: 0 }}>
                <span style={{ ...S.histBadge, background: histBg(h.num), fontSize: 20 }}>{h.num}</span>
                <div style={{ fontSize: 12, color: h.net > 0 ? "#00d4aa" : "#ff4444", marginTop: 1 }}>
                  {h.net > 0 ? `+${h.net}` : h.net}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={S.card}>
        {/* ── Layout principal: ruleta izq, mesa der ── */}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>

          {/* ─── Columna izquierda: ruleta ─── */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            
            <div style={{ position: "relative", width: WHEEL_SIZE, height: WHEEL_SIZE }}>
              <img ref={wheelRef} src="/RULETA.png" width={WHEEL_SIZE} height={WHEEL_SIZE}
                style={{
                  position: "absolute", top: 0, left: 0, borderRadius: "50%",
                  border: "3px solid #8b6914", boxShadow: "0 0 32px #c084fc55",
                  transformOrigin: "center center"
                }}
                alt="Ruleta" />
              <canvas ref={canvasRef} width={WHEEL_SIZE} height={WHEEL_SIZE}
                style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }} />
            </div>

            {/* Resultado */}
            {result && (
              <span style={{ ...S.resultBadge, background: histBg(result.num), fontSize: 20 }}>
                {result.num} — {result.colorLabel}
              </span>
            )}
            {msg && (
              <div style={{ ...S.msgBox, fontSize: 25, color: msg.includes("Ganaste") ? "#00d4aa" : msg.includes("Recuperas") ? "#fbbf24" : "#ff6b35" }}>
                {msg}
              </div>
            )}
          </div>

          {/* ─── Columna derecha: fichas + mesa + girar ─── */}
          <div style={{ flex: 1, minWidth: 340, display: "flex", flexDirection: "column", gap: 8 }}>

            {/* Selector de fichas */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ color: "#ffffff", fontSize: 20, letterSpacing: 1 }}>FICHA:</span>
              {[500, 1000, 5000, 10000, 50000].map(v => (
                <button key={v} onClick={() => setChipValue(v)} style={{
                  ...S.chip,
                  background: chipValue === v ? "#c084fc" : "#2a2a3a",
                  fontWeight: chipValue === v ? 900 : 400,
                  boxShadow: chipValue === v ? "0 0 8px #c084fc88" : "none",
                }}>
                  {v}
                </button>
              ))}
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                {totalBet > 0 && <span style={{ color: "#fbbf24", fontSize: 12, fontWeight: 700 }}>Total: {totalBet}</span>}
                <button onClick={clearBets} disabled={spinning} style={S.clearBtn}>✕ Limpiar</button>





  {totalBet > 0 && <span style={{ color: "#fbbf24", fontSize: 12, fontWeight: 700 }}>Total: {totalBet}</span>}
  
  {/* ── Botón Borrar apuesta ── */}
  <button
    onClick={() => setEraseMode(e => !e)}
    disabled={spinning}
    style={{
      ...S.clearBtn,
      borderColor: eraseMode ? "#ff6b35" : "#888",
      color: eraseMode ? "#ff6b35" : "#888",
      background: eraseMode ? "#2a1000" : "transparent",
      fontWeight: eraseMode ? 700 : 400,
    }}
  >
    🗑️ {eraseMode ? "Cancelar" : "Borrar"}
  </button>

  <button onClick={clearBets} disabled={spinning} style={S.clearBtn}>✕ Limpiar</button>











              </div>
            </div>







              {Object.keys(lastBets).length > 0 && (
  <button
    onClick={() => {
      if (spinning) return;
      const total = Object.values(lastBets).reduce((a, b) => a + b, 0);
      if (balance < total) { setMsg("Saldo insuficiente para repetir"); return; }
      setBets(lastBets);
    }}
    disabled={spinning}
    style={{ ...S.clearBtn, borderColor: "#c084fc", color: "#c084fc" }}
  >
    🔄 Repetir
  </button>
)}
















            {/* Mesa de apuestas */}
            <div style={{ overflowX: "auto" }}>
              <div style={{ minWidth: 340 }}>

                {/* Números */}
                <div style={{ display: "flex", gap: 1 }}>
                  {/* 00 y 0 */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
                    <Cell id="00" style={{ ...C.num, ...C.green, width: 30 }}>00</Cell>
                    <div style={{ height: 32, width: 30}} />
                    <Cell id="0" style={{ ...C.num, ...C.green, width: 30 }}>0</Cell>
                  </div>

                  {/* Números 1–36 */}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 1 }}>
                    {[ROW_TOP, ROW_MID, ROW_BOT].map((row, ri) => (
                      <div key={ri} style={{ display: "flex", gap: 1 }}>
                        {row.map(n => (
                          <Cell key={n} id={String(n)} style={{ ...C.num, flex: 1, background: numBg(n) }}>
                            {n}
                          </Cell>
                        ))}
                      </div>
                    ))}
                  </div>

                  {/* Columnas 2a1 */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
                    {[["col3", "2a1"], ["col2", "2a1"], ["col1", "2a1"]].map(([id, lbl]) => (
                      <Cell key={id} id={id} style={{ ...C.num, ...C.green, width: 32, fontSize: 15 }}>{lbl}</Cell>
                    ))}
                  </div>
                </div>

                {/* Docenas */}
                <div style={{ display: "flex", gap: 1, marginTop: 1, paddingLeft: 31 }}>
                  {[["doz1", "1° Docena"], ["doz2", "2° Docena"], ["doz3", "3° Docena"]].map(([id, lbl]) => (
                    <Cell key={id} id={id} style={{ ...C.outside, flex: 1, fontSize: 15 }}>{lbl}</Cell>
                  ))}
                  <div style={{ width: 33, flexShrink: 0 }} />
                </div>

                {/* Externas */}
                <div style={{ display: "flex", gap: 1, marginTop: 1, paddingLeft: 31 }}>
                  <Cell id="low" style={{ ...C.outside, flex: 1, fontSize: 15 }}>1-18</Cell>
                  <Cell id="even" style={{ ...C.outside, flex: 1, fontSize: 15}}>PAR</Cell>
                  <Cell id="red" style={{ ...C.outside, flex: 1, background: "#8b1c1c", fontSize: 20 }}>🔴</Cell>
                  <Cell id="black" style={{ ...C.outside, flex: 1, background: "#1a1a1a", fontSize: 20 }}>⚫</Cell>
                  <Cell id="odd" style={{ ...C.outside, flex: 1, fontSize: 15 }}>IMPAR</Cell>
                  <Cell id="high" style={{ ...C.outside, flex: 1, fontSize: 15 }}>19-36</Cell>
                  <div style={{ width: 33, flexShrink: 0 }} />
                </div>
              </div>
            </div>

            {/* Girar */}
            <button onClick={spin} disabled={spinning || totalBet === 0}
              style={{ ...S.spinBtn, opacity: spinning || totalBet === 0 ? 0.4 : 1 }}>
              {spinning ? "Girando..." : "GIRAR"}
            </button>


            {/* ── Estadísticas (abajo, full width) ── */}
            {fullHistory.length > 0 && (
              <div style={{ marginTop: 20, display: "flex", gap: 25, alignItems: "flex-start" }}>

                {/* 1. Tabla calientes/fríos */}
                <div style={{ width: 220 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 30 }}>
                    <thead>
                      <tr>
                        <th style={S.th}>🔥 Calientes</th>
                        <th style={S.th}>🧊 Fríos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 4 }).map((_, i) => (
                        <tr key={i}>
                          <td style={S.td}>
                            {hotNums[i] ? (
                              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <span style={{ ...S.numBadge, background: histBg(hotNums[i].n) }}>{hotNums[i].n}</span>
                                <span style={{ color: "#ff6b35", fontSize: 10 }}>×{hotNums[i].c}</span>
                              </span>
                            ) : <span style={{ color: "#333" }}>—</span>}
                          </td>
                          <td style={S.td}>
                            {coldNums[i] ? (
                              <span style={{ ...S.numBadge, background: histBg(coldNums[i].n) }}>{coldNums[i].n}</span>
                            ) : <span style={{ color: "#333" }}>—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ color: "#555", fontSize: 11, marginTop: 6, lineHeight: "1.2" }}>
                    Caliente: ≥5 en últ. 38<br />Frío: ausente en últ. 114
                  </div>
                </div>

                {/* 2. CONTENEDOR MAESTRO DE GRÁFICAS (Esto es lo que debes añadir) */}
                <div style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "row", // Las pone en fila
                  gap: 20,              // Espacio entre círculos
                  justifyContent: "space-around",
                  background: "#16161f",
                  padding: "15px",
                  borderRadius: "12px"
                }}>

                  {/* Gráfica Rojo/Negro */}
                  <div style={{ textAlign: "center" }}>
                    <PieChart
                      label="Rojo / Negro / Verde"
                      slices={[
                        { value: redCount, color: "#8b1c1c", label: `Rojo (${redCount})` },
                        { value: blackCount, color: "#444", label: `Negro (${blackCount})` },
                        { value: greenCount, color: "#1a6b1a", label: `Verde (${greenCount})` },
                      ]}
                    />
                  </div>

                  {/* Gráfica Par/Impar */}
                  <div style={{ textAlign: "center" }}>
                    <PieChart
                      label="Par / Impar"
                      slices={[
                        { value: evenCount, color: "#3b82f6", label: `Par (${evenCount})` },
                        { value: oddCount, color: "#f59e0b", label: `Impar (${oddCount})` },
                      ]}
                    />
                  </div>
                </div> {/*Fin contenedor graficas*/}
              </div> //fin estadisticas
            )} {/*Fin condición fullHistory*/}
          </div> {/*Fin columna derecha*/}
        </div> {/*Fin layout principal*/}
      </div> {/*Fin card*/}
    </div>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const S = {
  back: { background: "transparent", border: "none", color: "#555", fontSize: 14, cursor: "pointer", marginBottom: 10, padding: 0 },
  card: { background: "#16161f", border: "1px solid #1e1e2e", borderRadius: 14, padding: 30, width: "85vw", maxWidth: "2000px", margin: "0px auto", boxSizing: "border-box", display: "block", position: "relative", left: "50%", transform: "translateX(-50%)" },
  historyBar: { background: "#16161f", border: "1px solid #1e1e2e", borderRadius: 10, padding: "8px 14px", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 },
  histBadge: { display: "inline-block", padding: "4px 8px", borderRadius: 8, color: "#fff", fontWeight: 700 },
  msgBox: { textAlign: "center", fontWeight: 700, fontSize: 14, padding: "8px 14px", background: "#0d0d14", borderRadius: 8, width: "100%", boxSizing: "border-box" },
  resultBadge: { display: "inline-block", padding: "7px 22px", borderRadius: 20, color: "#fff", fontWeight: 700 },
  chip: { border: "none", borderRadius: 20, padding: "5px 14px", color: "#fff", fontSize: 13, cursor: "pointer", transition: "all 0.15s" },
  clearBtn: { background: "transparent", border: "1px solid #ff4444", borderRadius: 6, color: "#ff4444", fontSize: 11, padding: "4px 10px", cursor: "pointer" },
  spinBtn: { width: "100%", background: "linear-gradient(135deg,#7c3aed,#c084fc)", border: "none", borderRadius: 8, padding: 13, color: "#fff", fontSize: 20, fontWeight: 700, cursor: "pointer", letterSpacing: 0.5 },
  th: { background: "#1e1e2e", color: "#ffffff", padding: "6px 8px", textAlign: "left", borderBottom: "1px solid #2a2a3a", fontWeight: 700, fontSize: 20 },
  td: { padding: "5px 8px", borderBottom: "1px solid #1e1e2e", fontSize: 30 },
  numBadge: { display: "inline-block", padding: "3px 7px", borderRadius: 6, color: "#fff", fontWeight: 700, fontSize: 25 },
};