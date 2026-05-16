import { useState, useEffect, useRef } from "react";

// ── Datos de caballos (igual que Excel) ─────────────────────────────────────
const HOUSE_EDGE = 1.15;

function initHorses() {
  const base = [
    { id: 1, name: "Rayo Veloz",   color: "#DC3232", baseW: 0.22 },
    { id: 2, name: "Tormenta",     color: "#3278DC", baseW: 0.18 },
    { id: 3, name: "Viento Norte", color: "#32C850", baseW: 0.16 },
    { id: 4, name: "Sombra Negra", color: "#3C3C3C", baseW: 0.14 },
    { id: 5, name: "Luna Dorada",  color: "#DCB400", baseW: 0.13 },
    { id: 6, name: "Furia Roja",   color: "#C86400", baseW: 0.12 },
    { id: 7, name: "Espiritu",     color: "#9632C8", baseW: 0.10 },
    { id: 8, name: "Destino",      color: "#00B4C8", baseW: 0.10 },
  ];
  return base.map(h => ({ ...h, weight: h.baseW + Math.random() * 0.001 }));     //*0.05
}

// ── Harville: orden de llegada ponderado ────────────────────────────────────
function pickFinishOrder(horses) {
  const available = horses.map(h => ({ ...h }));
  const order = [];
  for (let pos = 0; pos < 8; pos++) {
    const totalW = available.reduce((s, h) => s + (h ? h.weight : 0), 0);
    let r = Math.random() * totalW;
    let cumul = 0;
    for (let i = 0; i < available.length; i++) {
      if (!available[i]) continue;
      cumul += available[i].weight;
      if (r <= cumul) {
        order.push(available[i].id);
        available[i] = null;
        break;
      }
    }
  }
  return order; // [1er, 2do, 3ro, ...]
}

// ── Probabilidad exacta Harville ────────────────────────────────────────────
function calcProb(betType, selectedIds, horses) {
  const w = {};
  horses.forEach(h => { w[h.id] = h.weight; });
  const totalW = horses.reduce((s, h) => s + h.weight, 0);
  const [h1, h2, h3, h4] = selectedIds;
  let p = 0;

  switch (betType) {
    case 1: // Ganador
      p = w[h1] / totalW;
      break;
    case 2: // Place (top 2)
      p = w[h1] / totalW;
      horses.forEach(h => {
        if (h.id !== h1) p += (w[h.id] / totalW) * (w[h1] / (totalW - w[h.id]));
      });
      break;
    case 3: // Show (top 3)
      p = w[h1] / totalW;
      horses.forEach(hj => {
        if (hj.id === h1) return;
        p += (w[hj.id] / totalW) * (w[h1] / (totalW - w[hj.id]));
        horses.forEach(hk => {
          if (hk.id === h1 || hk.id === hj.id) return;
          const wRem = totalW - w[hj.id] - w[hk.id];
          if (wRem > 0)
            p += (w[hj.id] / totalW) * (w[hk.id] / (totalW - w[hj.id])) * (w[h1] / wRem);
        });
      });
      break;
    case 4: // Exacta
      p = (w[h1] / totalW) * (w[h2] / (totalW - w[h1]));
      break;
    case 5: // Quinela
      p = (w[h1] / totalW) * (w[h2] / (totalW - w[h1])) +
          (w[h2] / totalW) * (w[h1] / (totalW - w[h2]));
      break;
    case 6: // Trifecta
      p = (w[h1] / totalW) * (w[h2] / (totalW - w[h1])) * (w[h3] / (totalW - w[h1] - w[h2]));
      break;
    case 7: // Cuatrifecta
      p = (w[h1] / totalW) * (w[h2] / (totalW - w[h1])) *
          (w[h3] / (totalW - w[h1] - w[h2])) *
          (w[h4] / (totalW - w[h1] - w[h2] - w[h3]));
      break;
    default: p = 0;
  }
  return p;
}

