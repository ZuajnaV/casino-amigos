import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase";

// ═══════════════════════════════════════════════════════════════
//  CONSTANTES
// ═══════════════════════════════════════════════════════════════
const COLS = 10, ROWS = 20;
const CELL = 28;
const BOARD_W = COLS * CELL;
const BOARD_H = ROWS * CELL;

// Pagos por líneas limpiadas
const LINE_PAY = { 1: 500, 2: 2000, 3: 5000, 4: 10000 };
const BACK_TO_BACK_BONUS = 1.5; // 50% extra si dos Tetris seguidos
const MAX_SESSION_PAY = 1_000_000;
// Lock Delay y DAS
const LOCK_DELAY    = 500;  // ms antes de fijar la pieza
const MAX_LK_MOVES  = 15;   // máximo de reinicios del lock delay
const DAS           = 150;  // ms antes de empezar el auto-repeat
const ARR           = 50;   // ms entre repeticiones


const COLORS = {
  I: "#5BC8E8", O: "#F5C518", T: "#9B59B6",
  L: "#E67E22", J: "#3498DB", S: "#2ECC71", Z: "#E74C3C",
};

const SHAPES = {
  I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  O: [[1,1],[1,1]],
  T: [[0,1,0],[1,1,1],[0,0,0]],
  L: [[0,0,1],[1,1,1],[0,0,0]],
  J: [[1,0,0],[1,1,1],[0,0,0]],
  S: [[0,1,1],[1,1,0],[0,0,0]],
  Z: [[1,1,0],[0,1,1],[0,0,0]],
};

// SRS Wall Kicks
const KICKS_NORMAL = [
  [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
];
const KICKS_I = [
  [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
  [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
];

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════
function newBag() {
  const types = ["I","O","T","L","J","S","Z"];
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [types[i], types[j]] = [types[j], types[i]];
  }
  return types;
}

function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function rotateMat(mat) {
  return mat[0].map((_, c) => mat.map(r => r[c]).reverse());
}

function spawnPiece(type) {
  const shape = SHAPES[type].map(r => [...r]);
  const col = Math.floor((COLS - shape[0].length) / 2);
  return { type, shape, r: type === "I" ? -1 : 0, c: col, rot: 0 };
}

function isValid(board, piece, dr = 0, dc = 0, shape = null) {
  const s = shape || piece.shape;
  for (let r = 0; r < s.length; r++)
    for (let c = 0; c < s[r].length; c++)
      if (s[r][c]) {
        const nr = piece.r + r + dr, nc = piece.c + c + dc;
        if (nr >= ROWS || nc < 0 || nc >= COLS) return false;
        if (nr >= 0 && board[nr][nc]) return false;
      }
  return true;
}

function ghostDrop(board, piece) {
  let dr = 0;
  while (isValid(board, piece, dr + 1)) dr++;
  return dr;
}

function placePiece(board, piece) {
  const b = board.map(r => [...r]);
  piece.shape.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v) {
        const nr = piece.r + r, nc = piece.c + c;
        if (nr >= 0) b[nr][nc] = piece.type;
      }
    })
  );
  return b;
}

function clearLines(board) {
  const kept = board.filter(row => row.some(v => !v));
  const cleared = ROWS - kept.length;
  const newBoard = [
    ...Array.from({ length: cleared }, () => Array(COLS).fill(null)),
    ...kept,
  ];
  return { board: newBoard, cleared };
}

function tryRotate(board, piece) {
  const newShape = rotateMat(piece.shape);
  const newRot = (piece.rot + 1) % 4;
  const kicks = piece.type === "I" ? KICKS_I[piece.rot] : KICKS_NORMAL[piece.rot];
  for (const [dc, dr] of kicks) {
    if (isValid(board, piece, dr, dc, newShape)) {
      return { ...piece, shape: newShape, rot: newRot, r: piece.r + dr, c: piece.c + dc };
    }
  }
  return piece;
}

