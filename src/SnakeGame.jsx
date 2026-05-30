import { useState, useEffect, useRef, useCallback } from "react";
//import { supabase } from "./supabase";
import { saveMinigameRecord } from "./minigameRecords";



// ─── Constantes ───────────────────────────────────────────────────────────────
const GRID = 20;          // celdas por lado
const CELL = 30;          //18 px por celda
const BOARD = GRID * CELL; // 360px
const TICK_MS = 130;       // velocidad inicial
const PAGO_POR_MANZANA = 2000;    //1000=4000 pago inicial, luego revisar si es estable
const MAX_MANZANAS_PAGO = 100; // máximo de manzanas que generan pago por sesión

const DIR = {
  UP:    { x: 0,  y: -1 },
  DOWN:  { x: 0,  y:  1 },
  LEFT:  { x: -1, y:  0 },
  RIGHT: { x: 1,  y:  0 },
};

function rnd(max) { return Math.floor(Math.random() * max); }

function newFood(snake) {
  let pos;
  do {
    pos = { x: rnd(GRID), y: rnd(GRID) };
  } while (snake.some(s => s.x === pos.x && s.y === pos.y));
  return pos;
}

function initState() {
  const head = { x: 10, y: 10 };
  const snake = [head, { x: 9, y: 10 }, { x: 8, y: 10 }];
  return {
    snake,
    dir: DIR.RIGHT,
    nextDir: DIR.RIGHT,
    food: newFood(snake),
    score: 0,
    alive: true,
    started: false,
  };
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function SnakeGame({ balance, setBalance, onBack }) {
  const [state, setState] = useState(initState());
  const [particles, setParticles] = useState([]);
  const [sessionEarned, setSessionEarned] = useState(0);
  const [manzanasPagadas, setManzanasPagadas] = useState(0);
  const [bestScore, setBestScore] = useState(() => parseInt(localStorage.getItem("snake_best") || "0"));
  const [saving, setSaving] = useState(false);

    const stateRef = useRef(state);
const tickRef = useRef(null);
const canvasRef = useRef(null);
const balanceRef = useRef(balance);

useEffect(() => { stateRef.current = state; }, [state]);
useEffect(() => { balanceRef.current = balance; }, [balance]);

// ── Bloquear scroll con flechas mientras Snake está activo ──
useEffect(() => {
  function preventScroll(e) {
    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) {
      e.preventDefault();
    }
  }
  window.addEventListener("keydown", preventScroll, { passive: false });
  return () => window.removeEventListener("keydown", preventScroll);
}, []);

// ── Guardar balance en Supabase al cobrar ──
async function cobrarYGuardar(manzanas, ganancia) {
  setSaving(true);
  const newBal = balanceRef.current + ganancia;
  setBalance(newBal);
  balanceRef.current = newBal;
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase.from("profiles").update({ balance: newBal }).eq("id", session.user.id);
      // Registrar en historial de trabajo (tabla snake_history si existe, sino ignorar)
      await saveMinigameRecord("snake", manzanas, ganancia);
      /*await supabase.from("snake_history").insert({
        user_id: session.user.id,
        manzanas,
        payout: ganancia,
      }).then(() => {}).catch(() => {}); // silenciar si no existe la tabla    */
    }
    setSaving(false);
  }

  // ── Loop del juego ──
  const tick = useCallback(() => {
    setState(prev => {
      if (!prev.alive || !prev.started) return prev;

      const dir = prev.nextDir;
      const head = { x: prev.snake[0].x + dir.x, y: prev.snake[0].y + dir.y };

      // Colisión con paredes
      if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) {
        return { ...prev, alive: false };
      }
      // Colisión consigo mismo
      if (prev.snake.some(s => s.x === head.x && s.y === head.y)) {
        return { ...prev, alive: false };
      }

      const ate = head.x === prev.food.x && head.y === prev.food.y;
      const newSnake = ate
        ? [head, ...prev.snake]
        : [head, ...prev.snake.slice(0, -1)];

      let newFood = prev.food;
      let newScore = prev.score;

      if (ate) {
        newFood = newFood_fn(newSnake);
        newScore = prev.score + 1;

        // Partículas de comida
        setParticles(ps => [
          ...ps,
          ...Array.from({ length: 6 }, (_, i) => ({
            id: Date.now() + i,
            x: prev.food.x * CELL + CELL / 2,
            y: prev.food.y * CELL + CELL / 2,
            vx: (Math.random() - 0.5) * 60,
            vy: (Math.random() - 0.5) * 60,
            life: 1,
          })),
        ]);

        // Pago por manzana
        setManzanasPagadas(mp => {
          if (mp < MAX_MANZANAS_PAGO) {
            setSessionEarned(se => se + PAGO_POR_MANZANA);
            return mp + 1;
          }
          return mp;
        });
      }

      return { ...prev, snake: newSnake, dir, food: newFood, score: newScore };
    });
  }, []);

  function newFood_fn(snake) {
    let pos;
    do { pos = { x: rnd(GRID), y: rnd(GRID) }; }
    while (snake.some(s => s.x === pos.x && s.y === pos.y));
    return pos;
  }

  // Iniciar loop
  useEffect(() => {
    tickRef.current = setInterval(tick, TICK_MS);
    return () => clearInterval(tickRef.current);
  }, [tick]);

  // Partículas: decay
  useEffect(() => {
    if (particles.length === 0) return;
    const t = setTimeout(() => {
      setParticles(ps => ps
        .map(p => ({ ...p, life: p.life - 0.12 }))
        .filter(p => p.life > 0)
      );
    }, 30);
    return () => clearTimeout(t);
  }, [particles]);

  // Guardar mejor score
  useEffect(() => {
    if (!state.alive && state.score > bestScore) {
      setBestScore(state.score);
      localStorage.setItem("snake_best", String(state.score));
    }
  }, [state.alive]);

  // ── Controles teclado ──
  useEffect(() => {
    function onKey(e) {
      const s = stateRef.current;
      if (!s.started && (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === " ")) {
        setState(p => ({ ...p, started: true }));
        return;
      }
      const map = {
        ArrowUp:    DIR.UP,
        ArrowDown:  DIR.DOWN,
        ArrowLeft:  DIR.LEFT,
        ArrowRight: DIR.RIGHT,
        w: DIR.UP, s: DIR.DOWN, a: DIR.LEFT, d: DIR.RIGHT,
      };
      const next = map[e.key];
      if (!next) return;
      // No permitir 180°
      const cur = stateRef.current.dir;
      if (next.x === -cur.x && next.y === -cur.y) return;
      setState(p => ({ ...p, nextDir: next }));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function handleDir(d) {
    if (!state.started) { setState(p => ({ ...p, started: true })); }
    const cur = stateRef.current.dir;
    if (d.x === -cur.x && d.y === -cur.y) return;
    setState(p => ({ ...p, nextDir: d }));
  }

  function restart() {
    setSessionEarned(0);
    setManzanasPagadas(0);
    setState(initState());
  }

  async function cobrar() {
    if (sessionEarned <= 0 || saving) return;
    await cobrarYGuardar(manzanasPagadas, sessionEarned);
    setSessionEarned(0);
    setManzanasPagadas(0);
  }

  // ── Render canvas ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, BOARD, BOARD);

    // Fondo de cuadrícula
    for (let x = 0; x < GRID; x++) {
      for (let y = 0; y < GRID; y++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? "#0d0d14" : "#0f0f18";
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }

    // Serpiente
    state.snake.forEach((seg, i) => {
      const isHead = i === 0;
      const ratio = 1 - i / state.snake.length;
      const g = isHead
        ? "#00ff88"
        : `hsl(${140 + i * 2}, ${70 + ratio * 20}%, ${30 + ratio * 25}%)`;

      ctx.beginPath();
      const margin = isHead ? 1 : 2;
      ctx.roundRect(
        seg.x * CELL + margin, seg.y * CELL + margin,
        CELL - margin * 2, CELL - margin * 2,
        isHead ? 5 : 3
      );
      ctx.fillStyle = g;
      ctx.fill();

      // Ojos de la cabeza
      if (isHead) {
        const d = state.dir;
        ctx.fillStyle = "#001a08";
        const ex = seg.x * CELL + CELL / 2;
        const ey = seg.y * CELL + CELL / 2;
        const offset = 4;
        const perp = { x: d.y, y: d.x };
        ctx.beginPath();
        ctx.arc(ex + d.x * offset + perp.x * 3, ey + d.y * offset + perp.y * 3, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ex + d.x * offset - perp.x * 3, ey + d.y * offset - perp.y * 3, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Comida
    const fx = state.food.x * CELL + CELL / 2;
    const fy = state.food.y * CELL + CELL / 2;
    const t = Date.now() / 300;
    const pulse = 1 + Math.sin(t) * 0.12;

    // Glow
    const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, CELL * pulse);
    grad.addColorStop(0, "rgba(255,60,60,0.4)");
    grad.addColorStop(1, "rgba(255,60,60,0)");
    ctx.beginPath();
    ctx.arc(fx, fy, CELL * pulse, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(fx, fy, (CELL / 2 - 2) * pulse, 0, Math.PI * 2);
    ctx.fillStyle = "#ff3c3c";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(fx - 2, fy - 2, 2 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fill();

    // Partículas
    particles.forEach(p => {
      const age = 1 - p.life;
      ctx.beginPath();
      ctx.arc(
        p.x + p.vx * age,
        p.y + p.vy * age,
        3 * p.life,
        0, Math.PI * 2
      );
      ctx.fillStyle = `rgba(255,${Math.floor(100 + p.life * 155)},50,${p.life})`;
      ctx.fill();
    });

  }, [state, particles]);

  // Animación continua para comida pulsante
  useEffect(() => {
    let raf;
    function loop() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      // Redibujar solo la comida (sobre lo que ya hay)
      // En realidad forzamos re-render desde state — usamos un timer pequeño
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Velocidad dinámica según score
  useEffect(() => {
    clearInterval(tickRef.current);
    const speed = Math.max(65, TICK_MS - state.score * 3);
    tickRef.current = setInterval(tick, speed);
    return () => clearInterval(tickRef.current);
  }, [state.score, tick]);

  const puedeCobrarse = manzanasPagadas > 0 && manzanasPagadas < MAX_MANZANAS_PAGO;
  const limiteAlcanzado = manzanasPagadas >= MAX_MANZANAS_PAGO;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#080810",
      color: "#fff",
      fontFamily: "'Courier New', monospace",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "16px 12px 32px",
    }}>
      {/* ── Header ── */}
      <div style={{ width: "100%", maxWidth: 420, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <button onClick={onBack} style={{
          background: "transparent", border: "1px solid #2a2a3a",
          borderRadius: 8, color: "#666", fontSize: 20, padding: "6px 14px", cursor: "pointer",
        }}>← Volver</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#00ff88", fontWeight: 900, fontSize: 30, letterSpacing: 2 }}>🐍 SNAKE</div>
          <div style={{ fontSize: 15, color: "#fbfbfb", letterSpacing: 1 }}>TRABAJO · $2.000 / 🍎</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 15, color: "#bebebe" }}>MEJOR</div>
          <div style={{ color: "#fbbf24", fontWeight: 700, fontSize: 16 }}>{bestScore}</div>
        </div>
      </div>

      {/* ── Marcador ── */}
      <div style={{
        width: "100%", maxWidth: 420,
        display: "flex", gap: 10, marginBottom: 14,
      }}>
        {[
          { label: "PUNTAJE", val: state.score, color: "#00ff88" },
          { label: "GANADO", val: `$${sessionEarned.toLocaleString()}`, color: "#fbbf24" },
          { label: "🍎 PAGADAS", val: `${manzanasPagadas}/${MAX_MANZANAS_PAGO}`, color: limiteAlcanzado ? "#ff4444" : "#aaa" },
        ].map(({ label, val, color }) => (
          <div key={label} style={{
            flex: 1, background: "#0d0d18", border: "1px solid #1e1e2e",
            borderRadius: 8, padding: "8px 10px", textAlign: "center",
          }}>
            <div style={{ fontSize: 12, color: "#ffffff", letterSpacing: 1, marginBottom: 3 }}>{label}</div>
            <div style={{ color, fontWeight: 900, fontSize: 20 }}>{val}</div>
          </div>
        ))}
      </div>

      {/* ── Tablero ── */}
      <div style={{
        position: "relative",
        border: `2px solid ${state.alive ? "#1e2e1e" : "#3a1e1e"}`,
        borderRadius: 8,
        overflow: "hidden",
        boxShadow: state.alive
          ? "0 0 30px rgba(0,255,100,0.06), 0 0 0 1px #0f1f0f"
          : "0 0 30px rgba(255,50,50,0.12)",
        transition: "border-color 0.3s, box-shadow 0.3s",
      }}>
        <canvas
          ref={canvasRef}
          width={BOARD}
          height={BOARD}
          style={{ display: "block" }}
        />

        {/* Overlay: Inicio */}
        {!state.started && state.alive && (
          <div style={overlayStyle}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🐍</div>
            <div style={{ color: "#00ff88", fontWeight: 900, fontSize: 25, letterSpacing: 2, marginBottom: 6 }}>SNAKE</div>
            <div style={{ color: "#ffffff", fontSize: 15, marginBottom: 20 }}>Usa flechas · WASD · o botones</div>
            <button
              onClick={() => setState(p => ({ ...p, started: true }))}
              style={startBtnStyle}
            >
              ▶ JUGAR
            </button>
            <div style={{ marginTop: 14, fontSize: 15, color: "#ffffff" }}>
              Ganas ${(PAGO_POR_MANZANA*4).toLocaleString()} por cada 🍎<br />
              (máx. {MAX_MANZANAS_PAGO} manzanas por sesión)
            </div>
          </div>
        )}

        {/* Overlay: Game Over */}
        {!state.alive && (
          <div style={overlayStyle}>
            <div style={{ fontSize: 36, marginBottom: 6 }}>💀</div>
            <div style={{ color: "#ff4444", fontWeight: 900, fontSize: 20, letterSpacing: 2, marginBottom: 4 }}>GAME OVER</div>
            <div style={{ color: "#ffffff", fontSize: 18, marginBottom: 16 }}>
              {state.score} manzana{state.score !== 1 ? "s" : ""} • ${(Math.min(state.score, MAX_MANZANAS_PAGO) * PAGO_POR_MANZANA*2).toLocaleString()} ganados
            </div>
            {sessionEarned > 0 && (
              <button onClick={cobrar} disabled={saving} style={{
                ...startBtnStyle,
                background: saving ? "#555" : "#fbbf24",
                color: "#000",
                marginBottom: 10,
              }}>
                {saving ? "Guardando..." : `💰 Cobrar $${sessionEarned.toLocaleString()}`}
              </button>
            )}
            <button onClick={restart} style={{ ...startBtnStyle, background: "#1a2a1a", color: "#00ff88", border: "1px solid #00ff8844" }}>
              🔄 Reintentar
            </button>
          </div>
        )}
      </div>

      {/* ── Controles táctiles ── */}
      <div style={{ marginTop: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <button onPointerDown={() => handleDir(DIR.UP)} style={dpadBtn}>▲</button>
        <div style={{ display: "flex", gap: 6 }}>
          <button onPointerDown={() => handleDir(DIR.LEFT)} style={dpadBtn}>◀</button>
          <div style={{ width: 44 }} />
          <button onPointerDown={() => handleDir(DIR.RIGHT)} style={dpadBtn}>▶</button>
        </div>
        <button onPointerDown={() => handleDir(DIR.DOWN)} style={dpadBtn}>▼</button>
      </div>

      {/* ── Panel de cobro ── */}
      {(sessionEarned > 0 && state.alive) && (
        <div style={{
          marginTop: 16, width: "100%", maxWidth: 420,
          background: "#0d1a0d", border: "1px solid #00ff8833",
          borderRadius: 10, padding: "12px 16px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: 15, color: "#4a8a4a", letterSpacing: 1 }}>EN JUEGO</div>
            <div style={{ color: "#00ff88", fontWeight: 900, fontSize: 25 }}>
              ${sessionEarned.toLocaleString()}
            </div>
            {limiteAlcanzado && (
              <div style={{ fontSize: 15, color: "#ff4444", marginTop: 2 }}>
                Límite de sesión alcanzado
              </div>
            )}
          </div>
          <button onClick={cobrar} disabled={saving || !puedeCobrarse} style={{
            background: (saving || !puedeCobrarse) ? "#222" : "#fbbf24",
            color: (saving || !puedeCobrarse) ? "#555" : "#000",
            border: "none", borderRadius: 8, padding: "10px 18px",
            fontWeight: 900, fontSize: 20, cursor: (saving || !puedeCobrarse) ? "not-allowed" : "pointer",
            fontFamily: "'Courier New', monospace",
          }}>
            {saving ? "..." : "💰 Cobrar"}
          </button>
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 15, color: "#ffffff", textAlign: "center" }}>
        Puedes cobrar mientras juegas o al morir · Límite {MAX_MANZANAS_PAGO} 🍎/sesión
      </div>
    </div>
  );
}

// ─── Estilos reutilizables ────────────────────────────────────────────────────
const overlayStyle = {
  position: "absolute", inset: 0,
  background: "rgba(8,8,16,0.92)",
  backdropFilter: "blur(4px)",
  display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center",
};

const startBtnStyle = {
  background: "#00ff88",
  color: "#000",
  border: "none",
  borderRadius: 10,
  padding: "12px 32px",
  fontWeight: 900,
  fontSize: 30,
  cursor: "pointer",
  letterSpacing: 1,
  fontFamily: "'Courier New', monospace",
};

const dpadBtn = {
  width: 44, height: 44,
  background: "#0d0d18",
  border: "1px solid #2a2a3a",
  borderRadius: 8,
  color: "#555",
  fontSize: 18,
  cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
  userSelect: "none",
  WebkitUserSelect: "none",
  touchAction: "manipulation",
};
