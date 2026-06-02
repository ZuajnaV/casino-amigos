import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase";

// ─── CONSTANTS ────────────────────────────────────────────────
const VISUAL_LANES = 10;

const DIFFICULTY_CONFIG = {
  Easy: {
    prob: 0.95,
    finalMult: 55,
    rtp: 0.98,
    totalLevels: 20,
    finalProb: 0.75,
    color: "#4ade80",
  },
  Medium: {
    prob: 0.8,
    finalMult: 5000,
    rtp: 0.98,
    totalLevels: 20,
    finalProb: 0.60,
    color: "#facc15",
  },
  Hard: {
    prob: 0.7,
    finalMult: 20000,
    rtp: 0.98,
    totalLevels: 15,
    finalProb: 0.5,
    color: "#f97316",
  },
  Hardcore: {
    prob: 0.52,
    finalMult: 1000000,
    rtp: 0.98,
    totalLevels: 15,
    finalProb: 0.35,
    color: "#ef4444",
  },
};

function buildProbArray(cfg) {
  const { prob, totalLevels, finalProb } = cfg;
  const coef = (prob - finalProb) / (totalLevels - 1);
  return Array.from({ length: totalLevels }, (_, i) =>
    Math.max(0.1, prob - i * coef)
  );
}

function calcMult(probArray, level, cfg) {
  if (level === cfg.totalLevels) return cfg.finalMult;
  let pAcum = 1;
  for (let k = 0; k < level; k++) pAcum *= probArray[k];
  return cfg.rtp / pAcum;
}

// ─── LANE STATES ──────────────────────────────────────────────
// "idle" | "active" | "passed" | "crash" | "dim"

const initialLaneState = () =>
  Array.from({ length: VISUAL_LANES }, (_, i) => ({
    visualIndex: i,
    label: `Nv ${i + 1}`,
    realLevel: i + 1,
    state: i === 0 ? "active" : "idle",
    mult: "x?.??",
  }));