// ═══════════════════════════════════════════════════════════════
//  DIBUJO EN CANVAS
// ═══════════════════════════════════════════════════════════════
function drawBlock(ctx, x, y, color, ghost = false) {
  ctx.globalAlpha = ghost ? 0.18 : 1;
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
  // Brillo superior
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(x + 1, y + 1, CELL - 2, 4);
  // Sombra inferior
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(x + 1, y + CELL - 5, CELL - 2, 4);
  ctx.globalAlpha = 1;
}

function drawMini(ctx, type, w, h) {
  ctx.clearRect(0, 0, w, h);
  if (!type) return;
  const shape = SHAPES[type];
  const sz = 16;
  const ox = Math.floor((w - shape[0].length * sz) / 2);
  const oy = Math.floor((h - shape.length * sz) / 2);
  ctx.fillStyle = COLORS[type];
  shape.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v) {
        ctx.fillRect(ox + c * sz + 1, oy + r * sz + 1, sz - 2, sz - 2);
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.fillRect(ox + c * sz + 1, oy + r * sz + 1, sz - 2, 3);
        ctx.fillStyle = COLORS[type];
      }
    })
  );
}

function renderBoard(ctx, board, current, ghost) {
  // Fondo
  ctx.fillStyle = "#0d0d18";
  ctx.fillRect(0, 0, BOARD_W, BOARD_H);

  // Grid lines
  ctx.strokeStyle = "#111122";
  ctx.lineWidth = 0.5;
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath(); ctx.moveTo(0, r * CELL); ctx.lineTo(BOARD_W, r * CELL); ctx.stroke();
  }
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath(); ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, BOARD_H); ctx.stroke();
  }

  // Bloques fijos
  board.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v) drawBlock(ctx, c * CELL, r * CELL, COLORS[v]);
    })
  );

  // Ghost
  if (current) {
    const gd = ghost;
    current.shape.forEach((row, dr) =>
      row.forEach((v, dc) => {
        if (!v) return;
        const gr = current.r + dr + gd, gc = current.c + dc;
        if (gr >= 0 && gr < ROWS && !board[gr][gc])
          drawBlock(ctx, gc * CELL, gr * CELL, COLORS[current.type], true);
      })
    );
  }

  // Pieza activa
  if (current) {
    current.shape.forEach((row, dr) =>
      row.forEach((v, dc) => {
        if (!v) return;
        const pr = current.r + dr, pc = current.c + dc;
        if (pr >= 0 && pr < ROWS)
          drawBlock(ctx, pc * CELL, pr * CELL, COLORS[current.type]);
      })
    );
  }
}

