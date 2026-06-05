import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase";

// ═══════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════
const CW = 600, CH = 660;         // 420, 580 con escala 10x para alta resolución
const ROWS = 11, COLS = 14;   // filas y columnas del tablero
const R = 20;           // radio de burbuja
const DIAM = R * 2;

// Offset horizontal para filas pares (hexagonal)
const rowOffsetX = (row) => (row % 2 === 0 ? 0 : R);

// Posición central de cada celda
const cellCenter = (row, col) => ({
  x: R + col * DIAM + rowOffsetX(row) + R,
  y: R + row * DIAM + 10,
});

const COLORS = ["#ef4444","#3b82f6","#22c55e","#fbbf24","#a855f7","#f97316"];
const DEAD_LINE_Y = CH - 100;
const CANNON_Y    = CH - 55;
const CANNON_X    = CW / 2;

// Pagos
const PAY_POP  =   120;   //700 por burbuja explotada
const PAY_DROP = 360;   //2000 por burbuja caída
const PAY_CLEAR = 30_000; //100000 tablero limpio

// Fallos antes de que el techo baje
const MISSES_BEFORE_PUSH = 5;

// ═══════════════════════════════════════════════════════════════
//  GENERACIÓN DEL TABLERO
// ═══════════════════════════════════════════════════════════════
function randomColor() { return COLORS[Math.floor(Math.random() * COLORS.length)]; }

function createBoard(rows = 7) {
  // Devuelve Map: "r,c" → color | null
  const board = {};
  for (let r = 0; r < rows; r++) {
    const cols = r % 2 === 0 ? COLS : COLS - 1;
    for (let c = 0; c < cols; c++) {
      board[`${r},${c}`] = randomColor();
    }
  }
  return board;
}

// ── Vecinos hexagonales ──────────────────────────────────────
function neighbors(r, c) {
  const even = r % 2 === 0;
  return [
    [r - 1, even ? c - 1 : c],
    [r - 1, even ? c     : c + 1],
    [r,     c - 1],
    [r,     c + 1],
    [r + 1, even ? c - 1 : c],
    [r + 1, even ? c     : c + 1],
  ];
}

// ── Encontrar celda libre más cercana al punto de impacto ────
function snapToGrid(px, py, board) {
  let best = null, bestDist = Infinity;
  for (let r = 0; r < ROWS + 4; r++) {
    const cols = r % 2 === 0 ? COLS : COLS - 1;
    for (let c = 0; c < cols; c++) {
      if (board[`${r},${c}`]) continue;
      const { x, y } = cellCenter(r, c);
      const d = (px - x) ** 2 + (py - y) ** 2;
      if (d < bestDist) { bestDist = d; best = [r, c]; }
    }
  }
  return best;
}

// ── BFS: grupo del mismo color ───────────────────────────────
function findGroup(board, row, col) {
  const color = board[`${row},${col}`];
  if (!color) return [];
  const visited = new Set();
  const queue   = [[row, col]];
  while (queue.length) {
    const [r, c] = queue.shift();
    const key = `${r},${c}`;
    if (visited.has(key)) continue;
    if (board[key] !== color) continue;
    visited.add(key);
    neighbors(r, c).forEach(([nr, nc]) => {
      if (!visited.has(`${nr},${nc}`) && board[`${nr},${nc}`] === color) {
        queue.push([nr, nc]);
      }
    });
  }
  return [...visited].map(k => k.split(",").map(Number));
}

// ── BFS: celdas conectadas al techo (fila 0) ────────────────
function findConnected(board) {
  const visited = new Set();
  const queue   = [];
  // Semillas: toda la fila 0
  for (let c = 0; c < COLS; c++) {
    if (board[`0,${c}`]) { queue.push([0, c]); visited.add(`0,${c}`); }
  }
  while (queue.length) {
    const [r, c] = queue.shift();
    neighbors(r, c).forEach(([nr, nc]) => {
      const key = `${nr},${nc}`;
      if (!visited.has(key) && board[key]) {
        visited.add(key);
        queue.push([nr, nc]);
      }
    });
  }
  return visited;
}

