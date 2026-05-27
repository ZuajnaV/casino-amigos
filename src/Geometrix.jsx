import { useState, useRef, useEffect, useCallback } from "react";
import { saveMinigameRecord } from "./minigameRecords";

// ── DIMENSIONES ───────────────────────────────────────────────────────────────
// Para cambiar el tamaño del canvas modifica PLAY_W y PLAY_H
const RULER_W  = 48;    // ancho regla vertical izq
const RULER_H  = 50;    // alto regla horizontal abajo
const PLAY_W   = 660;   // ← ANCHO del área de juego (aumentar/bajar aquí)
const PLAY_H   = 480;   // ← ALTO del área de juego  (aumentar/bajar aquí)
const CANVAS_W = RULER_W + PLAY_W;
const CANVAS_H = PLAY_H + RULER_H;

// ── TIEMPO POR NIVEL ──────────────────────────────────────────────────────────
function getTimeLimit(lvl) {
  if (lvl <= 1) return 25;      //30
  if (lvl <= 2) return 30;      //45
  if (lvl <= 3) return 30;      //60
  if (lvl <= 4) return 25;      //30
  if (lvl <= 5) return 35;      //45
  if (lvl <= 6) return 25;      //30
  if (lvl <= 7) return 60;     //180
  if (lvl <= 8) return 120;     //180
  if (lvl <= 9) return 20;     //300
  return 180;       //600
}

// ── NIVELES ───────────────────────────────────────────────────────────────────
const LEVELS = [
  { lvl:1,  shape:"line",     goal:"longitud",   prize:5000,   threshold:0.08, color:"#00d4aa", label:"Línea",            unit:"px"  },
  { lvl:2,  shape:"rect",     goal:"área",        prize:10000,  threshold:0.08, color:"#3b82f6", label:"Rectángulo",       unit:"px²" },
  { lvl:3,  shape:"triangle", goal:"área",        prize:20000,  threshold:0.1, color:"#f59e0b", label:"Triángulo",        unit:"px²" },
  { lvl:4,  shape:"circle",   goal:"radio",       prize:30000,  threshold:0.08, color:"#ec4899", label:"Círculo",          unit:"px"  },
  { lvl:5,  shape:"rect",     goal:"perímetro",   prize:50000,  threshold:0.08, color:"#8b5cf6", label:"Rectángulo",       unit:"px"  },
  { lvl:6,  shape:"circle",   goal:"área",        prize:70000,  threshold:0.05, color:"#06b6d4", label:"Círculo",          unit:"px²" },
  { lvl:7,  shape:"triangle", goal:"perímetro",   prize:120000, threshold:0.05, color:"#84cc16", label:"Triángulo",        unit:"px"  },
  { lvl:8,  shape:"polygon",  goal:"área",        prize:280000, threshold:0.15, color:"#f97316", label:"Polígono",         unit:"px²" },
  { lvl:9,  shape:"ellipse",  goal:"radio mayor", prize:300000, threshold:0.05, color:"#e879f9", label:"Elipse",           unit:"px"  },
  { lvl:10, shape:"compound", goal:"área total",  prize:500000, threshold:0.1, color:"#fbbf24", label:"Figura Compuesta", unit:"px²" },
];

