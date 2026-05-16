// Mines.jsx
import { useState, useCallback } from "react";

const TOTAL_CELLS = 25;
const HOUSE_EDGE  = 0.03;

function combination(n, k) {
  if (k > n || k < 0) return 0;
  if (k === 0 || k === n) return 1;
  if (k > n - k) k = n - k;
  let logRes = 0;
  for (let i = 1; i <= k; i++) {
    logRes += Math.log(n - k + i) - Math.log(i);
  }
  return Math.exp(logRes);
}

function calcMultiplier(mines, safeClicks) {
  const num = combination(TOTAL_CELLS - mines, safeClicks);
  const den = combination(TOTAL_CELLS, safeClicks);
  if (den === 0 || num === 0) return 0;
  return (den / num) * (1 - HOUSE_EDGE);
}

function generateGrid(numMines) {
  const grid = Array(25).fill(false);
  let placed = 0;
  while (placed < numMines) {
    const idx = Math.floor(Math.random() * 25);
    if (!grid[idx]) { grid[idx] = true; placed++; }
  }
  return grid;
}

function blankCells() {
  return Array(25).fill(null).map(() => ({ state: "hidden" }));
}

export default function MinesGame({ balance, setBalance, onBack }) {
  const [phase, setPhase]               = useState("idle");
  const [cells, setCells]               = useState(blankCells);
  const [mineGrid, setMineGrid]         = useState([]);
  const [numMines, setNumMines]         = useState(3);
  const [betAmount, setBetAmount]       = useState(100);
  const [safeRevealed, setSafeRevealed] = useState(0);
  const [multiplier, setMultiplier]     = useState(1);
  const [potentialWin, setPotentialWin] = useState(0);
  const [msg, setMsg]                   = useState("");
  const [history, setHistory]           = useState([]);

  const safeCells = TOTAL_CELLS - numMines;

  function newGame() {
    if (betAmount <= 0)                { setMsg("La apuesta debe ser mayor a 0"); return; }
    if (betAmount > balance)           { setMsg("Saldo insuficiente");             return; }
    if (numMines < 1 || numMines > 24) { setMsg("Minas: entre 1 y 24");           return; }

    //setBalance((b) => b - betAmount);
    setBalance(balance - betAmount);
    const grid = generateGrid(numMines);
    setMineGrid(grid);
    setCells(blankCells());
    setSafeRevealed(0);
    setMultiplier(1);
    setPotentialWin(betAmount);
    setPhase("playing");
    setMsg(`${safeCells} gemas · ${numMines} minas — ¡Haz clic!`);
  }

  const reveal = useCallback((idx) => {
    if (phase !== "playing") return;
    const isMine = mineGrid[idx];

    if (isMine) {
      setCells((prev) =>
        prev.map((cell, i) => {
          if (i === idx) return { state: "mine" };
          if (cell.state !== "hidden") return cell;
          return mineGrid[i] ? { state: "ghost-mine" } : { state: "ghost-gem" };
        })
      );
      setPhase("dead");
      setMultiplier(0);
      setPotentialWin(0);
      setMsg(`💥 ¡BOOM! Perdiste $${betAmount}`);
      setHistory((h) => [{ delta: -betAmount, mines: numMines, gems: safeRevealed }, ...h.slice(0, 8)]);
    } else {
      const newSafe = safeRevealed + 1;
      const mult    = calcMultiplier(numMines, newSafe);
      const win     = parseFloat((betAmount * mult).toFixed(2));
      setCells((prev) => prev.map((cell, i) => (i === idx ? { state: "gem" } : cell)));
      setSafeRevealed(newSafe);
      setMultiplier(mult);
      setPotentialWin(win);
      if (newSafe === safeCells) {
        finishCashOut(win, mult, newSafe, true);
      } else {
        setMsg(`✅ Gema ${newSafe}/${safeCells} · ${safeCells - newSafe} restantes · x${mult.toFixed(4)}`);
      }
    }
  }, [phase, mineGrid, safeRevealed, betAmount, numMines, safeCells]);

  function cashOut() {
    if (phase !== "playing") return;
    if (safeRevealed === 0) { setMsg("Revela al menos 1 celda antes de cobrar"); return; }
    const mult = calcMultiplier(numMines, safeRevealed);
    const win  = parseFloat((betAmount * mult).toFixed(2));
    finishCashOut(win, mult, safeRevealed, false);
  }

  function finishCashOut(win, mult, gems, isFullWin) {
    //setBalance((b) => b + win);
    setBalance(balance + win);
    setPhase("won");
    setMultiplier(mult);
    setPotentialWin(win);
    setHistory((h) => [{ delta: win - betAmount, mines: numMines, gems }, ...h.slice(0, 8)]);
    setCells((prev) =>
      prev.map((cell, i) => {
        if (cell.state !== "hidden") return cell;
        return mineGrid[i] ? { state: "ghost-mine" } : { state: "ghost-gem" };
      })
    );
    setMsg(isFullWin
      ? `🏆 ¡TABLERO LIMPIO! +$${win.toFixed(2)} (x${mult.toFixed(4)})`
      : `💰 Cobrado: $${win.toFixed(2)} · x${mult.toFixed(4)}`
    );
  }

  function cellStyle(state) {
    const base = {
      width: "100%", aspectRatio: "1", border: "none", borderRadius: 7,
      fontSize: 30, display: "flex", alignItems: "center", justifyContent: "center",
      cursor: phase === "playing" && state === "hidden" ? "pointer" : "default",
      transition: "transform 0.1s, background 0.15s",
      fontWeight: 700, userSelect: "none",
    };
    switch (state) {
      case "hidden":     return { ...base, background: "#1a2a6c", border: "1px solid #2a3d9f", color: "#4a6adf" };
      case "gem":        return { ...base, background: "#0a5c32", border: "1px solid #0e9e55", color: "#fff" };
      case "mine":       return { ...base, background: "#8b0e0e", border: "1px solid #cc2222", color: "#fff" };
      case "ghost-mine": return { ...base, background: "#3a0a0a", border: "1px solid #6b1010", color: "#993333" };
      case "ghost-gem":  return { ...base, background: "#0a2a17", border: "1px solid #0a5c32", color: "#0a5c32" };
      default:           return base;
    }
  }

  function cellIcon(state) {
    switch (state) {
      case "hidden":     return "?";
      case "gem":        return "💎";
      case "mine":       return "💣";
      case "ghost-mine": return "💣";
      case "ghost-gem":  return "◆";
      default:           return "";
    }
  }

  const netWin = potentialWin - betAmount;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", fontFamily: "Georgia, serif" }}>
      <button onClick={onBack} style={S.back}>← Lobby</button>

      <div style={S.card}>
        <h2 style={{ color: "#fbbf24", marginBottom: 12, fontSize: 24, letterSpacing: 2, textAlign: "center" }}>
          💣 MINES
        </h2>

        {/* Mensaje de estado */}
        <div style={{
          ...S.msgBox, fontSize: 20,
          color: phase === "dead" ? "#ff4444" : phase === "won" ? "#fbbf24" : "#80c8ff",
        }}>
          {msg || "Configura tu apuesta y pulsa NUEVA PARTIDA"}
        </div>

        {/* Stats row */}
        <div style={S.statsRow}>
          <div style={S.statBox}>
            <div style={S.statLabel}>Multiplicador</div>
            <div style={{ ...S.statValue, color: "#fbbf24" }}>x{multiplier.toFixed(4)}</div>
          </div>
          <div style={S.statBox}>
            <div style={S.statLabel}>Ganancia potencial</div>
            <div style={{ ...S.statValue, color: netWin >= 0 ? "#00d4aa" : "#ff4444" }}>
              ${potentialWin.toFixed(2)}
              <span style={{ fontSize: 13, marginLeft: 4, opacity: 0.7 }}>
                ({netWin >= 0 ? "+" : ""}{netWin.toFixed(2)})
              </span>
            </div>
          </div>
        </div>

        {/* ── Fila principal: grilla izquierda + panel derecho ── */}
        <div style={S.mainRow}>

          {/* Columna izquierda: tablero + botón cobrar */}
          <div style={S.leftCol}>
            <div style={S.grid}>
              {cells.map((cell, i) => (
                <button
                  key={i}
                  style={cellStyle(cell.state)}
                  onClick={() => reveal(i)}
                  disabled={phase !== "playing" || cell.state !== "hidden"}
                >
                  {cellIcon(cell.state)}
                </button>
              ))}
            </div>

            {/* Botón cobrar — debajo del tablero, solo al jugar */}
            {phase === "playing" && (
              <button
                onClick={cashOut}
                disabled={safeRevealed === 0}
                style={{ ...S.btnCash, marginTop: 8, opacity: safeRevealed === 0 ? 0.4 : 1 }}
              >
                💰 COBRAR ${potentialWin.toFixed(2)}
              </button>
            )}
          </div>

          {/* Columna derecha: config → nueva partida → historial */}
          <div style={S.rightCol}>

            {/* Configuración / info de ronda */}
            {phase !== "playing" ? (
              <div style={S.configBox}>
                {/* Apuesta */}
                <div style={{ marginBottom: 14 }}>
                  <div style={S.label}>APUESTA</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {[50, 100, 250, 500, 1000].map((v) => (
                      <button
                        key={v}
                        onClick={() => setBetAmount(v)}
                        style={{
                          ...S.chip,
                          background: betAmount === v ? "#fbbf24" : "#1e1e2e",
                          color:      betAmount === v ? "#000"    : "#aaa",
                          border:     betAmount === v ? "1px solid #fbbf24" : "1px solid #2a2a3a",
                        }}
                      >
                        ${v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Slider de minas */}
                <div>
                  <div style={S.label}>MINAS: {numMines} &nbsp;·&nbsp; GEMAS: {TOTAL_CELLS - numMines}</div>
                  <input
                    type="range"
                    min={1} max={24}
                    value={numMines}
                    onChange={(e) => setNumMines(parseInt(e.target.value))}
                    style={{ width: "100%", accentColor: "#fbbf24", marginBottom: 2 }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#dadada" }}>
                    <span>1 fácil</span><span>24 extremo</span>
                  </div>
                </div>
              </div>
            ) : (
              /* Info compacta durante la partida */
              <div style={S.configBox}>
                <div style={S.label}>RONDA ACTIVA</div>
                <div style={S.infoRow}><span style={S.infoKey}>Apuesta</span>  <span style={S.infoVal}>${betAmount}</span></div>
                <div style={S.infoRow}><span style={S.infoKey}>Minas</span>    <span style={S.infoVal}>💣 {numMines}</span></div>
                <div style={S.infoRow}><span style={S.infoKey}>Gemas</span>    <span style={S.infoVal}>💎 {safeRevealed}/{safeCells}</span></div>
              </div>
            )}

            {/* Botón nueva partida */}
            <button
              onClick={newGame}
              disabled={phase === "playing"}
              style={{ ...S.btnNew, marginTop: 10, opacity: phase === "playing" ? 0.35 : 1 }}
            >
              NUEVA PARTIDA
            </button>

            {/* Historial */}
            {history.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={S.label}>HISTORIAL</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 5 }}>
                  {history.map((h, i) => (
                    <div key={i} style={S.histRow}>
                      <span style={{ color: "#ffffff", fontSize: 20 }}>💣{h.mines} 💎{h.gems}</span>
                      <span style={{ color: h.delta >= 0 ? "#00d4aa" : "#ff4444", fontWeight: 700, fontSize: 20 }}>
                        {h.delta >= 0 ? "+" : ""}{h.delta.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
          {/* fin columna derecha */}
        </div>
        {/* fin mainRow */}

      </div>
    </div>
  );
}

const S = {
  back:      { background: "transparent", border: "none", color: "#555", fontSize: 14, cursor: "pointer", marginBottom: 12, padding: 0 },
  card:      { background: "#16161f", border: "1px solid #1e1e2e", borderRadius: 14, padding: 20 },
  msgBox:    { background: "#0d0d14", borderRadius: 8, padding: "10px 14px", fontSize: 13, fontWeight: 700, marginBottom: 12, textAlign: "center", minHeight: 36 },
  statsRow:  { display: "flex", gap: 10, marginBottom: 14 },
  statBox:   { flex: 1, background: "#0d0d14", borderRadius: 8, padding: "10px 12px", textAlign: "center" },
  statLabel: { color: "#ffffff", fontSize: 14, letterSpacing: 1.5, marginBottom: 4, textAlign: "center" },
  statValue: { fontSize: 16, fontWeight: 700 },

  // layout dos columnas
  mainRow:   { display: "flex", gap: 14, alignItems: "flex-start" },
  leftCol:   { flex: "0 0 auto" },
  grid:      { display: "grid", gridTemplateColumns: "repeat(5, 80px)", gap: 8 },
  rightCol:  { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },

  // panel config
  configBox: { background: "#0d0d14", borderRadius: 8, padding: "12px 12px", textAlign: "center" },
  label:     { color: "#ffffff", fontSize: 12, letterSpacing: 1.5, marginBottom: 4, display: "block", textAlign: "center" },
  chip:      { width: "100%", borderRadius: 6, padding: "7px 10px", fontSize: 15, cursor: "pointer", fontWeight: 700, textAlign: "center" },

  // info ronda activa
  infoRow:   { display: "flex", justifyContent: "space-between", marginBottom: 8 },
  infoKey:   { color: "#ffffff", fontSize: 15 },
  infoVal:   { color: "#fff", fontSize: 15, fontWeight: 700},

  // botones
  btnNew:    { width: "100%", background: "linear-gradient(135deg,#065f2e,#00a854)", border: "1px solid #00a854", borderRadius: 8, padding: "12px 0", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", letterSpacing: 0.5 },
  btnCash:   { width: "100%", background: "linear-gradient(135deg,#7a5200,#e6a800)", border: "1px solid #e6a800", borderRadius: 8, padding: "12px 0", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", letterSpacing: 0.5 },

  // historial
  histRow:   { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0d0d14", borderRadius: 6, padding: "5px 10px" },
};
