import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import SnakeGame from "./SnakeGame.jsx";
import DinoGame from "./DinoGame.jsx";
import MinesweeperGame from "./MinesweeperGame.jsx";
import ColorDash from "./ColorDash.jsx";
import BlockBreaker from "./BlockBreaker.jsx";


// ─── Sub-componente: Stats del jugador ───────────────────────────────────────
function PlayerStats({ userId }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [bj, slots, mines, spaceman, horses, chicken] = await Promise.all([
        supabase.from("blackjack_stats").select("*").eq("user_id", userId).single(),
        supabase.from("slots_history").select("time, payout, free_spins").eq("user_id", userId),
        supabase.from("mines_history").select("delta").eq("user_id", userId),
        supabase.from("spaceman_history").select("crash, multiplier, net").eq("user_id", userId),
        supabase.from("horserace_history").select("won, multiplier").eq("user_id", userId),
        supabase.from("chickenroad_stats").select("hist_net").eq("user_id", userId).single(),
      ]);

      const slotsRows = slots.data || [];
      const minesRows = mines.data || [];
      const spaceRows = spaceman.data || [];
      const horseRows = horses.data || [];

      setStats({
        bj: bj.data || { wins: 0, losses: 0, ties: 0, blackjacks: 0 },
        slots: {
          giros: slotsRows.length,
          pagoTotal: slotsRows.reduce((a, h) => a + (h.payout || 0), 0),
          tirosGratis: slotsRows.reduce((a, h) => a + (h.free_spins || 0), 0),
        },
        mines: {
          partidas: minesRows.length,
          victorias: minesRows.filter(h => h.delta > 0).length,
          netTotal: minesRows.reduce((a, h) => a + (h.delta || 0), 0),
        },
        spaceman: {
          vuelos: spaceRows.length,
          crashes: spaceRows.filter(h => h.crash).length,
          multPromedio: spaceRows.length
            ? (spaceRows.reduce((a, h) => a + (h.multiplier || 0), 0) / spaceRows.length).toFixed(2)
            : 0,
          netTotal: spaceRows.reduce((a, h) => a + (h.net || 0), 0),
        },
        horses: {
          apuestas: horseRows.length,
          victorias: horseRows.filter(h => h.won).length,
        },
        chicken: {
          netTotal: chicken.data?.hist_net || 0,
        },
      });
      setLoading(false);
    }
    load();
  }, [userId]);

  if (loading) return (
    <div style={{ color: "#aaa", fontSize: 15, padding: 16, textAlign: "center" }}>
      Cargando estadísticas...
    </div>
  );
  if (!stats) return null;

  const bjTotal = stats.bj.wins + stats.bj.losses + stats.bj.ties;
  const bjWinRate = bjTotal > 0 ? ((stats.bj.wins / bjTotal) * 100).toFixed(1) : 0;

  const StatBlock = ({ icon, title, rows, color }) => (
    <div style={{
      background: "rgba(13,13,20,0.85)",
      border: `1px solid ${color}44`,
      borderRadius: 10,
      padding: "10px 14px",
    }}>
      <div style={{ color, fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{icon} {title}</div>
      {rows.map(([label, val], i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
          <span style={{ color: "#777" }}>{label}</span>
          <span style={{ color: "#ddd", fontWeight: 600 }}>{val}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      <StatBlock icon="🃏" title="Blackjack" color="#00d4aa" rows={[
        ["Partidas", bjTotal],
        ["Victorias", `${stats.bj.wins} (${bjWinRate}%)`],
        ["Derrotas", stats.bj.losses],
        ["Blackjacks", stats.bj.blackjacks],
      ]} />
      <StatBlock icon="🎰" title="Tragamonedas" color="#ff6b35" rows={[
        ["Giros", stats.slots.giros],
        ["Pago total", stats.slots.pagoTotal.toLocaleString()],
        ["Tiros gratis", stats.slots.tirosGratis],
      ]} />
      <StatBlock icon="💣" title="Mines" color="#491cff" rows={[
        ["Partidas", stats.mines.partidas],
        ["Victorias", `${stats.mines.victorias}`],
        ["Neto total", stats.mines.netTotal.toLocaleString()],
      ]} />
      <StatBlock icon="🚀" title="Spaceman" color="#8b5cf6" rows={[
        ["Vuelos", stats.spaceman.vuelos],
        ["Crashes", stats.spaceman.crashes],
        ["×̄ prom.", `×${stats.spaceman.multPromedio}`],
        ["Neto", Math.round(stats.spaceman.netTotal).toLocaleString()],
      ]} />
      <StatBlock icon="🐎" title="Horse Race" color="#ef4444" rows={[
        ["Apuestas", stats.horses.apuestas],
        ["Victorias", `${stats.horses.victorias}`],
      ]} />
      <StatBlock icon="🐔" title="Chicken Road" color="#f59e0b" rows={[
        ["Neto total", Math.round(stats.chicken.netTotal).toLocaleString()],
      ]} />
    </div>
  );
}

// ─── Panel lateral flotante ───────────────────────────────────────────────────
function SidePanel({ title, icon, onClose, children }) {
  return (
    <div style={{
      position: "absolute",
      top: 0,
      right: 0,
      width: "min(380px, 92vw)",
      height: "100%",
      background: "rgba(10,10,18,0.97)",
      backdropFilter: "blur(12px)",
      borderLeft: "1px solid #2a2a3a",
      display: "flex",
      flexDirection: "column",
      zIndex: 20,
      animation: "slideIn 0.22s ease",
    }}>
      <style>{`@keyframes slideIn { from { transform: translateX(40px); opacity:0 } to { transform: translateX(0); opacity:1 } }`}</style>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "16px 18px", borderBottom: "1px solid #1e1e2e",
        flexShrink: 0,
      }}>
        <span style={{ fontWeight: 800, fontSize: 17, color: "#fbbf24" }}>{icon} {title}</span>
        <button onClick={onClose} style={{
          background: "transparent", border: "1px solid #333", borderRadius: 6,
          color: "#777", fontSize: 18, cursor: "pointer", width: 32, height: 32,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>
        {children}
      </div>
    </div>
  );
}

// ─── Botón del sidebar izquierdo ──────────────────────────────────────────────
function SideBtn({ icon, label, onClick, active, color = "#fbbf24" }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
        background: active ? `${color}22` : "rgba(10,10,18,0.75)",
        border: `1px solid ${active ? color : "#2a2a3a"}`,
        borderRadius: 12, padding: "12px 10px",
        cursor: "pointer", color: active ? color : "#888",
        fontSize: 15, fontWeight: 700, letterSpacing: 0.5,
        backdropFilter: "blur(8px)",
        transition: "all 0.15s",
        width: 64,
        textTransform: "uppercase",
      }}
    >
      <span style={{ fontSize: 22 }}>{icon}</span>
      {label}
    </button>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function PlayerSpace({ profile, balance, setBalance, deaths = 0, onBack }) {    
  const [panel, setPanel] = useState(null); // "shop" | "stats" | "work" | null
  const [activeJob, setActiveJob] = useState(null);


  const togglePanel = (name) => setPanel(p => p === name ? null : name);

  const BONUS = 100000;
  const dep = profile.total_deposited || 0;
  const capitalBase = dep + BONUS;
  const neto = balance - capitalBase;
  const roi = capitalBase > 0 ? ((neto / capitalBase) * 100).toFixed(1) : "0.0";

  return (
    <div style={{
      position: "relative",
      width: "100%",
      minHeight: "calc(100vh - 50px)",
      overflow: "hidden",
      fontFamily: "'Georgia', serif",
    }}>
      {/* ── Fondo ── */}
      <img
        src="/Campo.jpg"
        alt="fondo"
        style={{
          position: "absolute", inset: 0,
          width: "100%", height: "100%",
          objectFit: "cover",
          zIndex: 0,
        }}
        onError={e => {
          // fallback si no existe la imagen
          e.target.style.display = "none";
        }}
      />
      {/* Overlay oscuro para legibilidad */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.55) 100%)",
        zIndex: 1,
      }} />

      {/* ── Contenido principal ── */}
      <div style={{ position: "relative", zIndex: 2, minHeight: "calc(100vh - 50px)", display: "flex", flexDirection: "column" }}>

        {/* Botón volver */}
        <div style={{ padding: "12px 14px" }}>
          <button onClick={onBack} style={{
            background: "rgba(10,10,18,0.75)", border: "1px solid #2a2a3a",
            borderRadius: 8, color: "#aaa", fontSize: 13, padding: "6px 14px",
            cursor: "pointer", backdropFilter: "blur(8px)",
          }}>
            ← Lobby
          </button>
        </div>

        {/* Avatar central */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
          {/* Sombra del avatar */}
          <div style={{
            background: "rgba(0,0,0,0.45)",
            borderRadius: "50%",
            width: 90, height: 20,
            filter: "blur(8px)",
            marginBottom: -18,
          }} />
          {/* Burbuja del avatar */}
          <div style={{
            background: "rgba(10,10,18,0.8)",
            border: "3px solid #fbbf2466",
            borderRadius: "50%",
            width: 110, height: 110,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 60,
            backdropFilter: "blur(10px)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 0 0 6px rgba(251,191,36,0.08)",
          }}>
            {profile.avatar}
          </div>
          {/* Nombre */}
          <div style={{
            background: "rgba(10,10,18,0.8)",
            border: "1px solid #2a2a3a",
            borderRadius: 20,
            padding: "4px 18px",
            backdropFilter: "blur(8px)",
          }}>
            <span style={{ color: "#fbbf24", fontWeight: 800, fontSize: 18 }}>{profile.username}</span>
          </div>
          {/* Balance pill */}
          <div style={{
            background: "rgba(10,10,18,0.75)",
            border: "1px solid #fbbf2444",
            borderRadius: 14,
            padding: "5px 16px",
            fontSize: 13,
            color: "#fbbf24",
            fontWeight: 700,
            backdropFilter: "blur(8px)",
          }}>
            💰 {balance.toLocaleString()} fichas
          </div>
          {/* Neto / ROI */}
          <div style={{
            background: "rgba(10,10,18,0.7)",
            border: `1px solid ${neto >= 0 ? "#00d4aa44" : "#ff444444"}`,
            borderRadius: 12,
            padding: "4px 14px",
            fontSize: 12,
            color: neto >= 0 ? "#00d4aa" : "#ff6666",
            fontWeight: 600,
            backdropFilter: "blur(8px)",
          }}>
            {neto >= 0 ? "📈 +" : "📉 "}{neto.toLocaleString()} neto
            <span style={{ marginLeft: 8, opacity: 0.8 }}>
              ({parseFloat(roi) >= 0 ? "+" : ""}{roi}% ROI)
            </span>
          </div>
        </div>

        {/* ── Botones laterales ── */}
        <div style={{
          position: "absolute",
          left: 12,
          top: "50%",
          transform: "translateY(-50%)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          zIndex: 5,
        }}>
          <SideBtn icon="🏪" label="Tienda" onClick={() => togglePanel("shop")} active={panel === "shop"} color="#fbbf24" />
          <SideBtn icon="📊" label="Stats"  onClick={() => togglePanel("stats")} active={panel === "stats"} color="#00d4aa" />
          <SideBtn icon="💼" label="Trabajo" onClick={() => togglePanel("work")} active={panel === "work"} color="#8b5cf6" />
        </div>

        {/* ── Contador de muertes (esquina inferior izquierda) ── */}
        <div style={{
          position: "absolute",
          bottom: 20,
          left: 14,
          background: "rgba(10,10,18,0.82)",
          border: "1px solid #ff444444",
          borderRadius: 10,
          padding: "8px 14px",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          zIndex: 5,
        }}>
          <span style={{ fontSize: 20 }}>💀</span>
          <div>
            <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: 1 }}>Muertes</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#ff4444", lineHeight: 1 }}>{deaths}</div>
          </div>
        </div>
      </div>

      {/* ── Panel lateral ── */}
      {panel && (
        <div style={{ position: "absolute", inset: 0, zIndex: 15 }}>
          {/* Overlay para cerrar */}
          <div
            onClick={() => setPanel(null)}
            style={{ position: "absolute", inset: 0, background: "transparent" }}
          />

          {panel === "shop" && (
            <SidePanel title="Tienda" icon="🏪" onClose={() => setPanel(null)}>
              <div style={{ color: "#666", fontSize: 13, textAlign: "center", marginTop: 40 }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🚧</div>
                <div style={{ color: "#888", fontWeight: 600, marginBottom: 6 }}>Próximamente</div>
                <div style={{ color: "#555", fontSize: 12 }}>
                  Propiedades, vehículos y descuentos<br />estarán disponibles pronto.
                </div>
              </div>
            </SidePanel>
          )}

          {panel === "stats" && (
            <SidePanel title="Mis Estadísticas" icon="📊" onClose={() => setPanel(null)}>
              {/* Resumen rápido */}
              <div style={{
                background: "rgba(251,191,36,0.06)",
                border: "1px solid #fbbf2422",
                borderRadius: 10,
                padding: "12px 14px",
                marginBottom: 14,
              }}>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Resumen</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {[
                    ["💰 Balance actual", `${balance.toLocaleString()} fichas`],
                    ["📥 Total depositado", `${dep.toLocaleString()} fichas`],
                    ["📊 Neto", `${neto >= 0 ? "+" : ""}${neto.toLocaleString()}`],
                    ["📈 ROI", `${parseFloat(roi) >= 0 ? "+" : ""}${roi}%`],
                    ["💀 Muertes", deaths],
                  ].map(([label, val], i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span style={{ color: "#777" }}>{label}</span>
                      <span style={{ color: "#ddd", fontWeight: 700 }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stats por juego */}
              <div style={{ fontSize: 12, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                Por juego
              </div>
              <PlayerStats userId={profile.id} />
            </SidePanel>
          )}

          {panel === "work" && (
  <SidePanel title="Trabajar" icon="💼" onClose={() => setPanel(null)}>
    <div style={{ color: "#ffffff", fontSize: 14, marginBottom: 16 }}>
      Juega y gana fichas reales. Cuanto mejor lo hagas, más cobras.
    </div>

    {/* Snake — habilitado */}
    <div
      onClick={() => { setPanel(null); setActiveJob("snake"); }}
      style={{
        background: "rgba(0,212,170,0.08)",
        border: "1px solid #00d4aa44",
        borderRadius: 10,
        padding: "12px 14px",
        marginBottom: 10,
        display: "flex",
        alignItems: "center",
        gap: 12,
        cursor: "pointer",
      }}
    >
      <span style={{ fontSize: 28 }}>🐍</span>
      <div style={{ flex: 1 }}>
        <div style={{ color: "#00d4aa", fontWeight: 700, fontSize: 14 }}>Snake</div>
        <div style={{ color: "#555", fontSize: 12 }}>$1.000 por manzana</div>
      </div>
      <div style={{
        background: "#00d4aa", borderRadius: 6, padding: "4px 10px",
        fontSize: 11, color: "#000", fontWeight: 700,
      }}>▶ Jugar</div>
    </div>

      {/* Dino — habilitado */}
      <div
  onClick={() => { setPanel(null); setActiveJob("dino"); }}
  style={{
    background: "rgba(251,191,36,0.08)",
    border: "1px solid #fbbf2444",
    borderRadius: 10,
    padding: "12px 14px",
    marginBottom: 10,
    display: "flex",
    alignItems: "center",
    gap: 12,
    cursor: "pointer",
  }}
>
  <span style={{ fontSize: 28 }}>🦕</span>
  <div style={{ flex: 1 }}>
    <div style={{ color: "#fbbf24", fontWeight: 700, fontSize: 14 }}>Dinosaur Game</div>
    <div style={{ color: "#555", fontSize: 12 }}>$2.000 por cada 100 puntos</div>
  </div>
  <div style={{
    background: "#fbbf24", borderRadius: 6, padding: "4px 10px",
    fontSize: 11, color: "#000", fontWeight: 700,
  }}>▶ Jugar</div>
</div>


  {/* Buscaminas — habilitado */}
<div
  onClick={() => { setPanel(null); setActiveJob("minesweeper"); }}
  style={{
    background: "rgba(255,107,53,0.08)",
    border: "1px solid #ff6b3544",
    borderRadius: 10, padding: "12px 14px", marginBottom: 10,
    display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
  }}
>
  <span style={{ fontSize: 28 }}>💥</span>
  <div style={{ flex: 1 }}>
    <div style={{ color: "#ff6b35", fontWeight: 700, fontSize: 14 }}>Buscaminas</div>
    <div style={{ color: "#555", fontSize: 12 }}>Diferentes premios</div>
  </div>
  <div style={{
    background: "#ff6b35", borderRadius: 6, padding: "4px 10px",
    fontSize: 11, color: "#fff", fontWeight: 700,
  }}>▶ Jugar</div>
</div>




  {/* Color Dash — habilitado */}
<div
  onClick={() => { setPanel(null); setActiveJob("colordash"); }}
  style={{
    background: "rgba(192,132,252,0.08)",
    border: "1px solid #c084fc44",
    borderRadius: 10, padding: "12px 14px", marginBottom: 10,
    display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
  }}
>
  <span style={{ fontSize: 28 }}>🔺</span>
  <div style={{ flex: 1 }}>
    <div style={{ color: "#c084fc", fontWeight: 700, fontSize: 14 }}>Color Dash</div>
    <div style={{ color: "#555", fontSize: 12 }}>$5.000 por objeto superado</div>
  </div>
  <div style={{
    background: "#c084fc", borderRadius: 6, padding: "4px 10px",
    fontSize: 11, color: "#000", fontWeight: 700,
  }}>▶ Jugar</div>
</div>

  {/* Block Breaker — habilitado */}
<div
  onClick={() => { setPanel(null); setActiveJob("blockbreaker"); }}
  style={{
    background: "rgba(139,92,246,0.08)",
    border: "1px solid #8b5cf644",
    borderRadius: 10, padding: "12px 14px", marginBottom: 10,
    display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
  }}
>
  <span style={{ fontSize: 28 }}>🧱</span>
  <div style={{ flex: 1 }}>
    <div style={{ color: "#8b5cf6", fontWeight: 700, fontSize: 14 }}>Block Breaker</div>
    <div style={{ color: "#555", fontSize: 12 }}>$30.000 por nivel superado</div>
  </div>
  <div style={{
    background: "#8b5cf6", borderRadius: 6, padding: "4px 10px",
    fontSize: 11, color: "#fff", fontWeight: 700,
  }}>▶ Jugar</div>
</div>



    {/* Los demás — pronto */}
    {[
      { icon: "⭕", name: "Tres en Raya",  desc: "$5.000 por victoria",      color: "#c084fc" },
    
    ].map(job => (
      <div key={job.name} style={{
        background: "rgba(13,13,20,0.8)", border: `1px solid ${job.color}33`,
        borderRadius: 10, padding: "12px 14px", marginBottom: 10,
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <span style={{ fontSize: 28 }}>{job.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ color: job.color, fontWeight: 700, fontSize: 14 }}>{job.name}</div>
          <div style={{ color: "#555", fontSize: 12 }}>{job.desc}</div>
        </div>
        <div style={{
          background: "#1a1a26", border: "1px solid #2a2a3a", borderRadius: 6,
          padding: "4px 10px", fontSize: 11, color: "#555", fontWeight: 600,
        }}>Pronto</div>
      </div>
    ))}
  </SidePanel>
)}
        </div>
      )}



      {activeJob === "snake" && (
  <div style={{
    position: "fixed",
    inset: 0,
    zIndex: 100,
    background: "#080810",
    overflowY: "auto",
  }}>
    <SnakeGame
      balance={balance}
      setBalance={setBalance}
      onBack={() => setActiveJob(null)}
    />
  </div>
)}


  {activeJob === "dino" && (
  <div style={{
    position: "fixed",
    inset: 0,
    zIndex: 100,
    background: "#080810",
    overflowY: "auto",
  }}>
    <DinoGame
      balance={balance}
      setBalance={setBalance}
      onBack={() => setActiveJob(null)}
    />
  </div>
)}


  {activeJob === "minesweeper" && (
  <div style={{
    position: "fixed", inset: 0, zIndex: 100,
    background: "#080810", overflowY: "auto",
  }}>
    <MinesweeperGame
      balance={balance}
      setBalance={setBalance}
      onBack={() => setActiveJob(null)}
    />
  </div>
)}
  {activeJob === "colordash" && (
  <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "#08080f", overflowY: "auto" }}>
    <ColorDash balance={balance} setBalance={setBalance} onBack={() => setActiveJob(null)} />
  </div>
)}




  {activeJob === "blockbreaker" && (
  <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "#08080f", overflowY: "auto" }}>
    <BlockBreaker balance={balance} setBalance={setBalance} onBack={() => setActiveJob(null)} />
</div>
  )}


    </div>
  );
}
