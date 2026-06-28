import { useState } from "react";

// ─── Datos extraídos del componente CrazyTimeGame ───────────────────────────
// (deben coincidir exactamente con los arreglos usados en CrazyTime.jsx)
const WHEEL_SEGMENTS = [
  "crazy_time","1","5","1","2","pachinko","1","5","1","2","1","coin_flip",
  "1","2","1","10","2","cash_hunt","1","2","1","5","1","coin_flip","1","5",
  "2","10","1","pachinko","1","2","5","1","2","coin_flip","1","10","1","5",
  "1","cash_hunt","1","2","5","1","2","coin_flip","2","1","10","2","1"
];

const TOP_SLOT_MULTIPLIERS = [2, 3, 5, 7, 10, 12, 15, 20, 25, 50, 100];

const TOP_SLOT_SECTOR_POOL = [
  "1","1","1","1","1",
  "2","2","2","2",
  "5","5","5",
  "10","10",
  "coin_flip","coin_flip",
  "cash_hunt","pachinko",
  "crazy_time",
  "NO_MATCH","NO_MATCH","NO_MATCH","NO_MATCH","NO_MATCH",
  "NO_MATCH","NO_MATCH","NO_MATCH","NO_MATCH","NO_MATCH"
];

const SEGMENT_LABELS = {
  "1": { label: "1",          emoji: "1️⃣", color: "#3a7bd5" },
  "2": { label: "2",          emoji: "2️⃣", color: "#f7c948" },
  "5": { label: "5",          emoji: "5️⃣", color: "#7ed321" },
  "10": { label: "10",        emoji: "🔟", color: "#d0021b" },
  coin_flip:  { label: "Coin Flip",  emoji: "🪙", color: "#e84393" },
  cash_hunt:  { label: "Cash Hunt",  emoji: "🎯", color: "#f5a623" },
  pachinko:   { label: "Pachinko",   emoji: "🎳", color: "#9b59b6" },
  crazy_time: { label: "Crazy Time", emoji: "🎡", color: "#ff6b00" },
};

// ─── Lógica de simulación ─────────────────────────────────────────────────────
function runSimulation(N) {
  const wheelCounts = {};
  const topSlotSegCounts = {};
  const topSlotMultCounts = {};
  let multSum = 0;

  for (const t of new Set(WHEEL_SEGMENTS)) wheelCounts[t] = 0;
  for (const t of new Set(TOP_SLOT_SECTOR_POOL)) topSlotSegCounts[t] = 0;
  for (const m of TOP_SLOT_MULTIPLIERS) topSlotMultCounts[m] = 0;

  for (let i = 0; i < N; i++) {
    const landed = WHEEL_SEGMENTS[Math.floor(Math.random() * WHEEL_SEGMENTS.length)];
    wheelCounts[landed]++;

    const tsSeg = TOP_SLOT_SECTOR_POOL[Math.floor(Math.random() * TOP_SLOT_SECTOR_POOL.length)];
    topSlotSegCounts[tsSeg]++;

    if (tsSeg !== "NO_MATCH") {
      const mult = TOP_SLOT_MULTIPLIERS[Math.floor(Math.random() * TOP_SLOT_MULTIPLIERS.length)];
      topSlotMultCounts[mult]++;
      multSum += mult;
    }
  }

  return {
    N,
    wheelCounts,
    topSlotSegCounts,
    topSlotMultCounts,
    avgMultiplier: multSum / N,
    topSlotActiveCount: N - topSlotSegCounts.NO_MATCH,
  };
}

