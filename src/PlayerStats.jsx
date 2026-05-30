import { useState, useEffect } from "react";
import { supabase } from "./supabase";

// ─── Colores por juego ────────────────────────────────────────────────────────
const GAME_COLORS = {
  blackjack:  "#00d4aa",
  slots:      "#ff6b35",
  mines:      "#491cff",
  spaceman:   "#8b5cf6",
  horses:     "#ef4444",
  chicken:    "#f59e0b",
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
// Usa agregación en el servidor para evitar el límite de 1000 filas de Supabase.
// count:exact + head:true  → solo el número, sin traer filas
// .select("alias:col.sum()")  → suma server-side, sin traer filas
export default function PlayerStats({ userId, layout = "grid" }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    async function load() {
      setLoading(true);

      const [
        bjRes,

        // ── Slots ──────────────────────────────────────────────────────────
        { count: slotsCount },           // total giros (sin limit de filas)
        slotsAgg,                        // suma de payout y free_spins

        // ── Mines ──────────────────────────────────────────────────────────
        { count: minesTotal },
        { count: minesWins },
        minesNetRes,

        // ── Spaceman ───────────────────────────────────────────────────────
        { count: spaceTotal },
        { count: spaceCrashes },
        spaceAgg,

        // ── Horse Race ─────────────────────────────────────────────────────
        { count: horsesTotal },
        { count: horsesWins },

        // ── Chicken Road ───────────────────────────────────────────────────
        chickenRes,
      ] = await Promise.all([
        // Blackjack — fila única, sin problema de límite
        supabase
          .from("blackjack_stats")
          .select("*")
          .eq("user_id", userId)
          .single(),

        // ── Slots ──────────────────────────────────────────────────────────
        supabase
          .from("slots_history")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId),

        supabase
          .from("slots_history")
          .select("total_payout:payout.sum(), total_free:free_spins.sum()")
          .eq("user_id", userId),

        // ── Mines ──────────────────────────────────────────────────────────
        supabase
          .from("mines_history")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId),

        supabase
          .from("mines_history")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .gt("delta", 0),

        supabase
          .from("mines_history")
          .select("total_net:delta.sum()")
          .eq("user_id", userId),

        // ── Spaceman ───────────────────────────────────────────────────────
        supabase
          .from("spaceman_history")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId),

        supabase
          .from("spaceman_history")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("crash", true),

        supabase
          .from("spaceman_history")
          .select("avg_mult:multiplier.avg(), total_net:net.sum()")
          .eq("user_id", userId),

        // ── Horses ─────────────────────────────────────────────────────────
        supabase
          .from("horserace_history")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId),

        supabase
          .from("horserace_history")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("won", true),

        // ── Chicken ────────────────────────────────────────────────────────
        supabase
          .from("chickenroad_stats")
          .select("hist_net")
          .eq("user_id", userId)
          .single(),
      ]);

      const bj = bjRes.data || { wins: 0, losses: 0, ties: 0, blackjacks: 0 };

      setStats({
        bj,
        slots: {
          giros:       slotsCount ?? 0,
          pagoTotal:   slotsAgg.data?.[0]?.total_payout ?? 0,
          tirosGratis: slotsAgg.data?.[0]?.total_free   ?? 0,
        },
        mines: {
          partidas:  minesTotal ?? 0,
          victorias: minesWins  ?? 0,
          netTotal:  minesNetRes.data?.[0]?.total_net ?? 0,
        },
        spaceman: {
          vuelos:      spaceTotal   ?? 0,
          crashes:     spaceCrashes ?? 0,
          multPromedio: spaceAgg.data?.[0]?.avg_mult != null
            ? Number(spaceAgg.data[0].avg_mult).toFixed(2)
            : "0.00",
          netTotal: spaceAgg.data?.[0]?.total_net ?? 0,
        },
        horses: {
          apuestas:  horsesTotal ?? 0,
          victorias: horsesWins  ?? 0,
        },
        chicken: {
          netTotal: chickenRes.data?.hist_net ?? 0,
        },
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

  const bjTotal   = stats.bj.wins + stats.bj.losses + stats.bj.ties;
  const bjWinRate = bjTotal > 0
    ? ((stats.bj.wins / bjTotal) * 100).toFixed(1)
    : "0.0";

  const minesWinRate = stats.mines.partidas > 0
    ? ((stats.mines.victorias / stats.mines.partidas) * 100).toFixed(1)
    : "0.0";

  const horsesWinRate = stats.horses.apuestas > 0
    ? ((stats.horses.victorias / stats.horses.apuestas) * 100).toFixed(1)
    : "0.0";

  const gridStyle = layout === "flex"
    ? { display: "flex", flexWrap: "wrap", gap: 10 }
    : { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 };

  return (
    <div style={gridStyle}>
      <StatBlock
        icon="🃏" title="Blackjack" color={GAME_COLORS.blackjack}
        rows={[
          ["Partidas",   bjTotal],
          ["Victorias",  `${stats.bj.wins} (${bjWinRate}%)`],
          ["Derrotas",   stats.bj.losses],
          ["Empates",    stats.bj.ties],
          ["Blackjacks", stats.bj.blackjacks],
        ]}
      />
      <StatBlock
        icon="🎰" title="Tragamonedas" color={GAME_COLORS.slots}
        rows={[
          ["Giros",       stats.slots.giros.toLocaleString()],
          ["Pago total",  Math.round(stats.slots.pagoTotal).toLocaleString()],
          ["Tiros gratis", stats.slots.tirosGratis.toLocaleString()],
        ]}
      />
      <StatBlock
        icon="💣" title="Mines" color={GAME_COLORS.mines}
        rows={[
          ["Partidas",   stats.mines.partidas.toLocaleString()],
          ["Victorias",  `${stats.mines.victorias.toLocaleString()} (${minesWinRate}%)`],
          ["Neto total", Math.round(stats.mines.netTotal).toLocaleString()],
        ]}
      />
      <StatBlock
        icon="🚀" title="Spaceman" color={GAME_COLORS.spaceman}
        rows={[
          ["Vuelos",    stats.spaceman.vuelos.toLocaleString()],
          ["Crashes",   stats.spaceman.crashes.toLocaleString()],
          ["×̄ prom.",  `×${stats.spaceman.multPromedio}`],
          ["Neto",      Math.round(stats.spaceman.netTotal).toLocaleString()],
        ]}
      />
      <StatBlock
        icon="🐎" title="Horse Race" color={GAME_COLORS.horses}
        rows={[
          ["Apuestas",  stats.horses.apuestas.toLocaleString()],
          ["Victorias", `${stats.horses.victorias.toLocaleString()} (${horsesWinRate}%)`],
        ]}
      />
      <StatBlock
        icon="🐔" title="Chicken Road" color={GAME_COLORS.chicken}
        rows={[
          ["Neto total", Math.round(stats.chicken.netTotal).toLocaleString()],
        ]}
      />
    </div>
  );
}
