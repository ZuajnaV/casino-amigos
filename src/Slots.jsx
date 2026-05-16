import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase";

// ── Símbolos ────────────────────────────────────────────────────────────────
const SYMBOLS = [
  { id: "cereza",    img: "/cereza.png",   prob: 15, type: "common",  pay: [0, 0, 1,  4,   8]   },
  { id: "sandia",    img: "/sandia.png",   prob: 14, type: "common",  pay: [0, 0, 1,  5,   10]   },
  { id: "fresa",     img: "/fresa.png",    prob: 12, type: "common",  pay: [0, 0, 1,  6,  12]   },
  { id: "banano",    img: "/banano.png",   prob: 9,  type: "common",  pay: [0, 0, 3,  7,  14]   },
  { id: "uvas",      img: "/uvas.png",     prob: 9,  type: "common",  pay: [0, 0, 3,  8,  16]   },
  { id: "corazon",   img: "/corazon.png",  prob: 9,  type: "common",  pay: [0, 0, 5,  9,  18]   },
  { id: "campana",   img: "/campana.png",  prob: 8,  type: "premium", pay: [0, 0, 9,  20,  70]   },
  { id: "esmeralda", img: "/esmeralda.png",prob: 6,  type: "premium", pay: [0, 0, 12, 40,  80]   },
  { id: "rubi",      img: "/rubi.png",     prob: 5,  type: "premium", pay: [0, 0, 20, 50,  110]  },
  { id: "diamante",  img: "/diamante.png", prob: 5,  type: "premium", pay: [0, 0, 50, 250, 1000] },
  { id: "trebol",    img: "/trebol.png",   prob: 1,  type: "wild"  },
  { id: "hongo",     img: "/hongo.png",    prob: 1,  type: "wild"  },
  { id: "dulce",     img: "/dulce.png",    prob: 5,  type: "scatter", freeSpins: [0,0,6,25,70] },
  { id: "jackpot",   img: "/jackpot.png",  prob: 1,  type: "jackpot" },
];

const TOTAL_PROB = SYMBOLS.reduce((s, sym) => s + sym.prob, 0);
function randomSymbol() {
  let r = Math.random() * TOTAL_PROB;
  for (const sym of SYMBOLS) { r -= sym.prob; if (r <= 0) return sym.id; }
  return SYMBOLS[0].id;
}
function getSymbol(id) { return SYMBOLS.find(s => s.id === id); }
function generateGrid() {
  return Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => randomSymbol()));
}

function evaluateGrid(grid, betPerLine) {
  let totalPayout = 0;
  const winningLines = [];
  let freeSpinsWon = 0;
  let jackpotCount = 0;

  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++)
      if (grid[r][c] === "jackpot") jackpotCount++;

  let wildCount = 0;
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++)
      if (getSymbol(grid[r][c]).type === "wild") wildCount++;
  const wildBonus = wildCount >= 3;

  for (let r = 0; r < 5; r++) {
    const result = evaluateLine(grid[r], betPerLine, wildBonus);
    if (result) { winningLines.push({ type: "row", index: r, ...result }); totalPayout += result.payout; if (result.freeSpins) freeSpinsWon += result.freeSpins; }
  }
  for (let c = 0; c < 5; c++) {
    const col = grid.map(row => row[c]);
    const result = evaluateLine(col, betPerLine, wildBonus);
    if (result) { winningLines.push({ type: "col", index: c, ...result }); totalPayout += result.payout; if (result.freeSpins) freeSpinsWon += result.freeSpins; }
  }
  return { totalPayout, winningLines, freeSpinsWon, jackpotCount, wildBonus };
}

function evaluateLine(line, betPerLine, wildBonus) {
  const filtered = line.filter(id => { const s = getSymbol(id); return s.type === "common" || s.type === "premium"; });
  const counts = {};
  for (const id of filtered) counts[id] = (counts[id] || 0) + 1;
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const scatterCount = line.filter(id => id === "dulce").length;

  if (!best || best[1] < 3) {
    if (scatterCount >= 3) { const sym = getSymbol("dulce"); return { symId: "dulce", count: scatterCount, mult: 0, payout: 0, freeSpins: sym.freeSpins[scatterCount] }; }
    return null;
  }
  const [symId, count] = best;
  const sym = getSymbol(symId);
  let mult = sym.pay[count - 1] || 0;
  if (wildBonus) mult *= 2;
  return { symId, count, mult, payout: betPerLine * mult, freeSpins: 0 };
}