// ═══════════════════════════════════════════════════════════════
//  COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════
export default function TetrisGame({ balance, setBalance, onBack }) {
  const canvasRef   = useRef(null);
  const nextRef     = useRef(null);
  const holdRef     = useRef(null);

  // Estado del juego en refs para el loop
  const boardRef    = useRef(emptyBoard());
  const currentRef  = useRef(null);
  const nextPieceRef = useRef(null);
  const holdRef2    = useRef(null);   // tipo guardado
  const holdUsedRef = useRef(false);
  const bagRef      = useRef(newBag());
  const scoreRef    = useRef(0);
  const levelRef    = useRef(1);
  const linesRef    = useRef(0);
  const earnedRef   = useRef(0);
  const paidRef     = useRef(0);
  const lastTetrisRef = useRef(false); // para back-to-back
  const runningRef  = useRef(false);
  const balRef      = useRef(balance);
  const dropTimerRef = useRef(null);
  const rafRef      = useRef(null);
  const savingRef   = useRef(false);



  const lockTimerRef  = useRef(null);
const lockMovesRef  = useRef(0);
const dasTimerRef   = useRef(null);
const arrTimerRef   = useRef(null);
const keysHeld      = useRef({});

  // UI state
  const [phase,   setPhase]   = useState("idle"); // idle | playing | gameover
  const [uiScore, setUiScore] = useState(0);
  const [uiLevel, setUiLevel] = useState(1);
  const [uiLines, setUiLines] = useState(0);
  const [uiEarned,setUiEarned]= useState(0);
  const [saving,  setSaving]  = useState(false);

  useEffect(() => { balRef.current = balance; }, [balance]);

  // ── Prevenir scroll con flechas ────────────────────────────
  useEffect(() => {
    const fn = e => {
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key))
        e.preventDefault();
    };
    window.addEventListener("keydown", fn, { passive: false });
    return () => window.removeEventListener("keydown", fn);
  }, []);

  // ── Obtener siguiente pieza del bag ────────────────────────
  function nextFromBag() {
    if (bagRef.current.length === 0) bagRef.current = newBag();
    return bagRef.current.shift();
  }

  // ── Calcular velocidad de caída ────────────────────────────
  function dropMs() {
    return Math.max(30, 1000 - (levelRef.current - 1) * 95);        // estaba en 80, lo bajé a 60   30, 1000- (levelRef.current - 1) * 85);
  }

  // ── Renderizar canvas ──────────────────────────────────────
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const gd = currentRef.current
      ? ghostDrop(boardRef.current, currentRef.current)
      : 0;
    renderBoard(ctx, boardRef.current, currentRef.current, gd);

    drawMini(
      nextRef.current?.getContext("2d"),
      nextPieceRef.current?.type,
      nextRef.current?.width || 80,
      nextRef.current?.height || 72,
    );
    drawMini(
      holdRef.current?.getContext("2d"),
      holdRef2.current,
      holdRef.current?.width || 80,
      holdRef.current?.height || 72,
    );
  }, []);

  // ── Bloquear pieza y generar la siguiente ──────────────────
  function lockAndNext() {
    cancelLock();               // ← nueva
  lockMovesRef.current = 0;   // ← nueva
    boardRef.current = placePiece(boardRef.current, currentRef.current);
    const { board: newBoard, cleared } = clearLines(boardRef.current);
    boardRef.current = newBoard;

    // Calcular pago
    if (cleared > 0) {
      const isTetris = cleared === 4;
      const btb = isTetris && lastTetrisRef.current;
      lastTetrisRef.current = isTetris;

      let pay = LINE_PAY[cleared] || 0;
      if (btb) pay = Math.round(pay * BACK_TO_BACK_BONUS);

      if (paidRef.current < MAX_SESSION_PAY) {
        const actual = Math.min(pay, MAX_SESSION_PAY - paidRef.current);
        earnedRef.current += actual;
        paidRef.current   += actual;
      }

      // Puntuación
      const pts = [0, 100, 300, 500, 800];
      scoreRef.current += (pts[cleared] || 0) * levelRef.current;
      linesRef.current += cleared;
      levelRef.current = Math.floor(linesRef.current / 10) + 1;

      setUiScore(scoreRef.current);
      setUiLevel(levelRef.current);
      setUiLines(linesRef.current);
      setUiEarned(earnedRef.current);
    } else {
      lastTetrisRef.current = false;
    }

    // Siguiente pieza
    holdUsedRef.current = false;
    currentRef.current = nextPieceRef.current;
    nextPieceRef.current = spawnPiece(nextFromBag());

    // Reiniciar drop timer con nueva velocidad
    clearInterval(dropTimerRef.current);
    dropTimerRef.current = setInterval(gameTick, dropMs());

    // Game Over
    if (!isValid(boardRef.current, currentRef.current)) {
      endGame();
    }
  }




  // Programa el bloqueo de la pieza tras LOCK_DELAY ms
function scheduleLock() {
  if (lockTimerRef.current) return; // ya programado
  lockTimerRef.current = setTimeout(() => {
    lockTimerRef.current = null;
    lockMovesRef.current = 0;
    if (!runningRef.current) return;
    lockAndNext();
    render();
  }, LOCK_DELAY);
}

// Cancela el bloqueo pendiente
function cancelLock() {
  clearTimeout(lockTimerRef.current);
  lockTimerRef.current = null;
}