// ─── Barra de progreso visual ────────────────────────────────────────────────
function StatBar({ label, emoji, count, total, color }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
        <span style={{ color: "#bbb" }}>{emoji ? `${emoji} ` : ""}{label}</span>
        <span style={{ color: "#fff", fontWeight: 700 }}>
          {count.toLocaleString()} <span style={{ color: "#777" }}>({pct.toFixed(2)}%)</span>
        </span>
      </div>
      <div style={{ height: 7, background: "#1a1a26", borderRadius: 4, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`,
          background: color || "#fbbf24",
          borderRadius: 4, transition: "width 0.4s ease",
        }} />
      </div>
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function RTPCT() {
  const [running, setRunning] = useState(false);
  const [result, setResult]   = useState(null);
  const [trials, setTrials]   = useState(10000);

  function simulate() {
    setRunning(true);
    setResult(null);
    // setTimeout permite que el botón muestre "Simulando..." antes del cálculo síncrono
    setTimeout(() => {
      const res = runSimulation(trials);
      setResult(res);
      setRunning(false);
    }, 50);
  }

  const wheelSorted = result
    ? Object.entries(result.wheelCounts).sort((a, b) => b[1] - a[1])
    : [];
  const topSlotSorted = result
    ? Object.entries(result.topSlotSegCounts).sort((a, b) => b[1] - a[1])
    : [];
  const multSorted = result
    ? Object.entries(result.topSlotMultCounts).sort((a, b) => Number(a[0]) - Number(b[0]))
    : [];

  return (
    <div style={{
      maxWidth: 640, margin: "0 auto", fontFamily: "'Georgia', serif", color: "#fff",
      background: "#0d0d14", borderRadius: 16, padding: 20,
      border: "1px solid #1e1e2e",
    }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#fbbf24", letterSpacing: 1 }}>
          📊 Simulador RTP — Crazy Time
        </div>
        <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
          Simula partidas para verificar la distribución real de la rueda y el Top Slot
        </div>
      </div>

      {/* Controles */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18, flexWrap: "wrap", justifyContent: "center" }}>
        <select
          value={trials}
          onChange={e => setTrials(Number(e.target.value))}
          disabled={running}
          style={{
            background: "#16161f", border: "1px solid #2a2a3a", borderRadius: 8,
            color: "#fff", fontSize: 13, padding: "10px 14px", outline: "none",
          }}
        >
          <option value={1000}>1.000 partidas</option>
          <option value={10000}>10.000 partidas</option>
          <option value={50000}>50.000 partidas</option>
          <option value={100000}>100.000 partidas</option>
        </select>

        <button
          onClick={simulate}
          disabled={running}
          style={{
            background: running ? "#2a2a3a" : "linear-gradient(135deg, #fbbf24, #f97316)",
            border: "none", borderRadius: 10, padding: "11px 26px",
            fontSize: 14, fontWeight: 800, color: running ? "#666" : "#000",
            cursor: running ? "not-allowed" : "pointer",
          }}
        >
          {running ? "🌀 Simulando..." : "▶ Simular"}
        </button>
      </div>

      {!result && !running && (
        <div style={{ textAlign: "center", color: "#444", fontSize: 13, padding: "20px 0" }}>
          Elige el número de partidas y pulsa Simular
        </div>
      )}

      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Resumen */}
          <div style={{
            background: "rgba(251,191,36,0.06)", border: "1px solid #fbbf2433",
            borderRadius: 10, padding: "12px 14px", textAlign: "center",
          }}>
            <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 1 }}>
              {result.N.toLocaleString()} partidas simuladas
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 24, marginTop: 8, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#00d4aa" }}>
                  {result.avgMultiplier.toFixed(2)}x
                </div>
                <div style={{ fontSize: 10, color: "#777" }}>Promedio multiplicador<br/>(incluye 0 sin match)</div>
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#fbbf24" }}>
                  {((result.topSlotActiveCount / result.N) * 100).toFixed(2)}%
                </div>
                <div style={{ fontSize: 10, color: "#777" }}>Top Slot con match</div>
              </div>
            </div>
          </div>

          {/* Segmentos de la rueda */}
          <div>
            <div style={{ fontSize: 12, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
              🎡 Segmentos de la rueda principal
            </div>
            {wheelSorted.map(([type, count]) => {
              const info = SEGMENT_LABELS[type];
              return (
                <StatBar
                  key={type}
                  label={info?.label || type}
                  emoji={info?.emoji}
                  count={count}
                  total={result.N}
                  color={info?.color}
                />
              );
            })}
          </div>

          {/* Top Slot — segmento */}
          <div>
            <div style={{ fontSize: 12, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
              ⭐ Resultados Top Slot (segmento)
            </div>
            {topSlotSorted.map(([type, count]) => {
              if (type === "NO_MATCH") {
                return (
                  <StatBar
                    key={type}
                    label="Sin Top Slot (-x-)"
                    count={count}
                    total={result.N}
                    color="#555"
                  />
                );
              }
              const info = SEGMENT_LABELS[type];
              return (
                <StatBar
                  key={type}
                  label={info?.label || type}
                  emoji={info?.emoji}
                  count={count}
                  total={result.N}
                  color={info?.color}
                />
              );
            })}
          </div>

          {/* Top Slot — multiplicadores */}
          <div>
            <div style={{ fontSize: 12, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
              ✖️ Multiplicadores (solo cuando hubo match)
            </div>
            {multSorted.map(([mult, count]) => (
              <StatBar
                key={mult}
                label={`×${mult}`}
                count={count}
                total={result.topSlotActiveCount}
                color="#00d4aa"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
