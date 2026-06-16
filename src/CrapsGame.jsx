import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabase";

// ═══════════════════════════════════════════════════════════════
//  CONSTANTES
// ═══════════════════════════════════════════════════════════════
const CHIP_VALUES = [1_000, 5_000, 10_000, 50_000, 100_000];
const CHIP_COLORS = {
  1_000: "#9ca3af", 5_000: "#3b82f6", 10_000: "#ef4444",
  50_000: "#22c55e", 100_000: "#a855f7",
};
const DICE_FACES = ["⚀","⚁","⚂","⚃","⚄","⚅"];
const sleep = ms => new Promise(r => setTimeout(r, ms));

function placeOdds(n) {
  if (n === 4 || n === 10) return 9/5;
  if (n === 5 || n === 9)  return 7/5;
  return 7/6; // 6 u 8
}

const EMPTY_BETS = {
  passLine: 0, dontPass: 0, come: 0, dontCome: 0, field: 0,
  big6: 0, big8: 0, place4: 0, place5: 0, place6: 0,
  place8: 0, place9: 0, place10: 0,
  anySeven: 0, anyCraps: 0, yo: 0, aces: 0, boxcars: 0,
};

// ═══════════════════════════════════════════════════════════════
//  COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════

// ─── CSS 3D ──────────────────────────────────────────────────
const DICE_CSS = `
  @keyframes spin3d_a {
    0%   { transform: rotateX(0deg)   rotateY(0deg)   rotateZ(0deg); }
    100% { transform: rotateX(720deg) rotateY(1080deg) rotateZ(360deg); }
  }
  @keyframes spin3d_b {
    0%   { transform: rotateX(0deg)    rotateY(0deg)   rotateZ(0deg); }
    100% { transform: rotateX(1080deg) rotateY(540deg) rotateZ(720deg); }
  }
  @keyframes fadeInOverlay {
    from { opacity:0; } to { opacity:1; }
  }
  @keyframes popIn {
    0%{transform:scale(0.5);opacity:0} 70%{transform:scale(1.15)} 100%{transform:scale(1);opacity:1}
  }
`;

const DOT_POSITIONS = {
  1: [[50,50]],
  2: [[25,25],[75,75]],
  3: [[25,25],[50,50],[75,75]],
  4: [[25,25],[75,25],[25,75],[75,75]],
  5: [[25,25],[75,25],[50,50],[25,75],[75,75]],
  6: [[25,20],[75,20],[25,50],[75,50],[25,80],[75,80]],
};

function DieFace({ value, transform }) {
  const S = 80;
  return (
    <div style={{
      position: "absolute", width: S, height: S,
      background: "linear-gradient(135deg, #f5f0e8, #ede8d8)",
      border: "2px solid rgba(0,0,0,0.25)",
      borderRadius: 12,
      boxShadow: "inset 0 2px 6px rgba(255,255,255,0.6), inset 0 -2px 6px rgba(0,0,0,0.2)",
      backfaceVisibility: "hidden",
      transform,
      willChange: "transform",
    }}>
      {(DOT_POSITIONS[value] || []).map(([x, y], i) => (
        <div key={i} style={{
          position: "absolute",
          left: `${x}%`, top: `${y}%`,
          transform: "translate(-50%, -50%)",
          width: 12, height: 12, borderRadius: "50%",
          background: "radial-gradient(circle at 35% 35%, #555, #111)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
        }} />
      ))}
    </div>
  );
}

const FACE_ROTATIONS = {
  1: "rotateX(720deg) rotateY(720deg)",   //  0°+720 , 0°+720
  2: "rotateX(720deg) rotateY(630deg)",   //  0°+720 , -90°+720
  3: "rotateX(630deg) rotateY(720deg)",   // -90°+720,  0°+720
  4: "rotateX(810deg) rotateY(720deg)",   //  90°+720,  0°+720
  5: "rotateX(720deg) rotateY(810deg)",   //  0°+720 ,  90°+720
  6: "rotateX(720deg) rotateY(900deg)",   //  0°+720 , 180°+720
};