// ── GENERADOR DE FIGURAS ──────────────────────────────────────────────────────
function generateShape(levelDef) {
  const mg = 65;
  const mxW = PLAY_W - mg * 2;
  const mxH = PLAY_H - mg * 2;

  switch (levelDef.shape) {
    case "line": {
      const len = 80 + Math.random() * (mxW - 100);
      const x1  = mg + Math.random() * (mxW - len);
      const y   = mg + Math.random() * mxH;
      return { type:"line", x1, y1:y, x2:x1+len, y2:y, realValue:Math.round(len) };
    }
    case "rect": {
      const w = 80 + Math.random() * 240;
      const h = 60 + Math.random() * 180;
      const x = mg + Math.random() * (mxW - w);
      const y = mg + Math.random() * (mxH - h);
      const area = Math.round(w * h);
      const perimeter = Math.round(2*(w+h));
      return { type:"rect", x, y, w, h, realValue: levelDef.goal==="área" ? area : perimeter, area, perimeter };
    }
    case "triangle": {
      const bw = 100 + Math.random() * 220;
      const bh = 80  + Math.random() * 180;
      const bx = mg  + Math.random() * (mxW - bw);
      const by = mg  + Math.random() * (mxH - bh);
      const p1 = [bx,        by+bh];
      const p2 = [bx+bw,     by+bh];
      const p3 = [bx+bw/2+(Math.random()-.5)*bw*.35, by];
      const area = Math.round(.5*Math.abs((p2[0]-p1[0])*(p3[1]-p1[1])-(p3[0]-p1[0])*(p2[1]-p1[1])));
      const s1 = Math.hypot(p2[0]-p1[0], p2[1]-p1[1]);
      const s2 = Math.hypot(p3[0]-p2[0], p3[1]-p2[1]);
      const s3 = Math.hypot(p1[0]-p3[0], p1[1]-p3[1]);
      const perimeter = Math.round(s1+s2+s3);
      return { type:"triangle", p1, p2, p3, realValue: levelDef.goal==="área" ? area : perimeter, area, perimeter };
    }
    case "circle": {
      const r  = 40 + Math.random() * 110;
      const cx = mg + r + Math.random() * (mxW - r*2);
      const cy = mg + r + Math.random() * (mxH - r*2);
      const area = Math.round(Math.PI * r * r);
      return { type:"circle", cx, cy, r:Math.round(r), realValue: levelDef.goal==="radio" ? Math.round(r) : area, area };
    }
    case "polygon": {
      const r    = 50 + Math.random() * 90;
      const cx   = mg + r + Math.random() * (mxW - r*2);
      const cy   = mg + r + Math.random() * (mxH - r*2);
      const sides = 5 + Math.floor(Math.random()*3);
      const pts  = Array.from({length:sides},(_,i)=>{
        const a = (i*2*Math.PI/sides)-Math.PI/2;
        return [cx+r*Math.cos(a), cy+r*Math.sin(a)];
      });
      const area = Math.round(.5*Math.abs(pts.reduce((acc,p,i)=>{
        const nx = pts[(i+1)%sides];
        return acc+p[0]*nx[1]-nx[0]*p[1];
      },0)));
      return { type:"polygon", pts, sides, r:Math.round(r), realValue:area };
    }
    case "ellipse": {
      const rx = 70 + Math.random() * 130;
      const ry = 35 + Math.random() *  90;
      const cx = mg + rx + Math.random() * (mxW - rx*2);
      const cy = mg + ry + Math.random() * (mxH - ry*2);
      return { type:"ellipse", cx, cy, rx:Math.round(rx), ry:Math.round(ry), realValue:Math.round(rx) };
    }
    case "compound": {
      const w = 100 + Math.random() * 180;
      const h = 70  + Math.random() * 110;
      const r = w/2;
      const x = mg  + Math.random() * (mxW - w);
      const y = mg  + r + Math.random() * (mxH - h - r);
      const rectA = Math.round(w*h);
      const semiA = Math.round(Math.PI*r*r/2);
      return { type:"compound", x, y, w, h, r, realValue:rectA+semiA, rectArea:rectA, semiArea:semiA };
    }
    default: return generateShape({...levelDef, shape:"line"});
  }
}