function checkBet(betType, selectedIds, finishOrder) {
  const [h1, h2, h3, h4] = selectedIds;
  switch (betType) {
    case 1: return finishOrder[0] === h1;
    case 2: return finishOrder[0] === h1 || finishOrder[1] === h1;
    case 3: return finishOrder.slice(0, 3).includes(h1);
    case 4: return finishOrder[0] === h1 && finishOrder[1] === h2;
    case 5: return (finishOrder[0] === h1 && finishOrder[1] === h2) ||
                   (finishOrder[0] === h2 && finishOrder[1] === h1);
    case 6: return finishOrder[0] === h1 && finishOrder[1] === h2 && finishOrder[2] === h3;
    case 7: return finishOrder[0] === h1 && finishOrder[1] === h2 &&
                   finishOrder[2] === h3 && finishOrder[3] === h4;
    default: return false;
  }
}

const BET_TYPES = [
  { id: 1, name: "Ganador (Win)",    horses: 1, desc: "Tu caballo llega 1°" },
  { id: 2, name: "Place (Top 2)",    horses: 1, desc: "Tu caballo llega 1° o 2°" },
  { id: 3, name: "Show (Top 3)",     horses: 1, desc: "Tu caballo llega en el podio" },
  { id: 4, name: "Exacta",           horses: 2, desc: "1° y 2° en ese orden exacto" },
  { id: 5, name: "Quinela",          horses: 2, desc: "1° y 2° en cualquier orden" },
  { id: 6, name: "Trifecta",         horses: 3, desc: "1°, 2° y 3° en orden exacto" },
  { id: 7, name: "Cuatrifecta",      horses: 4, desc: "1°, 2°, 3° y 4° en orden exacto" },
];

const TRACK_WIDTH = "100%";       //600
const LANE_HEIGHT = 70;     //52
const START_X = 40;         //60
const FINISH_X = 1250;      //60   TRACK_WIDTH - 60
const HORSE_W = 100;     //48

