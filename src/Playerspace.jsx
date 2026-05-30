import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import SnakeGame from "./SnakeGame.jsx";
import DinoGame from "./DinoGame.jsx";
import MinesweeperGame from "./MinesweeperGame.jsx";
import ColorDash from "./Colordash.jsx";
import BlockBreaker from "./BlockBreaker.jsx";
import Geometrix from "./Geometrix.jsx";
import ShopPanel, { ASSETS } from "./ShopPanel.jsx";
import BankPanel, { processLoanPayments } from "./Bankpanel.jsx";


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
      width: "min(400px, 94vw)",
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

// ─── Activos flotantes alrededor del avatar ───────────────────────────────────
// Cada activo poseído aparece en una posición fija alrededor del personaje.
// Los vehículos van abajo/costados, las propiedades van de fondo.
const ASSET_POSITIONS = {
  // Vehículos — a los costados del avatar
  bicicleta: { bottom: 100,  left: "calc(50% - 220px)", width: 160,  zIndex: 3 },
  moto:      { bottom: 150,  left: "calc(50% - 500px)", width: 160, zIndex: 3 },
  carro:     { bottom: 30,  left: "calc(50% - 450px)", width: 240, zIndex: 2 },

  // Vivienda — al fondo, más arriba
  choza:     { bottom: 70, left: "calc(50% + 180px)", width: 150, zIndex: 1 },
  casa:      { bottom: 30, left: "calc(50% + 450px)", width: 200, zIndex: 1 },
  mansion:   { bottom: 250, left: "calc(50% + 260px)", width: 350, zIndex: 1 },
};