// ── DIBUJADOR DE FIGURA ───────────────────────────────────────────────────────
function drawShape(ctx, shape, color, highlight) {
  ctx.save();
  ctx.translate(RULER_W, 0);
  ctx.strokeStyle = color;
  ctx.fillStyle   = color + (highlight ? "44" : "22");
  ctx.lineWidth   = highlight ? 3.5 : 2.5;

  switch (shape.type) {
    case "line":
      ctx.beginPath(); ctx.moveTo(shape.x1, shape.y1); ctx.lineTo(shape.x2, shape.y2); ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(shape.x1, shape.y1, 5, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(shape.x2, shape.y2, 5, 0, Math.PI*2); ctx.fill();
      break;
    case "rect":
      ctx.beginPath(); ctx.rect(shape.x, shape.y, shape.w, shape.h); ctx.fill(); ctx.stroke(); break;
    case "triangle":
      ctx.beginPath();
      ctx.moveTo(shape.p1[0], shape.p1[1]);
      ctx.lineTo(shape.p2[0], shape.p2[1]);
      ctx.lineTo(shape.p3[0], shape.p3[1]);
      ctx.closePath(); ctx.fill(); ctx.stroke(); break;
    case "circle":
      ctx.beginPath(); ctx.arc(shape.cx, shape.cy, shape.r, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.setLineDash([5,5]); ctx.strokeStyle=color+"88";
      ctx.beginPath(); ctx.moveTo(shape.cx,shape.cy); ctx.lineTo(shape.cx+shape.r,shape.cy); ctx.stroke();
      ctx.setLineDash([]); break;
    case "polygon":
      ctx.beginPath(); ctx.moveTo(shape.pts[0][0],shape.pts[0][1]);
      shape.pts.slice(1).forEach(p=>ctx.lineTo(p[0],p[1]));
      ctx.closePath(); ctx.fill(); ctx.stroke(); break;
    case "ellipse":
      ctx.beginPath(); ctx.ellipse(shape.cx,shape.cy,shape.rx,shape.ry,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.setLineDash([5,5]); ctx.strokeStyle=color+"88";
      ctx.beginPath(); ctx.moveTo(shape.cx,shape.cy); ctx.lineTo(shape.cx+shape.rx,shape.cy); ctx.stroke();
      ctx.setLineDash([]); break;
    case "compound":
      ctx.beginPath(); ctx.rect(shape.x,shape.y,shape.w,shape.h); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(shape.x+shape.w/2,shape.y,shape.r,Math.PI,0); ctx.fill(); ctx.stroke(); break;
  }
  ctx.restore();
}

// ── REGLAS + CROSSHAIR ────────────────────────────────────────────────────────
function drawRulers(ctx, mx, my) {
  const BG = "#131325";
  const MAJ = "#6366f1";
  const MED = "#333355";
  const MIN = "#1e1e30";

  // Regla horizontal (eje X) — franja inferior
  ctx.fillStyle = BG;
  ctx.fillRect(RULER_W, PLAY_H, PLAY_W, RULER_H);
  ctx.strokeStyle = "#2a2a3a"; ctx.lineWidth = 1;
  ctx.strokeRect(RULER_W, PLAY_H, PLAY_W, RULER_H);

  for (let px = 0; px <= PLAY_W; px += 5) {
    const maj = px % 50 === 0;
    const med = px % 10 === 0;
    const th  = maj ? 20 : med ? 11 : 5;
    ctx.strokeStyle = maj ? MAJ : med ? MED : MIN;
    ctx.lineWidth   = maj ? 1.5 : 1;
    ctx.beginPath(); ctx.moveTo(RULER_W+px, PLAY_H); ctx.lineTo(RULER_W+px, PLAY_H+th); ctx.stroke();
    if (maj && px > 0 && px < PLAY_W) {
      ctx.fillStyle = "#6366f188"; ctx.font = "20px 'Courier New', monospace"; ctx.textAlign = "center";
      ctx.fillText(px, RULER_W+px, PLAY_H+RULER_H-5);
    }
  }
  ctx.fillStyle = "#ffffff22"; ctx.font = "20px 'Courier New', monospace"; ctx.textAlign = "left";
  ctx.fillText("X", RULER_W+4, PLAY_H+RULER_H-5);

  // Regla vertical (eje Y) — franja izquierda
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, RULER_W, PLAY_H);
  ctx.strokeStyle = "#2a2a3a"; ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, RULER_W, PLAY_H);

  for (let py = 0; py <= PLAY_H; py += 5) {
    const maj = py % 50 === 0;
    const med = py % 10 === 0;
    const tw  = maj ? 20 : med ? 11 : 5;
    ctx.strokeStyle = maj ? MAJ : med ? MED : MIN;
    ctx.lineWidth   = maj ? 1.5 : 1;
    ctx.beginPath(); ctx.moveTo(RULER_W, py); ctx.lineTo(RULER_W-tw, py); ctx.stroke();
    if (maj && py > 0 && py < PLAY_H) {
      ctx.save();
      ctx.translate(RULER_W-22, py);
      ctx.rotate(-Math.PI/2);
      ctx.fillStyle = "#6366f188"; ctx.font = "20px 'Courier New', monospace"; ctx.textAlign = "center";
      ctx.fillText(py, 0, 0);
      ctx.restore();
    }
  }
  ctx.save();
  ctx.translate(10, PLAY_H/2); ctx.rotate(-Math.PI/2);
  ctx.fillStyle = "#ffffff22"; ctx.font = "20px 'Courier New', monospace"; ctx.textAlign = "center";
  ctx.fillText("Y", 0, 0);
  ctx.restore();

  // Esquina origen
  ctx.fillStyle = BG;
  ctx.fillRect(0, PLAY_H, RULER_W, RULER_H);
  ctx.strokeStyle = "#2a2a3a"; ctx.lineWidth = 1;
  ctx.strokeRect(0, PLAY_H, RULER_W, RULER_H);
  ctx.fillStyle = "#6366f166"; ctx.font = "bold 30px 'Courier New', monospace"; ctx.textAlign = "center";
  ctx.fillText("0", RULER_W/2, PLAY_H+RULER_H/2+4);

  // Crosshair
  if (mx !== null && my !== null && mx >= RULER_W && mx <= CANVAS_W && my >= 0 && my <= PLAY_H) {
    const px = mx - RULER_W;
    const py = my;

    ctx.strokeStyle = "#fbbf2455"; ctx.lineWidth = 1; ctx.setLineDash([5,4]);
    ctx.beginPath(); ctx.moveTo(RULER_W, py); ctx.lineTo(CANVAS_W, py); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mx, 0); ctx.lineTo(mx, PLAY_H); ctx.stroke();
    ctx.setLineDash([]);

    // marcas en reglas
    ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(mx, PLAY_H); ctx.lineTo(mx, PLAY_H+24); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(RULER_W, py); ctx.lineTo(0, py); ctx.stroke();

    // etiquetas
    const ex = Math.min(mx+4, CANVAS_W-46);
    ctx.fillStyle = "#fbbf24"; ctx.font = "bold 20px 'Courier New', monospace"; ctx.textAlign = "left";
    ctx.fillText(`${Math.round(px)}`, ex, PLAY_H+RULER_H-6);

    const ey = Math.max(py-4, 12);
    ctx.fillStyle = "#fbbf24"; ctx.font = "bold 20px 'Courier New', monospace"; ctx.textAlign = "right";
    ctx.fillText(`${Math.round(py)}`, RULER_W-3, ey);

    // tooltip
    /*
    const tx = mx+10 > CANVAS_W-88 ? mx-94 : mx+10;
    const ty = my-28 < 4 ? my+16 : my-26;
    ctx.fillStyle = "rgba(251,191,36,0.93)";
    ctx.beginPath(); ctx.roundRect(tx, ty, 155, 22, 4); ctx.fill();
    ctx.fillStyle = "#000"; ctx.font = "bold 20px 'Courier New', monospace"; ctx.textAlign = "left";
    ctx.fillText(`x:${Math.round(px)}  y:${Math.round(py)}`, tx+5, ty+13);*/
    // 1. Define el texto primero
const text = `x:${Math.round(px)} y:${Math.round(py)}`;

// 2. Configura la fuente antes de medir
ctx.font = "bold 20px 'Courier New', monospace"; 
const textWidth = ctx.measureText(text).width; // Mide exactamente cuánto mide tu texto

// 3. Define un padding (margen interno)
const padding = 10;
const boxWidth = textWidth + padding;
const boxHeight = 26; // Un poco más alto que la fuente de 20px

// 4. Dibuja el recuadro basado en el ancho calculado
const tx = mx + 10 > CANVAS_W - (boxWidth + 5) ? mx - (boxWidth + 5) : mx + 10;
const ty = my - 30 < 4 ? my + 16 : my - 30;

ctx.fillStyle = "rgba(251,191,36,0.93)";
ctx.beginPath(); 
ctx.roundRect(tx, ty, boxWidth, boxHeight, 4); 
ctx.fill();

// 5. Dibuja el texto centrado verticalmente en el nuevo boxHeight
ctx.fillStyle = "#000";
ctx.textAlign = "left";
ctx.fillText(text, tx + (padding / 2), ty + 18);
  }
}