// Llamar después de cada movimiento lateral / rotación
function afterMove() {
  const onGround = !isValid(boardRef.current, currentRef.current, 1);
  if (onGround) {
    if (lockMovesRef.current < MAX_LK_MOVES) {
      lockMovesRef.current++;
      cancelLock();
      scheduleLock(); // reinicia el temporizador
    }
    // Si ya llegó al límite, dejamos que el timer existente corra
  } else {
    // La pieza puede seguir cayendo → cancelar lock
    cancelLock();
    lockMovesRef.current = 0;
  }
}












  // ── Tick de gravedad ───────────────────────────────────────



function gameTick() {
  if (!runningRef.current) return;
  if (isValid(boardRef.current, currentRef.current, 1)) {
    currentRef.current = { ...currentRef.current, r: currentRef.current.r + 1 };
    // Puede seguir cayendo → cancelar cualquier lock pendiente
    cancelLock();
    lockMovesRef.current = 0;
  } else {
    // Toca el suelo → programar bloqueo (si no está ya programado)
    scheduleLock();
  }
  render();
}









/*

  function gameTick() {
    if (!runningRef.current) return;
    if (isValid(boardRef.current, currentRef.current, 1)) {
      currentRef.current = { ...currentRef.current, r: currentRef.current.r + 1 };
    } else {
      lockAndNext();
    }
    render();
  }
*/
  // ── Cobrar y guardar ───────────────────────────────────────
async function saveEarned() {
  const earned = earnedRef.current;
  if (earned <= 0 || savingRef.current) return;
  
  savingRef.current = true;
  earnedRef.current = 0;    // ← agregar esta línea aquí
  setSaving(true);
  
  const newBal = balRef.current + earned;
  setBalance(newBal);
  balRef.current = newBal;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase.from("profiles").update({ balance: newBal }).eq("id", session.user.id);
    }
  } catch (e) { console.error(e); }
  finally {
    savingRef.current = false;
    setSaving(false);
  }
}

  // ── Fin del juego ──────────────────────────────────────────
  async function endGame() {
    runningRef.current = false;
    clearInterval(dropTimerRef.current);
    render();
    await saveEarned();
    setPhase("gameover");
  }

  // ── Iniciar partida ────────────────────────────────────────
  function startGame() {
    clearInterval(dropTimerRef.current);
    boardRef.current    = emptyBoard();
    bagRef.current      = newBag();
    scoreRef.current    = 0;
    levelRef.current    = 1;
    linesRef.current    = 0;
    earnedRef.current   = 0;
    paidRef.current     = 0;
    holdRef2.current    = null;
    holdUsedRef.current = false;
    lastTetrisRef.current = false;



    cancelLock();
lockMovesRef.current = 0;
clearTimeout(dasTimerRef.current);
clearInterval(arrTimerRef.current);
keysHeld.current = {};






    runningRef.current  = true;

    currentRef.current  = spawnPiece(nextFromBag());
    nextPieceRef.current = spawnPiece(nextFromBag());

    setUiScore(0); setUiLevel(1); setUiLines(0); setUiEarned(0);
    setPhase("playing");

    dropTimerRef.current = setInterval(gameTick, dropMs());
    render();
  }

  // ── Controles de teclado ───────────────────────────────────




