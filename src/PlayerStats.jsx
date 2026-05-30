import { useState, useEffect } from "react";
import { supabase } from "./supabase";

// ─── Colores por juego ────────────────────────────────────────────────────────
const GAME_COLORS = {
  blackjack: "#00d4aa",
  slots:     "#ff6b35",
  mines:     "#491cff",
  spaceman:  "#8b5cf6",
  horses:    "#ef4444",
  chicken:   "#f59e0b",
};

// ─── Bloque de estadísticas ───────────────────────────────────────────────────
function StatBlock({ icon, title, rows, color }) {
  return (
    <div style={{
      background: "rgba(13,13,20,0.85)",
      border: `1px solid ${color}44`,
      borderRadius: 10,
      padding: "10px 14px",
    }}>
      <div style={{ color, fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
        {icon} {title}
      </div>
      {rows.map(([label, val], i) => (
        <div key={i} style={{
          display: "flex", justifyContent: "space-between",
          fontSize: 12, marginBottom: 3,
        }}>
          <span style={{ color: "#777" }}>{label}</span>
          <span style={{ color: "#ddd", fontWeight: 600 }}>{val}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
// Usa funciones RPC de Supabase (SQL SECURITY DEFINER) para calcular todo
// en el servidor. Sin límite de 1000 filas, sin traer datos innecesarios.
//
// Requiere haber ejecutado supabase_stats_functions.sql en el SQL Editor.
//
// Props:
//   userId  — UUID del jugador
//   layout  — "grid" (2 columnas, default) | "flex" (wrap horizontal)
export default function PlayerStats({ userId, layout = "grid" }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    async function load() {
      setLoading(true);

      // Todas las queries en paralelo.
      // Las 4 de juego usan .rpc() → función SQL en el servidor, sin row limit.
      // Blackjack y Chicken son filas únicas, sin problema de límite.
      const [bjRes, slotsRes, minesRes, spaceRes, horsesRes, chickenRes] =
        await Promise.all([
          supabase
            .from("blackjack_stats")
            .select("wins, losses, ties, blackjacks")
            .eq("user_id", userId)
            .single(),

          supabase.rpc("get_slots_stats",    { p_user_id: userId }),
          supabase.rpc("get_mines_stats",    { p_user_id: userId }),
          supabase.rpc("get_spaceman_stats", { p_user_id: userId }),
          supabase.rpc("get_horses_stats",   { p_user_id: userId }),

          supabase
            .from("chickenroad_stats")
            .select("hist_net")
            .eq("user_id", userId)
            .single(),
        ]);

      // Cada RPC devuelve { data: { campo: valor, ... }, error }
      const bj    = bjRes.data    ?? { wins: 0, losses: 0, ties: 0, blackjacks: 0 };
      const slots  = slotsRes.data  ?? { giros: 0, pago_total: 0, tiros_gratis: 0 };
      const mines  = minesRes.data  ?? { partidas: 0, victorias: 0, net_total: 0 };
      const space  = spaceRes.data  ?? { vuelos: 0, crashes: 0, mult_promedio: 0, net_total: 0 };
      const horses = horsesRes.data ?? { apuestas: 0, victorias: 0 };

      setStats({ bj, slots, mines, space, horses,
        chicken: { netTotal: chickenRes.data?.hist_net ?? 0 },
      });
      setLoading(false);
    }

    load();
  }, [userId]);

  if (loading) return (
    <div style={{ color: "#aaa", fontSize: 13, padding: 16, textAlign: "center" }}>
      Cargando estadísticas...
    </div>
  );
  if (!stats) return null;

  // ── Derivados ───────────────────────────────────────────────────────────────
  const { bj, slots, mines, space, horses, chicken } = stats;

  const bjTotal      = bj.wins + bj.losses + bj.ties;
  const bjWinRate    = bjTotal > 0 ? ((bj.wins / bjTotal) * 100).toFixed(1) : "0.0";
  const minesWinRate = mines.partidas > 0
    ? ((mines.victorias / mines.partidas) * 100).toFixed(1) : "0.0";
  const horsesWinRate = horses.apuestas > 0
    ? ((horses.victorias / horses.apuestas) * 100).toFixed(1) : "0.0";

  const gridStyle = layout === "flex"
    ? { display: "flex", flexWrap: "wrap", gap: 10 }
    : { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 };

  return (
    <div style={gridStyle}>
      <StatBlock
        icon="🃏" title="Blackjack" color={GAME_COLORS.blackjack}
        rows={[
          ["Partidas",   bjTotal],
          ["Victorias",  `${bj.wins} (${bjWinRate}%)`],
          ["Derrotas",   bj.losses],
          ["Empates",    bj.ties],
          ["Blackjacks", bj.blackjacks],
        ]}
      />
      <StatBlock
        icon="🎰" title="Tragamonedas" color={GAME_COLORS.slots}
        rows={[
          ["Giros",        Number(slots.giros).toLocaleString()],
          ["Pago total",   Math.round(slots.pago_total).toLocaleString()],
          ["Tiros gratis", Number(slots.tiros_gratis).toLocaleString()],
        ]}
      />
      <StatBlock
        icon="💣" title="Mines" color={GAME_COLORS.mines}
        rows={[
          ["Partidas",   Number(mines.partidas).toLocaleString()],
          ["Victorias",  `${Number(mines.victorias).toLocaleString()} (${minesWinRate}%)`],
          ["Neto total", Math.round(mines.net_total).toLocaleString()],
        ]}
      />
      <StatBlock
        icon="🚀" title="Spaceman" color={GAME_COLORS.spaceman}
        rows={[
          ["Vuelos",   Number(space.vuelos).toLocaleString()],
          ["Crashes",  Number(space.crashes).toLocaleString()],
          ["×̄ prom.", `×${Number(space.mult_promedio).toFixed(2)}`],
          ["Neto",     Math.round(space.net_total).toLocaleString()],
        ]}
      />
      <StatBlock
        icon="🐎" title="Horse Race" color={GAME_COLORS.horses}
        rows={[
          ["Apuestas",  Number(horses.apuestas).toLocaleString()],
          ["Victorias", `${Number(horses.victorias).toLocaleString()} (${horsesWinRate}%)`],
        ]}
      />
      <StatBlock
        icon="🐔" title="Chicken Road" color={GAME_COLORS.chicken}
        rows={[
          ["Neto total", Math.round(chicken.netTotal).toLocaleString()],
        ]}
      />
    </div>
  );
}