function checkJackpotAcum(line) {
  const CHERRY = ["cereza", "corazon"];
  for (let i = 0; i <= line.length - 3; i++) {
    const window = line.slice(i, i + 3);
    if (window.some(id => CHERRY.includes(id)) && window.includes("diamante") && window.includes("dulce")) return true;
  }
  return false;
}

function useAudio() {
  const audioRef = useRef(null);
  const bgRef = useRef(null);
  const playBg = useCallback((file) => {
    if (bgRef.current) { bgRef.current.pause(); bgRef.current = null; }
    const audio = new Audio(`/${file}`); audio.loop = true; audio.volume = 0.4; audio.play().catch(() => {}); bgRef.current = audio;
  }, []);
  const stopBg = useCallback(() => { if (bgRef.current) { bgRef.current.pause(); bgRef.current = null; } }, []);
  const playSfx = useCallback((file) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    const audio = new Audio(`/${file}`); audio.volume = 0.8; audio.play().catch(() => {}); audioRef.current = audio;
  }, []);
  return { playBg, stopBg, playSfx };
}

function SlotGrid({ grid, spinning, stoppedCols, winningLines }) {
  function isCellHighlighted(r, c) {
    if (!winningLines || winningLines.length === 0) return false;
    return winningLines.some(line => (line.type === "row" ? line.index === r : line.index === c));
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, background: "#0a0a14", border: "2px solid #2a2a4a", borderRadius: 12, padding: 8 }}>
      {grid.map((row, r) => row.map((symId, c) => {
        const sym = getSymbol(symId);
        const isWin = isCellHighlighted(r, c);
        const isColSpinning = spinning && !stoppedCols?.has(c);
        return (
          <div key={`${r}-${c}`} style={{
            background: isWin ? "#1a2a0a" : "#14141f",
            border: `2px solid ${isWin ? "#FFD700" : isColSpinning ? "#3a3a6a" : "#1e1e2e"}`,
            borderRadius: 8, aspectRatio: "1",
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden", position: "relative",
            boxShadow: isWin ? "0 0 10px #FFD70088" : "none",
            transition: "border-color 0.3s, box-shadow 0.3s",
          }}>
            <img src={sym.img} alt={symId} style={{
              width: "80%", height: "80%", objectFit: "contain",
              filter: isWin ? "drop-shadow(0 0 4px #FFD700)" : isColSpinning ? "blur(2px) brightness(0.6)" : "none",
              transition: isColSpinning ? "none" : "filter 0.2s",
            }} onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }} />
            <div style={{ display: "none", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", fontSize: 24, color: sym.type === "jackpot" ? "#FFD700" : "#fff" }}>
              {sym.type === "jackpot" ? "⭐" : sym.type === "wild" ? "🃏" : sym.type === "scatter" ? "🍬" : sym.type === "premium" ? "💎" : "🎰"}
            </div>
            {(sym.type === "wild" || sym.type === "scatter" || sym.type === "jackpot") && (
              <div style={{ position: "absolute", top: 2, right: 2, fontSize: 8, fontWeight: 900, color: sym.type === "jackpot" ? "#FFD700" : sym.type === "scatter" ? "#ff6b35" : "#00d4aa", background: "#000a", borderRadius: 3, padding: "1px 3px" }}>
                {sym.type === "wild" ? "W" : sym.type === "scatter" ? "S" : "J"}
              </div>
            )}
          </div>
        );
      }))}
    </div>
  );
}

const NUM_LINES = 10;

