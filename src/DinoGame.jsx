import { useState, useEffect, useRef, useCallback } from "react";
import { saveMinigameRecord } from "./minigameRecords";

// ── Constantes del juego ──────────────────────────────────────────────────────
const CANVAS_W = 700;
const CANVAS_H = 200;
const GROUND_Y = 160;
const DINO_X = 80;
const DINO_W = 44;
const DINO_H = 48;
const GRAVITY = 0.7;
const JUMP_VY = -11;        //-13 es un buen valor para que el salto sea desafiante pero no imposible, se puede ajustar para hacerlo más fácil o difícil
const DUCK_H = 28;
const INIT_SPEED = 6;
const MAX_SPEED = 13;
const SPEED_INC = 0.001;       //0.0006 es bueno para que el juego dure un rato sin volverse imposible, pero se puede ajustar para hacerlo más fácil o difícil

// Pago: $2.000 por cada 100 puntos
const PAGO_POR_100 = 366;    //2000

// ── Tipos de obstáculos ───────────────────────────────────────────────────────
const OBS_TYPES = [
  { type: "cactus_s", w: 17, h: 35, y: GROUND_Y - 35, minScore: 0 },
  { type: "cactus_m", w: 25, h: 50, y: GROUND_Y - 50, minScore: 300 },
  { type: "cactus_g", w: 50, h: 50, y: GROUND_Y - 50, minScore: 300 },
  { type: "ptero_lo", w: 46, h: 30, y: GROUND_Y - 60, minScore: 350 },      //450
  { type: "ptero_hi", w: 46, h: 30, y: GROUND_Y - 100, minScore: 450 },
];

function getObstacleType(score) {
  const available = OBS_TYPES.filter(o => o.minScore <= score);
  return available[Math.floor(Math.random() * available.length)];
}

// ── Dibujo ────────────────────────────────────────────────────────────────────
function drawDino(ctx, x, y, ducking, frame, dark) {
  const color = dark ? "#fff" : "#535353";
  ctx.fillStyle = color;
  if (ducking) {
    // cuerpo agachado
    ctx.fillRect(x + 2, y + 20, 40, 18);
    ctx.fillRect(x + 26, y + 12, 16, 16); // cabeza
    // ojo
    ctx.fillStyle = dark ? "#000" : "#fff";
    ctx.fillRect(x + 36, y + 14, 5, 5);
    ctx.fillStyle = color;
    // patas (animadas)
    const legOff = frame % 2 === 0 ? 0 : 6;
    ctx.fillRect(x + 8,  y + 36, 7, 10 - legOff);
    ctx.fillRect(x + 20, y + 36, 7, 10 + legOff - 4);
  } else {
    // cuerpo
    ctx.fillRect(x + 6,  y + 12, 30, 28);
    // cuello / cabeza
    ctx.fillRect(x + 24, y,      20, 20);
    // mandíbula
    ctx.fillRect(x + 36, y + 14, 8, 8);
    // ojo
    ctx.fillStyle = dark ? "#000" : "#fff";
    ctx.fillRect(x + 34, y + 4, 6, 6);
    ctx.fillStyle = color;
    // cola
    ctx.fillRect(x,      y + 18, 10, 10);
    // patas (animadas)
    const legOff = frame % 2 === 0 ? 0 : 8;
    ctx.fillRect(x + 10, y + 38, 8, 12 - legOff);
    ctx.fillRect(x + 22, y + 38, 8, 12 + legOff - 6);
  }
}

function drawCactus(ctx, obs, dark) {
  const color = dark ? "#fff" : "#535353";
  ctx.fillStyle = color;
  if (obs.type === "cactus_s") {
    ctx.fillRect(obs.x + 6, obs.y, 5, obs.h);
    ctx.fillRect(obs.x,     obs.y + 8, 17, 6);
  } else if (obs.type === "cactus_m") {
    ctx.fillRect(obs.x + 9, obs.y, 7, obs.h);
    ctx.fillRect(obs.x,     obs.y + 12, 25, 8);
    ctx.fillRect(obs.x,     obs.y + 4,  8, 20);
    ctx.fillRect(obs.x + 17,obs.y + 4,  8, 20);
  } else {
    // cactus_g (doble)
    ctx.fillRect(obs.x + 9, obs.y, 7, obs.h);
    ctx.fillRect(obs.x,     obs.y + 12, 25, 8);
    ctx.fillRect(obs.x,     obs.y + 4,  8, 22);
    ctx.fillRect(obs.x + 17,obs.y + 4,  8, 22);
    ctx.fillRect(obs.x + 28,obs.y + 6,  7, obs.h - 6);
    ctx.fillRect(obs.x + 24,obs.y + 16, 14, 7);
  }
}

