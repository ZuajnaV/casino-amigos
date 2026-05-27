import { useState, useEffect, useCallback, useRef } from "react";
import { saveMinigameRecord } from "./minigameRecords";

// ── Configuración de dificultades ─────────────────────────────────────────────
const DIFFICULTIES = {
  easy:   { label: "Fácil",   rows: 9,  cols: 9,  mines: 10, color: "#00d4aa", pago: 75000},
  medium: { label: "Medio",   rows: 16, cols: 16, mines: 40, color: "#fbbf24", pago: 300000 },
  hard:   { label: "Difícil", rows: 16, cols: 30, mines: 99, color: "#ff4444", pago: 750000 },
};

// ── Utilidades ────────────────────────────────────────────────────────────────
function buildEmptyBoard(rows, cols) {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      mine: false, revealed: false, flagged: false, count: 0,
    }))
  );
}

function placeMines(board, rows, cols, mines, safeR, safeC) {
  const newBoard = board.map(r => r.map(c => ({ ...c })));
  const safe = new Set();
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      const nr = safeR + dr, nc = safeC + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols)
        safe.add(`${nr},${nc}`);
    }

  let placed = 0;
  while (placed < mines) {
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);
    if (!newBoard[r][c].mine && !safe.has(`${r},${c}`)) {
      newBoard[r][c].mine = true;
      placed++;
    }
  }

  // calcular counts
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (newBoard[r][c].mine) continue;
      let count = 0;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && newBoard[nr][nc].mine)
            count++;
        }
      newBoard[r][c].count = count;
    }
  }
  return newBoard;
}

function floodReveal(board, rows, cols, r, c) {
  const newBoard = board.map(row => row.map(cell => ({ ...cell })));
  const queue = [[r, c]];
  const visited = new Set([`${r},${c}`]);

  while (queue.length > 0) {
    const [cr, cc] = queue.shift();
    newBoard[cr][cc].revealed = true;
    newBoard[cr][cc].flagged = false;
    if (newBoard[cr][cc].count === 0) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = cr + dr, nc = cc + dc;
          const key = `${nr},${nc}`;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols
            && !visited.has(key) && !newBoard[nr][nc].revealed && !newBoard[nr][nc].mine) {
            visited.add(key);
            queue.push([nr, nc]);
          }
        }
      }
    }
  }
  return newBoard;
}

function countRevealed(board) {
  return board.flat().filter(c => c.revealed && !c.mine).length;
}

function checkWin(board, rows, cols, mines) {
  const safe = rows * cols - mines;
  return countRevealed(board) === safe;
}

// ── Colores de números ────────────────────────────────────────────────────────
const NUM_COLORS = ["", "#4fc3f7", "#81c784", "#e57373", "#7986cb", "#ff8a65", "#4dd0e1", "#9e9e9e", "#ef9a9a"];