// ── Componente pista de carreras ─────────────────────────────────────────────
function RaceTrack({ horses, positions, finished, finishOrder, racing }) {
  return (
    <div style={{ position: "relative", width: "100%"}}>    
      <div style={{
        position: "relative", width: TRACK_WIDTH, height: 8 * LANE_HEIGHT + 8,      //"100%" -> TRACK_WIDTH
        background: "linear-gradient(180deg, #1a4a1a 0%, #165016 100%)",
        border: "2px solid #2d6a2d", borderRadius: 10, overflow: "hidden",
      }}>
        {/* Línea de salida */}
        <div style={{ position: "absolute", left: START_X, top: 0, bottom: 0, width: 2, background: "rgba(255,255,255,0.3)", zIndex: 1 }} />
        {/* Línea de meta */}
        <div style={{ position: "absolute", left: FINISH_X, top: 0, bottom: 0, width: 3, background: "#FFD700", zIndex: 1, boxShadow: "0 0 8px #FFD700" }}>
          <div style={{ position: "absolute", top: -18, left: -12, color: "#FFD700", fontSize: 15, fontWeight: 700, whiteSpace: "nowrap" }}>META 🏁</div>
        </div>

        {/* Carriles */}
        {horses.map((h, i) => (
          <div key={h.id} style={{
            position: "absolute", top: i * LANE_HEIGHT, left: 0, right: 0, height: LANE_HEIGHT,
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            background: i % 2 === 0 ? "rgba(0,0,0,0.1)" : "transparent",
          }}>
            {/* Número de carril */}
            <div style={{
              position: "absolute", left: 4, top: "50%", transform: "translateY(-50%)",
              color: h.color, fontSize: 20, fontWeight: 900, opacity: 0.8,
            }}>#{h.id}</div>

            {/* Caballo */}
            <div style={{
              position: "absolute",
              left: positions[h.id] ?? START_X,
              top: "50%",
              transform: "translateY(-50%)",
              transition: racing ? "left 0.05s linear" : "left 0.3s ease",
              zIndex: 2,
              display: "flex", flexDirection: "column", alignItems: "center",
            }}>
              <img
                src={`/Horse${h.id}.png`}
                alt={h.name}
                style={{
                  width: HORSE_W, height: HORSE_W - 8,
                  objectFit: "contain",
                  filter: finished[h.id] ? `drop-shadow(0 0 6px ${h.color})` : "none",
                  imageRendering: "auto",
                }}
                onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}
              />
              {/* Fallback emoji si no carga la imagen */}
              <div style={{
                display: "none", width: HORSE_W, height: HORSE_W - 8,
                alignItems: "center", justifyContent: "center",
                fontSize: 28, background: h.color + "33",
                borderRadius: 6, border: `2px solid ${h.color}`,
              }}>🐎</div>
            </div>

            {/* Posición final */}
            {finished[h.id] && finishOrder && (
              <div style={{
                position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                color: finishOrder.indexOf(h.id) === 0 ? "#FFD700" :
                       finishOrder.indexOf(h.id) === 1 ? "#C0C0C0" :
                       finishOrder.indexOf(h.id) === 2 ? "#CD7F32" : "#ffffff",
                fontSize: 20, fontWeight: 900,
              }}>
                {finishOrder.indexOf(h.id) === 0 ? "🥇" :
                 finishOrder.indexOf(h.id) === 1 ? "🥈" :
                 finishOrder.indexOf(h.id) === 2 ? "🥉" :
                 `${finishOrder.indexOf(h.id) + 1}°`}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function HorseRace({ balance, setBalance, onBack }) {
  const [horses, setHorses] = useState(() => initHorses());
  const [betType, setBetType] = useState(1);
  const [selectedHorses, setSelectedHorses] = useState([null, null, null, null]);
  const [betAmount, setBetAmount] = useState(100);
  const [phase, setPhase] = useState("bet"); // bet | racing | result
  const [positions, setPositions] = useState({});
  const [finished, setFinished] = useState({});
  const [finishOrder, setFinishOrder] = useState([]);
  const [result, setResult] = useState(null); // { won, multiplier, netResult }
  const [history, setHistory] = useState([]);
  const animRef = useRef(null);

  const needed = BET_TYPES.find(b => b.id === betType)?.horses || 1;

  const trackRef = useRef(null);
  const [trackWidth, setTrackWidth] = useState(800);

  useEffect(() => {
    if (trackRef.current) setTrackWidth(trackRef.current.offsetWidth);
    const handleResize = () => {
      if (trackRef.current) setTrackWidth(trackRef.current.offsetWidth);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Reset selección al cambiar tipo
  function handleBetType(id) {
    setBetType(id);
    setSelectedHorses([null, null, null, null]);
  }

  function selectHorse(slot, horseId) {
    const ns = [...selectedHorses];
    // Si ya está seleccionado en otro slot, quitarlo
    const existing = ns.indexOf(horseId);
    if (existing !== -1 && existing !== slot) ns[existing] = null;
    ns[slot] = horseId;
    setSelectedHorses(ns);
  }

  const validSelection = selectedHorses.slice(0, needed).every(h => h !== null) &&
    new Set(selectedHorses.slice(0, needed)).size === needed;

  const prob = validSelection
    ? calcProb(betType, selectedHorses, horses)
    : 0;
  const multiplier = prob > 0 ? Math.round((1 / prob / HOUSE_EDGE) * 100) / 100 : 0;

  function startRace() {
    if (!validSelection) return;
    if (balance < betAmount) return;

    setBalance(b => b - betAmount);
    const newHorses = initHorses();
    setHorses(newHorses);

    const order = pickFinishOrder(newHorses);
    const initPos = {};
    newHorses.forEach(h => { initPos[h.id] = START_X; });
    setPositions(initPos);
    setFinished({});
    setFinishOrder([]);
    setResult(null);
    setPhase("racing");

    // Calcular multiplicador ANTES de la carrera (con los pesos nuevos)
    const prob2 = calcProb(betType, selectedHorses, newHorses);
    const mult2 = prob2 > 0 ? Math.round((1 / prob2 / HOUSE_EDGE) * 100) / 100 : 0;

    runAnimation(order, newHorses, mult2);
  }

  











function runAnimation(order, horseList, mult) {
  const pos = {};
  const spd = {};
  const fin = {};
  const finishedOrder = [];

  // Inicialización de los competidores
  horseList.forEach(h => {
    pos[h.id] = START_X;
    // Salida ligeramente diferenciada desde el milisegundo cero
    spd[h.id] = 1.5 + Math.random() * 1.5; 
    fin[h.id] = false;
  });

  const totalDist = FINISH_X - START_X;
  const destinationRank = {}; // rank 0 = Primero, 7 = Último
  order.forEach((hId, rank) => { destinationRank[hId] = rank; });

  function getPhase(pct) {
    if (pct < 0.25) return 1;
    if (pct < 0.50) return 2;
    if (pct < 0.75) return 3;
    return 4;
  }

  function tick() {
    let allDone = true;

    horseList.forEach(h => {
      if (fin[h.id]) return;
      allDone = false;

      const pct = (pos[h.id] - START_X) / totalDist;
      const phase = getPhase(pct);
      const rank = destinationRank[h.id]; 
      const rankFactor = (7 - rank) / 7; // 1.0 para el ganador, 0 para el último

      let targetSpd = 2.5;
      let accelRate = 0.05; 
      let randomNoise = 0.2; 

      if (phase === 1) {
        // ETAPA 1: SALIDA IMPREDECIBLE (0% a 25%)
        // Ampliamos el rango de velocidad drásticamente (de 1.5 a 7.0).
        // Bajamos el accelRate a 0.05 para que si un caballo arranca lento, se note bastante el rezago.
        targetSpd = 1 + Math.random() * 5.5;    //1.5   5.5
        accelRate = 0.05; 
        randomNoise = 0.8; // Alta vibración y saltos orgánicos

      } else if (phase === 2) {
        // ETAPA 2: ESTIRAMIENTO DEL PELOTÓN (25% a 50%)
        // Aquí la pista se rompe. Mantenemos una alta dispersión puramente aleatoria.
        // El rankFactor influye de forma mínima (0.4) para mantener el engaño visual.
        targetSpd = 1.8 + Math.random() * 5.0 + (rankFactor * 1);       // 1.8   5.0   0.4
        accelRate = 0.04; // Transición muy lenta, permitiendo que las distancias se consoliden
        randomNoise = 0.5;

      } else if (phase === 3) {
        // ETAPA 3: REGULACIÓN Y REMONTADA (50% a 75%)
        // Como el caos inicial fue grande, empezamos a corregir desde aquí suavemente.
        const phaseProgress = (pct - 0.50) / 0.25; 
        
        // Trayectoria ideal al llegar al 75% de la pista:
        // Los favoritos deberían estar cruzando el 75%, los rezagados toleran estar en el 64%
        const expected75Pct = 0.64 + (rankFactor * 0.11);
        const expectedPct = 0.50 + phaseProgress * (expected75Pct - 0.50);
        const lag = expectedPct - pct;

        // Fuerza de empuje según el caballo
        const sprintPower = rankFactor * phaseProgress * 1;     // Hasta +2.5 para el favorito en la fase final de esta etapa
        const correctiveBoost = Math.max(0, lag * 10); // Mitiga las distancias exageradas de la fase 1 y 2
        
        targetSpd = 2.8 + sprintPower + correctiveBoost;
        accelRate = 0.08; // El motor del caballo empieza a responder con más firmeza
        randomNoise = 0.2;

      } else {
        // ETAPA 4: SENTENCIA EN META (75% a 100%)
        // Cierre de precisión matemática. Ajuste fino de las posiciones finales.
        const phaseProgress = (pct - 0.75) / 0.25;
        
        // Espaciado elegante en meta: el 1° llega al 100%, el 2° al 98.2%, etc.
        const targetFinalPct = 1.0 - (rank * 0.018); 
        const expectedPct = 0.75 + phaseProgress * (targetFinalPct - 0.75);
        const lag = expectedPct - pct;

        // Multiplicador de reacción alto (18) actúa como un imán para asegurar el orden exacto
        const correctiveBoost = Math.max(0, lag * 18); 
        
        targetSpd = 3.0 + (rankFactor * 4.0) + correctiveBoost;
        accelRate = 0.16; // Reacción casi inmediata a la velocidad objetivo
        randomNoise = 0.04; // Estabilidad total para el desenlace limpio
      }

      // ─────────────────────────────────────────────────────────────────
      // CÁLCULO FÍSICO FINAL
      // ─────────────────────────────────────────────────────────────────
      spd[h.id] += (targetSpd - spd[h.id]) * accelRate;
      
      const noise = (Math.random() - 0.5) * randomNoise;
      const advance = Math.max(0.8, spd[h.id] + noise);

      pos[h.id] = Math.min(pos[h.id] + advance, FINISH_X);

      if (pos[h.id] >= FINISH_X && !fin[h.id]) {
        fin[h.id] = true;
        finishedOrder.push(h.id);
      }
    });

    setPositions({ ...pos });
    setFinished({ ...fin });

    if (!allDone) {
      animRef.current = setTimeout(() => requestAnimationFrame(tick), 8);
    } else {
      setFinishOrder([...order]);
      const won = checkBet(betType, selectedHorses, order);
      const net = won ? Math.round(betAmount * mult - betAmount) : -betAmount;
      if (won) setBalance(b => b + betAmount + Math.round(betAmount * mult));
      setResult({ won, multiplier: mult, netResult: net, order });
      setHistory(h => [{
        won, order: order.slice(0, 3),
        names: horseList.reduce((acc, h) => { acc[h.id] = h.name; return acc; }, {}),
        betTypeName: BET_TYPES.find(b => b.id === betType)?.name,
        mult,
      }, ...h.slice(0, 7)]);
      setPhase("result");
    }
  }

  animRef.current = requestAnimationFrame(tick);
}



  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  function resetRace() {
    setPhase("bet");
    setResult(null);
    setFinished({});
    setFinishOrder([]);
    setPositions({});
  }

  const totalW = horses.reduce((s, h) => s + h.weight, 0);

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", fontFamily: "'Georgia', serif" }}>
      <button onClick={onBack} style={S.backBtn}>← Lobby</button>

      <div style={S.card}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ color: "#FFD700", margin: 0, fontSize: 20, letterSpacing: 2 }}>🏇 CARRERA DE CABALLOS</h2>
          <span style={S.balancePill}>💰 {balance.toLocaleString()}</span>
        </div>

        {/* Pista */}
        <RaceTrack
          horses={horses}
          positions={positions}
          finished={finished}
          finishOrder={phase === "result" ? finishOrder : null}
          racing={phase === "racing"}
        />

        {/* Resultado */}
        {phase === "result" && result && (
          <div style={{
            margin: "12px 0", padding: 14, borderRadius: 10,
            background: result.won ? "#0a2a0a" : "#2a0a0a",
            border: `2px solid ${result.won ? "#00d4aa" : "#ff4444"}`,
            textAlign: "center",
          }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: result.won ? "#00d4aa" : "#ff6b35", marginBottom: 6 }}>
              {result.won ? `🎉 ¡GANASTE! +${result.netResult.toLocaleString()} fichas` : `Perdiste ${Math.abs(result.netResult).toLocaleString()} fichas`}
            </div>
            <div style={{ color: "#aaa", fontSize: 20 }}>
              Podio: 🥇 {horses.find(h => h.id === finishOrder[0])?.name} · 🥈 {horses.find(h => h.id === finishOrder[1])?.name} · 🥉 {horses.find(h => h.id === finishOrder[2])?.name}
            </div>
            {result.won && <div style={{ color: "#FFD700", fontSize: 20, marginTop: 4 }}>Multiplicador: {result.multiplier}x</div>}
            <button onClick={resetRace} style={{ ...S.spinBtn, marginTop: 10, background: "#FFD700", color: "#000" }}>
              Nueva carrera
            </button>
          </div>
        )}

        {phase === "bet" && (
          <>
            {/* Tabla de caballos con cuotas */}
            <div style={{ marginTop: 14, marginBottom: 10 }}>
              <div style={{ color: "#ffffff", fontSize: 14, letterSpacing: 2, marginBottom: 6 }}>CABALLOS Y CUOTAS</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5 }}>
                {horses.map(h => {
                  const prob = h.weight / totalW;
                  const odd = Math.round((1 / prob / HOUSE_EDGE) * 10) / 10;
                  return (
                    <div key={h.id} style={{ background: "#0d0d14", border: `1px solid ${h.color}33`, borderRadius: 8, padding: "6px 8px"}}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                        <img src={`/Horse${h.id}.png`} alt="" style={{ width: 100, height: 70, objectFit: "contain" }}
                          onError={e => { e.target.style.display = "none"; }} />
                        <span style={{ color: h.color, fontWeight: 700, fontSize: 20 }}>#{h.id}</span>
                      </div>
                      <div style={{ color: "#ccc", fontSize: 15, lineHeight: 1.3 }}>{h.name}</div>
                      <div style={{ color: "#FFD700", fontSize: 15, fontWeight: 700 }}>{odd}x</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tipo de apuesta */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ color: "#ffffff", fontSize: 18, letterSpacing: 2, marginBottom: 6 }}>TIPO DE APUESTA</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {BET_TYPES.map(b => (
                  <button key={b.id} onClick={() => handleBetType(b.id)} style={{
                    ...S.betBtn,
                    background: betType === b.id ? "#FFD700" : "#1a1a2a",
                    color: betType === b.id ? "#000" : "#aaa",
                    border: betType === b.id ? "none" : "1px solid #333",
                    fontSize: 13, padding: "5px 10px",
                  }}>
                    {b.name}
                  </button>
                ))}
              </div>
              <div style={{ color: "#ffffff", fontSize: 15, marginTop: 4 }}>
                {BET_TYPES.find(b => b.id === betType)?.desc}
              </div>
            </div>

            {/* Selección de caballos */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ color: "#ffffff", fontSize: 15, letterSpacing: 2, marginBottom: 6 }}>
                SELECCIONA {needed === 1 ? "EL CABALLO" : `LOS ${needed} CABALLOS`}
                {needed > 1 && <span style={{ color: "#ff9696", fontWeight: 400 }}> (en orden)</span>}
              </div>
              {Array.from({ length: needed }).map((_, slot) => (
                <div key={slot} style={{ marginBottom: 6 }}>
                  <div style={{ color: "#ffffff", fontSize: 14, marginBottom: 4 }}>
                    {needed === 1 ? "Caballo" : `${slot + 1}° lugar`}
                  </div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {horses.map(h => {
                      const isSelected = selectedHorses[slot] === h.id;
                      const usedOtherSlot = selectedHorses.some((s, i) => i !== slot && s === h.id);
                      return (
                        <button key={h.id} onClick={() => !usedOtherSlot && selectHorse(slot, h.id)}
                          disabled={usedOtherSlot}
                          style={{
                            border: isSelected ? `2px solid ${h.color}` : "1px solid #333",
                            borderRadius: 7, padding: "4px 8px", cursor: usedOtherSlot ? "default" : "pointer",
                            background: isSelected ? h.color + "33" : "#0d0d14",
                            color: usedOtherSlot ? "#333" : "#fff", fontSize: 11,
                            display: "flex", alignItems: "center", gap: 4,
                          }}>
                          <span style={{ color: h.color, fontWeight: 700 }}>#{h.id}</span>
                          <span style={{ fontSize: 14 }}>{h.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Apuesta y multiplicador */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ color: "#ffffff", fontSize: 15, marginBottom: 4 }}>APUESTA</div>
                <div style={{ display: "flex", gap: 5 }}>
                  {[50, 100, 250, 500, 1000].map(v => (
                    <button key={v} onClick={() => setBetAmount(v)} style={{
                      ...S.betBtn,
                      background: betAmount === v ? "#FFD700" : "#1a1a2a",
                      color: betAmount === v ? "#000" : "#aaa",
                      border: betAmount === v ? "none" : "1px solid #333",
                    }}>{v}</button>
                  ))}
                </div>
              </div>
              {validSelection && (
                <div style={{ marginLeft: "auto", textAlign: "right" }}>
                  <div style={{ color: "#ffffff", fontSize: 15 }}>MULTIPLICADOR</div>
                  <div style={{ color: "#FFD700", fontWeight: 900, fontSize: 25 }}>{multiplier}x</div>
                  <div style={{ color: "#00d4aa", fontSize: 13 }}>
                    Ganancia potencial: +{Math.round(betAmount * multiplier - betAmount).toLocaleString()}
                  </div>
                </div>
              )}
            </div>

            {/* Botón correr */}
            <button
              onClick={startRace}
              disabled={!validSelection || balance < betAmount}
              style={{
                ...S.spinBtn,
                background: validSelection && balance >= betAmount
                  ? "linear-gradient(135deg, #8B6914, #FFD700)"
                  : "#333",
                color: validSelection && balance >= betAmount ? "#000" : "#666",
              }}>
              🏇 INICIAR CARRERA ({betAmount.toLocaleString()} fichas)
            </button>
          </>
        )}

        {phase === "racing" && (
          <div style={{ textAlign: "center", padding: "20px 0", color: "#FFD700", fontSize: 25, fontWeight: 700, letterSpacing: 2 }}>
            🏇 ¡CARRERA EN CURSO!
          </div>
        )}

        {/* Historial */}
        {history.length > 0 && phase === "bet" && (
          <div style={{ marginTop: 14 }}>
            <div style={{ color: "#ffffff", fontSize: 15, letterSpacing: 2, marginBottom: 6 }}>ÚLTIMAS CARRERAS</div>
            {history.map((h, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "5px 8px", borderRadius: 6, marginBottom: 4,
                background: h.won ? "#0a2a0a" : "#1a0a0a",
                fontSize: 15,
              }}>
                <span style={{ color: "#ffffff" }}>{h.betTypeName}</span>
                <span style={{ color: "#ffffff" }}>
                  🥇 {h.names[h.order[0]]} · 🥈 {h.names[h.order[1]]} · 🥉 {h.names[h.order[2]]}
                </span>
                <span style={{ color: h.won ? "#00d4aa" : "#ff4444", fontWeight: 700 }}>
                  {h.won ? `${h.mult}x ✓` : "✗"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const S = {
  backBtn: { background: "transparent", border: "none", color: "#555", fontSize: 14, cursor: "pointer", marginBottom: 12, padding: 0 },
  card: { background: "#0d1a0d", border: "2px solid #2d4a2d", borderRadius: 16, padding: 16, width: "95vw", maxWidth: "1400px", position: "relative", left: "50%", transform: "translateX(-50%)", boxSizing: "border-box" },
  balancePill: { background: "#1e1e2e", border: "1px solid #2a2a3a", borderRadius: 20, padding: "4px 12px", fontSize: 14, fontWeight: 700, color: "#fbbf24" },
  betBtn: { border: "none", borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 15, fontWeight: "bold" },
  spinBtn: { width: "100%", border: "none", borderRadius: 8, padding: "13px", fontSize: 20, fontWeight: 900, cursor: "pointer", marginTop: 4 },
};