function Dice3D({ animKey, finalValue, isSpinning }) {
  const S = 80, H = S / 2;
  const faces = [
    { value: 1, transform: `rotateY(0deg)   translateZ(${H}px)` },
    { value: 6, transform: `rotateY(180deg) translateZ(${H}px)` },
    { value: 2, transform: `rotateY(90deg)  translateZ(${H}px)` },
    { value: 5, transform: `rotateY(-90deg) translateZ(${H}px)` },
    { value: 3, transform: `rotateX(90deg)  translateZ(${H}px)` },
    { value: 4, transform: `rotateX(-90deg) translateZ(${H}px)` },
  ];

  return (
    <div style={{ perspective: 300, width: S, height: S }}>
      <div style={{
        width: S, height: S,
        position: "relative",
        transformStyle: "preserve-3d",
        willChange: "transform",
        // Giro loco: animación infinita
        animation: isSpinning
          ? `${animKey === 0 ? "spin3d_a" : "spin3d_b"} 0.9s linear infinite`
          : "none",
        // Freno: transición suave a la cara correcta
        transform:  isSpinning ? undefined : (FACE_ROTATIONS[finalValue] ?? "rotateX(0deg) rotateY(0deg)"),
        transition: isSpinning ? "none" : "transform 0.8s cubic-bezier(0.2, 0.8, 0.4, 1)",
      }}>
        {faces.map((f, i) => <DieFace key={i} value={f.value} transform={f.transform} />)}
      </div>
    </div>
  );
}