// ── COMPONENTE ────────────────────────────────────────────────────────────────
export default function Geometrix({ balance, setBalance, onBack }) {
  const canvasRef     = useRef(null);
  const timerRef      = useRef(null);
  const particleRef   = useRef([]);
  const rafRef        = useRef(null);

  const [currentLvl,  setCurrentLvl]  = useState(0);
  const [shape,       setShape]       = useState(null);
  const [phase,       setPhase]       = useState("playing"); // playing|correct|wrong|timeout|complete
  const [inputVal,    setInputVal]    = useState("");
  const [feedback,    setFeedback]    = useState(null);
  const [totalEarned, setTotalEarned] = useState(0);
  const [mouse,       setMouse]       = useState({ x:null, y:null });
  const [attempts,    setAttempts]    = useState(0);
  const [particles,   setParticles]   = useState([]);
  const [timeLeft,    setTimeLeft]    = useState(30);   // segundos restantes
  const [timeLimit,   setTimeLimit]   = useState(30);   // límite del nivel

  const levelDef = LEVELS[currentLvl];

  // Iniciar nivel
  useEffect(() => {
    const limit = getTimeLimit(levelDef.lvl);
    setShape(generateShape(levelDef));
    setInputVal(""); setFeedback(null); setPhase("playing");
    setAttempts(0); setTimeLeft(limit); setTimeLimit(limit);
    particleRef.current = [];
  }, [currentLvl]);

  // Timer
  useEffect(() => {
    if (phase !== "playing") { clearInterval(timerRef.current); return; }
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          setPhase("timeout");
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase, currentLvl]);

  // ── Partículas ──────────────────────────────────────────────────────────────
  function spawnParticles(cx, cy, color) {
    particleRef.current = Array.from({length:32},(_,i)=>({
      id:i, x:cx+RULER_W, y:cy,
      vx:(Math.random()-.5)*10, vy:(Math.random()-.5)*10-2,
      life:1, color, r:2+Math.random()*5,
    }));
    setParticles([...particleRef.current]);
  }
  function animateParticles() {
    particleRef.current = particleRef.current
      .map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,vy:p.vy+0.18,life:p.life-0.02}))
      .filter(p=>p.life>0);
    setParticles([...particleRef.current]);
    if (particleRef.current.length>0) rafRef.current=requestAnimationFrame(animateParticles);
  }

  // ── Dibujar canvas ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !shape) return;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#07070e";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Grid
    ctx.strokeStyle = "#0d0d1e"; ctx.lineWidth = 1;
    for (let x=0; x<PLAY_W; x+=20) {
      ctx.beginPath(); ctx.moveTo(RULER_W+x,0); ctx.lineTo(RULER_W+x,PLAY_H); ctx.stroke();
    }
    for (let y=0; y<PLAY_H; y+=20) {
      ctx.beginPath(); ctx.moveTo(RULER_W,y); ctx.lineTo(CANVAS_W,y); ctx.stroke();
    }

    drawShape(ctx, shape, levelDef.color, phase==="correct");

    for (const p of particleRef.current) {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    drawRulers(ctx, mouse.x, mouse.y);

    // Overlay correcto
    if (phase==="correct" && feedback) {
      ctx.fillStyle = "rgba(0,212,170,0.10)";
      ctx.fillRect(RULER_W,0,PLAY_W,PLAY_H);
      ctx.fillStyle = "#00d4aa"; ctx.font = "bold 22px 'Courier New', monospace"; ctx.textAlign = "center";
      ctx.fillText("✓ CORRECTO", RULER_W+PLAY_W/2, PLAY_H/2-12);
      ctx.font = "20px 'Courier New', monospace"; ctx.fillStyle = "#ffffff88";
      ctx.fillText(`Valor real: ${feedback.real} ${levelDef.unit}`, RULER_W+PLAY_W/2, PLAY_H/2+16);
      ctx.textAlign = "left";
    }
    // Overlay timeout/wrong
    if (phase==="timeout" || phase==="wrong") {
      ctx.fillStyle = "rgba(255,68,68,0.08)";
      ctx.fillRect(RULER_W,0,PLAY_W,PLAY_H);
      if (phase==="timeout") {
        ctx.fillStyle = "#ff4444"; ctx.font = "bold 22px 'Courier New', monospace"; ctx.textAlign = "center";
        ctx.fillText("⏱ TIEMPO AGOTADO", RULER_W+PLAY_W/2, PLAY_H/2-12);
        ctx.font = "20px 'Courier New', monospace"; ctx.fillStyle = "#ffffff66";
        ctx.fillText(`La respuesta era: ${shape.realValue} ${levelDef.unit}`, RULER_W+PLAY_W/2, PLAY_H/2+16);
        ctx.textAlign = "left";
      }
    }
  }, [shape, phase, feedback, mouse, levelDef, particles]);

  // Mouse
  function handleMouseMove(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    setMouse({
      x: (e.clientX-rect.left) * (CANVAS_W/rect.width),
      y: (e.clientY-rect.top)  * (CANVAS_H/rect.height),
    });
  }
  function handleMouseLeave() { setMouse({x:null,y:null}); }

  // ── Verificar respuesta ─────────────────────────────────────────────────────
  function checkAnswer() {
    const given = parseFloat(inputVal);
    if (isNaN(given)) return;
    const real      = shape.realValue;
    const error     = Math.abs(given - real);
    const threshold = real * levelDef.threshold;
    const correct   = error <= threshold;

    setFeedback({ correct, error:Math.round(error), real, given, prize:levelDef.prize });

    if (correct) {
      clearInterval(timerRef.current);
      setPhase("correct");
      setTotalEarned(e => e+levelDef.prize);
      setBalance(balance + levelDef.prize);

      saveMinigameRecord("geometrix", currentLvl + 1, totalEarned + levelDef.prize);

      let cx=PLAY_W/2, cy=PLAY_H/2;
      if (shape.cx!==undefined) { cx=shape.cx; cy=shape.cy; }
      else if (shape.x!==undefined) { cx=shape.x+(shape.w||0)/2; cy=shape.y+(shape.h||0)/2; }
      else if (shape.x1!==undefined) { cx=(shape.x1+shape.x2)/2; cy=shape.y1; }
      spawnParticles(cx, cy, levelDef.color);
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(animateParticles);
    } else {
      setAttempts(a=>a+1);
      setPhase("wrong");
    }
  }

  function nextLevel() {
    if (currentLvl >= LEVELS.length-1) setPhase("complete");
    else setCurrentLvl(l=>l+1);
  }

  // Reset al nivel 1 (fallo = timeout o wrong)
  function resetToStart() {
    setCurrentLvl(0);
    setTotalEarned(0);
  }

  useEffect(()=>()=>{ cancelAnimationFrame(rafRef.current); clearInterval(timerRef.current); },[]);

  // Numpad
  const NUMPAD = [["7","8","9"],["4","5","6"],["1","2","3"],[".",  "0","⌫"]];
  function numpadPress(k) {
    if (k==="⌫") setInputVal(v=>v.slice(0,-1));
    else if (k==="."&&inputVal.includes(".")) return;
    else setInputVal(v=>(v+k).slice(0,10));
  }

  // Barra de tiempo: color según urgencia
  const timePct = timeLimit > 0 ? (timeLeft / timeLimit) * 100 : 0;
  const timerColor = timePct > 50 ? "#00d4aa" : timePct > 25 ? "#fbbf24" : "#ff4444";

  // ── PANTALLA COMPLETA ───────────────────────────────────────────────────────
  if (phase === "complete") return (
    <div style={S.wrap}>
      <div style={{ maxWidth:440, margin:"0 auto", textAlign:"center", paddingTop:60 }}>
        <div style={{ fontSize:60, marginBottom:14 }}>🏆</div>
        <div style={{ fontSize:45, fontWeight:900, color:"#fbbf24", marginBottom:8 }}>¡COMPLETADO!</div>
        <div style={{ fontSize:30, color:"#777", marginBottom:24 }}>Superaste los 10 niveles de Geometrix</div>
        <div style={{ background:"rgba(0,212,170,0.1)", border:"1px solid #00d4aa44", borderRadius:14, padding:20, marginBottom:24 }}>
          <div style={{ fontSize:20, color:"#555", marginBottom:4 }}>TOTAL GANADO</div>
          <div style={{ fontSize:36, fontWeight:900, color:"#00d4aa" }}>${totalEarned.toLocaleString()}</div>
        </div>
        <button onClick={onBack} style={S.btnPrimary}>← Volver al espacio</button>
      </div>
    </div>
  );

  const isAnswered = phase==="correct" || phase==="wrong" || phase==="timeout";

  return (
    <div style={S.wrap}>
      {/* ── Contenedor principal: full width ── */}
      <div style={{ width:"100%", maxWidth:1100, margin:"0 auto" }}>

        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
          <button onClick={onBack} style={S.backBtn}>← Volver</button>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:25, fontWeight:900, color:"#fbbf24", letterSpacing:2 }}>📐 GEOMETRIX</div>
            <div style={{ fontSize:15, color:"#ffffff" }}>Mide y gana fichas reales</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:15, color:"#ffffff" }}>BALANCE</div>
            <div style={{ fontSize:15, color:"#fbbf24", fontWeight:700 }}>${balance.toLocaleString()}</div>
          </div>
        </div>

        {/* Barra progreso niveles */}
        <div style={{ display:"flex", gap:3, marginBottom:8 }}>
          {LEVELS.map((l,i)=>(
            <div key={i} style={{
              flex:1, height:6, borderRadius:3,
              background: i<currentLvl ? "#00d4aa" : i===currentLvl ? levelDef.color : "#1e1e2e",
              transition:"background 0.3s",
            }} />
          ))}
        </div>

        {/* Info nivel + BARRA DE TIEMPO */}
        <div style={{
          display:"flex", alignItems:"center", gap:12,
          background:"rgba(13,13,20,0.9)", border:`1px solid ${levelDef.color}33`,
          borderRadius:8, padding:"8px 14px", marginBottom:10,
        }}>
          {/* Info */}
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15, color:"#ffffff", letterSpacing:1 }}>NIVEL {levelDef.lvl}/10</div>
            <div style={{ fontSize:20, fontWeight:800, color:levelDef.color }}>{levelDef.label}</div>
            <div style={{ fontSize:20, color:"#888" }}>
              Mide: <strong style={{color:"#fff"}}>{levelDef.goal}</strong>
              <span style={{ marginLeft:14, color:"#ffffff" }}>±{(levelDef.threshold*100).toFixed(0)}%</span>
            </div>
          </div>

          {/* Temporizador */}
          <div style={{ flex:2 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
              <span style={{ fontSize:20, color:"#e3e3e3" }}>TIEMPO</span>
              <span style={{ fontSize:20, fontWeight:900, color:timerColor,
                fontFamily:"'Courier New',monospace",
                animation: timeLeft<=5 && phase==="playing" ? "pulse 0.5s infinite" : "none",
              }}>
                {timeLeft}s
              </span>
            </div>
            <div style={{
              height:10, borderRadius:5,
              background:"#1e1e2e",
              overflow:"hidden",
              border:`1px solid ${timerColor}33`,
            }}>
              <div style={{
                height:"100%", borderRadius:5,
                width:`${timePct}%`,
                background: `linear-gradient(90deg, ${timerColor}88, ${timerColor})`,
                transition:"width 1s linear, background 0.5s",
                boxShadow: timeLeft<=5 ? `0 0 8px ${timerColor}` : "none",
              }} />
            </div>
          </div>

          {/* Premio */}
          <div style={{ textAlign:"right", flexShrink:0 }}>
            <div style={{ fontSize:15, color:"#ffffff" }}>PREMIO</div>
            <div style={{ fontSize:20, fontWeight:900, color:"#00d4aa" }}>${levelDef.prize.toLocaleString()}</div>
          </div>
        </div>

        {/* ── Layout principal: canvas izq + panel der ── */}
        <div style={{ display:"flex", gap:14, alignItems:"flex-start" }}>

          {/* ── LADO IZQUIERDO: Canvas ── */}
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{
              border:`2px solid ${levelDef.color}44`,
              borderRadius:10, overflow:"hidden",
              boxShadow:`0 0 30px ${levelDef.color}18`,
              cursor:"crosshair",
            }}>
              <canvas
                ref={canvasRef}
                width={CANVAS_W} height={CANVAS_H}
                style={{ display:"block", width:"100%", imageRendering:"pixelated" }}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
              />
            </div>
            <div style={{ marginTop:6, fontSize:20, color:"#ffffff", textAlign:"center" }}>
              🖱️ Mueve el cursor sobre la figura · regla izq = Y · regla abajo = X
            </div>
          </div>

          {/* ── LADO DERECHO: Panel de respuesta ── */}
          <div style={{ width:220, flexShrink:0 }}>

            {/* Pista */}
            <div style={{
              background:"rgba(13,13,20,0.9)", border:`1px solid ${levelDef.color}22`,
              borderRadius:10, padding:"10px 12px", marginBottom:10,
            }}>
              <div style={{ fontSize:20, color:"#ffffff", letterSpacing:1, marginBottom:6, textTransform:"uppercase" }}>Pista</div>
              <div style={{ fontSize:16, color:"#888", lineHeight:1.6 }}>
                {levelDef.goal==="área"       && "Área = base × altura (rect)\n½|base×altura| (tri)\n\n PI*r² (cir)"}
                {levelDef.goal==="perímetro"  && "Perímetro = suma de todos los lados"}
                {levelDef.goal==="radio"       && "Radio = distancia del centro al borde"}
                {levelDef.goal==="longitud"    && "Longitud = distancia de extremo a extremo"}
                {levelDef.goal==="radio mayor" && "Radio mayor = mitad del eje más largo"}
                {levelDef.goal==="área total"  && "Área total = área rectángulo + área semicírculo"}
              </div>
              {attempts>0 && (
                <div style={{ marginTop:8, fontSize:20, color:"#ff5555", borderTop:"1px solid #1e1e2e", paddingTop:6 }}>
                  {attempts} intento{attempts>1?"s":""} fallido{attempts>1?"s":""}
                </div>
              )}
            </div>

            {phase === "playing" && (
              <>
                {/* Display valor */}
                <div style={{
                  background:"#0d0d18", border:`2px solid ${levelDef.color}66`,
                  borderRadius:10, padding:"10px 12px", marginBottom:8,
                  display:"flex", alignItems:"baseline", gap:6,
                }}>
                  <span style={{
                    fontSize:28, fontWeight:900, color:levelDef.color,
                    fontFamily:"'Courier New',monospace", flex:1,
                  }}>
                    {inputVal || <span style={{opacity:.25}}>0</span>}
                  </span>
                  <span style={{ fontSize:20, color:"#ffffff" }}>{levelDef.unit}</span>
                </div>

                {/* Numpad */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:5, marginBottom:8 }}>
                  {NUMPAD.flat().map(k=>(
                    <button key={k} onClick={()=>numpadPress(k)} style={{
                      background: k==="⌫" ? "rgba(255,68,68,0.12)" : "rgba(255,255,255,0.04)",
                      border:`1px solid ${k==="⌫"?"#ff444433":"#2a2a3a"}`,
                      borderRadius:7, padding:"13px 0",
                      fontSize:17, fontWeight:700,
                      color: k==="⌫" ? "#ff4444" : "#ccc",
                      cursor:"pointer", fontFamily:"'Courier New',monospace",
                    }}>{k}</button>
                  ))}
                </div>

                {/* Confirmar */}
                <button onClick={checkAnswer} disabled={!inputVal} style={{
                  width:"100%", border:"none", borderRadius:8,
                  padding:"13px 0", fontSize:15, fontWeight:800,
                  background: inputVal ? levelDef.color : "#1a1a26",
                  color: inputVal ? "#000" : "#555",
                  cursor: inputVal ? "pointer" : "not-allowed",
                  letterSpacing:.5,
                }}>✓ CONFIRMAR MEDIDA</button>
              </>
            )}

            {/* Feedback correcto */}
            {phase==="correct" && feedback && (
              <div style={{ background:"rgba(0,212,170,0.08)", border:"1px solid #00d4aa44", borderRadius:10, padding:"12px" }}>
                <div style={{ fontSize:20, fontWeight:900, color:"#00d4aa", marginBottom:5 }}>✓ ¡Correcto!</div>
                <div style={{ fontSize:18, color:"#777", marginBottom:10, lineHeight:1.6 }}>
                  Diste: <strong style={{color:"#fff"}}>{feedback.given}</strong><br/>
                  Real:  <strong style={{color:"#fff"}}>{feedback.real} {levelDef.unit}</strong><br/>
                  Error: <strong style={{color:"#fbbf24"}}>{feedback.error} {levelDef.unit}</strong>
                </div>
                <div style={{ background:"rgba(0,212,170,0.1)", border:"1px solid #00d4aa33", borderRadius:8, padding:"8px", textAlign:"center", marginBottom:10 }}>
                  <div style={{ fontSize:20, color:"#555" }}>GANADO</div>
                  <div style={{ fontSize:22, fontWeight:900, color:"#00d4aa" }}>+${feedback.prize.toLocaleString()}</div>
                </div>
                <button onClick={nextLevel} style={{
                  width:"100%", border:"none", borderRadius:8, padding:"11px",
                  background:levelDef.color, color:"#000", fontSize:20, fontWeight:800, cursor:"pointer",
                }}>
                  {currentLvl>=LEVELS.length-1 ? "🏆 Final" : `Nivel ${currentLvl+2} →`}
                </button>
              </div>
            )}

            {/* Feedback incorrecto */}
            {phase==="wrong" && feedback && (
              <div style={{ background:"rgba(255,68,68,0.08)", border:"1px solid #ff444433", borderRadius:10, padding:"12px" }}>
                <div style={{ fontSize:20, fontWeight:900, color:"#ff4444", marginBottom:5 }}>✗ Incorrecto</div>
                <div style={{ fontSize:18, color:"#c6c6c6", marginBottom:6, lineHeight:1.6 }}>
                  Diste: <strong style={{color:"#ff6666"}}>{feedback.given} {levelDef.unit}</strong><br/>
                  Real: <strong style={{color:"#fff"}}>{feedback.real} {levelDef.unit}</strong><br/>
                  Te {feedback.given>feedback.real?"sobraron":"faltaron"}{" "}
                  <strong style={{color:"#fbbf24"}}>{feedback.error} {levelDef.unit}</strong>
                </div>
                <div style={{ fontSize:20, color:"#f6f6f6", marginBottom:10 }}>
                  Vuelves al nivel 1
                </div>
                <button onClick={resetToStart} style={{
                  width:"100%", border:"none", borderRadius:8, padding:"11px",
                  background:"#ff4444", color:"#fff", fontSize:20, fontWeight:800, cursor:"pointer",
                }}>🔄 Reiniciar desde nivel 1</button>
              </div>
            )}

            {/* Timeout */}
            {phase==="timeout" && (
              <div style={{ background:"rgba(255,68,68,0.08)", border:"1px solid #ff444433", borderRadius:10, padding:"12px" }}>
                <div style={{ fontSize:20, fontWeight:900, color:"#ff4444", marginBottom:5 }}>⏱ Tiempo agotado</div>
                <div style={{ fontSize:18, color:"#f2f2f2", marginBottom:6, lineHeight:1.6 }}>
                  La respuesta era:<br/>
                  <strong style={{color:"#fff", fontSize:22}}>{shape?.realValue} {levelDef.unit}</strong>
                </div>
                <div style={{ fontSize:20, color:"#ffffff", marginBottom:10 }}>
                  Vuelves al nivel 1
                </div>
                <button onClick={resetToStart} style={{
                  width:"100%", border:"none", borderRadius:8, padding:"11px",
                  background:"#ff4444", color:"#fff", fontSize:20, fontWeight:800, cursor:"pointer",
                }}>🔄 Reiniciar desde nivel 1</button>
              </div>
            )}

            {/* Acumulado */}
            {totalEarned > 0 && (
              <div style={{ marginTop:10, background:"rgba(251,191,36,0.06)", border:"1px solid #fbbf2422", borderRadius:8, padding:"8px 10px" }}>
                <div style={{ fontSize:15, color:"#ffffff" }}>ACUMULADO</div>
                <div style={{ fontSize:22, fontWeight:900, color:"#fbbf24" }}>${totalEarned.toLocaleString()}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  );
}

const S = {
  wrap: {
    minHeight:"100vh", background:"#07070e",
    color:"#fff", fontFamily:"'Courier New', monospace",
    padding:"14px 20px", overflowY:"auto",
  },
  backBtn: {
    background:"rgba(10,10,18,0.8)", border:"1px solid #2a2a3a",
    borderRadius:8, color:"#aaa", fontSize:15, padding:"6px 12px", cursor:"pointer",
  },
  btnPrimary: {
    background:"#fbbf24", border:"none", borderRadius:8,
    padding:"12px 24px", fontSize:16, fontWeight:800, color:"#000", cursor:"pointer",
  },
};