useEffect(() => {
  function move(dc) {
    const c = currentRef.current;
    if (!c || !runningRef.current) return;
    if (isValid(boardRef.current, c, 0, dc)) {
      currentRef.current = { ...c, c: c.c + dc };
      afterMove();
      render();
    }
  }

  function onKeyDown(e) {
    if (!runningRef.current) return;
    const cur = currentRef.current;
    if (!cur) return;

    // ── Movimiento horizontal con DAS ──
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      if (keysHeld.current[e.key]) return; // ya presionada
      keysHeld.current[e.key] = true;
      const dc = e.key === "ArrowLeft" ? -1 : 1;

      move(dc); // movimiento inmediato

      clearTimeout(dasTimerRef.current);
      clearInterval(arrTimerRef.current);
      dasTimerRef.current = setTimeout(() => {
        arrTimerRef.current = setInterval(() => move(dc), ARR);
      }, DAS);
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        if (isValid(boardRef.current, cur, 1)) {
          currentRef.current = { ...cur, r: cur.r + 1 };
          scoreRef.current += 1;
          afterMove();
        }
        break;
      case "ArrowUp":
        currentRef.current = tryRotate(boardRef.current, cur);
        afterMove();
        break;
      case " ": {
        const gd = ghostDrop(boardRef.current, cur);
        scoreRef.current += gd * 2;
        currentRef.current = { ...cur, r: cur.r + gd };
        cancelLock();
        lockAndNext();
        break;
      }
      case "c": case "C": case "Shift": {
        if (holdUsedRef.current) break;
        holdUsedRef.current = true;
        if (!holdRef2.current) {
          holdRef2.current = cur.type;
          currentRef.current = nextPieceRef.current;
          nextPieceRef.current = spawnPiece(nextFromBag());
        } else {
          const tmp = holdRef2.current;
          holdRef2.current = cur.type;
          currentRef.current = spawnPiece(tmp);
        }
        cancelLock();
        lockMovesRef.current = 0;
        break;
      }
    }
    render();
  }

  function onKeyUp(e) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      keysHeld.current[e.key] = false;
      clearTimeout(dasTimerRef.current);
      clearInterval(arrTimerRef.current);
    }
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup",   onKeyUp);
  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup",   onKeyUp);
    clearTimeout(dasTimerRef.current);
    clearInterval(arrTimerRef.current);
  };
}, [render]);