// ── Componente principal ──────────────────────────────────────────────────────
export default function MinesweeperGame({ balance, setBalance, onBack }) {
  const [difficulty, setDifficulty] = useState(null); // null = pantalla selección
  const [board, setBoard] = useState(null);
  const [phase, setPhase] = useState("idle"); // idle | playing | dead | won
  const [firstClick, setFirstClick] = useState(true);
  const [flagCount, setFlagCount] = useState(0);
  const [revealedCount, setRevealedCount] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [earned, setEarned] = useState(0);
  const [lastEarned, setLastEarned] = useState(0);
  const timerRef = useRef(null);

  const cfg = difficulty ? DIFFICULTIES[difficulty] : null;

  // Timer
  useEffect(() => {
    if (phase === "playing") {
      timerRef.current = setInterval(() => setTimeElapsed(t => t + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [phase]);

  function startGame(diff) {
    const c = DIFFICULTIES[diff];
    setDifficulty(diff);
    setBoard(buildEmptyBoard(c.rows, c.cols));
    setPhase("idle");
    setFirstClick(true);
    setFlagCount(0);
    setRevealedCount(0);
    setTimeElapsed(0);
    setEarned(0);
    setLastEarned(0);
  }

  function resetGame() {
    startGame(difficulty);
  }

  function handleReveal(r, c) {
    if (phase === "dead" || phase === "won") return;
    if (board[r][c].revealed || board[r][c].flagged) return;

    let currentBoard = board;

    // Primer clic: sembrar minas garantizando zona segura
    if (firstClick) {
      currentBoard = placeMines(board, cfg.rows, cfg.cols, cfg.mines, r, c);
      setFirstClick(false);
      setPhase("playing");
    }

    // Pisó mina
    if (currentBoard[r][c].mine) {
      // revelar todas las minas
      const exploded = currentBoard.map(row =>
        row.map(cell => ({ ...cell, revealed: cell.mine ? true : cell.revealed }))
      );
      setBoard(exploded);
      setPhase("dead");
      return;
    }

    // Flood reveal
    const newBoard = floodReveal(currentBoard, cfg.rows, cfg.cols, r, c);
    const newRevealed = countRevealed(newBoard);
    setRevealedCount(newRevealed);

    // Calcular ganado ($1.000 por casilla libre)
    const newEarned = cfg.pago;       //const newEarned = newRevealed * cfg.pago;
    setEarned(newEarned);

    if (checkWin(newBoard, cfg.rows, cfg.cols, cfg.mines)) {
      setBoard(newBoard);
      setPhase("won");
      setLastEarned(newEarned);
      setBalance(balance + newEarned);

      saveMinigameRecord("minesweeper", revealedCount, newEarned);
      
      return;
    }

    setBoard(newBoard);
  }

  function handleFlag(e, r, c) {
    e.preventDefault();
    if (phase === "dead" || phase === "won" || phase === "idle") return;
    if (board[r][c].revealed) return;
    const newBoard = board.map(row => row.map(cell => ({ ...cell })));
    const cell = newBoard[r][c];
    if (!cell.flagged && flagCount >=100 ) return; // no más banderas   cfg.mines
    cell.flagged = !cell.flagged;
    setFlagCount(fc => cell.flagged ? fc + 1 : fc - 1);
    setBoard(newBoard);
  }

  // ── Pantalla de selección de dificultad ───────────────────────────────────
  if (!difficulty) {
    return (
      <div style={styles.wrap}>
        <div style={{ width: "100%", maxWidth: 480, margin: "0 auto" }}>
          <button onClick={onBack} style={styles.backBtn}>← Volver</button>

          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ fontSize: 70, marginBottom: 8 }}>💣</div>
            <div style={{ fontSize: 50, fontWeight: 900, color: "#fbbf24", letterSpacing: 2 }}>BUSCAMINAS</div>
            <div style={{ fontSize: 20, color: "#eaeaea", marginTop: 4 }}>Solo se gana si completas el tablero</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {Object.entries(DIFFICULTIES).map(([key, d]) => (
              <button key={key} onClick={() => startGame(key)} style={{
                background: `${d.color}0d`,
                border: `2px solid ${d.color}44`,
                borderRadius: 14,
                padding: "18px 20px",
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: 16,
                transition: "all 0.15s",
              }}>
                <div style={{
                  width: 48, height: 48,
                  background: `${d.color}22`,
                  border: `2px solid ${d.color}66`,
                  borderRadius: 10,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 30, flexShrink: 0,
                }}>
                  {key === "easy" ? "😊" : key === "medium" ? "😬" : "💀"}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: d.color, fontWeight: 800, fontSize: 25 }}>{d.label}</div>
                  <div style={{ color: "#ffffff", fontSize: 20, marginTop: 2 }}>
                    {d.cols} × {d.rows} · {d.mines} minas
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: "#00d4aa", fontSize: 20, fontWeight: 700 }}>
                    {(d.pago).toLocaleString()}
                  </div>
                  <div style={{ color: "#ffffff", fontSize: 16 }}>Ganancia</div>
                </div>
              </button>
            ))}
          </div>

          <div style={{
            marginTop: 24, background: "rgba(13,13,20,0.8)",
            border: "1px solid #1e1e2e", borderRadius: 12, padding: "14px 16px",
          }}>
            <div style={{ fontSize: 20, color: "#ffffff", letterSpacing: 2, marginBottom: 10, textTransform: "uppercase" }}>Cómo jugar</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                ["👆 Clic izquierdo: ", "Revelar casilla"],
                ["🚩 Clic derecho: ", "Poner / quitar bandera"],
                ["💥 Mina: ", "Game Over — pierdes lo ganado"],
                ["🏆 Ganar: ", "Revela todas las casillas sin minas"],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "left", fontSize: 18 }}>
                  <span style={{ color: "#ffffff" }}>{k}</span>
                  <span style={{ color: "#ffffff" }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Calcular tamaño de celda responsive ──────────────────────────────────
  const maxW = Math.min(window.innerWidth - 32, 720);
  const cellSize = Math.max(20, Math.floor(maxW / cfg.cols));
  const boardW = cellSize * cfg.cols;

  const minesLeft = cfg.mines - flagCount;
  const currentEarned = revealedCount * cfg.pago;

  return (
    <div style={styles.wrap}>
      <div style={{ width: "100%", maxWidth: Math.max(boardW + 16, 400), margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <button onClick={() => setDifficulty(null)} style={styles.backBtn}>← Niveles</button>
          <div style={{ textAlign: "center" }}>
            <span style={{ fontSize: 25, fontWeight: 900, color: cfg.color, letterSpacing: 1 }}>
              💣 {cfg.label.toUpperCase()}
            </span>
          </div>
          <button onClick={onBack} style={{ ...styles.backBtn, color: "#666" }}>✕ Salir</button>
        </div>

        {/* Stats bar */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr",
          gap: 8, marginBottom: 12,
        }}>
          {[
            { icon: "🚩", label: "Minas", val: minesLeft, color: "#ff4444" },
            { icon: "⏱", label: "Tiempo", val: `${timeElapsed}s`, color: "#8b5cf6" },
            { icon: "✅", label: "Seguras", val: revealedCount, color: "#00d4aa" },
          ].map(s => (
            <div key={s.label} style={{
              background: "rgba(13,13,20,0.9)", border: `1px solid ${s.color}33`,
              borderRadius: 8, padding: "6px 8px", textAlign: "center",
            }}>
              <div style={{ fontSize: 20, color: "#ffffff", textTransform: "uppercase", letterSpacing: 1 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.val}</div>
            </div>
          ))}
        </div>

        {/* Tablero */}
        <div style={{
          overflowX: "auto",
          borderRadius: 10,
          border: `2px solid ${cfg.color}44`,
          boxShadow: `0 0 30px ${cfg.color}22`,
        }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${cfg.cols}, ${cellSize}px)`,
            width: boardW,
            gap: 0,
          }}>
            {board && board.map((row, r) =>
              row.map((cell, c) => {
                const isRevealed = cell.revealed;
                const isMine = cell.mine;
                const isFlagged = cell.flagged;
                const isExploded = isMine && isRevealed && phase === "dead";

                let bg = "#1a1a2e";
                let border = "1px solid #0d0d1a";
                if (isRevealed && !isMine) {
                  bg = "#0d0d16";
                  border = "1px solid #111120";
                }
                if (isExploded) bg = "#3a0000";
                if (phase === "won" && isMine) bg = "#002a1a";

                return (
                  <div
                    key={`${r}-${c}`}
                    onClick={() => handleReveal(r, c)}
                    onContextMenu={(e) => handleFlag(e, r, c)}
                    style={{
                      width: cellSize, height: cellSize,
                      background: bg,
                      border,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: cellSize > 28 ? 25 : cellSize > 22 ? 20 : 20,
                      fontWeight: 900,
                      cursor: isRevealed ? "default" : "pointer",
                      userSelect: "none",
                      color: isFlagged ? "#ff4444"
                        : isExploded ? "#ff4444"
                        : (phase === "won" && isMine) ? "#00d4aa"
                        : isRevealed && cell.count > 0 ? NUM_COLORS[cell.count]
                        : "#ccc",
                      transition: "background 0.08s",
                      boxSizing: "border-box",
                      position: "relative",
                      // efecto hover solo en no reveladas
                      ...((!isRevealed && phase !== "dead" && phase !== "won") ? { } : {}),
                    }}
                    onMouseEnter={e => {
                      if (!isRevealed && phase !== "dead" && phase !== "won")
                        e.currentTarget.style.background = "#252540";
                    }}
                    onMouseLeave={e => {
                      if (!isRevealed && phase !== "dead" && phase !== "won")
                        e.currentTarget.style.background = bg;
                    }}
                  >
                    {isFlagged && !isRevealed ? "🚩"
                      : isExploded ? "💥"
                      : (phase === "won" && isMine) ? "🚩"
                      : isRevealed && isMine ? "💣"
                      : isRevealed && cell.count > 0 ? cell.count
                      : null}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Botón reset */}
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button onClick={resetGame} style={{
            flex: 1, background: `${cfg.color}18`, border: `1px solid ${cfg.color}44`,
            borderRadius: 8, padding: "10px", color: cfg.color,
            fontSize: 20, fontWeight: 700, cursor: "pointer", letterSpacing: 1,
          }}>
            {phase === "idle" ? "🔄 Nueva partida" : phase === "playing" ? "🔄 Reiniciar" : "🔄 Jugar de nuevo"}
          </button>
          <button onClick={() => setDifficulty(null)} style={{
            background: "rgba(13,13,20,0.8)", border: "1px solid #2a2a3a",
            borderRadius: 8, padding: "10px 14px", color: "#ffffff",
            fontSize: 20, cursor: "pointer",
          }}>
            Cambiar nivel
          </button>
        </div>

        {/* Instrucción inicial */}
        {phase === "idle" && (
          <div style={{
            marginTop: 12, textAlign: "center",
            background: "rgba(251,191,36,0.06)", border: "1px solid #fbbf2422",
            borderRadius: 8, padding: "10px",
            fontSize: 20, color: "#888",
          }}>
            👆 Haz clic en cualquier casilla para comenzar
          </div>
        )}
      </div>

      {/* ── Overlay Game Over ── */}
      {phase === "dead" && (
        <div style={styles.overlay}>
          <div style={styles.overlayCard}>
            <div style={{ fontSize: 52, marginBottom: 8 }}>💥</div>
            <div style={{ fontSize: 30, fontWeight: 900, color: "#ff4444", marginBottom: 6 }}>GAME OVER</div>
            <div style={{ fontSize: 20, color: "#888", marginBottom: 16 }}>
              Revelaste <strong style={{ color: "#fff" }}>{revealedCount}</strong> casillas seguras
            </div>
            <div style={{
              background: "rgba(255,68,68,0.1)", border: "1px solid #ff444433",
              borderRadius: 10, padding: "10px 20px", marginBottom: 20,
              fontSize: 20, color: "#ff6666",
            }}>
              Pierdes lo ganado — las ganancias se acreditan solo al ganar
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={resetGame} style={{
                flex: 1, background: "#ff4444", border: "none", borderRadius: 8,
                padding: "12px", color: "#fff", fontSize: 20, fontWeight: 800, cursor: "pointer",
              }}>▶ Reintentar</button>
              <button onClick={() => setDifficulty(null)} style={{
                flex: 1, background: "rgba(13,13,20,0.8)", border: "1px solid #2a2a3a",
                borderRadius: 8, padding: "12px", color: "#aaa", fontSize: 20, cursor: "pointer",
              }}>Cambiar nivel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Overlay Victoria ── */}
      {phase === "won" && (
        <div style={styles.overlay}>
          <div style={styles.overlayCard}>
            <div style={{ fontSize: 52, marginBottom: 8 }}>🏆</div>
            <div style={{ fontSize: 30, fontWeight: 900, color: "#00d4aa", marginBottom: 6 }}>¡GANASTE!</div>
            <div style={{ fontSize: 20, color: "#888", marginBottom: 4 }}>
              {revealedCount} casillas seguras · {timeElapsed}s
            </div>
            <div style={{
              background: "rgba(0,212,170,0.1)", border: "1px solid #00d4aa44",
              borderRadius: 10, padding: "12px 24px", margin: "16px 0",
            }}>
              <div style={{ fontSize: 20, color: "#555", marginBottom: 4 }}>FICHAS GANADAS</div>
              <div style={{ fontSize: 40, fontWeight: 900, color: "#00d4aa" }}>
                +${lastEarned.toLocaleString()}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={resetGame} style={{
                flex: 1, background: "#00d4aa", border: "none", borderRadius: 8,
                padding: "12px", color: "#000", fontSize: 20, fontWeight: 800, cursor: "pointer",
              }}>▶ Jugar de nuevo</button>
              <button onClick={() => setDifficulty(null)} style={{
                flex: 1, background: "rgba(13,13,20,0.8)", border: "1px solid #2a2a3a",
                borderRadius: 8, padding: "12px", color: "#aaa", fontSize: 20, cursor: "pointer",
              }}>Cambiar nivel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  wrap: {
    minHeight: "100vh",
    background: "#080810",
    color: "#fff",
    fontFamily: "'Courier New', monospace",
    padding: "16px",
    position: "relative",
  },
  backBtn: {
    background: "rgba(10,10,18,0.8)", border: "1px solid #2a2a3a",
    borderRadius: 8, color: "#aaa", fontSize: 20, padding: "6px 12px",
    cursor: "pointer",
  },
  overlay: {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.85)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 200,
    backdropFilter: "blur(6px)",
  },
  overlayCard: {
    background: "#10101c",
    border: "1px solid #2a2a3a",
    borderRadius: 16,
    padding: "32px 28px",
    textAlign: "center",
    maxWidth: 340,
    width: "90%",
  },
};