export default function CrapsGame({ balance, setBalance, onBack }) {
  const [phase,    setPhase]    = useState("come-out");
  const [point,    setPoint]    = useState(null);
  const [dice,     setDice]     = useState([1, 6]);
  const [rolling,  setRolling]  = useState(false);
  const [chip,     setChip]     = useState(5_000);
  const [msg,      setMsg]      = useState("Fase de salida — Apuesta en Pass Line y lanza");
  const [msgColor, setMsgColor] = useState("#aaa");
  const [history,  setHistory]  = useState([]);
  const [bets,     setBets]     = useState({ ...EMPTY_BETS });
  // Come/DontCome bets que establecieron número
  const [comeNums,     setComeNums]     = useState({});
  const [dontComeNums, setDontComeNums] = useState({});
  const balRef = useRef(balance);
  useEffect(() => { balRef.current = balance; }, [balance]);

  // ── Colocar apuesta ─────────────────────────────────────────
  function addBet(key) {
    if (rolling) return;
    if ((key === "passLine" || key === "dontPass") && phase === "point") {
      setMsg("Pass/Don't Pass no disponible durante la fase del punto"); setMsgColor("#f59e0b"); return;
    }
    if ((key === "come" || key === "dontCome") && phase === "come-out") {
  setMsg("Come/Don't Come solo disponible durante la fase del punto");
  setMsgColor("#f59e0b"); return;
}
    if (balRef.current < chip) { setMsg("Saldo insuficiente"); setMsgColor("#ef4444"); return; }
    const nb = balRef.current - chip;
    balRef.current = nb;
    setBalance(nb);
    setBets(p => ({ ...p, [key]: p[key] + chip }));
    setMsg(""); setMsgColor("#aaa");
  }

  // ── Retirar todas las apuestas ───────────────────────────────
  function handleSafeBack() {
  const hasActiveBets = Object.values(bets).some(v => v > 0) ||
                        Object.keys(comeNums).length > 0 ||
                        Object.keys(dontComeNums).length > 0;

  if (hasActiveBets) {
    const confirmLeave = window.confirm(
      "¡Atención! Tienes apuestas activas en la mesa. Si sales al lobby ahora, perderás las fichas que estén en juego. ¿Seguro que deseas salir?"
    );
    if (!confirmLeave) return; // Cancela la salida
  }
  onBack(); // Ejecuta la salida normal si aceptó o si la mesa estaba limpia
}

  // ── Retirar todas las apuestas (Corregido para respetar reglas de casino) ──
  function clearAllBets() {
    if (rolling) return;

    if (phase === "point") {
      // 🔒 Si hay punto, NO se pueden retirar las apuestas de línea ni números establecidos
      // Solo limpiamos las secundarias, las del centro y fichas de COME puestas en este turno
      const keysToClear = [
        "come", "dontCome", "field", "big6", "big8",
        "place4", "place5", "place6", "place8", "place9", "place10",
        "anySeven", "anyCraps", "yo", "aces", "boxcars"
      ];

      let removableTotal = 0;
      const nb = { ...bets };

      keysToClear.forEach(key => {
        removableTotal += nb[key];
        nb[key] = 0;
      });

      if (removableTotal === 0) return; // No hay nada legal que retirar

      const newBal = balRef.current + removableTotal;
      balRef.current = newBal;
      setBalance(newBal);
      setBets(nb);
      // comeNums y dontComeNums NO se tocan, se quedan fijas en la mesa
      setMsg("Apuestas secundarias retiradas (Líneas fijas bloqueadas)"); 
      setMsgColor("#aaa");

    } else {
      // 🔓 En Fase de Salida (come-out) el jugador es libre de retirar TODO lo que guste
      const total = Object.values(bets).reduce((a,b)=>a+b,0);
      if (total === 0) return;

      const newBal = balRef.current + total;
      balRef.current = newBal;
      setBalance(newBal);
      setBets({ ...EMPTY_BETS });
      setComeNums({}); setDontComeNums({});
      setMsg("Todas las apuestas retiradas"); 
      setMsgColor("#aaa");
    }
  }

// ── Lanzar dados (nueva versión con 3D) ──────────────────────
const [rolling3D, setRolling3D] = useState(false);
const [finalDice, setFinalDice] = useState(null);
const [isSpinning, setIsSpinning] = useState(false);

async function roll() {
  if (rolling) return;
  const anyBet = Object.values(bets).some(v => v > 0) ||
                 Object.keys(comeNums).length > 0 ||
                 Object.keys(dontComeNums).length > 0;
  if (!anyBet) { setMsg("Haz al menos una apuesta primero"); setMsgColor("#f59e0b"); return; }

  // ── Paso A: calcular resultado AHORA, en memoria ──────────
  const FORCED_DICE = null;
  const d1 = FORCED_DICE ? FORCED_DICE[0] : Math.ceil(Math.random() * 6);
  const d2 = FORCED_DICE ? FORCED_DICE[1] : Math.ceil(Math.random() * 6);

  setRolling(true);
  setDice([d1, d2]);       // los dados conocen su valor final desde el inicio
  setFinalDice(null);       // ocultar panel 2D
  setRolling3D(true);
  setIsSpinning(true);      // giro loco

  // ── Paso B: giro descontrolado 1200 ms ───────────────────
  await sleep(1200);

  // ── Paso C: freno — CSS transition se encarga ────────────
  setIsSpinning(false);

  // ── Paso D: pausa 1000 ms con dados clavados en 3D ───────
  await sleep(1000);

  // ── Paso E: cerrar 3D, revelar 2D, resolver apuestas ─────
  setRolling3D(false);
  setFinalDice([d1, d2]);   // activa animación popIn en panel 2D

  const total = d1 + d2;
  setHistory(p => [...p.slice(-29), total]);
  resolve(total);
  setRolling(false);
}

  // ── Resolver tiro ────────────────────────────────────────────
  function resolve(total) {
    let add = 0;
    const ev = [];
    const nb  = { ...bets };
    const ncn  = { ...comeNums };
    const ndcn = { ...dontComeNums };
    let nph = phase, np = point;

    // ── Apuestas de un solo tiro ──────────────────────────────
    function sr(key, cond, mult, label) {
      if (!nb[key]) return;
      if (cond) { add += nb[key] * (1 + mult); ev.push(`✅ ${label} +${(nb[key]*mult).toLocaleString()}`); }
      else ev.push(`❌ ${label}`);
      nb[key] = 0;
    }
    sr("anySeven", total===7,              4,  "Any Seven");
    sr("anyCraps", [2,3,12].includes(total), 7,"Any Craps");
    sr("yo",       total===11,             15, "Yo (11)");
    sr("aces",     total===2,              30, "Aces (2)");
    sr("boxcars",  total===12,             30, "Boxcars (12)");

    // ── Field ─────────────────────────────────────────────────
    if (nb.field > 0) {
      if ([3,4,9,10,11].includes(total)) { add += nb.field*2; ev.push(`✅ Campo +${nb.field.toLocaleString()}`); }
      else if (total===2)  { add += nb.field*3;  ev.push(`✅ Campo 2:1 +${(nb.field*2).toLocaleString()}`); }
      else if (total===12) { add += nb.field*4;  ev.push(`✅ Campo 3:1 +${(nb.field*3).toLocaleString()}`); }
      else ev.push(`❌ Campo pierde`);
      nb.field = 0;
    }

    // ── Big 6/8 ───────────────────────────────────────────────
    if (nb.big6 > 0) {
      if (total===6) { add += nb.big6*2; ev.push(`✅ Big 6 +${nb.big6.toLocaleString()}`); nb.big6=0; }
      else if (total===7) { ev.push(`❌ Big 6 pierde`); nb.big6=0; }
    }
    if (nb.big8 > 0) {
      if (total===8) { add += nb.big8*2; ev.push(`✅ Big 8 +${nb.big8.toLocaleString()}`); nb.big8=0; }
      else if (total===7) { ev.push(`❌ Big 8 pierde`); nb.big8=0; }
    }

    // ── Place bets (Corregido: Solo activas en fase de punto) ──
if (phase === "point") {
  for (const n of [4,5,6,8,9,10]) {
    const k = `place${n}`;
    if (nb[k] > 0) {
      if (total===n) {
        const win = Math.floor(nb[k] * placeOdds(n));
        add += nb[k] + win;
        ev.push(`✅ Place ${n} +${win.toLocaleString()}`);
        nb[k] = 0;
      } else if (total===7) {
        ev.push(`❌ Place ${n} pierde`); nb[k]=0;
      }
    }
  }
}

    // ── Come numbers ──────────────────────────────────────────
    for (const [ns, amt] of Object.entries(ncn)) {
      const n = parseInt(ns);
      if (total===n) {
        //const win = Math.floor(amt * placeOdds(n));
        const win = amt;    // SE AGREGÓ PARA ARREGLAR EL 1:1 DEL COME
        add += amt + win;   // SE AGREGÓ PARA ARREGLAR EL 1:1 DEL COME
        //add += amt + win; ev.push(`✅ Come ${n} +${win.toLocaleString()}`);
        ev.push(`✅ Come ${n} +${win.toLocaleString()}`);     // SE AGREGÓ PARA ARREGLAR EL 1:1 DEL COME
        delete ncn[ns];
      } else if (total===7) {
        ev.push(`❌ Come ${n} pierde`); delete ncn[ns];
      }
    }

    // ── Don't Come numbers ────────────────────────────────────
    for (const [ns, amt] of Object.entries(ndcn)) {
      const n = parseInt(ns);
      if (total===7) {const win = amt; add += amt + win; ev.push(`✅ Don't Come ${n} +${win.toLocaleString()}`); delete ndcn[ns]; }  //amt.toLocaleString()   add += amt*2
      else if (total===n) { ev.push(`❌ Don't Come ${n} pierde`); delete ndcn[ns]; }
    }

    // ── COME/DON'T COME pendientes ────────────────────────────
    if (nb.come > 0) {
      if ([7,11].includes(total)) { add+=nb.come*2; ev.push(`✅ Come +${nb.come.toLocaleString()}`); nb.come=0; }
      else if ([2,3,12].includes(total)) { ev.push(`❌ Come pierde`); nb.come=0; }
      else { ncn[total]=(ncn[total]||0)+nb.come; ev.push(`Come → ${total}`); nb.come=0; }
    }
    if (nb.dontCome > 0) {
      if ([7,11].includes(total)) { ev.push(`❌ Don't Come pierde`); nb.dontCome=0; }
      else if ([2,3].includes(total)) { add+=nb.dontCome*2; ev.push(`✅ Don't Come +${nb.dontCome.toLocaleString()}`); nb.dontCome=0; }
      else if (total===12) { add+=nb.dontCome; ev.push(`Don't Come: Push`); nb.dontCome=0; }
      else { ndcn[total]=(ndcn[total]||0)+nb.dontCome; ev.push(`Don't Come → ${total}`); nb.dontCome=0; }
    }

    // ── Lógica de fases ───────────────────────────────────────
    if (phase === "come-out") {
      // Pass Line
      if (nb.passLine > 0) {
        if ([7,11].includes(total)) { add+=nb.passLine*2; ev.push(`✅ Pass Line +${nb.passLine.toLocaleString()}`); nb.passLine=0; }
        else if ([2,3,12].includes(total)) { ev.push(`❌ Pass Line pierde`); nb.passLine=0; }
        // else: punto establecido, la apuesta espera
      }
      // Don't Pass
      if (nb.dontPass > 0) {
        if ([2,3].includes(total)) { add+=nb.dontPass*2; ev.push(`✅ Don't Pass +${nb.dontPass.toLocaleString()}`); nb.dontPass=0; }
        else if ([7,11].includes(total)) { ev.push(`❌ Don't Pass pierde`); nb.dontPass=0; }
        else if (total===12) { add+=nb.dontPass; ev.push(`Don't Pass: Push`); nb.dontPass=0; }
      }
      // Transición de fase
      if ([7,11].includes(total)) {
        ev.unshift(`🎉 ¡Natural ${total}! Come-Out.`);
      } else if ([2,3,12].includes(total)) {
        ev.unshift(`💥 ¡Craps ${total}!`);
      } else {
        np = total; nph = "point";
        ev.unshift(`🎯 Punto establecido: ${total}`);
      }

    } else {
      // FASE DEL PUNTO
      if (nb.passLine > 0) {
        if (total===np) { add+=nb.passLine*2; ev.push(`✅ Pass Line +${nb.passLine.toLocaleString()}`); nb.passLine=0; }
        else if (total===7) { ev.push(`❌ Pass Line pierde`); nb.passLine=0; }
      }
      if (nb.dontPass > 0) {
        if (total===7) { add+=nb.dontPass*2; ev.push(`✅ Don't Pass +${nb.dontPass.toLocaleString()}`); nb.dontPass=0; }
        else if (total===np) { ev.push(`❌ Don't Pass pierde`); nb.dontPass=0; }
      }
      // Transición
      if (total===np) { nph="come-out"; np=null; ev.unshift(`🎉 ¡Punto! Ronda ganada.`); }
      else if (total===7) { nph="come-out"; np=null; ev.unshift(`💥 Seven-Out. Mesa se limpia.`); }
      else ev.unshift(`Tiro ${total} — Buscando el ${point}...`);
    }

    // ── Actualizar estado ─────────────────────────────────────
    const newBal = balRef.current + add;
    balRef.current = newBal;
    setBalance(newBal);
    setBets(nb); setComeNums(ncn); setDontComeNums(ndcn);
    setPhase(nph); setPoint(np);

    const mainMsg = ev[0] || `Tiro: ${total}`;
    const detail  = ev.slice(1).join(" · ");
    setMsg(detail ? `${mainMsg}  ·  ${detail}` : mainMsg);
    setMsgColor(add > 0 ? "#22c55e" : ev.some(e=>e.startsWith("✅")) ? "#22c55e" : ev.some(e=>e.startsWith("❌")) ? "#ef4444" : "#fbbf24");

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) await supabase.from("profiles").update({ balance: newBal }).eq("id", session.user.id);
    });
  }

  // ── Helpers de render ────────────────────────────────────────
  const tableBorder = "rgba(255,255,255,0.25)";

  function Chip({ val }) {
    return (
      <button onClick={() => setChip(val)} style={{
        width: 55, height: 55, borderRadius: "50%",
        background: chip===val ? CHIP_COLORS[val] : CHIP_COLORS[val]+"2a",
        border: `2.5px solid ${CHIP_COLORS[val]}`,
        color: chip===val ? "#000" : CHIP_COLORS[val],
        fontWeight: 900, fontSize: 15, cursor: "pointer",
        transform: chip===val ? "scale(1.18)" : "scale(1)",
        transition: "all 0.15s",
        boxShadow: chip===val ? `0 0 12px ${CHIP_COLORS[val]}88` : "none",
      }}>
        {val>=100_000?`${val/1000}k`:val>=1000?`${val/1000}k`:val}
      </button>
    );
  }

  function BetArea({ betKey, children, style = {}, disabled = false }) {
    const active = bets[betKey] > 0;
    return (
      <div onClick={() => !disabled && addBet(betKey)} style={{
        position: "relative", cursor: disabled ? "not-allowed" : "pointer",
        border: `2px solid ${active ? "#fbbf24" : tableBorder}`,
        background: active ? "rgba(251,191,36,0.12)" : "transparent",
        borderRadius: 6, transition: "all 0.15s",
        opacity: disabled ? 0.45 : 1,
        ...style,
      }}>
        {children}
        {active && (
          <div style={{
            position: "absolute", top: -10, right: 4,
            background: "#fbbf24", color: "#000",
            borderRadius: 10, padding: "1px 7px",
            fontSize: 15, fontWeight: 900, whiteSpace: "nowrap",
            boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
          }}>
            ${bets[betKey].toLocaleString()}
          </div>
        )}
      </div>
    );
  }

  function PropBet({ betKey, label, pay, color }) {
    const active = bets[betKey] > 0;
    return (
      <div onClick={() => addBet(betKey)} style={{
        position: "relative", cursor: "pointer",
        border: `1.5px solid ${active ? color : "rgba(255,255,255,0.18)"}`,
        background: active ? `${color}22` : "rgba(0,0,0,0.3)",
        borderRadius: 5, padding: "4px 6px", textAlign: "center",
        transition: "all 0.15s",
      }}>
        <div style={{ fontSize: 15, fontWeight: 80, color, letterSpacing: 0.3 }}>{label}</div>
        <div style={{ fontSize: 15, color: "rgba(193, 193, 193, 0.75)" }}>{pay}</div>
        {active && (
          <div style={{
            position: "absolute", top: -8, right: 2,
            background: color, color: "#000",
            borderRadius: 8, padding: "1px 5px", fontSize: 15, fontWeight: 900,
          }}>
            ${bets[betKey].toLocaleString()}
          </div>
        )}
      </div>
    );
  }

  const POINT_NUMS = [4,5,6,8,9,10];
  const POINT_LABELS = { 4:"4", 5:"5", 6:"SIX", 8:"8", 9:"NINE", 10:"10" };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", fontFamily: "'Georgia', serif", color: "#fff", padding: "0 8px 40px" }}>
      <style>{`
        @keyframes diceRoll { 0%{transform:rotate(-8deg) scale(1.05)} 50%{transform:rotate(8deg) scale(0.95)} 100%{transform:rotate(-8deg) scale(1.05)} }
        @keyframes popIn { 0%{transform:scale(0.5);opacity:0} 70%{transform:scale(1.15)} 100%{transform:scale(1);opacity:1} }
      `}</style>

      {/* ── Header ── */} {/*onBack por handleSafeBack, para proteger el dinero del jugador */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 0 14px", borderBottom:"1px solid rgba(255,255,255,0.07)", marginBottom:14 }}>
        <button onClick={handleSafeBack} style={{ background:"transparent", border:"1px solid rgba(255,255,255,0.14)", borderRadius:8, color:"#777", fontSize:15, padding:"6px 12px", cursor:"pointer" }}>← Lobby</button>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:25, fontWeight:900, letterSpacing:4, color:"#fbbf24" }}>🎲 CRAPS</div>
          <div style={{ fontSize:15, color:"rgba(255, 255, 255, 0.71)", letterSpacing:2 }}>CASINO DICE · PUNTO BANCO</div>
        </div>
        <div style={{ background:"rgba(251,191,36,0.1)", border:"1px solid rgba(251,191,36,0.3)", borderRadius:20, padding:"6px 14px", fontSize:15, fontWeight:700, color:"#fbbf24" }}>
          💰 {balance.toLocaleString()}
        </div>
      </div>

      {/* ── Dados + Estado + Mensaje ── */}
      <div style={{ display:"flex", gap:14, alignItems:"stretch", marginBottom:12, flexWrap:"wrap" }}>
{/* ── Dados ── */}
<div style={{ position: "relative", flexShrink: 0 }}>
  <style>{DICE_CSS}</style>

  {/* Overlay 3D — solo cuando rolling3D */}
  {rolling3D && (
    <div style={{
      background: "rgba(0,0,0,0.85)",
      border: "1px solid rgba(255,255,255,0.15)",
      borderRadius: 14, padding: "24px 28px",
      display: "flex", gap: 80, alignItems: "center",   //gap: 28, minWidth: 220
      animation: "fadeInOverlay 0.2s ease",
      minWidth: 250,
    }}>
      {/*<Dice3D animKey={0} />
      <Dice3D animKey={1} />*/}
      <Dice3D animKey={0} finalValue={dice[0]} isSpinning={isSpinning} />
    <Dice3D animKey={1} finalValue={dice[1]} isSpinning={isSpinning} />
    </div>
  )}


  {/* Resultado estático 2D — cuando NO rolling3D */}
  {!rolling3D && (
    <div style={{
      background: "rgba(0,0,0,0.45)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 14, padding: "16px 22px",
      display: "flex", gap: 14, alignItems: "center",
      minWidth: 220,
    }}>
      {dice.map((d, i) => (
        <div key={i} style={{
          fontSize: 85, lineHeight: 1, userSelect: "none",
          animation: finalDice ? "popIn 0.35s ease" : "none",
        }}>
          {DICE_FACES[d-1]}
        </div>
      ))}
      <div style={{ textAlign: "center", marginLeft: 6 }}>
        <div style={{
          fontSize: 40, fontWeight: 900, color: "#fbbf24",
          animation: finalDice ? "popIn 0.4s ease 0.1s both" : "none",
        }}>
          {dice[0]+dice[1]}
        </div>
        <div style={{ fontSize: 17, color: "#959595" }}>total</div>
      </div>
    </div>
  )}
