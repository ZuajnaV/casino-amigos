import { useState, useEffect, useRef, useCallback } from "react";
import { saveMinigameRecord } from "./minigameRecords";

// ── Constantes ────────────────────────────────────────────────────────────────
const W = 400;
const H = 600;
const GROUND_Y = H - 60;     // límite inferior del jugador
const TRI_R = 44;            // radio del triángulo (centro a vértice)
const OBJ_R = 20;
const PLAYER_SPEED = 4.5;
const OBJ_SPEED_INIT = 2.8;
const OBJ_SPEED_MAX  = 8.5;
const OBJ_SPEED_INC  = 0.0015;      // aceleración gradual de los objetos
const SPAWN_INTERVAL_INIT = 1600;   // intervalo inicial de spawn (ms)
const SPAWN_INTERVAL_MIN  = 650;     // límite de spawn (máxima dificultad)
const SPAWN_DEC = 0.993;            //0.984 factor de reducción del intervalo de spawn por cada objeto generado
const HIT_RADIUS = TRI_R - 4;   // radio de colisión con la punta activa
const MAX_ON_SCREEN = 20;
const PAGO_POR_OBJ = 1500;

// Los 3 colores/puntas
const COLORS = [
  { id: "green", hex: "#4ade80", label: "VERDE"  },
  { id: "blue",  hex: "#60a5fa", label: "AZUL"   },
  { id: "red",   hex: "#f87171", label: "ROJO"   },
];

// Rotación: 3 estados (0, 1, 2) → ángulo de la punta superior
// rot=0: verde arriba (90°), azul abajo-izq (210°), rojo abajo-der (330°)
// rot=1: rojo arriba, verde abajo-izq, azul abajo-der
// rot=2: azul arriba, rojo abajo-izq, verde abajo-der
// color de cada vértice según rot: vertex[i] = COLORS[(i - rot*??) % 3]
// Cada "step" gira 120° → la asignación de color a vértice cambia
// vértice 0 = ángulo 90 (arriba), 1 = 210 (abajo-izq), 2 = 330 (abajo-der)
function getVertexColors(rotStep) {
  // rotStep 0,1,2 — rotamos la asignación
  return [
    COLORS[(0 + rotStep) % 3],  // vértice arriba
    COLORS[(1 + rotStep) % 3],  // vértice abajo-izq
    COLORS[(2 + rotStep) % 3],  // vértice abajo-der
  ];
}
// Vértice activo (arriba) = índice 0 siempre (se rota asignación, no geometría)
// → punta activa siempre apunta arriba, pero cambia de color

function triVerts(cx, cy) {
  const angles = [90, 210, 330]; // grados, 0=derecha, 90=arriba
  return angles.map(a => {
    const rad = (a * Math.PI) / 180;
    return [cx + TRI_R * Math.cos(rad), cy - TRI_R * Math.sin(rad)];
  });
}

