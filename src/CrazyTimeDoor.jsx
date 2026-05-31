// CrazyTimeDoor.jsx
import { useState, useEffect, useRef } from "react";

export default function CrazyTimeDoor({ onComplete }) {
  const [phase, setPhase] = useState(0);
  // 0 = cerrada+shimmer  1 = manijas  2 = apertura  3 = zoom  4 = flash  5 = done

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 1000),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 1500),
      setTimeout(() => setPhase(4), 2200),
      setTimeout(() => setPhase(5), 2600),
      setTimeout(() => onComplete(), 2900),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const done = phase >= 5;
  if (done) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 999,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "#07070f",
      overflow: "hidden",
      perspective: "900px",
    }}>
      <style>{`
        @keyframes shimmer {
          0%   { left: -60%; opacity: 0; }
          20%  { opacity: 1; }
          80%  { opacity: 1; }
          100% { left: 110%; opacity: 0; }
        }
        @keyframes vibrate {
          0%,100% { transform: translateX(0); }
          25%     { transform: translateX(-2px); }
          75%     { transform: translateX(2px); }
        }
        @keyframes confetti-fall {
          0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(120vh) rotate(720deg); opacity: 0; }
        }
        @keyframes flash-expand {
          0%   { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(4); }
        }
      `}</style>

      {/* ── Contenedor 3D que hace zoom ── */}
      <div style={{
        position: "relative",
        width: "100vw", height: "100vh",
        transformStyle: "preserve-3d",
        transition: phase >= 3 ? "transform 1.2s cubic-bezier(0.4,0,0.2,1)" : "none",
        transform: phase >= 3 ? "translateZ(600px) scale(2.5)" : "translateZ(0) scale(1)",
      }}>

        {/* ── Haz de luz central (fase 2+) ── */}
        {phase >= 2 && (
          <div style={{
            position: "absolute",
            left: "50%", top: 0, bottom: 0,
            width: phase >= 3 ? "100vw" : "8px",
            marginLeft: phase >= 3 ? "-50vw" : "-4px",
            background: phase >= 3
              ? "radial-gradient(ellipse at center, #fffde7 0%, #fbbf24aa 30%, transparent 70%)"
              : "linear-gradient(to bottom, #fbbf24, #fff8e1, #fbbf24)",
            filter: "blur(12px)",
            opacity: phase >= 4 ? 0 : 0.9,
            transition: "width 0.3s ease, margin-left 0.3s ease, opacity 0.4s ease",
            pointerEvents: "none",
            zIndex: 5,
          }} />
        )}

        {/* ── PUERTA IZQUIERDA ── */}
        <div style={{
          position: "absolute",
          top: 0, left: 0,
          width: "50%", height: "100%",
          transformOrigin: "left center",
          transformStyle: "preserve-3d",
          transition: phase >= 2 ? "transform 0.9s cubic-bezier(0.55,0,0.45,1)" : "none",
          transform: phase >= 2 ? "rotateY(-95deg)" : "rotateY(0deg)",
          animation: phase === 0 ? "vibrate 0.18s ease-in-out infinite" : "none",
          zIndex: 10,
        }}>
          {/* Cara de la puerta */}
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(160deg, #c0392b 0%, #e74c3c 30%, #a93226 60%, #7b241c 100%)",
            boxShadow: "inset -8px 0 24px rgba(0,0,0,0.5), inset 0 0 40px rgba(0,0,0,0.3)",
            borderRight: "3px solid #7b241c",
          }}>
            {/* Moldura dorada */}
            <div style={{
              position: "absolute", inset: "5%",
              border: "6px solid #f5c518",
              borderRadius: 4,
              boxShadow: "0 0 12px #f5c51844, inset 0 0 8px #f5c51822",
            }} />
            <div style={{
              position: "absolute", inset: "12%",
              border: "3px solid #d4a017",
              borderRadius: 2,
              opacity: 0.6,
            }} />

            {/* Shimmer (fase 0) */}
            {phase === 0 && (
              <div style={{
                position: "absolute", inset: 0, overflow: "hidden", borderRadius: 4,
              }}>
                <div style={{
                  position: "absolute", top: 0, bottom: 0, width: "40%",
                  background: "linear-gradient(90deg, transparent, rgba(255,245,150,0.5), transparent)",
                  animation: "shimmer 1.4s ease-in-out infinite",
                  transform: "skewX(-15deg)",
                }} />
              </div>
            )}

            {/* Manija derecha (baja en fase 1) */}
            <div style={{
              position: "absolute",
              right: "8%", top: "50%",
              width: 18, height: 50,
              background: "linear-gradient(180deg, #f5c518, #d4a017, #f5c518)",
              borderRadius: 9,
              transformOrigin: "50% 20%",
              transition: "transform 0.2s ease-in",
              transform: phase >= 1 ? "rotate(45deg)" : "rotate(0deg)",
              boxShadow: "2px 2px 6px #0008",
            }} />
          </div>
        </div>

        {/* ── PUERTA DERECHA ── */}
        <div style={{
          position: "absolute",
          top: 0, right: 0,
          width: "50%", height: "100%",
          transformOrigin: "right center",
          transformStyle: "preserve-3d",
          transition: phase >= 2 ? "transform 0.9s cubic-bezier(0.55,0,0.45,1)" : "none",
          transform: phase >= 2 ? "rotateY(95deg)" : "rotateY(0deg)",
          animation: phase === 0 ? "vibrate 0.18s ease-in-out infinite" : "none",
          zIndex: 10,
        }}>
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(200deg, #c0392b 0%, #e74c3c 30%, #a93226 60%, #7b241c 100%)",
            boxShadow: "inset 8px 0 24px rgba(0,0,0,0.5), inset 0 0 40px rgba(0,0,0,0.3)",
            borderLeft: "3px solid #7b241c",
          }}>
            <div style={{
              position: "absolute", inset: "5%",
              border: "6px solid #f5c518",
              borderRadius: 4,
              boxShadow: "0 0 12px #f5c51844, inset 0 0 8px #f5c51822",
            }} />
            <div style={{
              position: "absolute", inset: "12%",
              border: "3px solid #d4a017",
              borderRadius: 2,
              opacity: 0.6,
            }} />

            {phase === 0 && (
              <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: 4 }}>
                <div style={{
                  position: "absolute", top: 0, bottom: 0, width: "40%",
                  background: "linear-gradient(90deg, transparent, rgba(255,245,150,0.5), transparent)",
                  animation: "shimmer 1.4s ease-in-out infinite",
                  animationDelay: "0.7s",
                  transform: "skewX(-15deg)",
                }} />
              </div>
            )}

            <div style={{
              position: "absolute",
              left: "8%", top: "50%",
              width: 18, height: 50,
              background: "linear-gradient(180deg, #f5c518, #d4a017, #f5c518)",
              borderRadius: 9,
              transformOrigin: "50% 20%",
              transition: "transform 0.2s ease-in",
              transform: phase >= 1 ? "rotate(-45deg)" : "rotate(0deg)",
              boxShadow: "2px 2px 6px #0008",
            }} />
          </div>
        </div>

        {/* ── Marco dorado ── */}
        <div style={{
          position: "absolute", inset: 0,
          border: "12px solid #d4a017",
          boxShadow: "inset 0 0 30px rgba(212,160,23,0.3), 0 0 40px rgba(212,160,23,0.2)",
          pointerEvents: "none",
          zIndex: 20,
        }} />

        {/* ── Texto central (fase 0-1) ── */}
        {phase <= 1 && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 15, pointerEvents: "none",
          }}>
            <div style={{
              fontSize: 52, fontWeight: 900, letterSpacing: 4,
              color: "#fbbf24",
              textShadow: "0 0 30px #fbbf24, 0 0 60px #f97316",
              fontFamily: "'Georgia', serif",
            }}>
              🎡 CRAZY TIME
            </div>
          </div>
        )}
      </div>

      {/* ── Flash final (fase 4) ── */}
      {phase === 4 && (
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(circle, #fffde7 0%, #fbbf24 40%, transparent 70%)",
          animation: "flash-expand 0.4s ease-out forwards",
          pointerEvents: "none",
          zIndex: 50,
        }} />
      )}

      {/* ── Confetti (fase 3+) ── */}
      {phase >= 3 && Array.from({ length: 22 }, (_, i) => (
        <div key={i} style={{
          position: "absolute",
          left: `${Math.random() * 100}%`,
          top: `-${Math.random() * 20}px`,
          width: 8 + Math.random() * 8,
          height: 8 + Math.random() * 8,
          borderRadius: Math.random() > 0.5 ? "50%" : 2,
          background: ["#fbbf24","#ef4444","#22c55e","#3b82f6","#a855f7","#fff"][i % 6],
          animation: `confetti-fall ${1.2 + Math.random() * 1}s ease-in forwards`,
          animationDelay: `${Math.random() * 0.4}s`,
          pointerEvents: "none",
          zIndex: 60,
        }} />
      ))}
    </div>
  );
}