/*
  useEffect(() => {
    function onKey(e) {
      if (!runningRef.current) return;
      const cur = currentRef.current;
      if (!cur) return;

      switch (e.key) {
        case "ArrowLeft":
          if (isValid(boardRef.current, cur, 0, -1))
            currentRef.current = { ...cur, c: cur.c - 1 };
          break;
        case "ArrowRight":
          if (isValid(boardRef.current, cur, 0, 1))
            currentRef.current = { ...cur, c: cur.c + 1 };
          break;
        case "ArrowDown":
          if (isValid(boardRef.current, cur, 1))
            currentRef.current = { ...cur, r: cur.r + 1 };
          scoreRef.current += 1;
          break;
        case "ArrowUp":
          currentRef.current = tryRotate(boardRef.current, cur);
          break;
        case " ": {
          // Hard drop
          const gd = ghostDrop(boardRef.current, cur);
          scoreRef.current += gd * 2;
          currentRef.current = { ...cur, r: cur.r + gd };
          lockAndNext();
          break;
        }
        case "c":
        case "C":
        case "Shift": {
          if (holdUsedRef.current) break;
          holdUsedRef.current = true;
          if (!holdRef2.current) {
            holdRef2.current = cur.type;
            currentRef.current = nextPieceRef.current;
            nextPieceRef.current = spawnPiece(nextFromBag());
          } else {
            const tmp = holdRef2.current;
            holdRef2.current = cur.type;
            currentRef.current = spawnPiece(tmp);
          }
          break;
        }
      }
      render();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [render]);

*/


  // ── Renderizar en idle para preview ───────────────────────
  useEffect(() => {
    render();
  }, [phase, render]);

  // ── Cleanup al desmontar ───────────────────────────────────
  useEffect(() => {
    return () => {
      clearInterval(dropTimerRef.current);
      cancelAnimationFrame(rafRef.current);


        clearTimeout(dasTimerRef.current);
clearInterval(arrTimerRef.current);



    };
  }, []);

  // ── Controles táctiles (D-pad) ────────────────────────────
  function touchLeft()   { if (!runningRef.current) return; const c = currentRef.current; if (c && isValid(boardRef.current, c, 0, -1)) { currentRef.current = {...c, c: c.c - 1}; render(); } }
  function touchRight()  { if (!runningRef.current) return; const c = currentRef.current; if (c && isValid(boardRef.current, c, 0, 1))  { currentRef.current = {...c, c: c.c + 1}; render(); } }
  function touchRotate() { if (!runningRef.current) return; currentRef.current = tryRotate(boardRef.current, currentRef.current); render(); }
  function touchDown()   { if (!runningRef.current) return; const c = currentRef.current; if (c && isValid(boardRef.current, c, 1)) { currentRef.current = {...c, r: c.r + 1}; scoreRef.current++; render(); } }
  function touchDrop()   { if (!runningRef.current) return; const c = currentRef.current; if (!c) return; const gd = ghostDrop(boardRef.current, c); scoreRef.current += gd * 2; currentRef.current = {...c, r: c.r + gd}; lockAndNext(); render(); }
  function touchHold()   { if (!runningRef.current || holdUsedRef.current) return; holdUsedRef.current = true; const c = currentRef.current; if (!holdRef2.current) { holdRef2.current = c.type; currentRef.current = nextPieceRef.current; nextPieceRef.current = spawnPiece(nextFromBag()); } else { const tmp = holdRef2.current; holdRef2.current = c.type; currentRef.current = spawnPiece(tmp); } render(); }

  const btnStyle = (color = "#2a2a3a") => ({
    background: "#0d0d18", border: `1px solid ${color}`,
    borderRadius: 10, color: "#fff", fontSize: 20,
    width: 52, height: 52, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    userSelect: "none", WebkitUserSelect: "none", touchAction: "manipulation",
    fontWeight: 700,
  });

  return (
    <div style={{
      minHeight: "100vh", background: "#080810", color: "#fff",
      fontFamily: "'Courier New', monospace",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "12px 8px 32px",
    }}>
      {/* Header */}
      <div style={{
        width: "100%", maxWidth: 520,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 14,
      }}>
        <button onClick={async () => { clearInterval(dropTimerRef.current); runningRef.current = false; await saveEarned(); onBack(); }} style={{
          background: "rgba(10,10,18,0.75)", border: "1px solid #2a2a3a",
          borderRadius: 8, color: "#aaa", fontSize: 13, padding: "6px 14px", cursor: "pointer",
        }}>← Volver</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#5BC8E8", fontWeight: 900, fontSize: 22, letterSpacing: 2 }}>🟦 TETRIS</div>
          <div style={{ color: "#555", fontSize: 11 }}>TRABAJO · Gana fichas limpiando líneas</div>
        </div>
        <div style={{ color: "#fbbf24", fontWeight: 700, fontSize: 13 }}>💰 {balance.toLocaleString()}</div>
      </div>

      {/* Área principal */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap", justifyContent: "center" }}>

        {/* Tablero */}
        <div style={{ position: "relative" }}>
          <canvas
            ref={canvasRef}
            width={BOARD_W} height={BOARD_H}
            style={{ border: "1.5px solid #1e1e2e", borderRadius: 6, display: "block" }}
          />
          {/* Overlay idle */}
          {phase === "idle" && (
            <div style={{
              position: "absolute", inset: 0, background: "rgba(8,8,16,0.88)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              borderRadius: 6,
            }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>🟦</div>
              <div style={{ color: "#5BC8E8", fontWeight: 900, fontSize: 24, letterSpacing: 3, marginBottom: 6 }}>TETRIS</div>
              <div style={{ fontSize: 13, color: "#ffffff", marginBottom: 20, textAlign: "center", lineHeight: 1.8 }}>
                1 línea = $500 · 2 = $2.000<br/>3 = $5.000 · Tetris = $10.000<br/>Back-to-Back Tetris = ×1.5
              </div>
              <button onClick={startGame} style={{
                background: "#5BC8E8", border: "none", borderRadius: 10,
                padding: "12px 32px", fontSize: 16, fontWeight: 900, cursor: "pointer", color: "#000",
              }}>▶ JUGAR</button>
            </div>
          )}
          {/* Overlay game over */}
          {phase === "gameover" && (
            <div style={{
              position: "absolute", inset: 0, background: "rgba(8,8,16,0.92)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              borderRadius: 6,
            }}>
              <div style={{ fontSize: 36, marginBottom: 6 }}>💀</div>
              <div style={{ color: "#ef4444", fontWeight: 900, fontSize: 20, letterSpacing: 2, marginBottom: 6 }}>GAME OVER</div>
              <div style={{ color: "#aaa", fontSize: 13, marginBottom: 4 }}>Score: {uiScore.toLocaleString()}</div>
              <div style={{ color: "#00d4aa", fontWeight: 900, fontSize: 20, marginBottom: 20 }}>
                +${uiEarned.toLocaleString()} cobrados
              </div>
              <button onClick={startGame} style={{
                background: "#5BC8E8", border: "none", borderRadius: 10,
                padding: "11px 28px", fontSize: 15, fontWeight: 900, cursor: "pointer", color: "#000", marginBottom: 8,
              }}>🔄 Reintentar</button>
            </div>
          )}
        </div>

        {/* Panel lateral */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: 110 }}>

          {/* Hold */}
          <div style={{ background: "#0d0d18", border: "1px solid #1e1e2e", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
            <div style={{ fontSize: 15, color: "#ffffff", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Hold (C)</div>
            <canvas ref={holdRef} width={88} height={72} style={{ display: "block", margin: "0 auto" }} />
          </div>

          {/* Next */}
          <div style={{ background: "#0d0d18", border: "1px solid #1e1e2e", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
            <div style={{ fontSize: 15, color: "#ffffff", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Next</div>
            <canvas ref={nextRef} width={88} height={72} style={{ display: "block", margin: "0 auto" }} />
          </div>

          {/* Stats */}
          {[
            { label: "Score",  val: uiScore.toLocaleString(), color: "#fff" },
            { label: "Nivel",  val: uiLevel, color: "#fbbf24" },
            { label: "Líneas", val: uiLines, color: "#5BC8E8" },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ background: "#0d0d18", border: "1px solid #1e1e2e", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 15, color: "#ffffff", letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
            </div>
          ))}

          {/* Ganado */}
          <div style={{
            background: uiEarned > 0 ? "rgba(0,212,170,0.08)" : "#0d0d18",
            border: `1px solid ${uiEarned > 0 ? "#00d4aa44" : "#1e1e2e"}`,
            borderRadius: 10, padding: "8px 10px", textAlign: "center",
          }}>
            <div style={{ fontSize: 15, color: "#ffffff", letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 }}>Ganado</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#00d4aa" }}>+${uiEarned.toLocaleString()}</div>
          </div>

          {/* Teclado */}
          <div style={{ background: "#0d0d18", border: "1px solid #1e1e2e", borderRadius: 10, padding: "8px" }}>
            <div style={{ fontSize: 15, color: "#ffffff", lineHeight: 1.9, textAlign: "center" }}>
              ← → mover<br/>↑ rotar<br/>↓ bajar<br/>⎵ hard drop<br/>C guardar
            </div>
          </div>
        </div>
      </div>

      {/* D-pad táctil */}
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <button onPointerDown={touchHold}   style={btnStyle("#9B59B6")}>C</button>
          <button onPointerDown={touchRotate} style={btnStyle("#5BC8E8")}>↺</button>
          <button onPointerDown={touchDrop}   style={btnStyle("#F5C518")}>⬇⬇</button>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onPointerDown={touchLeft}  style={btnStyle()}>◀</button>
          <button onPointerDown={touchDown}  style={btnStyle()}>▼</button>
          <button onPointerDown={touchRight} style={btnStyle()}>▶</button>
        </div>
      </div>

      <div style={{ marginTop: 10, fontSize: 15, color: "#ffffff", textAlign: "center" }}>
        Máx. ${MAX_SESSION_PAY.toLocaleString()} por sesión · El cobro es automático al morir
      </div>
    </div>
  );
}