function drawPtero(ctx, obs, frame, dark) {
  const color = dark ? "#fff" : "#535353";
  ctx.fillStyle = color;
  const wingUp = frame % 6 < 3;
  // cuerpo
  ctx.fillRect(obs.x + 10, obs.y + 8, 26, 14);
  // cabeza
  ctx.fillRect(obs.x + 32, obs.y + 4, 14, 12);
  // pico
  ctx.fillRect(obs.x + 44, obs.y + 6, 6, 4);
  // ojo
  ctx.fillStyle = dark ? "#000" : "#fff";
  ctx.fillRect(obs.x + 38, obs.y + 5, 4, 4);
  ctx.fillStyle = color;
  // alas
  if (wingUp) {
    ctx.fillRect(obs.x,      obs.y,      22, 8);
    ctx.fillRect(obs.x + 22, obs.y + 2,  14, 6);
  } else {
    ctx.fillRect(obs.x,      obs.y + 18, 22, 8);
    ctx.fillRect(obs.x + 22, obs.y + 16, 14, 6);
  }
}

function drawGround(ctx, groundX, dark) {
  ctx.fillStyle = dark ? "#aaa" : "#535353";
  ctx.fillRect(0, GROUND_Y + DINO_H - 4, CANVAS_W, 3);
  // decoración del suelo
  ctx.fillStyle = dark ? "#888" : "#757575";
  for (let i = 0; i < 12; i++) {
    const px = ((groundX + i * 60) % CANVAS_W);
    ctx.fillRect(px, GROUND_Y + DINO_H, 20, 3);
    ctx.fillRect((px + 35) % CANVAS_W, GROUND_Y + DINO_H + 5, 10, 2);
  }
}