</div>

        {/* Fase + punto + mensaje */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", gap:8, minWidth:200 }}>
          <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
            <div style={{
              background: phase==="come-out" ? "#fbbf2420" : "#22c55e20",
              border:`2px solid ${phase==="come-out" ? "#fbbf24" : "#22c55e"}`,
              borderRadius:10, padding:"5px 14px",
              fontSize:15, fontWeight:800,
              color: phase==="come-out" ? "#fbbf24" : "#22c55e",
            }}>
              {phase==="come-out" ? "🎯 FASE DE SALIDA" : "🎯 FASE DEL PUNTO"}
            </div>
            {point && (
              <div style={{
                background:"#ef444422", border:"2px solid #ef4444",
                borderRadius:10, padding:"5px 18px",
                fontSize:20, fontWeight:900, color:"#ef4444",
                animation:"popIn 0.3s ease",
              }}>
                PUNTO: {point}
              </div>
            )}
          </div>
          <div style={{
            flex:1, background:"rgba(0,0,0,0.3)", borderRadius:10, padding:"10px 14px",
            fontSize:15, color:msgColor, fontWeight:600, lineHeight:1.6,
          }}>
            {msg || "Apuesta y lanza los dados"}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          TABLERO VERDE
      ══════════════════════════════════════════════════════ */}
      <div style={{
        background:"radial-gradient(ellipse at 50% 40%, #1e6b2e 0%, #0d3c18 100%)",
        border:"4px solid #0a2810", borderRadius:18, padding:10, marginBottom:12,
      }}>

        {/* FILA SUPERIOR: Don't Come Bar + Números de punto */}
        <div style={{ display:"grid", gridTemplateColumns:"130px repeat(6, 1fr) 100px", gap:4, marginBottom:4 }}>
          
          {/* Don't Come Bar */}
          {/*<BetArea betKey="dontCome" style={{ padding:"6px 8px", minHeight:60 }}>*/}
          <BetArea betKey="dontCome" disabled={phase === "come-out"} style={{ padding:"6px 8px", minHeight:60 }}>
            <div style={{ fontSize:25, color:"#fff", fontWeight:700, textAlign:"center", lineHeight:1.3 }}>
              DON'T<br/>COME<br/>BAR
            </div>
            <div style={{ textAlign:"center", marginTop:4, fontSize:40 }}>🎲🎲</div>
          </BetArea>

          {/* Números 4,5,6,8,9,10 */}
          {POINT_NUMS.map(n => {
            const isPoint = point === n;
            const placeAmt = bets[`place${n}`];
            const comeAmt  = comeNums[n] || 0;
            const dcAmt    = dontComeNums[n] || 0;
            return (
              <div key={n} onClick={() => addBet(`place${n}`)} style={{
                border:`2px solid ${isPoint ? "#22c55e" : placeAmt>0 ? "#fbbf24" : tableBorder}`,
                borderRadius:6, padding:"4px 2px", textAlign:"center",
                background: isPoint ? "rgba(34,197,94,0.2)" : placeAmt>0 ? "rgba(251,191,36,0.1)" : "rgba(0,0,0,0.2)",
                cursor:"pointer", position:"relative", minHeight:60,
                transition:"all 0.15s", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
              }}>
                <div style={{
                  fontSize: n===6||n===9 ? 30 : 40, fontWeight:900,
                  color: n===6||n===9 ? "#fbbf24" : "#fff", letterSpacing: n===6||n===9?1:0,
                }}>{POINT_LABELS[n]}</div>
                {isPoint && <div style={{ fontSize:15, color:"#22c55e", fontWeight:700, marginTop:2 }}>● ON</div>}
                {placeAmt > 0 && (
                  <div style={{ position:"absolute", bottom:2, right:3, background:"#3b82f6", color:"#fff", borderRadius:4, padding:"1px 4px", fontSize:15, fontWeight:900 }}>
                    ${(placeAmt/1000).toFixed(0)}k
                  </div>
                )}
                {comeAmt > 0 && (
                  <div style={{ position:"absolute", top:2, left:3, background:"#22c55e", color:"#000", borderRadius:4, padding:"1px 4px", fontSize:15, fontWeight:900 }}>
                    C${(comeAmt/1000).toFixed(0)}k
                  </div>
                )}
                {dcAmt > 0 && (
                  <div style={{ position:"absolute", top:2, right:3, background:"#ef4444", color:"#fff", borderRadius:4, padding:"1px 4px", fontSize:15, fontWeight:900 }}>
                    DC${(dcAmt/1000).toFixed(0)}k
                  </div>
                )}
              </div>
            );
          })}

          {/* Panel Prop bets — SEVEN */}
          <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
            <PropBet betKey="anySeven" label="SEVEN" pay="4 a 1" color="#ef4444" />
            <PropBet betKey="yo"       label="YO · 11" pay="15 a 1" color="#f97316" />
            <PropBet betKey="aces"     label="ACES · 2" pay="30 a 1" color="#a855f7" />
            <PropBet betKey="boxcars"  label="BOX · 12" pay="30 a 1" color="#a855f7" />
            <PropBet betKey="anyCraps" label="ANY CRAPS" pay="7 a 1" color="#ec4899" />
          </div>
        </div>

        {/* COME */}
        <BetArea betKey="come" disabled={phase === "come-out"} style={{ padding:"14px 12px", textAlign:"center", marginBottom:4 }}>
       {/* <BetArea betKey="come" style={{ padding:"14px 12px", textAlign:"center", marginBottom:4 }}>*/}
          <div style={{ fontSize:35, fontWeight:900, color:"#ef4444", letterSpacing:6 }}>COME</div>
          <div style={{ fontSize:15, color:"rgba(255, 255, 255, 0.59)", marginTop:2 }}>Apuesta como Pass Line en la siguiente tirada</div>
        </BetArea>

        {/* FIELD */}
        <BetArea betKey="field" style={{ padding:"8px 14px", marginBottom:4, display:"flex", alignItems:"center", justifyContent:"center", gap:10, flexWrap:"wrap" }}>
          <div style={{ fontSize:15, fontWeight:900, color:"#fff", letterSpacing:2 }}>FIELD</div>
          <div style={{ fontSize:15, fontWeight:900, color:"#ef4444", border:"1.5px solid #ef4444", borderRadius:20, padding:"0 8px" }}>②</div>
          <div style={{ fontSize:15, color:"rgba(255,255,255,0.7)" }}>• 3 • 4 • 9 • 10 • 11 •</div>
          <div style={{ fontSize:15, fontWeight:900, color:"#ef4444", border:"1.5px solid #ef4444", borderRadius:20, padding:"0 8px" }}>⑫</div>
          <div style={{ fontSize:15, color:"rgba(255, 255, 255, 0.68)" }}>2 paga 2:1 · 12 paga 3:1 · Demás 1:1 · Pierde en 5,6,7,8</div>
        </BetArea>

        {/* FILA INFERIOR: Big6/8 + Don't Pass + Pass Line */}
        <div style={{ display:"grid", gridTemplateColumns:"80px 1fr 100px", gap:4 }}>
          
          {/* BIG 6 + BIG 8 */}
          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
            {[{key:"big6",label:"BIG\n6"},{key:"big8",label:"BIG\n8"}].map(({key,label}) => (
              <BetArea key={key} betKey={key} style={{ flex:1, padding:"6px 4px", textAlign:"center", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
                <div style={{ fontSize:20, fontWeight:900, color:"#ef4444", whiteSpace:"pre-line", lineHeight:1 }}>{label}</div>
                <div style={{ fontSize:12, color:"rgba(255, 255, 255, 0.62)", marginTop:2 }}>1:1</div>
              </BetArea>
            ))}
          </div>

          {/* Don't Pass + Pass Line */}
          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
            <BetArea betKey="dontPass" disabled={phase==="point"}
              style={{ padding:"8px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontSize:25, fontWeight:700, color:"#fff", fontStyle:"italic" }}>Don't Pass Bar</div>
                <div style={{ fontSize:15, color:"rgba(255, 255, 255, 0.74)" }}>Gana con 2,3 · Pierde con 7,11 · 12=Push · {phase==="point"?"No disponible en punto":""}</div>
              </div>
              <div style={{ fontSize:30, marginLeft:8 }}>🎲🎲</div>
            </BetArea>

            <BetArea betKey="passLine" disabled={phase==="point"}
              style={{ padding:"12px 18px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontSize:25, fontWeight:900, color:"#fff", letterSpacing:3 }}>PASS LINE</div>
                <div style={{ fontSize:15, color:"rgba(255, 255, 255, 0.78)" }}>Gana con 7,11 · Pierde con 2,3,12 · {phase==="point"?"No disponible en punto":""}</div>
              </div>
              <div style={{ fontSize:20, color:"rgba(255, 255, 255, 0.78)" }}>1:1</div>
            </BetArea>
          </div>

          {/* Pay table mini */}
          <div style={{ background:"rgba(0,0,0,0.3)", borderRadius:6, padding:"6px 8px", fontSize:13, color:"rgba(255,255,255,0.4)", lineHeight:2 }}>
            <div style={{ color:"#fbbf24", fontWeight:700, marginBottom:2 }}>Place Bets</div>
            <div>4/10 → 9:5</div>
            <div>5/9 → 7:5</div>
            <div>6/8 → 7:6</div>
            <div style={{ color:"rgba(255, 255, 255, 0.7)", marginTop:4 }}>Clic en número</div>
          </div>
        </div>
      </div>

      {/* ── Fichas + Botones ── */}
      <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:12, flexWrap:"wrap" }}>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {CHIP_VALUES.map(v => <Chip key={v} val={v} />)}
        </div>

        <button onClick={roll} disabled={rolling} style={{
          flex:1, minWidth:160, padding:"14px 20px",
          background: rolling ? "#1a1a1a" : "linear-gradient(135deg, #fbbf24, #f97316)",
          border:"none", borderRadius:12,
          fontSize:25, fontWeight:900, cursor: rolling ? "not-allowed" : "pointer",
          color: rolling ? "#444" : "#000",
          boxShadow: rolling ? "none" : "0 4px 20px rgba(251,191,36,0.35)",
          transition:"all 0.2s",
        }}>
          {rolling ? "🎲 Lanzando..." : "🎲 LANZAR DADOS"}
        </button>

        <button onClick={clearAllBets} disabled={rolling} style={{
          padding:"12px 16px", background:"rgba(255,255,255,0.05)",
          border:"1px solid rgba(255,255,255,0.12)", borderRadius:10,
          color:"#aaa", fontSize:15, fontWeight:700, cursor:"pointer",
        }}>🗑 Retirar todo</button>
      </div>

      {/* ── Historial ── */}
      {history.length > 0 && (
        <div style={{ background:"rgba(0,0,0,0.2)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:10, padding:"10px 14px" }}>
          <div style={{ fontSize:15, color:"rgba(255, 255, 255, 0.65)", letterSpacing:2, textTransform:"uppercase", marginBottom:8 }}>Historial</div>
          <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
            {history.map((n, i) => {
              const col = n===7?"#ef4444":[2,3,12].includes(n)?"#a855f7":n===11?"#22c55e":"rgba(255,255,255,0.25)";
              return (
                <div key={i} style={{
                  width:28, height:28, borderRadius:"50%",
                  background:`${col}33`, border:`2px solid ${col}`,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:15, fontWeight:900, color:col,
                }}>{n}</div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}