// ═══════════════════════════════════════════════════════════════
//  INITIAL GAME STATE
// ═══════════════════════════════════════════════════════════════
function mkState() {
  return {
    board:      createBoard(7),
    phase:      "aiming",  // "aiming" | "shooting" | "gameover"
    bubble:     { x: CANNON_X, y: CANNON_Y, color: randomColor(), vx: 0, vy: 0 },
    nextColor:  randomColor(),
    angle:      -Math.PI / 2,   // apunta hacia arriba
    misses:     0,              // fallos desde última bajada
    maxMisses:  MISSES_BEFORE_PUSH,
    earned:     0,
    popAnim:    [],   // { x, y, color, life }
    dropAnim:   [],   // burbujas cayendo
    flashMsg:   null, // { text, color, life }
  };
}

// ═══════════════════════════════════════════════════════════════
//  COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function BubbleShooter({ balance, setBalance, onBack }) {
  const canvasRef  = useRef(null);
  const stateRef   = useRef(mkState());
  const rafRef     = useRef(null);
  const balRef     = useRef(balance);
  const mouseRef   = useRef({ x: CANNON_X, y: CANNON_Y - 100 });

  const [rphase,  setRPhase]  = useState("idle");  // "idle"|"ingame"|"gameover"
  const [earned,  setEarned]  = useState(0);
  const [saving,  setSaving]  = useState(false);

  useEffect(() => { balRef.current = balance; }, [balance]);

  // ── Guardar balance ──────────────────────────────────────────
  async function saveEarned(amount) {
    if (amount <= 0) return;
    setSaving(true);
    const newBal = balRef.current + amount;
    setBalance(newBal);
    balRef.current = newBal;
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase.from("profiles").update({ balance: newBal }).eq("id", session.user.id);
    }
    setSaving(false);
  }

  // ── Iniciar juego ────────────────────────────────────────────
  function startGame() {
    cancelAnimationFrame(rafRef.current);
    stateRef.current = mkState();
    setEarned(0);
    setRPhase("ingame");
  }

  // ── Cobrar y salir ───────────────────────────────────────────
  async function cashOut() {
    cancelAnimationFrame(rafRef.current);
    const amt = stateRef.current.earned;
    await saveEarned(amt);
    setRPhase("gameover");
  }

  // ── Disparar ─────────────────────────────────────────────────
  function shoot() {
    const s = stateRef.current;
    if (s.phase !== "aiming") return;
    const spd = 9;
    s.bubble.vx = Math.cos(s.angle) * spd;
    s.bubble.vy = Math.sin(s.angle) * spd;
    s.phase = "shooting";
  }

  // ── Bajar tablero una fila ────────────────────────────────────
  function pushBoard(s) {
    const newBoard = {};
    // Desplazar todas las filas existentes +1
    Object.entries(s.board).forEach(([key, color]) => {
      const [r, c] = key.split(",").map(Number);
      newBoard[`${r + 1},${c}`] = color;
    });
    // Nueva fila aleatoria en fila 0
    for (let c = 0; c < COLS; c++) {
      newBoard[`0,${c}`] = randomColor();
    }
    s.board = newBoard;
    s.misses = 0;
  }

  // ── Resolver impacto ─────────────────────────────────────────
  function resolveHit(s, px, py) {
    const snapped = snapToGrid(px, py, s.board);
    if (!snapped) return;
    const [row, col] = snapped;
    s.board[`${row},${col}`] = s.bubble.color;

    // Grupo del mismo color
    const group = findGroup(s.board, row, col);
    let popped = 0, dropped = 0;

    if (group.length >= 3) {
      // Pop
      group.forEach(([r, c]) => {
        const { x, y } = cellCenter(r, c);
        s.popAnim.push({ x, y, color: s.board[`${r},${c}`], life: 1 });
        delete s.board[`${r},${c}`];
        popped++;
      });

      // Drop (flotando sin conexión al techo)
      const connected = findConnected(s.board);
      Object.keys(s.board).forEach(key => {
        if (!connected.has(key)) {
          const [r, c] = key.split(",").map(Number);
          const { x, y } = cellCenter(r, c);
          s.dropAnim.push({
            x, y,
            color: s.board[key],
            vy: 1 + Math.random() * 2,
            vx: (Math.random() - 0.5) * 2,
            life: 1,
          });
          delete s.board[key];
          dropped++;
        }
      });

      // Pago
      s.earned += popped * PAY_POP + dropped * PAY_DROP;

      // ¿Tablero vacío?
      if (Object.keys(s.board).length === 0) {
        s.earned += PAY_CLEAR;
        s.flashMsg = { text: `¡TABLERO LIMPIO! +$${PAY_CLEAR.toLocaleString()}`, color: "#fbbf24", life: 3 };
        // Generar nuevo tablero
        setTimeout(() => { s.board = createBoard(7); }, 1500);
      }

      // Mensaje de combo
      if (dropped > 0) {
        s.flashMsg = {
          text: `💥 ×${popped} POP  +  ⬇ ×${dropped} DROP`,
          color: "#00d4aa", life: 2,
        };
      }

    } else {
      // Sin match → fallo
      s.misses++;
      if (s.misses >= s.maxMisses) {
        pushBoard(s);
        // Reducir tolerancia progresivamente
        s.maxMisses = Math.max(2, s.maxMisses - 1);
      }
    }

    // Preparar siguiente burbuja
    s.bubble = { x: CANNON_X, y: CANNON_Y, color: s.nextColor, vx: 0, vy: 0 };
    s.nextColor = randomColor();
    s.phase = "aiming";

    // Game over: ¿alguna burbuja cruzó la dead line?
    const dead = Object.entries(s.board).some(([key]) => {
      const r = parseInt(key.split(",")[0]);
      const { y } = cellCenter(r, 0);
      return y >= DEAD_LINE_Y;
    });
    if (dead) s.phase = "gameover";
  }

  // ═══════════════════════════════════════════════════════════
  //  GAME LOOP
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (rphase !== "ingame") return;
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");

    function loop() {
      const s   = stateRef.current;
      const now = Date.now();

      // ── Actualizar ángulo del cañón ──
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      let ang = Math.atan2(my - CANNON_Y, mx - CANNON_X);
      // Limitar entre ~-170° y ~-10° (no disparar hacia abajo)
      ang = Math.max(-Math.PI + 0.15, Math.min(-0.15, ang));
      s.angle = ang;

      // ── Mover burbuja ──
      if (s.phase === "shooting") {
        s.bubble.x += s.bubble.vx;
        s.bubble.y += s.bubble.vy;

        // Rebotar paredes
        if (s.bubble.x - R < 0)   { s.bubble.x = R;      s.bubble.vx =  Math.abs(s.bubble.vx); }
        if (s.bubble.x + R > CW)  { s.bubble.x = CW - R; s.bubble.vx = -Math.abs(s.bubble.vx); }

        // Tocar techo
        if (s.bubble.y - R < 10) {
          s.bubble.y = R + 10;
          resolveHit(s, s.bubble.x, s.bubble.y);
        }

        // Colisión con burbujas del tablero
        let hit = false;
        for (const [key, color] of Object.entries(s.board)) {
          if (!color) continue;
          const [r, c] = key.split(",").map(Number);
          const { x, y } = cellCenter(r, c);
          if ((s.bubble.x - x) ** 2 + (s.bubble.y - y) ** 2 < (DIAM - 2) ** 2) {
            resolveHit(s, s.bubble.x, s.bubble.y);
            hit = true;
            break;
          }
        }
      }

      // ── Partículas pop ──
      s.popAnim = s.popAnim
        .map(p => ({ ...p, life: p.life - 0.06 }))
        .filter(p => p.life > 0);

      // ── Burbujas cayendo ──
      s.dropAnim = s.dropAnim
        .map(p => ({ ...p, y: p.y + p.vy, x: p.x + p.vx, vy: p.vy + 0.3, life: p.life - 0.025 }))
        .filter(p => p.life > 0 && p.y < CH + 40);

      // ── Flash messages ──
      if (s.flashMsg) {
        s.flashMsg.life -= 0.03;
        if (s.flashMsg.life <= 0) s.flashMsg = null;
      }

      // ── Sincronizar UI ──
      if (s.earned !== earned) setEarned(s.earned);

      // ── Game over ──
      if (s.phase === "gameover") {
        draw(ctx, s);
        saveEarned(s.earned);
        setEarned(s.earned);
        setRPhase("gameover");
        return;
      }

      draw(ctx, s);
      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [rphase]);

  // ═══════════════════════════════════════════════════════════
  //  DRAW
  // ═══════════════════════════════════════════════════════════
  function draw(ctx, s) {
    // Fondo
    ctx.fillStyle = "#07070f";
    ctx.fillRect(0, 0, CW, CH);

    // Grid sutil
    ctx.strokeStyle = "#0e0e1c";
    ctx.lineWidth = 1;
    for (let x = 0; x < CW; x += 30) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CH); ctx.stroke();
    }
    for (let y = 0; y < CH; y += 30) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CW, y); ctx.stroke();
    }

    // ── Dead line ──
    ctx.save();
    ctx.strokeStyle = "#ff444466";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.moveTo(0, DEAD_LINE_Y);
    ctx.lineTo(CW, DEAD_LINE_Y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    ctx.fillStyle = "#ff444444";
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "right";
    ctx.fillStyle = "#ff4444aa";
    ctx.fillText("DEAD LINE", CW - 8, DEAD_LINE_Y - 4);

    // ── Burbujas del tablero ──
    Object.entries(s.board).forEach(([key, color]) => {
      if (!color) return;
      const [r, c] = key.split(",").map(Number);
      const { x, y } = cellCenter(r, c);
      drawBubble(ctx, x, y, R - 1, color);
    });

    // ── Partículas pop ──
    s.popAnim.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      const size = R * (1 + (1 - p.life) * 1.5);
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();
      // Destello blanco
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, size * 0.4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // ── Burbujas cayendo ──
    s.dropAnim.forEach(p => {
      ctx.globalAlpha = p.life;
      drawBubble(ctx, p.x, p.y, R - 1, p.color);
    });
    ctx.globalAlpha = 1;

    // ── Guía de trayectoria ──
    if (s.phase === "aiming") {
      drawTrajectory(ctx, s);
    }

    // ── Cañón ──
    drawCannon(ctx, s.angle);

    // ── Burbuja activa (en cañón o volando) ──
    drawBubble(ctx, s.bubble.x, s.bubble.y, R, s.bubble.color, true);

    // ── HUD ──
    drawHUD(ctx, s);

    // ── Flash message ──
    if (s.flashMsg && s.flashMsg.life > 0) {
      const alpha = Math.min(1, s.flashMsg.life);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = s.flashMsg.color;
      ctx.font = "bold 16px monospace";
      ctx.textAlign = "center";
      ctx.fillText(s.flashMsg.text, CW / 2, CH / 2 - 20);
      ctx.globalAlpha = 1;
    }

    // ── Game Over canvas overlay ──
    if (s.phase === "gameover") {
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(0, 0, CW, CH);
      ctx.fillStyle = "#ff4444";
      ctx.font = "bold 32px monospace";
      ctx.textAlign = "center";
      ctx.fillText("GAME OVER", CW / 2, CH / 2 - 20);
      ctx.fillStyle = "#00d4aa";
      ctx.font = "bold 18px monospace";
      ctx.fillText(`+$${s.earned.toLocaleString()}`, CW / 2, CH / 2 + 20);
    }
  }

  // ── Dibujar burbuja ──────────────────────────────────────────
  function drawBubble(ctx, x, y, r, color, glow = false) {
    if (glow) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
      g.addColorStop(0, color + "55");
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Cuerpo
    const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    grad.addColorStop(0, lighten(color, 0.4));
    grad.addColorStop(0.7, color);
    grad.addColorStop(1, darken(color, 0.3));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Brillo
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.beginPath();
    ctx.arc(x - r * 0.28, y - r * 0.28, r * 0.32, 0, Math.PI * 2);
    ctx.fill();

    // Borde sutil
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ── Línea guía de tiro ──────────────────────────────────────
  function drawTrajectory(ctx, s) {
    let x = CANNON_X, y = CANNON_Y;
    let vx = Math.cos(s.angle), vy = Math.sin(s.angle);
    const step = 6;
    ctx.save();
    ctx.strokeStyle = `${s.bubble.color}55`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let i = 0; i < 80; i++) {
      x += vx * step;
      y += vy * step;
      if (x - R < 0)  { x = R;      vx = Math.abs(vx); }
      if (x + R > CW) { x = CW - R; vx = -Math.abs(vx); }
      if (y < 0) break;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ── Cañón ────────────────────────────────────────────────────
  function drawCannon(ctx, angle) {
    ctx.save();
    ctx.translate(CANNON_X, CANNON_Y);
    ctx.rotate(angle + Math.PI / 2);

    // Base
    const baseGrad = ctx.createLinearGradient(-18, 0, 18, 0);
    baseGrad.addColorStop(0, "#2a2a3a");
    baseGrad.addColorStop(0.5, "#4a4a5a");
    baseGrad.addColorStop(1, "#2a2a3a");
    ctx.fillStyle = baseGrad;
    ctx.beginPath();
    ctx.ellipse(0, 8, 22, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cañón
    const cannonGrad = ctx.createLinearGradient(-8, -38, 8, 0);
    cannonGrad.addColorStop(0, "#606070");
    cannonGrad.addColorStop(0.4, "#9090a0");
    cannonGrad.addColorStop(1, "#404050");
    ctx.fillStyle = cannonGrad;
    ctx.beginPath();
    ctx.roundRect(-7, -40, 14, 38, [4, 4, 0, 0]);
    ctx.fill();

    // Brillo
    ctx.fillStyle = "rgb(255, 255, 255)";
    ctx.beginPath();
    ctx.roundRect(-3, -38, 5, 30, 2);
    ctx.fill();

    ctx.restore();
  }

  // ── HUD ──────────────────────────────────────────────────────
  function drawHUD(ctx, s) {
    // Fondo superior
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, CW, 52);

    // Earned
    ctx.fillStyle = "#00d4aa";
    ctx.font = "bold 13px monospace";
    ctx.textAlign = "left";
    ctx.fillText(`💰 $${s.earned.toLocaleString()}`, 10, 20);

    // Fallos restantes
    const missLeft = s.maxMisses - s.misses;
    ctx.fillStyle = "#ffffff";
    ctx.font = "15px monospace";
    ctx.textAlign = "left";
    ctx.fillText("Tiros sin match:", 10, 36);
    for (let i = 0; i < s.maxMisses; i++) {
      ctx.beginPath();
      ctx.arc(160 + i * 16, 31, 6, 0, Math.PI * 2);   //140+i*16 para dejar espacio al texto
      ctx.fillStyle = i < missLeft ? "#fbbf24" : "#2a2a3a";
      ctx.fill();
    }

    // Burbuja siguiente (derecha)
    ctx.fillStyle = "#ffffff";
    ctx.font = "20px monospace";
    ctx.textAlign = "right";
    ctx.fillText("SIGUIENTE", CW - 50, 40);   // CW - 12, 16 para dejar espacio a la burbuja
    drawBubble(ctx, CW - 28, 34, 14, s.nextColor);

    // Fondo inferior
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, CH - 80, CW, 80);

    ctx.fillStyle = "#ffffff";
    ctx.font = "15px monospace";
    ctx.textAlign = "center";
    ctx.fillText("Click / Tap — Disparar  ·  Mueve el ratón para apuntar", CW / 2, CH - 8);
  }

  // ── Helpers de color ─────────────────────────────────────────
  function lighten(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, ((n >> 16) & 0xff) + Math.round(255 * amount));
    const g = Math.min(255, ((n >> 8)  & 0xff) + Math.round(255 * amount));
    const b = Math.min(255, ( n        & 0xff) + Math.round(255 * amount));
    return `rgb(${r},${g},${b})`;
  }
  function darken(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, ((n >> 16) & 0xff) - Math.round(255 * amount));
    const g = Math.max(0, ((n >> 8)  & 0xff) - Math.round(255 * amount));
    const b = Math.max(0, ( n        & 0xff) - Math.round(255 * amount));
    return `rgb(${r},${g},${b})`;
  }

  // ── Controles ────────────────────────────────────────────────
  function onMouseMove(e) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouseRef.current = {
      x: (e.clientX - rect.left) * (CW / rect.width),
      y: (e.clientY - rect.top)  * (CH / rect.height),
    };
  }
  function onTouch(e) {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouseRef.current = {
      x: (e.touches[0].clientX - rect.left) * (CW / rect.width),
      y: (e.touches[0].clientY - rect.top)  * (CH / rect.height),
    };
  }
  function handleClick() {
    if (rphase === "ingame") shoot();
  }

  // Teclado: espacio = disparar
  useEffect(() => {
    const kd = e => {
      if (e.code === "Space") { e.preventDefault(); shoot(); }
    };
    window.addEventListener("keydown", kd);
    return () => window.removeEventListener("keydown", kd);
  }, []);

  // ═══════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <div style={{
      minHeight: "100vh",
      background: "#07070f",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      fontFamily: "'Courier New', monospace",
      paddingBottom: 32,
      color: "#fff",
    }}>

      {/* ── Header ── */}
      <div style={{
        width: "100%", maxWidth: CW + 40,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "10px 16px", boxSizing: "border-box",
      }}>
        <button onClick={() => { cancelAnimationFrame(rafRef.current); saveEarned(stateRef.current.earned); onBack(); }} style={{
          background: "rgba(10,10,18,0.75)", border: "1px solid #2a2a3a",
          borderRadius: 8, color: "#aaa", fontSize: 13, padding: "6px 14px", cursor: "pointer",
        }}>← Volver</button>

        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#60a5fa", fontWeight: 900, fontSize: 20, letterSpacing: 1 }}>🫧 Bubble Shooter</div>
          <div style={{ color: "#444", fontSize: 11 }}>Pop: $500 · Drop: $1.500 · Clear: $30.000</div>
        </div>

        <div style={{
          background: "rgba(0,212,170,0.1)", border: "1px solid #00d4aa44",
          borderRadius: 10, padding: "6px 14px", textAlign: "right",
        }}>
          <div style={{ color: "#444", fontSize: 10 }}>Ganado</div>
          <div style={{ color: "#00d4aa", fontWeight: 700, fontSize: 15 }}>
            +{earned.toLocaleString()}
          </div>
        </div>
      </div>

      {/* ── Canvas ── */}
      <div style={{
        width: "100%", maxWidth: CW + 40,
        padding: "0 20px", boxSizing: "border-box",
        position: "relative",
      }}>
        <canvas
          ref={canvasRef}
          width={CW} height={CH}  // Lienzo más grande para evitar distorsión en pantallas retina
          onMouseMove={onMouseMove}
          onTouchMove={onTouch}
          onTouchStart={e => { onTouch(e); handleClick(); }}
          onClick={handleClick}
          style={{
            width: "100%",
            border: "1px solid #1e1e2e",
            borderRadius: 12,
            display: "block",
            cursor: "crosshair",
          }}
        />

        {/* ── Idle overlay ── */}
        {rphase === "idle" && (
          <div style={{
            position: "absolute", inset: "0 20px",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            background: "rgba(7,7,15,0.88)", borderRadius: 12,
          }}>
            <div style={{ fontSize: 60, marginBottom: 10 }}>🫧</div>
            <div style={{ fontSize: 35, fontWeight: 900, marginBottom: 6, color: "#60a5fa", letterSpacing: 2 }}>
              BUBBLE SHOOTER
            </div>
            <div style={{ fontSize: 15, color: "#afafaf", textAlign: "center", lineHeight: 1.8, marginBottom: 8 }}>
              Agrupa 3 o más burbujas del mismo color para hacerlas estallar.<br/>
              Las burbujas que queden flotando caen y dan más puntos.<br/>
              Si las burbujas cruzan la línea roja — Game Over.
            </div>
            <div style={{
              background: "rgba(96,165,250,0.08)", border: "1px solid #60a5fa33",
              borderRadius: 10, padding: "10px 20px", marginBottom: 20, fontSize: 15,
              display: "flex", flexDirection: "column", gap: 4, textAlign: "center",
            }}>
              <span style={{ color: "#ef4444" }}>💥 Pop (×3+) → <span style={{ color: "#fff", fontWeight: 700 }}>$120</span> por burbuja</span>
              <span style={{ color: "#60a5fa" }}>⬇ Drop (colateral) → <span style={{ color: "#fff", fontWeight: 700 }}>$360</span> por burbuja</span>
              <span style={{ color: "#fbbf24" }}>✨ Tablero limpio → <span style={{ color: "#fff", fontWeight: 700 }}>$30.000</span> bonus</span>
            </div>
            <button onClick={startGame} style={{
              background: "#60a5fa", border: "none", borderRadius: 10,
              padding: "12px 40px", fontSize: 20, fontWeight: 900,
              cursor: "pointer", color: "#000", letterSpacing: 1,
            }}>▶ JUGAR</button>
          </div>
        )}

        {/* ── Game Over overlay ── */}
        {rphase === "gameover" && (
          <div style={{
            position: "absolute", inset: "0 20px",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            background: "rgba(7,7,15,0.88)", borderRadius: 12,
          }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>💀</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: "#ff5555", marginBottom: 6 }}>GAME OVER</div>
            <div style={{ color: "#00d4aa", fontSize: 20, fontWeight: 800, marginBottom: 24 }}>
              +{earned.toLocaleString()} fichas 🎉
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={startGame} style={{
                background: "#60a5fa", border: "none", borderRadius: 10,
                padding: "11px 28px", fontSize: 14, fontWeight: 900,
                cursor: "pointer", color: "#000",
              }}>🔄 Reintentar</button>
              <button onClick={() => { cancelAnimationFrame(rafRef.current); onBack(); }} style={{
                background: "transparent", border: "1px solid #444",
                borderRadius: 10, padding: "11px 20px",
                fontSize: 13, color: "#888", cursor: "pointer",
              }}>← Salir</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Botón cobrar (mientras juega) ── */}
      {rphase === "ingame" && earned > 0 && (
        <div style={{
          marginTop: 14,
          display: "flex", justifyContent: "center",
        }}>
          <button
            onClick={cashOut}
            disabled={saving}
            style={{
              background: saving ? "#222" : "linear-gradient(135deg, #00d4aa, #059669)",
              border: "none", borderRadius: 10,
              padding: "12px 32px", fontSize: 15, fontWeight: 900,
              cursor: saving ? "not-allowed" : "pointer",
              color: "#000",
            }}
          >
            {saving ? "Guardando..." : `💰 Cobrar $${earned.toLocaleString()} y salir`}
          </button>
        </div>
      )}

      {/* ── Leyenda de colores y reglas ── */}
      <div style={{
        marginTop: 14,
        display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center",
      }}>
        {COLORS.map(c => (
          <div key={c} style={{
            width: 18, height: 18, borderRadius: "50%",
            background: c, border: "1px solid rgba(255,255,255,0.2)",
          }} />
        ))}
      </div>
      <div style={{ marginTop: 6, fontSize: 10, color: "#333", textAlign: "center" }}>
        {COLORS.length} colores · Agrupa 3+ del mismo color para explotar
      </div>

      {/* Balance */}
      <div style={{
        marginTop: 12,
        background: "rgba(10,10,18,0.8)", border: "1px solid #fbbf2433",
        borderRadius: 10, padding: "8px 24px",
        color: "#fbbf24", fontWeight: 700, fontSize: 14,
      }}>
        💰 {balance.toLocaleString()} fichas
      </div>
    </div>
  );
}