export default function SlotsGame({ balance, setBalance, onBack }) {
  const [grid, setGrid] = useState(() => generateGrid());
  const [spinning, setSpinning] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [bet, setBet] = useState(1000);
  const [winningLines, setWinningLines] = useState([]);
  const [lastResult, setLastResult] = useState(null);
  const [freeSpinsLeft, setFreeSpinsLeft] = useState(0);
  const [jackpotPool, setJackpotPool] = useState(5000);
  const [history, setHistory] = useState([]);
  const [msg, setMsg] = useState("");
  const [spinCount, setSpinCount] = useState(0);
  const { playBg, stopBg, playSfx } = useAudio();
  const [stoppedCols, setStoppedCols] = useState(new Set());
  const spinTimersRef = useRef([]);

  async function doSpin(isFree = false) {
    if (spinning) return;
    if (!isFree && balance < bet) { setMsg("¡Sin saldo suficiente!"); return; }
    setMsg(""); setWinningLines([]); setLastResult(null);
    if (!isFree) {
    setBalance(balance - bet);
    const increment = Math.floor(bet * 0.1);
    const newPool = jackpotPool + increment;
    setJackpotPool(newPool);
    await supabase.rpc("increment_jackpot", { amount: increment });
}


    const sc = spinCount % 3;
    if (sc === 0) playBg("SonidoFondoGiro1.wav");
    else if (sc === 1) playBg("SonidoFondoGiro2.wav");
    else playBg("SonidoFondoGiro3.wav");
    setSpinCount(n => n + 1);
    setStoppedCols(new Set()); setSpinning(true); setPhase("spinning");
    const finalGrid = generateGrid();
    const stopped = new Set();
    let animInterval = setInterval(() => {
      setGrid(prev => prev.map((row, r) => row.map((sym, c) => stopped.has(c) ? finalGrid[r][c] : randomSymbol())));
    }, 60);
    spinTimersRef.current.push(animInterval);
    for (let col = 0; col < 5; col++) {
      const t = setTimeout(() => {
        stopped.add(col); setStoppedCols(new Set(stopped));
        if (stopped.size === 5) { clearInterval(animInterval); setGrid(finalGrid); setSpinning(false); stopBg(); resolveResult(finalGrid, isFree); }
      }, 1000 + col * 1000);
      spinTimersRef.current.push(t);
    }
  }

  function resolveResult(finalGrid, isFree) {
    const betPerLine = Math.floor(bet / NUM_LINES);
    const { totalPayout, winningLines: lines, freeSpinsWon, jackpotCount, wildBonus } = evaluateGrid(finalGrid, betPerLine);
    setWinningLines(lines);

    if (jackpotCount >= 3) {
      const roll = Math.floor(Math.random() * 5000) + 1;
      const jackpotWon = roll < 750;
      const FIXED_JACKPOT = 60000;
      setPhase("jackpotEvent"); playSfx(jackpotWon ? "Jackpot.wav" : "NoJackpot.wav");
      setLastResult({ type: "jackpotFijo", jackpotWon, roll, jackpotAmt: FIXED_JACKPOT, payout: totalPayout, freeSpinsWon, wildBonus, lines });
      if (jackpotWon) setBalance(b => b + FIXED_JACKPOT + totalPayout);
      else if (totalPayout > 0) setBalance(b => b + totalPayout);
      addHistory(lines, totalPayout + (jackpotWon ? FIXED_JACKPOT : 0), freeSpinsWon);
      return;
    }

    const jackpotAcumTriggered = (() => {
      for (let r = 0; r < 5; r++) if (checkJackpotAcum(finalGrid[r])) return true;
      for (let c = 0; c < 5; c++) if (checkJackpotAcum(finalGrid.map(row => row[c]))) return true;
      return false;
    })();
    if (jackpotAcumTriggered && jackpotPool > 0) {
      playSfx("Jackpot.wav"); setPhase("jackpotEvent");
      setLastResult({ type: "jackpotAcumulado", jackpotWon: true, jackpotAmt: jackpotPool, payout: totalPayout, freeSpinsWon, wildBonus, lines });
      setBalance(b => b + jackpotPool + totalPayout); setJackpotPool(0);
      supabase.from("slots_jackpot").update({ pool: 0 }).eq("id", 1);
      addHistory(lines, totalPayout + jackpotPool, freeSpinsWon);
      return;
    }

    if (freeSpinsWon > 0) setFreeSpinsLeft(n => n + freeSpinsWon);
    if (totalPayout > 0) {
      setBalance(b => b + totalPayout);
      const bgIdx = Math.floor(Math.random() * 3);
      playBg(["fondoTragamonedasUNO.wav","fondoTragamonedasDOS.wav","fondoTragamonedasTRES.wav"][bgIdx]);
      setTimeout(stopBg, 3000);
    }
    setLastResult({ type: "normal", payout: totalPayout, freeSpinsWon, wildBonus, lines });
    setPhase("result");
    addHistory(lines, totalPayout, freeSpinsWon);
  }

  function addHistory(lines, payout, fs) {
    const entry = { bet, payout, freeSpins: fs };
    setHistory(h => [entry, ...h.slice(0, 6)]);
  
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      await supabase.from("slots_history").insert({
        user_id: session.user.id,
        time: String(bet),
        payout,
        free_spins: fs,
      });
    });
  }
  function continueAfterResult() {
    setPhase("idle"); setLastResult(null); setWinningLines([]);
    if (freeSpinsLeft > 0) { setFreeSpinsLeft(n => n - 1); setTimeout(() => doSpin(true), 400); }
  }

 
  useEffect(() => () => { spinTimersRef.current.forEach(t => { clearTimeout(t); clearInterval(t); }); stopBg(); }, []);