// ── Componente ────────────────────────────────────────────────────────────────
export default function ColorDash({ balance, setBalance, onBack }) {
  const canvasRef    = useRef(null);
  const stateRef     = useRef(null);
  const rafRef       = useRef(null);
  const lastTsRef    = useRef(null);
  const spawnRef     = useRef(null);
  const keysRef      = useRef({ left: false, right: false });

  const [phase, setPhase]       = useState("idle");
  const [score, setScore]       = useState(0);
  const [best, setBest]         = useState(() => parseInt(localStorage.getItem("cdash_best") || "0"));
  const [lastEarned, setLastE]  = useState(0);
  const [flashCol, setFlash]    = useState(null);

  // ── Init state ──────────────────────────────────────────────────────────────
  function initState() {
    return {
      px: W / 2,   // posición X del jugador
      py: GROUND_Y,
      rotStep: 0,  // 0,1,2
      objects: [],
      speed: OBJ_SPEED_INIT,
      spawnInterval: SPAWN_INTERVAL_INIT,
      score: 0,
      frame: 0,
      nextId: 0,
      // para animación de rotación suave
      rotAngle: 0,       // ángulo actual real (para dibujo suave)
      rotTarget: 0,      // ángulo destino
    };
  }

  // ── Spawn ───────────────────────────────────────────────────────────────────
  function scheduleSpawn(s) {
    clearTimeout(spawnRef.current);
    spawnRef.current = setTimeout(() => {
      const st = stateRef.current;
      if (!st) return;
      const colorIdx = Math.floor(Math.random() * 3);
      const x = OBJ_R + 10 + Math.random() * (W - OBJ_R * 2 - 20);
      st.objects.push({ x, y: -OBJ_R - 5, colorIdx, id: st.nextId++ });
      st.spawnInterval = Math.max(SPAWN_INTERVAL_MIN, st.spawnInterval * SPAWN_DEC);
      scheduleSpawn(st);
    }, s.spawnInterval);
  }





/*
  // ANTES:
function scheduleSpawn(s) {
  clearTimeout(spawnRef.current);
  spawnRef.current = setTimeout(() => {
    const st = stateRef.current;
    if (!st) return;
    const colorIdx = Math.floor(Math.random() * 3);
    const x = OBJ_R + 10 + Math.random() * (W - OBJ_R * 2 - 20);
    st.objects.push({ x, y: -OBJ_R - 5, colorIdx, id: st.nextId++ });
    st.spawnInterval = Math.max(SPAWN_INTERVAL_MIN, st.spawnInterval * SPAWN_DEC);
    scheduleSpawn(st);
  }, s.spawnInterval);
}*/

// DESPUÉS:
function scheduleSpawn(s) {
  clearTimeout(spawnRef.current);
  spawnRef.current = setTimeout(() => {
    const st = stateRef.current;
    if (!st) return;
    const onScreen = st.objects.filter(o => o.y < H + OBJ_R).length;
    if (onScreen < MAX_ON_SCREEN) {
      const colorIdx = Math.floor(Math.random() * 3);
      const x = OBJ_R + 10 + Math.random() * (W - OBJ_R * 2 - 20);
      st.objects.push({ x, y: -OBJ_R - 5, colorIdx, id: st.nextId++ });
      st.spawnInterval = Math.max(SPAWN_INTERVAL_MIN, st.spawnInterval * SPAWN_DEC);
      scheduleSpawn(st);
    } else {
      // Pantalla llena: reintenta en 300ms sin reducir el intervalo
      spawnRef.current = setTimeout(() => scheduleSpawn(st), 300);
    }
  }, s.spawnInterval);
}











  // ── Loop ────────────────────────────────────────────────────────────────────
  const loop = useCallback((ts) => {
    if (!lastTsRef.current) lastTsRef.current = ts;
    const dt = Math.min((ts - lastTsRef.current) / 16.67, 3);
    lastTsRef.current = ts;

    const s = stateRef.current;
    if (!s) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    s.frame++;
    s.speed = Math.min(OBJ_SPEED_MAX, s.speed + OBJ_SPEED_INC * dt);

    // Mover jugador
    const keys = keysRef.current;
    if (keys.left)  s.px = Math.max(TRI_R + 4, s.px - PLAYER_SPEED * dt);
    if (keys.right) s.px = Math.min(W - TRI_R - 4, s.px + PLAYER_SPEED * dt);

    // Animación rotación suave
    const rotDiff = s.rotTarget - s.rotAngle;
    if (Math.abs(rotDiff) > 0.5) s.rotAngle += rotDiff * 0.22 * dt;
    else s.rotAngle = s.rotTarget;

    // Mover objetos
    s.objects = s.objects.map(o => ({ ...o, y: o.y + s.speed * dt }));

    // Vértice activo = punta arriba (vértice 0 del triángulo)
    //const verts = triVertsAt(s.px, s.py, s.rotAngle);
    const verts = triVertsAt(s.px, s.py, 0);
    const [tipX, tipY] = verts[0]; // arriba siempre
    const activeColor = getVertexColors(s.rotStep)[0];

    let dead = false;
    let scored = 0;
    const surviving = [];

    for (const obj of s.objects) {
      if (obj.y > H + OBJ_R + 10) continue; // salió

      // ¿Toca cualquier parte del triángulo (body collision)?
      const distCenter = Math.hypot(obj.x - s.px, obj.y - s.py);
      if (distCenter < OBJ_R + TRI_R * 0.6) {
        // ¿Toca la punta activa específicamente?
        const distTip = Math.hypot(obj.x - tipX, obj.y - tipY);
        if (distTip < OBJ_R + 14) {
          if (obj.colorIdx === COLORS.indexOf(activeColor)) {
            scored++;
            s.score++;
            continue; // destruido correctamente
          } else {
            dead = true;
            break;
          }
        } else {
          // Chocó con el cuerpo pero no la punta → también muere
          dead = true;
          break;
        }
      }
      surviving.push(obj);
    }

    s.objects = surviving;

    if (dead) {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(spawnRef.current);
      const finalScore = s.score;
      const amt = finalScore * PAGO_POR_OBJ;
      if (finalScore > parseInt(localStorage.getItem("cdash_best") || "0")) {
        localStorage.setItem("cdash_best", String(finalScore));
        setBest(finalScore);
      }
      setScore(finalScore);
      setLastE(amt);
      if (amt > 0) setBalance(balance + amt);
      setPhase("dead");

      saveMinigameRecord("colordash", finalScore, amt);

      draw(ctx, s, true);
      return;
    }

    if (scored > 0) {
      setScore(s.score);
      setFlash(activeColor.hex);
      setTimeout(() => setFlash(null), 100);
    }

    draw(ctx, s, false);
    rafRef.current = requestAnimationFrame(loop);
  }, [balance, setBalance]);

  // ── Dibujo ──────────────────────────────────────────────────────────────────
  function triVertsAt(cx, cy, rotAngleDeg) {
    const base = [90, 210, 330];
    return base.map(a => {
      const rad = ((a + rotAngleDeg) * Math.PI) / 180;
      return [cx + TRI_R * Math.cos(rad), cy - TRI_R * Math.sin(rad)];
    });
  }

  function draw(ctx, s, dead) {
    // Fondo
    ctx.fillStyle = "#07070e";
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = "#12122a";
    ctx.lineWidth = 1;
    for (let y = 0; y < H; y += 50) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
    for (let x = 0; x < W; x += 50) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }

    // Objetos
    for (const obj of s.objects) {
      const col = COLORS[obj.colorIdx];
      // glow
      const grd = ctx.createRadialGradient(obj.x, obj.y, 0, obj.x, obj.y, OBJ_R + 14);
      grd.addColorStop(0, col.hex + "66");
      grd.addColorStop(1, "transparent");
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(obj.x, obj.y, OBJ_R + 14, 0, Math.PI*2); ctx.fill();
      // círculo
      ctx.fillStyle = col.hex;
      ctx.beginPath(); ctx.arc(obj.x, obj.y, OBJ_R, 0, Math.PI*2); ctx.fill();
      // brillo interior
      ctx.fillStyle = "#ffffff22";
      ctx.beginPath(); ctx.arc(obj.x - OBJ_R*0.25, obj.y - OBJ_R*0.25, OBJ_R*0.4, 0, Math.PI*2); ctx.fill();
    }

    // Triángulo
    //const verts = triVertsAt(s.px, s.py, s.rotAngle);
    const verts = triVertsAt(s.px, s.py, 0);
    const vcols = getVertexColors(s.rotStep);
    const cx = s.px, cy = s.py;

    // Dibujar 3 sectores coloreados
    for (let i = 0; i < 3; i++) {
      const v = verts[i];
      const col = vcols[i];

      // Sector: desde centro hasta el vértice i, mezclando con vértices adyacentes
      const prev = verts[(i + 2) % 3];
      const next = verts[(i + 1) % 3];

      // Punto medio de los lados adyacentes
      const mid1 = [(cx + prev[0] + v[0]) / 3, (cy + prev[1] + v[1]) / 3];
      const mid2 = [(cx + next[0] + v[0]) / 3, (cy + next[1] + v[1]) / 3];
      const mid3 = [(cx + v[0]) / 2, (cy + v[1]) / 2]; // mitad centro-vértice

      // Dibujamos un sector "punta" desde el vértice hacia el centro
      // Cada color domina su punta: dibujamos triángulo vértice + 2 puntos intermedios
      const p1x = (cx + v[0]) / 2 + (prev[0] - cx) * 0.18;
      const p1y = (cy + v[1]) / 2 + (prev[1] - cy) * 0.18;
      const p2x = (cx + v[0]) / 2 + (next[0] - cx) * 0.18;
      const p2y = (cy + v[1]) / 2 + (next[1] - cy) * 0.18;

      ctx.beginPath();
      ctx.moveTo(v[0], v[1]);
      ctx.lineTo(p1x, p1y);
      ctx.lineTo(cx, cy);
      ctx.lineTo(p2x, p2y);
      ctx.closePath();
      ctx.fillStyle = col.hex;
      ctx.fill();

      // Glow en la punta activa
      if (i === 0) {
        const grd = ctx.createRadialGradient(v[0], v[1], 0, v[0], v[1], 22);
        grd.addColorStop(0, col.hex + "cc");
        grd.addColorStop(1, "transparent");
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(v[0], v[1], 22, 0, Math.PI*2); ctx.fill();
      }
    }

    // Cara "ninja" del triángulo
    // Fondo blanco central
    ctx.fillStyle = "#f0f0f0";
    ctx.beginPath();
    ctx.arc(cx, cy, TRI_R * 0.38, 0, Math.PI * 2);
    ctx.fill();

    // Ojos
    ctx.fillStyle = "#1a1a1a";
    const eyeY = cy - 2;
    // ojo izq
    ctx.fillRect(cx - 13, eyeY - 5, 10, 8);
    // ojo der
    ctx.fillRect(cx + 3, eyeY - 5, 10, 8);
    // brillo ojos
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(cx - 11, eyeY - 3, 3, 3);
    ctx.fillRect(cx + 5, eyeY - 3, 3, 3);

    // Máscara ninja (franja negra bajo ojos)
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(cx - 14, eyeY + 4, 28, 6);

    // Contorno del triángulo
    ctx.beginPath();
    ctx.moveTo(verts[0][0], verts[0][1]);
    ctx.lineTo(verts[1][0], verts[1][1]);
    ctx.lineTo(verts[2][0], verts[2][1]);
    ctx.closePath();
    ctx.strokeStyle = dead ? "#ff444488" : "#ffffff44";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Score
    ctx.fillStyle = "#ffffff22";
    ctx.font = "bold 26px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillText(String(s.score).padStart(3, "0"), W/2, 38);
    ctx.textAlign = "left";

    // Indicador color activo: punto que flota ENCIMA de la punta activa,
    // desplazado en la dirección centro→vértice para que siempre quede "fuera" de la punta
    const activePt = verts[0];
    const dirX = activePt[0] - cx;
    const dirY = activePt[1] - cy;
    const dirLen = Math.hypot(dirX, dirY) || 1;
    const indX = activePt[0] + (dirX / dirLen) * 16;
    const indY = activePt[1] + (dirY / dirLen) * 16;
    // glow del indicador
    const indGrd = ctx.createRadialGradient(indX, indY, 0, indX, indY, 12);
    indGrd.addColorStop(0, vcols[0].hex + "cc");
    indGrd.addColorStop(1, "transparent");
    ctx.fillStyle = indGrd;
    ctx.beginPath(); ctx.arc(indX, indY, 12, 0, Math.PI * 2); ctx.fill();
    // punto sólido
    ctx.fillStyle = vcols[0].hex;
    ctx.beginPath();
    ctx.arc(indX, indY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff88";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // ── Controles teclado ────────────────────────────────────────────────────────
  const rotateUp = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    s.rotStep = (s.rotStep + 1) % 3;
  }, []);

  const rotateDown = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    s.rotStep = (s.rotStep + 2) % 3;
  }, []);

  useEffect(() => {
    const onDown = (e) => {
      if (phase !== "playing") return;
      if (e.code === "ArrowLeft"  || e.code === "KeyA") keysRef.current.left  = true;
      if (e.code === "ArrowRight" || e.code === "KeyD") keysRef.current.right = true;
      if (e.code === "ArrowUp"    || e.code === "KeyW") { e.preventDefault(); rotateUp(); }
      if (e.code === "ArrowDown"  || e.code === "KeyS") { e.preventDefault(); rotateDown(); }
    };
    const onUp = (e) => {
      if (e.code === "ArrowLeft"  || e.code === "KeyA") keysRef.current.left  = false;
      if (e.code === "ArrowRight" || e.code === "KeyD") keysRef.current.right = false;
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  }, [phase, rotateUp, rotateDown]);

  // ── Touch ────────────────────────────────────────────────────────────────────
  const touchRef = useRef({ x: null, y: null });
  function onTouchStart(e) {
    touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function onTouchEnd(e) {
    const { x, y } = touchRef.current;
    if (x === null) return;
    const dx = e.changedTouches[0].clientX - x;
    const dy = e.changedTouches[0].clientY - y;
    if (Math.abs(dy) > Math.abs(dx)) {
      if (dy < -15) rotateUp();
      else if (dy > 15) rotateDown();
    }
    touchRef.current = { x: null, y: null };
  }

  // Movimiento táctil continuo (joystick virtual)
  const holdRef = useRef(null);
  function onBtnDown(dir) {
    keysRef.current[dir] = true;
  }
  function onBtnUp(dir) {
    keysRef.current[dir] = false;
  }

  // ── Start ────────────────────────────────────────────────────────────────────
  function startGame() {
    cancelAnimationFrame(rafRef.current);
    clearTimeout(spawnRef.current);
    lastTsRef.current = null;
    keysRef.current = { left: false, right: false };
    const s = initState();
    stateRef.current = s;
    setScore(0);
    setLastE(0);
    setPhase("playing");
    scheduleSpawn(s);
    rafRef.current = requestAnimationFrame(loop);
  }

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    clearTimeout(spawnRef.current);
  }, []);

  // Pantalla idle
  useEffect(() => {
    if (phase !== "idle") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const s = initState();
    draw(ctx, s, false);
    ctx.fillStyle = "#e9e9e9";
    ctx.font = "bold 20px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillText("TAP PARA INICIAR", W/2, H/2 - 14);
    ctx.font = "20px 'Courier New', monospace";
    ctx.fillStyle = "#c6c6c6";
    ctx.fillText("← → mover   ↑ ↓ rotar color", W/2, H/2 + 12);
    ctx.textAlign = "left";
  }, [phase]);

  const maxW = Math.min(window.innerWidth - 32, W);
  const sc = maxW / W;

  return (
    <div style={{
      minHeight: "100vh", background: "#07070e",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "25px", fontFamily: "'Courier New', monospace", color: "#fff",
    }}>
      {/* Header */}
      <div style={{ width: maxW, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <button onClick={onBack} style={{
          background: "rgba(10,10,18,0.8)", border: "1px solid #2a2a3a",
          borderRadius: 8, color: "#aaa", fontSize: 16, padding: "6px 14px", cursor: "pointer",
        }}>← Volver</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 25, fontWeight: 900, color: "#fbbf24", letterSpacing: 2 }}>🔺 COLOR DASH</div>
          <div style={{ fontSize: 15, color: "#ffffff" }}>$5.000 por objeto superado</div>
        </div>
        <div style={{ background: "rgba(251,191,36,0.1)", border: "1px solid #fbbf2444", borderRadius: 10, padding: "6px 10px", textAlign: "right" }}>
          <div style={{ fontSize: 15, color: "#ffffff" }}>BALANCE</div>
          <div style={{ fontSize: 15, color: "#fbbf24", fontWeight: 700 }}>${balance.toLocaleString()}</div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ width: maxW, display: "flex", gap: 8, marginBottom: 8 }}>
        {[
          { l: "SCORE", v: String(score).padStart(3,"0"), c: "#8b5cf6" },
          { l: "GANADO", v: `$${(score*PAGO_POR_OBJ).toLocaleString()}`, c: "#00d4aa" },
          { l: "MEJOR", v: String(best).padStart(3,"0"), c: "#fbbf24" },
        ].map(s => (
          <div key={s.l} style={{ flex:1, background:"rgba(13,13,20,0.9)", border:`1px solid ${s.c}33`, borderRadius:8, padding:"6px", textAlign:"center" }}>
            <div style={{ fontSize:15, color:"#dfdfdf", letterSpacing:1 }}>{s.l}</div>
            <div style={{ fontSize:20, fontWeight:900, color:s.c }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Canvas */}
      <div style={{
        position: "relative", width: maxW, height: H * sc,
        borderRadius: 14, overflow: "hidden",
        border: "2px solid #1e1e2e",
        boxShadow: flashCol ? `0 0 40px ${flashCol}88` : "0 0 20px rgba(139,92,246,0.2)",
        transition: "box-shadow 0.1s",
      }}
        onClick={() => { if (phase === "idle" || phase === "dead") startGame(); }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <canvas ref={canvasRef} width={W} height={H}
          style={{ display:"block", width:maxW, height:H*sc, imageRendering:"pixelated" }} />

        {phase === "dead" && (
          <div style={{
            position:"absolute", inset:0, background:"rgba(0,0,0,0.85)",
            display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10,
          }}>
            <div style={{ fontSize:26, fontWeight:900, color:"#ff4444" }}>GAME OVER</div>
            <div style={{ fontSize:16, color:"#aaa" }}>Superaste <strong style={{color:"#fff"}}>{score}</strong> objetos</div>
            {lastEarned > 0 && (
              <div style={{ background:"rgba(0,212,170,0.12)", border:"1px solid #00d4aa44", borderRadius:10, padding:"8px 18px", fontSize:18, color:"#00d4aa", fontWeight:700 }}>
                💰 +${lastEarned.toLocaleString()}
              </div>
            )}
            <button onClick={(e)=>{e.stopPropagation();startGame();}} style={{
              marginTop:6, background:"#fbbf24", border:"none", borderRadius:8,
              padding:"10px 24px", fontSize:20, fontWeight:800, color:"#000", cursor:"pointer",
            }}>▶ REINTENTAR</button>
          </div>
        )}
      </div>

      {/* Controles táctiles */}
      <div style={{ display:"flex", gap:10, marginTop:12, width:maxW }}>
        {/* Mover izq */}
        <button
          onTouchStart={(e)=>{e.preventDefault(); if(phase==="playing") onBtnDown("left"); else startGame();}}
          onTouchEnd={(e)=>{e.preventDefault(); onBtnUp("left");}}
          onMouseDown={()=>{ if(phase==="playing") onBtnDown("left"); else startGame(); }}
          onMouseUp={()=>onBtnUp("left")}
          style={{ flex:2, background:"rgba(96,165,250,0.1)", border:"2px solid #60a5fa44", borderRadius:12, padding:"14px", fontSize:25, color:"#60a5fa", fontWeight:900, cursor:"pointer" }}
        >◀</button>
        {/* Rotar */}
        <div style={{ flex:1.5, display:"flex", flexDirection:"column", gap:6 }}>
          <button
            onTouchStart={(e)=>{e.preventDefault(); if(phase==="playing") rotateUp(); else startGame();}}
            onClick={()=>{ if(phase==="playing") rotateUp(); else startGame(); }}
            style={{ flex:1, background:"rgba(74,222,128,0.1)", border:"2px solid #4ade8044", borderRadius:8, padding:"8px", fontSize:20, color:"#4ade80", fontWeight:700, cursor:"pointer" }}
          >↑ ROTAR</button>
          <button
            onTouchStart={(e)=>{e.preventDefault(); if(phase==="playing") rotateDown(); else startGame();}}
            onClick={()=>{ if(phase==="playing") rotateDown(); else startGame(); }}
            style={{ flex:1, background:"rgba(248,113,113,0.1)", border:"2px solid #f8717144", borderRadius:8, padding:"8px", fontSize:20, color:"#f87171", fontWeight:700, cursor:"pointer" }}
          >↓ ROTAR</button>
        </div>
        {/* Mover der */}
        <button
          onTouchStart={(e)=>{e.preventDefault(); if(phase==="playing") onBtnDown("right"); else startGame();}}
          onTouchEnd={(e)=>{e.preventDefault(); onBtnUp("right");}}
          onMouseDown={()=>{ if(phase==="playing") onBtnDown("right"); else startGame(); }}
          onMouseUp={()=>onBtnUp("right")}
          style={{ flex:2, background:"rgba(248,113,113,0.1)", border:"2px solid #f8717144", borderRadius:12, padding:"14px", fontSize:25, color:"#f87171", fontWeight:900, cursor:"pointer" }}
        >▶</button>
      </div>

      {/* Leyenda */}
      <div style={{ width:maxW, marginTop:12, background:"rgba(13,13,20,0.8)", border:"1px solid #1e1e2e", borderRadius:12, padding:"12px 14px" }}>
        <div style={{ display:"flex", gap:8, marginBottom:8 }}>
          {COLORS.map(c => (
            <div key={c.id} style={{ flex:1, background:c.hex+"18", border:`1px solid ${c.hex}44`, borderRadius:8, padding:"6px", textAlign:"center" }}>
              <div style={{ width:14, height:14, borderRadius:"50%", background:c.hex, margin:"0 auto 3px" }} />
              <div style={{ fontSize:15, color:c.hex, fontWeight:700 }}>{c.label}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize:15, color:"#ffffff", textAlign:"center", lineHeight:1.7 }}>
          <strong style={{color:"#ffffff"}}>← →</strong> mover · <strong style={{color:"#aaa"}}>↑ ↓ / W S</strong> rotar color activo (punta arriba)<br/>
          Impacta el objeto con la punta del mismo color. Cuerpo o color incorrecto → mueres.
        </div>
      </div>
    </div>
  );
}