function OwnedAssets({ ownedMap }) {
  // ownedMap: { key: { quantity, mortgaged } }
  const entries = Object.entries(ownedMap).filter(([, info]) => info.quantity > 0);
  if (entries.length === 0) return null;

  return (
    <>
      {entries.map(([key, info]) => {
        const asset = ASSETS[key];
        const pos   = ASSET_POSITIONS[key];
        if (!asset || !pos) return null;

        return (
          <div
            key={key}
            title={`${asset.label}${info.quantity > 1 ? ` ×${info.quantity}` : ""}${info.mortgaged ? " (hipotecado)" : ""}`}
            style={{
              position: "absolute",
              bottom: pos.bottom,
              left: pos.left,
              width: pos.width,
              zIndex: pos.zIndex,
              filter: info.mortgaged
                ? "grayscale(0.7) brightness(0.6)"
                : "drop-shadow(0 8px 18px rgba(0,0,0,0.7))",
              transition: "filter 0.3s",
              animation: `floatAsset${key} 3s ease-in-out infinite`,
              cursor: "default",
            }}
          >
            <style>{`
              @keyframes floatAsset${key} {
                0%,100% { transform: translateY(0px); }
                50%      { transform: translateY(-5px); }
              }
            `}</style>

            <img
              src={asset.img}
              alt={asset.label}
              style={{ width: "100%", display: "block", objectFit: "contain" }}
              onError={e => {
                // Fallback: emoji grande si no carga la imagen
                e.target.style.display = "none";
                e.target.nextSibling.style.display = "flex";
              }}
            />

            {/* Fallback emoji */}
            <div style={{
              display: "none",
              alignItems: "center", justifyContent: "center",
              fontSize: pos.width * 0.45,
              lineHeight: 1,
              filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.8))",
            }}>
              {asset.icon}
            </div>

            {/* Badge cantidad si hay más de uno */}
            {info.quantity > 1 && (
              <div style={{
                position: "absolute",
                top: -6, right: -6,
                background: "#fbbf24", color: "#000",
                borderRadius: "50%", width: 22, height: 22,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 900,
                border: "2px solid #0d0d18",
                boxShadow: "0 2px 6px rgba(0,0,0,0.6)",
              }}>
                ×{info.quantity}
              </div>
            )}

            {/* Badge hipotecado */}
            {info.mortgaged && (
              <div style={{
                position: "absolute", bottom: -4, left: "50%",
                transform: "translateX(-50%)",
                background: "rgba(255,68,68,0.9)",
                borderRadius: 6, padding: "2px 7px",
                fontSize: 9, color: "#fff", fontWeight: 800,
                letterSpacing: 0.5,
                whiteSpace: "nowrap",
              }}>
                ⛓️ HIPOTECADO
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function PlayerSpace({ profile, balance, setBalance, deaths = 0, onBack, onDeath }) {
  const [panel, setPanel]       = useState(null);
  const [activeJob, setActiveJob] = useState(null);
  const [ownedAssets, setOwnedAssets] = useState({});   // { key: { quantity, mortgaged } }



  const [isInsolvent, setIsInsolvent] = useState(false);

// Cargar estado de insolvencia al montar y cuando cambia el balance
useEffect(() => {
  supabase
    .from("loans")
    .select("id")
    .eq("user_id", profile.id)
    .eq("status", "irrecoverable")
    .limit(1)
    .then(({ data }) => setIsInsolvent(data && data.length > 0));
}, [profile.id, balance]);








  // Cargar activos del jugador al montar
  useEffect(() => {
    async function loadAssets() {
      const { data } = await supabase
        .from("player_assets")
        .select("*")
        .eq("user_id", profile.id);

      if (data) {
        const map = {};
        data.forEach(a => {
          map[a.asset_key] = { quantity: a.quantity, mortgaged: a.mortgaged, id: a.id };
        });
        setOwnedAssets(map);
      }
    }
    loadAssets();
  }, [profile.id]);

  const togglePanel = (name) => setPanel(p => p === name ? null : name);

  const BONUS = 100000;
  const dep = profile.total_deposited || 0;
  const capitalBase = dep + BONUS;
  const neto = balance - capitalBase;
  const roi = capitalBase > 0 ? ((neto / capitalBase) * 100).toFixed(1) : "0.0";

  // Callback para cuando ShopPanel confirma una compra — sincroniza ownedAssets
  function handlePurchase({ asset }) {
    setOwnedAssets(prev => {
      const existing = prev[asset.key];
      return {
        ...prev,
        [asset.key]: {
          quantity: existing ? existing.quantity + 1 : 1,
          mortgaged: existing?.mortgaged || false,
          id: existing?.id,
        },
      };
    });
  }

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
        onError={e => { e.target.style.display = "none"; }}
      />

      {/* Overlay oscuro */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.55) 100%)",
        zIndex: 1,
      }} />

      {/* ── Activos poseídos flotando en el escenario ── */}
      <div style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none" }}>
        <OwnedAssets ownedMap={ownedAssets} />
      </div>

      {/* ── Contenido principal ── */}
      <div style={{ position: "relative", zIndex: 4, minHeight: "calc(100vh - 50px)", display: "flex", flexDirection: "column" }}>

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

          {/* Mini lista de activos poseídos bajo el avatar (si tiene alguno) */}
          {Object.keys(ownedAssets).length > 0 && (
            <div style={{
              display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center",
              maxWidth: 260, marginTop: 4,
            }}>
              {Object.entries(ownedAssets)
                .filter(([, info]) => info.quantity > 0)
                .map(([key, info]) => {
                  const asset = ASSETS[key];
                  if (!asset) return null;
                  return (
                    <div key={key} title={asset.label} style={{
                      background: "rgba(10,10,18,0.8)",
                      border: `1px solid ${info.mortgaged ? "#ff444444" : "#fbbf2433"}`,
                      borderRadius: 8, padding: "3px 9px",
                      fontSize: 12, color: info.mortgaged ? "#666" : "#ccc",
                      backdropFilter: "blur(8px)",
                      display: "flex", alignItems: "center", gap: 4,
                    }}>
                      <span>{asset.icon}</span>
                      {info.quantity > 1 && (
                        <span style={{ color: "#fbbf24", fontWeight: 700, fontSize: 11 }}>
                          ×{info.quantity}
                        </span>
                      )}
                      {info.mortgaged && <span style={{ fontSize: 10 }}>⛓️</span>}
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* ── Botones laterales izquierdos ── */}
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
          <SideBtn icon="🏦" label="Banco"   onClick={() => togglePanel("bank")}   active={panel === "bank"}   color="#60a5fa" />
          <SideBtn icon="🏪" label="Tienda" onClick={() => togglePanel("shop")}  active={panel === "shop"}  color="#fbbf24" />
          <SideBtn icon="📊" label="Stats"  onClick={() => togglePanel("stats")} active={panel === "stats"} color="#00d4aa" />
          <SideBtn icon="💼" label="Trabajo" onClick={() => togglePanel("work")}  active={panel === "work"}  color="#8b5cf6" />
        </div>

        {/* ── Contador de muertes ── */}
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
          <div onClick={() => setPanel(null)} style={{ position: "absolute", inset: 0, background: "transparent" }} />

          {/* ─ BANCO ─ */}
          {panel === "bank" && (
            <SidePanel title="Banco" icon="🏦" onClose={() => setPanel(null)}>
              <BankPanel
                profile={profile}
                balance={balance}
                setBalance={setBalance}
                onScChange={newSC => {}}


                onDeath={() => {
    setPanel(null);
    setOwnedAssets({});   // limpia activos del escenario
    if (onDeath) onDeath();
  }}


              />
            </SidePanel>
          )}

          {/* ─ TIENDA ─ */}
          {panel === "shop" && (
            <SidePanel title="Tienda" icon="🏪" onClose={() => setPanel(null)}>
              <ShopPanel
                profile={profile}
                balance={balance}
                setBalance={setBalance}
                onPurchase={handlePurchase}
              />
            </SidePanel>
          )}

          {/* ─ STATS ─ */}
          {panel === "stats" && (
            <SidePanel title="Mis Estadísticas" icon="📊" onClose={() => setPanel(null)}>
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
                    ["💰 Balance actual",    `${balance.toLocaleString()} fichas`],
                    ["📥 Total depositado",  `${dep.toLocaleString()} fichas`],
                    ["📊 Neto",             `${neto >= 0 ? "+" : ""}${neto.toLocaleString()}`],
                    ["📈 ROI",              `${parseFloat(roi) >= 0 ? "+" : ""}${roi}%`],
                    ["💀 Muertes",           deaths],
                    ["🏠 Activos",           Object.values(ownedAssets).reduce((a, b) => a + b.quantity, 0)],
                  ].map(([label, val], i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span style={{ color: "#777" }}>{label}</span>
                      <span style={{ color: "#ddd", fontWeight: 700 }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                Por juego
              </div>
              <PlayerStats userId={profile.id} />
            </SidePanel>
          )}



          {/* ─ TRABAJO ─ */}
          

                {panel === "work" && (
  <SidePanel title="Trabajar" icon="💼" onClose={() => setPanel(null)}>

    {/* Banner de bloqueo si está en quiebra irrecuperable */}
    {isInsolvent && (
      <div style={{
        background: "rgba(127,0,0,0.15)",
        border: "2px solid #ff000066",
        borderRadius: 10, padding: "12px 14px", marginBottom: 16,
        textAlign: "center",
      }}>
        <div style={{ fontSize: 22, marginBottom: 4 }}>☠️</div>
        <div style={{ color: "#ff4444", fontWeight: 900, fontSize: 14, marginBottom: 4 }}>
          QUIEBRA IRRECUPERABLE
        </div>
        <div style={{ color: "#ff8888", fontSize: 12, lineHeight: 1.5 }}>
          No puedes generar ingresos en este estado.<br />
          Ve al Banco y usa la opción "Colgarse".
        </div>
      </div>
    )}

    <div style={{ color: isInsolvent ? "#444" : "#ffffff", fontSize: 14, marginBottom: 16 }}>
      Juega y gana fichas reales. Cuanto mejor lo hagas, más cobras.
    </div>

    {[
      { id: "snake",        icon: "🐍", name: "Snake",         desc: "$1.000 por manzana",                   color: "#00d4aa" },
      { id: "dino",         icon: "🦕", name: "Dinosaur Game", desc: "$2.000 por cada 100 puntos",           color: "#fbbf24" },
      { id: "minesweeper",  icon: "💥", name: "Buscaminas",    desc: "Diferentes premios",                   color: "#ff6b35" },
      { id: "colordash",    icon: "🔺", name: "Color Dash",    desc: "$5.000 por objeto superado",           color: "#c084fc" },
      { id: "blockbreaker", icon: "🧱", name: "Block Breaker", desc: "$30.000 por nivel superado",           color: "#8b5cf6" },
      { id: "geometrix",    icon: "📐", name: "Geometrix",     desc: "$1'385.000 por completar los niveles", color: "#fbbf24" },
    ].map(job => (
      <div
        key={job.id}
        onClick={() => {
          if (isInsolvent) return;   // ← bloqueo
          setPanel(null);
          setActiveJob(job.id);
        }}
        style={{
          background: isInsolvent
            ? "rgba(13,13,20,0.5)"
            : `rgba(${job.color === "#00d4aa" ? "0,212,170" : job.color === "#fbbf24" ? "251,191,36" : job.color === "#ff6b35" ? "255,107,53" : job.color === "#c084fc" ? "192,132,252" : "139,92,246"},0.08)`,
          border: `1px solid ${isInsolvent ? "#2a2a3a" : job.color + "44"}`,
          borderRadius: 10, padding: "12px 14px", marginBottom: 10,
          display: "flex", alignItems: "center", gap: 12,
          cursor: isInsolvent ? "not-allowed" : "pointer",
          opacity: isInsolvent ? 0.4 : 1,
        }}
      >
        <span style={{ fontSize: 28 }}>{job.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ color: isInsolvent ? "#444" : job.color, fontWeight: 700, fontSize: 14 }}>{job.name}</div>
          <div style={{ color: "#555", fontSize: 12 }}>{job.desc}</div>
        </div>
        <div style={{
          background: isInsolvent ? "#1a1a26" : job.color,
          border: isInsolvent ? "1px solid #2a2a3a" : "none",
          borderRadius: 6, padding: "4px 10px",
          fontSize: 11,
          color: isInsolvent ? "#444" : ["#fbbf24", "#00d4aa", "#c084fc"].includes(job.color) ? "#000" : "#fff",
          fontWeight: 700,
        }}>
          {isInsolvent ? "🔒" : "▶ Jugar"}
        </div>
      </div>
    ))}
  </SidePanel>
)}



        </div>
      )}

      {/* ── Juegos activos ── */}
      {activeJob === "snake" && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "#080810", overflowY: "auto" }}>
          <SnakeGame balance={balance} setBalance={setBalance} onBack={() => setActiveJob(null)} />
        </div>
      )}
      {activeJob === "dino" && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "#080810", overflowY: "auto" }}>
          <DinoGame balance={balance} setBalance={setBalance} onBack={() => setActiveJob(null)} />
        </div>
      )}
      {activeJob === "minesweeper" && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "#080810", overflowY: "auto" }}>
          <MinesweeperGame balance={balance} setBalance={setBalance} onBack={() => setActiveJob(null)} />
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
      {activeJob === "geometrix" && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "#07070e", overflowY: "auto" }}>
          <Geometrix balance={balance} setBalance={setBalance} onBack={() => setActiveJob(null)} />
        </div>
      )}
    </div>
  );
}