// Cargar jackpot global
useEffect(() => {
  supabase.from("slots_jackpot").select("pool").eq("id", 1).single()
    .then(({ data }) => { if (data) setJackpotPool(data.pool); });
}, []);

// Cargar historial previo
useEffect(() => {
  supabase.auth.getSession().then(async ({ data: { session } }) => {
    if (!session) return;
    const { data } = await supabase.from("slots_history")
      .select("*").eq("user_id", session.user.id)
      .order("created_at", { ascending: false }).limit(7);
    if (data) setHistory(data.map(h => ({ bet: parseInt(h.time), payout: h.payout, freeSpins: h.free_spins })));
  });
}, []);



  // ── Controles (reutilizables en columna derecha) ────────────────────────
  const showControls = phase === "idle";

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", fontFamily: "'Georgia', serif" }}>
      <button onClick={onBack} style={ST.backBtn}>← Lobby</button>

      <div style={ST.card}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <h2 style={{ color: "#FFD700", margin: 0, fontSize: 20, letterSpacing: 2 }}>TRAGAMONEDAS</h2>
            <div style={{ fontSize: 13, color: "#ffffff", marginTop: 2 }}>5×5 · Filas y Columnas</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={ST.balancePill}>💰 {balance.toLocaleString()}</div>
            <div style={{ marginTop: 4, fontSize: 13, color: "#FFD700", fontWeight: 700 }}>
              🏆 Fijo: 60.000 · Acum: {jackpotPool.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Free spins banner */}
        {freeSpinsLeft > 0 && (
          <div style={{ background: "#1a0a2a", border: "2px solid #c084fc", borderRadius: 8, textAlign: "center", padding: "6px", marginBottom: 8, color: "#c084fc", fontWeight: 700 }}>
            🎁 TIROS GRATIS: {freeSpinsLeft} restantes
          </div>
        )}

        {/* ── Fila principal: grid izquierda + controles derecha ── */}
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>

          {/* Columna izquierda: grid + resultados */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <SlotGrid
              grid={grid} spinning={spinning} stoppedCols={stoppedCols}
              winningLines={phase === "result" || phase === "jackpotEvent" ? winningLines : []}
            />

            {/* Leyenda */}
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 6, fontSize: 15, color: "#ffffff" }}>
              <span>↔ Filas</span><span>↕ Columnas</span>
              <span style={{ color: "#00d4aa" }}>W = Wild ×2</span>
              <span style={{ color: "#ff6b35" }}>S = Scatter</span>
              <span style={{ color: "#FFD700" }}>J = Jackpot</span>
            </div>

            {/* Jackpot event */}
            {phase === "jackpotEvent" && lastResult && (
              <div style={{ margin: "10px 0", padding: 16, borderRadius: 10, textAlign: "center", background: lastResult.jackpotWon ? "#0a1a0a" : "#1a0a0a", border: `3px solid ${lastResult.jackpotWon ? "#FFD700" : "#ff4444"}` }}>
                {lastResult.jackpotWon ? (
                  <>
                    <div style={{ fontSize: 30, fontWeight: 900, color: "#FFD700" }}>🏆 ¡JACKPOT!</div>
                    <div style={{ fontSize: 18, color: "#ffffff", marginTop: 2 }}>{lastResult.type === "jackpotFijo" ? "Jackpot Fijo" : "🍒💎🍬 Jackpot Acumulado"}</div>
                    <div style={{ fontSize: 25, color: "#00d4aa", fontWeight: 700, marginTop: 4 }}>+{lastResult.jackpotAmt.toLocaleString()} fichas</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 25, fontWeight: 900, color: "#ff4444" }}>😬 ¡Cerca! No fue jackpot</div>
                    <div style={{ color: "#ffffff", fontSize: 20, marginTop: 4 }}>Salieron 3+ jackpots pero el dado no acompañó</div>
                    <div style={{ color: "#ffffff", fontSize: 18 }}>Roll: {lastResult.roll} / 5000 (necesitabas &lt;750)</div>
                  </>
                )}
                {lastResult.payout > 0 && <div style={{ color: "#00d4aa", fontSize: 20, marginTop: 4 }}>+{lastResult.payout.toLocaleString()} de líneas normales</div>}
                <button onClick={continueAfterResult} style={{ ...ST.spinBtn, marginTop: 10, background: "#FFD700", color: "#000", fontSize: 20, padding: "10px" }}>Continuar →</button>
              </div>
            )}

            {/* Tabla de pagos */}
            <details style={{ marginTop: 14 }}>
              <summary style={{ color: "#ffffff", fontSize: 18, cursor: "pointer", userSelect: "none" }}>Ver tabla de pagos</summary>
              <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                {SYMBOLS.filter(s => s.type === "common" || s.type === "premium").map(s => (
                  <div key={s.id} style={{ background: "#0d0d14", borderRadius: 6, padding: "5px 8px", border: `1px solid ${s.type === "premium" ? "#FFD70033" : "#1e1e2e"}`, display: "flex", gap: 6, alignItems: "center" }}>
                    <img src={s.img} alt={s.id} style={{ width: 24, height: 24, objectFit: "contain" }} onError={e => e.target.style.display = "none"} />
                    <div>
                      <div style={{ color: s.type === "premium" ? "#FFD700" : "#ccc", fontSize: 15, fontWeight: 700, textTransform: "capitalize" }}>{s.id}</div>
                      <div style={{ color: "#ffffff", fontSize: 12 }}>×{s.pay[2]} / ×{s.pay[3]} / ×{s.pay[4]}</div>
                    </div>
                  </div>
                ))}
                <div style={{ background: "#0d0d14", borderRadius: 6, padding: "5px 8px", border: "1px solid #00d4aa33", display: "flex", gap: 6, alignItems: "center", gridColumn: "span 2" }}>
                  <span style={{ fontSize: 20 }}>🃏</span>
                  <div style={{ color: "#00d4aa", fontSize: 15 }}>Wild (Trébol/Hongo): 3+ en grid → ×2 a todos los premios</div>
                </div>
                <div style={{ background: "#0d0d14", borderRadius: 6, padding: "5px 8px", border: "1px solid #ff6b3533", display: "flex", gap: 6, alignItems: "center", gridColumn: "span 2" }}>
                  <span style={{ fontSize: 20 }}>🍬</span>
                  <div style={{ color: "#ff6b35", fontSize: 15 }}>Scatter (Dulce): 3→6 tiros, 4→25 tiros, 5→70 tiros gratis</div>
                </div>
              </div>
            </details>
          </div>

          {/* ── Columna derecha: controles ── */}
          <div style={{ flex: "0 0 200px", display: "flex", flexDirection: "column", gap: 10 }}>

            {/* Saldo */}
            <div style={{ background: "#0d0d14", border: "1px solid #2a2a3a", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ color: "#ffffff", fontSize: 15, marginBottom: 4, letterSpacing: 1 }}>SALDO</div>
              <div style={{ color: "#fbbf24", fontWeight: 700, fontSize: 18 }}>💰 {balance.toLocaleString()}</div>
            </div>

            {/* Apuesta */}
            <div style={{ background: "#0d0d14", border: "1px solid #2a2a3a", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ color: "#ffffff", fontSize: 20, marginBottom: 6, letterSpacing: 1 }}>
                APUESTA TOTAL
              </div>
              <div style={{ color: "#e2e2e2", fontSize: 15, marginBottom: 8 }}>
                {NUM_LINES} líneas · {Math.floor(bet / NUM_LINES)} por línea
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                {[500, 1000, 5000, 10000, 20000, 50000, 100000].map(v => (
                  <button key={v} onClick={() => setBet(v)} disabled={phase === "spinning"} style={{
                    ...ST.betBtn,
                    background: bet === v ? "#FFD700" : "#1a1a2a",
                    color: bet === v ? "#000" : "#aaa",
                    border: bet === v ? "none" : "1px solid #333",
                    fontSize: 15,
                    padding: "6px 4px",
                  }}>
                    {v >= 1000 ? `${v/1000}k` : v}
                  </button>
                ))}
              </div>
            </div>

            {/* Botón girar */}
            <button
              onClick={() => doSpin(false)}
              disabled={spinning || balance < bet || phase === "result" || phase === "jackpotEvent"}
              style={{
                ...ST.spinBtn,
                background: (!spinning && balance >= bet && phase === "idle") ? "linear-gradient(135deg, #8B6914, #FFD700)" : "#333",
                color: (!spinning && balance >= bet && phase === "idle") ? "#000" : "#666",
                fontSize: 15,
                padding: "14px 10px",
              }}
            >
              {spinning ? "🎰 Girando..." : `🎰 GIRAR`}
            </button>

            {/* Resultado normal */}
              {phase === "result" && lastResult && lastResult.type === "normal" && (
              <div style={{ margin: "10px 0", padding: 12, borderRadius: 10, textAlign: "center", background: lastResult.payout > 0 ? "#0a2a0a" : "#1a0a0a", border: `2px solid ${lastResult.payout > 0 ? "#00d4aa" : "#333"}` }}>
                {lastResult.payout > 0 ? (
                  <>
                    <div style={{ fontSize: 25, fontWeight: 900, color: "#00d4aa" }}>🎉 +{lastResult.payout.toLocaleString()} fichas</div>
                    {lastResult.wildBonus && <div style={{ color: "#a74eff", fontSize: 13 }}>🃏 Wild ×2 aplicado</div>}
                    {lastResult.lines.map((l, i) => (
                      <div key={i} style={{ color: "#ffffff", fontSize: 15 }}>
                        {l.type === "row" ? `Fila ${l.index+1}` : `Col ${l.index+1}`}: {l.count}× {l.symId} → ×{l.mult} = {l.payout.toLocaleString()}
                      </div>
                    ))}
                  </>
                ) : (
                  <div style={{ color: "#ffffff", fontSize: 25 }}>😬 Sin premio esta vez</div>
                )}
                {lastResult.freeSpinsWon > 0 && (
                  <div style={{ color: "#c084fc", fontWeight: 700, fontSize: 25, marginTop: 4 }}>🎁 +{lastResult.freeSpinsWon} tiros gratis!</div>
                )}
                <button onClick={continueAfterResult} style={{ ...ST.spinBtn, marginTop: 8, fontSize: 20, padding: "10px" }}>
                  {freeSpinsLeft > 0 ? `🎁 Usar tiro gratis (${freeSpinsLeft})` : "Siguiente →"}
                </button>
              </div>
            )}

            {/* Apuesta actual */}
            {!spinning && phase === "idle" && (
              <div style={{ textAlign: "center", color: "#444", fontSize: 11 }}>
                {bet.toLocaleString()} fichas
              </div>
            )}

            {/* Tiro gratis */}
            {freeSpinsLeft > 0 && phase === "idle" && (
              <button
                onClick={() => { setFreeSpinsLeft(n => n - 1); doSpin(true); }}
                style={{ ...ST.spinBtn, background: "#c084fc", color: "#000", fontSize: 20, padding: "12px" }}
              >
                🎁 TIRO GRATIS ({freeSpinsLeft})
              </button>
            )}

            {/* Mensaje de error */}
            {msg && (
              <div style={{ color: "#ff6b35", fontSize: 20, textAlign: "center", padding: "6px", background: "#1a0a0a", borderRadius: 6 }}>
                {msg}
              </div>
            )}

            {/* Historial */}
            {history.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <div style={{ color: "#ffffff", fontSize: 15, letterSpacing: 2, marginBottom: 6 }}>ÚLTIMOS GIROS</div>
                {history.map((h, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 6px", borderRadius: 5, marginBottom: 3, fontSize: 15, background: h.payout > 0 ? "#0a2a0a" : "#0a0a0a" }}>
                    <span style={{ color: "#ffffff" }}>💰{(h.bet ?? h.time).toLocaleString()}</span>
                    {h.freeSpins > 0 && <span style={{ color: "#c084fc" }}>+{h.freeSpins}FS</span>}
                    <span style={{ color: h.payout > 0 ? "#00d4aa" : "#444", fontWeight: 700 }}>
                      {h.payout > 0 ? `+${h.payout.toLocaleString()}` : "−"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* fin columna derecha */}

        </div>
        {/* fin flex row */}

      </div>
    </div>
  );
}

const ST = {
  backBtn: { background: "transparent", border: "none", color: "#555", fontSize: 14, cursor: "pointer", marginBottom: 12, padding: 0 },
  card: { background: "#0d0d14", border: "2px solid #1e1e2e", borderRadius: 16, padding: 16 },
  balancePill: { background: "#1e1e2e", border: "1px solid #2a2a3a", borderRadius: 20, padding: "4px 12px", fontSize: 16, fontWeight: 700, color: "#fbbf24", display: "inline-block" },
  betBtn: { border: "none", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontWeight: "bold" },
  spinBtn: { width: "100%", border: "none", borderRadius: 8, padding: "13px", fontSize: 18, fontWeight: 900, cursor: "pointer" },
};