function drawClouds(ctx, clouds, dark) {
  ctx.fillStyle = dark ? "#555" : "#ccc";
  for (const c of clouds) {
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 28, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(c.x + 18, c.y - 6, 18, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(c.x - 16, c.y - 4, 16, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Colisión ──────────────────────────────────────────────────────────────────
function collides(dino, obs) {
  const margin = 6;
  const dinoRect = { x: DINO_X + margin, y: dino.y + margin, w: DINO_W - margin*2, h: dino.h - margin*2 };
  const obsRect  = { x: obs.x + margin,  y: obs.y + margin,  w: obs.w - margin*2,  h: obs.h - margin*2 };
  return (
    dinoRect.x < obsRect.x + obsRect.w &&
    dinoRect.x + dinoRect.w > obsRect.x &&
    dinoRect.y < obsRect.y + obsRect.h &&
    dinoRect.y + dinoRect.h > obsRect.y
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function DinoGame({ balance, setBalance, onBack }) {
  const canvasRef = useRef(null);
  const stateRef  = useRef(null);
  const rafRef    = useRef(null);
  const lastTimeRef = useRef(null);

  const [phase, setPhase]   = useState("idle"); // idle | playing | dead
  const [score, setScore]   = useState(0);
  const [earned, setEarned] = useState(0);
  const [bestScore, setBestScore] = useState(() => parseInt(localStorage.getItem("dino_best") || "0"));

  // Inicializar estado del juego
  const initState = useCallback(() => ({
    dino: { y: GROUND_Y - DINO_H, vy: 0, ducking: false, onGround: true, h: DINO_H },
    obstacles: [],
    clouds: [
      { x: 200, y: 40, speed: 0.5 },
      { x: 500, y: 60, speed: 0.3 },
      { x: 650, y: 30, speed: 0.4 },
    ],
    groundX: 0,
    speed: INIT_SPEED,
    score: 0,
    frame: 0,
    dark: false,
    nextObs: 900,
    lastScoreSound: 0,
    scoreAccum: 0,
  }), []);

  // ── Loop principal ────────────────────────────────────────────────────────
  const loop = useCallback((ts) => {
    if (!lastTimeRef.current) lastTimeRef.current = ts;
    const dt = Math.min((ts - lastTimeRef.current) / 16.67, 3); // normalizado a 60fps
    lastTimeRef.current = ts;

    const s = stateRef.current;
    if (!s) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    // ── Física ──
    s.frame++;
    s.speed = Math.min(MAX_SPEED, s.speed + SPEED_INC * dt);

    // Dinosaurio
    if (!s.dino.onGround) {
      s.dino.vy += GRAVITY * dt;
      s.dino.y  += s.dino.vy * dt;
      if (s.dino.y >= GROUND_Y - s.dino.h) {
        s.dino.y = GROUND_Y - s.dino.h;
        s.dino.vy = 0;
        s.dino.onGround = true;
      }
    }

    // Suelo
    s.groundX = (s.groundX - s.speed * dt + CANVAS_W * 2) % (CANVAS_W * 2);

    // Nubes
    for (const c of s.clouds) {
      c.x -= c.speed * dt;
      if (c.x < -60) c.x = CANVAS_W + 60;
    }

    // Obstáculos
    s.nextObs -= s.speed * dt;
    if (s.nextObs <= 0) {
      const obs = getObstacleType(s.score);
      s.obstacles.push({ ...obs, x: CANVAS_W + 10 });
      const gap = 300 + Math.random() * 400 - s.speed * 10;     // entre 300 y 700, menos a mayor velocidad
      s.nextObs = Math.max(150, gap);       //200 mínimo para que no se amontonen los obstáculos, pero se puede ajustar para hacerlo más fácil o difícil
    }
    s.obstacles = s.obstacles
      .map(o => ({ ...o, x: o.x - s.speed * dt }))
      .filter(o => o.x + o.w > -10);

    // Score
    s.scoreAccum += s.speed * dt * 0.1;
    s.score = Math.floor(s.scoreAccum);
    const newDark = Math.floor(s.score / 700) % 2 === 1;
    if (newDark !== s.dark) s.dark = newDark;

    // Colisiones
    for (const obs of s.obstacles) {
      if (collides(s.dino, obs)) {
        // DEAD
        cancelAnimationFrame(rafRef.current);
        const finalScore = s.score;
        const earnedAmount = Math.floor(finalScore / 100) * PAGO_POR_100;
        if (finalScore > (parseInt(localStorage.getItem("dino_best") || "0"))) {
          localStorage.setItem("dino_best", String(finalScore));
          setBestScore(finalScore);
        }
        setScore(finalScore);
        setEarned(earnedAmount);
        if (earnedAmount > 0) setBalance(balance + earnedAmount);
        setPhase("dead");

        saveMinigameRecord("dino", finalScore, earnedAmount);

        // dibujar última frame con X en ojos
        drawFrame(ctx, s, true);
        return;
      }
    }

    // ── Dibujo ──
    drawFrame(ctx, s, false);
    setScore(s.score);

    rafRef.current = requestAnimationFrame(loop);
  }, [balance, setBalance]);

  function drawFrame(ctx, s, dead) {
    const bg = s.dark ? "#1a1a1a" : "#f7f7f7";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    drawClouds(ctx, s.clouds, s.dark);
    drawGround(ctx, s.groundX, s.dark);

    for (const obs of s.obstacles) {
      if (obs.type.startsWith("ptero")) {
        drawPtero(ctx, obs, s.frame, s.dark);
      } else {
        drawCactus(ctx, obs, s.dark);
      }
    }

    if (dead) {
      // ojos en X
      const color = s.dark ? "#fff" : "#535353";
      ctx.fillStyle = color;
      ctx.fillRect(s.dino.y < GROUND_Y - DINO_H + 5 ? DINO_X + 24 : DINO_X + 24, s.dino.y + 3, 10, 3);
      ctx.fillRect(s.dino.y < GROUND_Y - DINO_H + 5 ? DINO_X + 24 : DINO_X + 24, s.dino.y + 3 + 4, 3, 3);
      ctx.fillRect(s.dino.y < GROUND_Y - DINO_H + 5 ? DINO_X + 24 + 7 : DINO_X + 24 + 7, s.dino.y + 3 + 4, 3, 3);
      drawDino(ctx, DINO_X, s.dino.y, s.dino.ducking, s.frame, s.dark);
    } else {
      drawDino(ctx, DINO_X, s.dino.y, s.dino.ducking, s.frame, s.dark);
    }

    // Score
    ctx.fillStyle = s.dark ? "#aaa" : "#535353";
    ctx.font = "bold 16px 'Courier New', monospace";
    ctx.textAlign = "right";
    ctx.fillText(String(s.score).padStart(5, "0"), CANVAS_W - 16, 24);
    ctx.textAlign = "left";
  }

  // ── Controles ──────────────────────────────────────────────────────────────
  const jump = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    if (s.dino.onGround) {
      s.dino.vy = JUMP_VY;
      s.dino.onGround = false;
      s.dino.ducking = false;
      s.dino.h = DINO_H;
    }
  }, []);

  const duck = useCallback((down) => {
    const s = stateRef.current;
    if (!s) return;
    if (s.dino.onGround) {
      s.dino.ducking = down;
      s.dino.h = down ? DUCK_H : DINO_H;
      if (down) {
        s.dino.y = GROUND_Y - DUCK_H;
      } else {
        s.dino.y = GROUND_Y - DINO_H;
      }
    }
  }, []);

  // Teclado
  useEffect(() => {
    const onKey = (e) => {
      if (phase !== "playing") return;
      if (e.type === "keydown") {
        if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); jump(); }
        if (e.code === "ArrowDown") { e.preventDefault(); duck(true); }
      }
      if (e.type === "keyup") {
        if (e.code === "ArrowDown") duck(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, [phase, jump, duck]);

  // Iniciar juego
  function startGame() {
    cancelAnimationFrame(rafRef.current);
    lastTimeRef.current = null;
    stateRef.current = initState();
    setScore(0);
    setEarned(0);
    setPhase("playing");
    rafRef.current = requestAnimationFrame(loop);
  }

  useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Dibujar pantalla idle
  useEffect(() => {
    if (phase === "idle") {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#f7f7f7";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      // suelo
      ctx.fillStyle = "#535353";
      ctx.fillRect(0, GROUND_Y + DINO_H - 4, CANVAS_W, 3);
      // dino estático
      const s = { dino: { y: GROUND_Y - DINO_H, ducking: false }, frame: 0, dark: false };
      drawDino(ctx, DINO_X, s.dino.y, false, 0, false);
      ctx.fillStyle = "#757575";
      ctx.font = "bold 25px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillText("PRESIONA ESPACIO / TAP PARA INICIAR", CANVAS_W / 2, CANVAS_H / 2 - 20);
      ctx.fillStyle = "#aaa";
      ctx.font = "20px 'Courier New', monospace";
      ctx.fillText("↑ / ESPACIO = saltar   ↓ = agacharse", CANVAS_W / 2, CANVAS_H / 2 + 4);
      ctx.textAlign = "left";
    }
  }, [phase]);

  const isMobile = window.innerWidth < 700;
  const scale = isMobile ? window.innerWidth / CANVAS_W : 1;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#080810",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "16px",
      fontFamily: "'Courier New', monospace",
      color: "#fff",
    }}>
      {/* Header */}
      <div style={{
        width: "100%", maxWidth: 700,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 16,
      }}>
        <button onClick={onBack} style={{
          background: "rgba(10,10,18,0.8)", border: "1px solid #2a2a3a",
          borderRadius: 8, color: "#aaa", fontSize: 15, padding: "6px 14px",
          cursor: "pointer",
        }}>← Volver</button>

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 30, fontWeight: 900, color: "#fbbf24", letterSpacing: 2 }}>🦕 DINO GAME</div>
          <div style={{ fontSize: 15, color: "#ffffff" }}>$2.000 por cada 100 puntos</div>
        </div>

        <div style={{
          background: "rgba(251,191,36,0.1)", border: "1px solid #fbbf2444",
          borderRadius: 10, padding: "6px 12px", textAlign: "right",
        }}>
          <div style={{ fontSize: 15, color: "#ffffff" }}>BALANCE</div>
          <div style={{ fontSize: 16, color: "#fbbf24", fontWeight: 700 }}>
            ${balance.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Info de recompensa */}
      <div style={{
        width: "100%", maxWidth: 700,
        display: "flex", gap: 10, marginBottom: 14,
      }}>
        <div style={{
          flex: 1, background: "rgba(139,92,246,0.08)", border: "1px solid #8b5cf644",
          borderRadius: 10, padding: "8px 14px",
        }}>
          <div style={{ fontSize: 20, color: "#ffffff", marginBottom: 2 }}>PUNTUACIÓN</div>
          <div style={{ fontSize: 25, fontWeight: 900, color: "#8b5cf6" }}>{String(score).padStart(5, "0")}</div>
        </div>
        <div style={{
          flex: 1, background: "rgba(0,212,170,0.08)", border: "1px solid #00d4aa44",
          borderRadius: 10, padding: "8px 14px",
        }}>
          <div style={{ fontSize: 20, color: "#ffffff", marginBottom: 2 }}>GANADO</div>
          <div style={{ fontSize: 25, fontWeight: 900, color: "#00d4aa" }}>
            ${(Math.floor(score / 100) * PAGO_POR_100).toLocaleString()}
          </div>
        </div>
        <div style={{
          flex: 1, background: "rgba(251,191,36,0.08)", border: "1px solid #fbbf2444",
          borderRadius: 10, padding: "8px 14px",
        }}>
          <div style={{ fontSize: 20, color: "#ffffff", marginBottom: 2 }}>MEJOR</div>
          <div style={{ fontSize: 25, fontWeight: 900, color: "#fbbf24" }}>{String(bestScore).padStart(5, "0")}</div>
        </div>
      </div>

      {/* Canvas */}
      <div style={{
        width: "100%", maxWidth: 700,
        position: "relative",
        borderRadius: 12,
        overflow: "hidden",
        border: "2px solid #2a2a3a",
        boxShadow: "0 0 40px rgba(139,92,246,0.15)",
        cursor: phase === "playing" ? "pointer" : "default",
      }}
        onClick={() => {
          if (phase === "playing") jump();
          else if (phase === "idle" || phase === "dead") startGame();
        }}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={{ display: "block", width: "100%", imageRendering: "pixelated" }}
        />

        {/* Overlay pantalla muerta */}
        {phase === "dead" && (
          <div style={{
            position: "absolute", inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: 10,
          }}>
            <div style={{ fontSize: 30, fontWeight: 900, color: "#ff4444", letterSpacing: 2 }}>GAME OVER</div>
            <div style={{ fontSize: 20, color: "#aaa" }}>Puntuación final: <strong style={{ color: "#fff" }}>{score}</strong></div>
            {earned > 0 ? (
              <div style={{
                background: "rgba(0,212,170,0.15)", border: "1px solid #00d4aa66",
                borderRadius: 10, padding: "8px 20px",
                fontSize: 25, color: "#00d4aa", fontWeight: 700,
              }}>
                💰 +${earned.toLocaleString()} fichas ganadas
              </div>
            ) : (
              <div style={{ fontSize: 20, color: "#555" }}>Necesitas 100+ puntos para ganar</div>
            )}
            <button onClick={startGame} style={{
              marginTop: 8,
              background: "#fbbf24", border: "none", borderRadius: 8,
              padding: "10px 28px", fontSize: 20, fontWeight: 800,
              color: "#000", cursor: "pointer",
              letterSpacing: 1,
            }}>▶ REINTENTAR</button>
          </div>
        )}
      </div>

      {/* Controles touch */}
      <div style={{
        display: "flex", gap: 16, marginTop: 16, width: "100%", maxWidth: 700,
      }}>
        <button
          onTouchStart={(e) => { e.preventDefault(); if (phase === "playing") jump(); else startGame(); }}
          onClick={() => { if (phase === "playing") jump(); else startGame(); }}
          style={{
            flex: 2,
            background: "rgba(139,92,246,0.12)", border: "2px solid #8b5cf644",
            borderRadius: 12, padding: "18px", fontSize: 20, color: "#8b5cf6",
            fontWeight: 700, cursor: "pointer", letterSpacing: 1,
          }}
        >
          {phase === "playing" ? "⬆ SALTAR" : phase === "dead" ? "▶ REINTENTAR" : "▶ INICIAR"}
        </button>
        {phase === "playing" && (
          <button
            onTouchStart={(e) => { e.preventDefault(); duck(true); }}
            onTouchEnd={(e) => { e.preventDefault(); duck(false); }}
            onMouseDown={() => duck(true)}
            onMouseUp={() => duck(false)}
            style={{
              flex: 1,
              background: "rgba(251,191,36,0.08)", border: "2px solid #fbbf2444",
              borderRadius: 12, padding: "18px", fontSize: 20, color: "#fbbf24",
              fontWeight: 700, cursor: "pointer", letterSpacing: 1,
            }}
          >⬇ AGACHAR</button>
        )}
      </div>

      {/* Tabla de pagos */}
      <div style={{
        width: "100%", maxWidth: 700, marginTop: 20,
        background: "rgba(13,13,20,0.8)", border: "1px solid #1e1e2e",
        borderRadius: 12, padding: "14px 16px",
      }}>
        <div style={{ fontSize: 15, color: "#ffffff", letterSpacing: 2, marginBottom: 10, textTransform: "uppercase" }}>
          Tabla de pagos
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[100, 500, 1000, 5000, 10000, 50000].map(pts => (
            <div key={pts} style={{
              background: "rgba(139,92,246,0.06)", border: "1px solid #8b5cf622",
              borderRadius: 8, padding: "8px 10px", textAlign: "center",
            }}>
              <div style={{ color: "#8b5cf6", fontWeight: 700, fontSize: 17 }}>{pts} pts</div>
              <div style={{ color: "#00d4aa", fontSize: 15 }}>
                +${((pts / 100) * PAGO_POR_100).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 15, color: "#dfdfdf", marginTop: 10, textAlign: "center" }}>
          El dinero se acredita al terminar la partida • Modo noche cada 700 puntos
        </div>
      </div>
    </div>
  );
}