// ─── CHICKEN ROAD COMPONENT ───────────────────────────────────
export default function ChickenRoad({ balance = 0, onBalanceChange, onBack }) {
  const [bal, setBal] = useState(balance);
  const [bet, setBet] = useState(10);
  const [diff, setDiff] = useState("Easy");
  const [gameState, setGameState] = useState("idle"); // idle | playing | crashed | won
  const [level, setLevel] = useState(0);
  const [mult, setMult] = useState(1);
  const [lanes, setLanes] = useState(initialLaneState());
  const [chickenPos, setChickenPos] = useState(-1); // -1=start, 0-9=lane index, -99=dead
  const [statusMsg, setStatusMsg] = useState({ text: "Configura tu apuesta y pulsa NUEVA PARTIDA", color: "#6b8cca" });
  const [hist, setHist] = useState(0);
  const [probArray, setProbArray] = useState([]);
  const [cfg, setCfg] = useState(DIFFICULTY_CONFIG["Easy"]);
  const [visualOffset, setVisualOffset] = useState(0); // 0 = showing lvl 1-10, 10 = showing 11-20
  const [isAnimating, setIsAnimating] = useState(false);

  // sync external balance
  useEffect(() => { setBal(balance); }, [balance]);



  useEffect(() => {
  supabase.auth.getSession().then(async ({ data: { session } }) => {
    if (!session) return;
    const { data } = await supabase.from("chickenroad_stats")
      .select("hist_net").eq("user_id", session.user.id).single();
    if (data) setHist(data.hist_net);
  });
}, []);



  useEffect(() => {
  if (hist === 0) return;
  supabase.auth.getSession().then(async ({ data: { session } }) => {
    if (!session) return;
    await supabase.from("chickenroad_stats")
      .update({ hist_net: hist }).eq("user_id", session.user.id);
  });
}, [hist]);






  const currentProb = probArray.length > 0 && level < probArray.length
    ? probArray[level]
    : null;

  // ─── BUILD MULT LABEL ────────────────────────────────────────
  function multLabel(realLevel, currentCfg, pArr) {
    if (!pArr || pArr.length === 0) return "x?.??";
    if (realLevel === currentCfg.totalLevels) return `x${currentCfg.finalMult.toLocaleString()}`;
    let pAcum = 1;
    for (let k = 0; k < realLevel; k++) pAcum *= pArr[k];
    return `x${(currentCfg.rtp / pAcum).toFixed(0)}`;
  }

  // ─── BUILD LANES FROM SCRATCH ───────────────────────────────
  function buildLanes(offset, currentLevel, currentCfg, pArr, crashedAt = null) {
    return Array.from({ length: VISUAL_LANES }, (_, vi) => {
      const realLevel = offset + vi + 1;
      if (realLevel > currentCfg.totalLevels) return null;

      let state = "idle";
      if (crashedAt !== null && realLevel === crashedAt) state = "crash";
      else if (realLevel <= currentLevel) state = "passed";
      else if (realLevel === currentLevel + 1) state = "active";
      else if (crashedAt !== null && realLevel > crashedAt) state = "dim";

      return {
        visualIndex: vi,
        realLevel,
        label: `Nv ${realLevel}`,
        mult: multLabel(realLevel, currentCfg, pArr),
        state,
        isGolden: realLevel >= currentCfg.totalLevels - 2,
      };
    });
  }

  // ─── NUEVA PARTIDA ───────────────────────────────────────────
  function handleNewGame() {
    if (bet <= 0) { setStatusMsg({ text: "La apuesta debe ser mayor a 0", color: "#f87171" }); return; }
    if (bet > bal) { setStatusMsg({ text: `Saldo insuficiente ($${bal.toFixed(0)})`, color: "#f87171" }); return; }

    const currentCfg = DIFFICULTY_CONFIG[diff];
    const pArr = buildProbArray(currentCfg);

    const newBal = bal - bet;
    setBal(newBal);
    onBalanceChange?.(newBal);
    setHist(h => h - bet);

    setCfg(currentCfg);
    setProbArray(pArr);
    setLevel(0);
    setMult(1);
    setVisualOffset(0);
    setGameState("playing");
    setChickenPos(-1);
    setLanes(buildLanes(0, 0, currentCfg, pArr));
    setStatusMsg({
      text: `$${bet.toFixed(0)} apostados | ${diff} (${(currentCfg.prob * 100).toFixed(0)}% por carril) | Pulsa GO para avanzar!`,
      color: "#4ade80",
    });
  }

  // ─── GO ───────────────────────────────────────────────────────
  function handleGo() {
    if (gameState !== "playing" || isAnimating) return;

    const nextLevel = level + 1;
    const rand = Math.random();
    const success = rand <= probArray[nextLevel - 1];

    setIsAnimating(true);

    setTimeout(() => {
      if (success) {
        const newMult = calcMult(probArray, nextLevel, cfg);
        setLevel(nextLevel);
        setMult(newMult);

        // Did we just cross into page 2?
        const needsFlip = nextLevel === 11 && cfg.totalLevels > 10;
        const newOffset = needsFlip ? 10 : visualOffset;

        const newLanes = buildLanes(newOffset, nextLevel, cfg, probArray);
        setLanes(newLanes);
        if (needsFlip) setVisualOffset(10);

        const visualIdx = (nextLevel - 1) % VISUAL_LANES;
        setChickenPos(visualIdx);

        if (nextLevel === cfg.totalLevels) {
          // Full win — cash out automatically
          const win = parseFloat((bet * newMult).toFixed(0));
          const newBal = bal - bet + win; // bet was already deducted
          // actually bal already had bet deducted
          const finalBal = parseFloat((bal + win).toFixed(0));
          setBal(finalBal);
          onBalanceChange?.(finalBal);
          setHist(h => parseFloat((h + win).toFixed(0)));
          setGameState("won");
          setStatusMsg({ text: `🏆 TABLERO COMPLETO! Ganaste $${win.toFixed(0)} (x${newMult.toFixed(0)})`, color: "#fbbf24" });
        } else {
          setStatusMsg({
            text: `Carril ${nextLevel} cruzado! x${newMult.toFixed(0)} | Pot: $${(bet * newMult).toFixed(0)} | GO o CASH OUT`,
            color: "#4ade80",
          });
        }
      } else {
        // CRASH
        setGameState("crashed");
        setChickenPos(-99); // dead
        const newLanes = buildLanes(visualOffset, level, cfg, probArray, nextLevel);
        setLanes(newLanes);
        setStatusMsg({ text: `💥 ATROPELLADO en carril ${nextLevel}! Perdiste $${bet.toFixed(0)}`, color: "#ef4444" });
      }
      setIsAnimating(false);
    }, 350);
  }

  // ─── CASH OUT ────────────────────────────────────────────────
  function handleCashOut() {
    if (gameState !== "playing") return;
    if (level === 0) { setStatusMsg({ text: "Supera al menos 1 carril antes de cobrar.", color: "#f87171" }); return; }

    const win = parseFloat((bet * mult).toFixed(0));
    const finalBal = parseFloat((bal + win).toFixed(0));
    setBal(finalBal);
    onBalanceChange?.(finalBal);
    setHist(h => parseFloat((h + win).toFixed(0)));
    setGameState("idle");

    const newLanes = lanes.map((ln, vi) => {
      if (!ln) return ln;
      if (ln.realLevel > level) return { ...ln, state: "dim" };
      return ln;
    });
    setLanes(newLanes);
    setStatusMsg({ text: `💰 COBRADO en carril ${level}: $${win.toFixed(0)} (x${mult.toFixed(0)})`, color: "#fbbf24" });
  }

  // ─── CHICKEN POSITION ─────────────────────────────────────────
  const chickenAtStart = chickenPos === -1;
  const chickenDead = chickenPos === -99;

  // ─── RENDER ──────────────────────────────────────────────────
  return (
    <div style={styles.root}>
      {/* BG grid texture */}
      <div style={styles.bgGrid} />

      <div style={styles.wrapper}>

        
        <button onClick={onBack} style={styles.backBtn}>← Lobby</button>



        {/* TITLE */}
        <div style={styles.title}>
          <span style={styles.titleChicken}>🐔</span>
          <span style={styles.titleText}>CHICKEN ROAD</span>
          <span style={styles.titleChicken}>🐔</span>
        </div>

        {/* STATUS BAR */}
        <div style={{ ...styles.statusBar, color: statusMsg.color, borderColor: statusMsg.color + "44" }}>
          {statusMsg.text}
        </div>

        {/* ROAD */}
        <div style={styles.roadWrapper}>
          {/* Chicken start zone */}
          <div style={styles.chickenStartZone}>
            {chickenAtStart && (
              <img src="/chicken.png" alt="chicken" style={styles.chickenImgStart} />
            )}
          </div>

          <div style={styles.road}>
            {lanes.map((ln, vi) => {
              if (!ln) return (
                <div key={vi} style={{ ...styles.lane, ...styles.laneEmpty }} />
              );

              const isActive = ln.state === "active";
              const isPassed = ln.state === "passed";
              const isCrash = ln.state === "crash";
              const isDim = ln.state === "dim";
              const isGolden = ln.isGolden;

              // Is chicken here?
              const chickenHere = !chickenDead && !chickenAtStart && chickenPos === vi;

              return (
                <div key={vi} style={{ ...styles.lane, ...(isActive ? styles.laneActive : {}), ...(isDim ? styles.laneDim : {}) }}>
                  {/* Obs row */}
                  <div style={{
                    ...styles.obsRow,
                    background: isPassed ? "#0a2a0f" : isCrash ? "#500a0a" : "#2a2e44",
                  }}>
                    {isPassed && <span style={{ color: "#4ade80", fontSize: 30 }}>✓</span>}
                    {isCrash && <span style={{ color: "#fff", fontSize: 30 }}>✗</span>}
                  </div>

                  {/* Mult row */}
                  <div style={{
                    ...styles.multRow,
                    ...(isGolden ? styles.multGolden : {}),
                    ...(isPassed ? (isGolden ? styles.multPassedGolden : styles.multPassed) : {}),
                    ...(isCrash ? styles.multCrash : {}),
                    ...(isActive ? (isGolden ? styles.multActiveGolden : styles.multActive) : {}),
                    ...(isDim ? styles.multDim : {}),
                    outline: isActive ? `2px solid ${isGolden ? "#f59e0b" : "#3b82f6"}` : "none",
                    outlineOffset: -2,
                  }}>
                    <span style={{ fontSize: isGolden ? 25 : 25 }}>{ln.mult}</span>
                  </div>

                  {/* Chicken row */}
                  <div style={{
                    ...styles.chkRow,
                    background: isPassed ? "#071a09" : isCrash ? "#1e0404" : "#282d46",
                  }}>
                    {chickenHere && !chickenDead && (
                      <img src="/chicken.png" alt="chicken" style={styles.chickenImg} />
                    )}
                    {isCrash && chickenDead && (
                      <img src="/chickendead.png" alt="dead" style={styles.chickenImg} />
                    )}
                  </div>

                  {/* Label */}
                  <div style={{
                    ...styles.lblRow,
                    color: isActive ? "#38bdf8" : isPassed ? "#4ade80" : isCrash ? "#f87171" : isDim ? "#334" : isGolden ? "#d97706" : "#4e6290",
                    fontWeight: isActive || isGolden ? 700 : 400,
                    background: isGolden ? "#1a0e00" : "#151830",
                  }}>
                    {ln.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* PANEL */}
        <div style={styles.panel}>
          {/* Left: Config */}
          <div style={styles.panelLeft}>
            <div style={styles.panelTitle}>CONTROL</div>

            <div style={styles.fieldRow}>
              <label style={styles.fieldLabel}>Saldo ($)</label>
              <div style={{ ...styles.fieldVal, color: "#38bdf8" }}>${bal.toFixed(0)}</div>
            </div>

            <div style={styles.fieldRow}>
              <label style={styles.fieldLabel}>Apuesta ($)</label>
              <input
                type="number"
                value={bet}
                min={0.01}
                step={0.5}
                onChange={e => setBet(parseFloat(e.target.value) || 0)}
                disabled={gameState === "playing"}
                style={styles.input}
              />
            </div>

            <div style={styles.fieldRow}>
              <label style={styles.fieldLabel}>Dificultad</label>
              <select
                value={diff}
                onChange={e => setDiff(e.target.value)}
                disabled={gameState === "playing"}
                style={styles.select}
              >
                {Object.entries(DIFFICULTY_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>

            {/* Diff info */}
            <div style={styles.diffBadge}>
              <span style={{ color: DIFFICULTY_CONFIG[diff].color }}>
                {diff}
              </span>
              <span style={{ color: "#b3b3b3", fontSize: 15 }}>
                {(DIFFICULTY_CONFIG[diff].prob * 100).toFixed(0)}% inicio →{" "}
                {(DIFFICULTY_CONFIG[diff].finalProb * 100).toFixed(0)}% fin ·{" "}
                {DIFFICULTY_CONFIG[diff].totalLevels} niveles
              </span>
            </div>
              <button onClick={handleNewGame} disabled={gameState === "playing" || isAnimating} style={{ ...styles.btn, ...styles.btnNew }}>
                NUEVA PARTIDA
              </button>
          </div>

          {/* Right: Stats + Buttons */}
          <div style={styles.panelRight}>
            <div style={styles.panelTitle}>ESTADÍSTICAS</div>

            <div style={styles.statGrid}>
              <StatRow label="Carril" value={`${level} / ${cfg.totalLevels}`} color="#fff" />
              <StatRow label="Multiplicador" value={`${mult.toFixed(0)}x`} color="#facc15" />
              <StatRow label="Gan. potencial" value={`$${(bet * mult).toFixed(0)}`} color="#4ade80" />
              <StatRow
                label="P. éxito sig."
                value={currentProb ? `${(currentProb * 100).toFixed(0)}%` : "-"}
                color="#a78bfa"
              />
              <StatRow
                label="Histórico neto"
                value={`$${hist.toFixed(0)}`}
                color={hist >= 0 ? "#4ade80" : "#f87171"}
              />
            </div>

            {/* Buttons */}
            <div style={styles.btnGroup}>
              <button onClick={handleGo} disabled={gameState !== "playing" || isAnimating} style={{ ...styles.btn, ...styles.btnGo, opacity: (gameState !== "playing" || isAnimating) ? 0.4 : 1 }}>
                {isAnimating ? "..." : "GO"}
              </button>
              <button onClick={handleCashOut} disabled={gameState !== "playing" || level === 0 || isAnimating} style={{ ...styles.btn, ...styles.btnCash, opacity: (gameState !== "playing" || level === 0 || isAnimating) ? 0.4 : 1 }}>
                CASH OUT
              </button>
            </div>
          </div>
        </div>

        {/* INSTRUCTIONS */}
        <div style={styles.instructions}>
          <span style={{ color: "#facc15", fontWeight: 700 }}>CÓMO JUGAR:</span>
          {"  "}Easy:95%  Medium:80%  Hard:70%  Hardcore:52% · La probabilidad disminuye con cada carril.
          {" "}✓=superado  ✗=atropellado  🐔=pollo
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value, color }) {
  return (
    <div style={styles.statRow}>
      <span style={styles.statLabel}>{label}</span>
      <span style={{ ...styles.statVal, color }}>{value}</span>
    </div>
  );
}

// ─── STYLES ───────────────────────────────────────────────────
const styles = {
  root: {
    position: "relative",
    minHeight: "100vh",
    background: "#0d1020",
    fontFamily: "'Courier New', 'Consolas', monospace",
    color: "#c8dcff",
    overflow: "hidden",
  },
  bgGrid: {
    position: "absolute", inset: 0, pointerEvents: "none",
    backgroundImage:
      "linear-gradient(rgba(60,80,160,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(60,80,160,0.06) 1px, transparent 1px)",
    backgroundSize: "40px 40px",
  },
  wrapper: {
    position: "relative", zIndex: 1,
    maxWidth: 1100, margin: "0 auto",
    padding: "24px 16px",
    display: "flex", flexDirection: "column", gap: 16,
  },
  title: {
    display: "flex", alignItems: "center", justifyContent: "center",
    gap: 12, padding: "10px 0",
  },
  titleChicken: { fontSize: 28 },
  titleText: {
    fontSize: 28, fontWeight: 900, letterSpacing: 8,
    color: "#fbbf24", textShadow: "0 0 24px #f59e0b88",
  },
  titleSub: {
    textAlign: "center", fontSize: 11, color: "#3d5080", letterSpacing: 3, marginTop: -8,
  },
  statusBar: {
    background: "#07091a",
    border: "1px solid",
    borderRadius: 6,
    padding: "8px 14px",
    fontSize: 20, fontWeight: 700,
    letterSpacing: 0.5,
    minHeight: 36,
    display: "flex", alignItems: "center",
    transition: "color 0.3s, border-color 0.3s",
  },
  roadWrapper: {
    display: "flex", alignItems: "stretch",
    background: "#0e1226",
    border: "1px solid #1e2a50",
    borderRadius: 10,
    overflow: "hidden",
  },
  chickenStartZone: {
    width: 52, minWidth: 52,
    background: "#111628",
    borderRight: "1px dashed #2a3560",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  chickenImgStart: {
    width: 70, height: 250, objectFit: "contain",
    filter: "drop-shadow(0 0 8px #fbbf24aa)",
  },
  road: {
    flex: 1, display: "flex",
  },
  lane: {
    flex: 1,
    borderRight: "1px dashed #2a3560",
    display: "flex", flexDirection: "column",
    transition: "background 0.2s",
  },
  laneEmpty: { background: "transparent", borderRight: "none" },
  laneActive: {
    background: "#101830",
    boxShadow: "inset 0 0 0 1px #3b82f6",
  },
  laneDim: { opacity: 0.35 },
  obsRow: {
    height: 30,
    display: "flex", alignItems: "center", justifyContent: "center",
    borderBottom: "1px solid #1e2540",
    transition: "background 0.2s",
  },
  multRow: {
    height: 125,
    display: "flex", alignItems: "center", justifyContent: "center",
    textAlign: "center",
    fontWeight: 700, fontSize: 120,
    color: "#8eaadf",
    background: "#20263e",
    borderBottom: "1px solid #1e2540",
    padding: "4px 2px",
    transition: "all 0.2s",
    lineHeight: 1.2,
  },
  multGolden: { color: "#f59e0b", background: "#1a0e00" },
  multPassed: { color: "#4ade80", background: "#071a09" },
  multPassedGolden: { color: "#fbbf24", background: "#2a1c00" },
  multCrash: { color: "#f87171", background: "#1e0404" },
  multActive: { color: "#fbbf24", background: "#0f1e38" },
  multActiveGolden: { color: "#fde68a", background: "#1a0f00", fontSize: 13 },
  multDim: { color: "#2a3350", background: "#111828" },
  chkRow: {
    height: 80,
    display: "flex", alignItems: "center", justifyContent: "center",
    borderBottom: "1px solid #1e2540",
    transition: "background 0.2s",
  },
  chickenImg: {
    width: 120, height: 100, objectFit: "contain",
    filter: "drop-shadow(0 0 6px #fbbf2488)",
  },
  lblRow: {
    height: 30,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 15, letterSpacing: 0.5,
    transition: "all 0.2s",
  },
  panel: {
    display: "flex", gap: 16, flexWrap: "wrap",
  },
  panelLeft: {
    flex: "1 1 260px",
    background: "#070a1c",
    border: "1px solid #1a2448",
    borderRadius: 10,
    padding: "14px 16px",
    display: "flex", flexDirection: "column", gap: 10,
  },
  panelRight: {
    flex: "1 1 300px",
    background: "#070a1c",
    border: "1px solid #1a2448",
    borderRadius: 10,
    padding: "14px 16px",
    display: "flex", flexDirection: "column", gap: 10,
  },
  panelTitle: {
    fontSize: 20, fontWeight: 700, letterSpacing: 3,
    color: "#fbbf24", marginBottom: 4,
  },
  fieldRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
  },
  fieldLabel: { fontSize: 15, color: "#ffffff", minWidth: 90 },
  fieldVal: { fontSize: 20, fontWeight: 700 },
  input: {
    background: "#0a0e24", border: "1px solid #1e2e60",
    color: "#4ade80", borderRadius: 4, padding: "4px 8px",
    fontSize: 20, fontWeight: 700, width: 100,
    outline: "none", textAlign: "center",
    fontFamily: "inherit",
  },
  select: {
    background: "#0a0e24", border: "1px solid #1e2e60",
    color: "#fb923c", borderRadius: 4, padding: "4px 8px",
    fontSize: 20, fontWeight: 700, outline: "none", textAlign: "center",
    fontFamily: "inherit", cursor: "pointer",
  },
  diffBadge: {
    background: "#0c1030", border: "1px solid #1a2448",
    borderRadius: 6, padding: "6px 10px",
    display: "flex", flexDirection: "column", gap: 2, fontSize: 20,
  },
  statGrid: { display: "flex", flexDirection: "column", gap: 6 },
  statRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    borderBottom: "1px solid #111828", paddingBottom: 4,
  },
  statLabel: { fontSize: 15, color: "#ffffff" },
  statVal: { fontSize: 18, fontWeight: 700 },
  btnGroup: { display: "flex", flexDirection: "column", gap: 8, marginTop: 4 },
  btn: {
    border: "none", borderRadius: 6, padding: "10px 0",
    fontFamily: "'Courier New', monospace", fontWeight: 900,
    fontSize: 20, letterSpacing: 2, cursor: "pointer",
    transition: "all 0.15s", width: "100%",
  },
  btnNew: {
    background: "#064024", border: "1px solid #15803d",
    color: "#fff",
  },
  btnGo: {
    background: "#15803d", border: "2px solid #22c55e",
    color: "#fff", fontSize: 20,
  },
  btnCash: {
    background: "#854d0e", border: "1px solid #ca8a04",
    color: "#fff",
  },
  instructions: {
    background: "#06080f", border: "1px solid #111828",
    borderRadius: 8, padding: "10px 14px",
    fontSize: 14, color: "#ffffff", lineHeight: 1.8,
  },
  backBtn: {
    background: "transparent", border: "none",
    color: "#5570a0", fontSize: 13, cursor: "pointer",
    padding: 0, marginBottom: 4, textAlign: "left",
  },
};
