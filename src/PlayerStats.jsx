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

// ─── Config CrazyTime ────────────────────────────────────────────────────────
const CT_TYPES  = ["1","2","5","10","coin_flip","cash_hunt","pachinko","crazy_time"];
const CT_LABELS = { "1":"1","2":"2","5":"5","10":"10","coin_flip":"Coin Flip","cash_hunt":"Cash Hunt","pachinko":"Pachinko","crazy_time":"Crazy Time" };
const CT_EMOJIS = { "1":"1️⃣","2":"2️⃣","5":"5️⃣","10":"🔟","coin_flip":"🪙","cash_hunt":"🎯","pachinko":"🎳","crazy_time":"🎡" };
const CT_COLORS = { "1":"#3a7bd5","2":"#f7c948","5":"#7ed321","10":"#d0021b","coin_flip":"#e84393","cash_hunt":"#f5a623","pachinko":"#9b59b6","crazy_time":"#ff6b00" };
const CT_BONUSES = ["coin_flip","cash_hunt","pachinko","crazy_time"];

// ─── Bloque de estadísticas genérico ─────────────────────────────────────────
function StatBlock({ icon, title, rows, color }) {
  return (
    <div style={{
      background: "rgba(13,13,20,0.85)",
      border: `1px solid ${color}44`,
      borderRadius: 10,
      padding: "10px 14px",
    }}>
      <div style={{ color, fontWeight: 700, fontSize: 20, marginBottom: 8 }}>
        {icon} {title}
      </div>
      {rows.map(([label, val], i) => (
        <div key={i} style={{
          display: "flex", justifyContent: "space-between",
          fontSize: 15, marginBottom: 3,
        }}>
          <span style={{ color: "#b2b2b2" }}>{label}</span>
          <span style={{ color: "#ddd", fontWeight: 600 }}>{val}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Bloque CrazyTime ────────────────────────────────────────────────────────
function CrazyTimeBlock({ ct }) {
  if (!ct || ct.totalSpins === 0) return (
    <div style={{
      gridColumn: "span 2",
      background: "rgba(13,13,20,0.85)",
      border: "1px solid #ff6b0033",
      borderRadius: 10, padding: "10px 14px",
    }}>
      <div style={{ color: "#ff6b00", fontWeight: 700, fontSize: 20, marginBottom: 4 }}>
        💥 Crazy Time
      </div>
      <div style={{ color: "#444", fontSize: 15 }}>Sin giros registrados aún.</div>
    </div>
  );

  return (
    <div style={{
      gridColumn: "span 2",
      background: "rgba(13,13,20,0.85)",
      border: "1px solid #ff6b0044",
      borderRadius: 10, padding: "10px 14px",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      {/* Título */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ color: "#ff6b00", fontWeight: 700, fontSize: 20 }}>
          💥 Crazy Time
        </div>
        <div style={{ color: "#cbcbcb", fontSize: 14 }}>
          {ct.totalSpins} giro{ct.totalSpins !== 1 ? "s" : ""} registrado{ct.totalSpins !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Proporciones */}
      <div>
        <div style={{ fontSize: 15, color: "#d9d9d9", textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>
          Proporción por segmento
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {CT_TYPES.map(s => {
            const count = ct.segCounts[s] || 0;
            const pct   = ct.totalSpins > 0 ? ((count / ct.totalSpins) * 100).toFixed(1) : "0.0";
            return (
              <div key={s} style={{
                background: CT_COLORS[s] + "18",
                border: `1px solid ${CT_COLORS[s]}55`,
                borderRadius: 6, padding: "2px 7px",
                display: "flex", alignItems: "center", gap: 3,
              }}>
                <span style={{ fontSize: 15 }}>{CT_EMOJIS[s]}</span>
                <span style={{ color: CT_COLORS[s], fontWeight: 700, fontSize: 16 }}>{pct}%</span>
                <span style={{ color: "#d4d4d4", fontSize: 14 }}>({count})</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Spins since last hit */}
      <div>
        <div style={{ fontSize: 12, color: "#ffffff", textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>
          Giros desde última aparición
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {CT_TYPES.map(s => {
            const since  = ct.spinsSince[s]; // -1 = nunca, 0 = último giro
            const isHot  = since === 0;
            const isCold = since > 10 || since === -1;
            return (
              <div key={s} style={{
                background: isHot ? "#00d4aa18" : isCold ? "#ff444418" : "#1e1e2e",
                border: `1px solid ${isHot ? "#00d4aa" : isCold ? "#ff4444" : "#2a2a3a"}`,
                borderRadius: 6, padding: "2px 8px",
                display: "flex", alignItems: "center", gap: 4,
              }}>
                <span style={{ fontSize: 16 }}>{CT_EMOJIS[s]}</span>
                <span style={{
                  color: isHot ? "#00d4aa" : isCold ? "#ff6666" : "#aaa",
                  fontWeight: 700, fontSize: 16,
                }}>
                  {since === -1 ? "—" : since === 0 ? "Salió" : `${since}`}
                </span>
              </div>
            );
          })}
        </div>
        <div style={{ color: "#ffffff", fontSize: 14, marginTop: 4 }}>
          Verde = salió en el último giro · Rojo = &gt;10 giros sin aparecer · Número = giros desde la última vez
        </div>
      </div>

      {/* Max multiplicador por bonus */}
      <div>
        <div style={{ fontSize: 14, color: "#f5f5f5", textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>
          Multiplicador máximo registrado por bonus
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {CT_BONUSES.map(b => (
            <div key={b} style={{
              background: CT_COLORS[b] + "18",
              border: `1px solid ${CT_COLORS[b]}55`,
              borderRadius: 6, padding: "4px 10px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
            }}>
              <span style={{ color: CT_COLORS[b], fontWeight: 700, fontSize: 16 }}>
                {CT_EMOJIS[b]} {CT_LABELS[b]}
              </span>
              <span style={{ color: "#fbbf24", fontWeight: 900, fontSize: 16 }}>
                {ct.maxMult[b] > 0 ? `${ct.maxMult[b]}x` : "—"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}



  async function fetchAllCT(userId) {
  const PAGE = 10000; // ajustar según necesidad (máx 10000 por consulta)
  let from = 0, all = [];
  while (true) {
    const { data, error } = await supabase
      .from("crazytime_history")
      .select("segment, won, payout, multiplier, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(PAGE)
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;   // última página
    from += PAGE;
  }
  return all;
}













// ─── Componente principal ─────────────────────────────────────────────────────
export default function PlayerStats({ userId, layout = "grid" }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    async function load() {
      setLoading(true);





        const [bjRes, slotsRes, minesRes, spaceRes, horsesRes, chickenRes] =
        await Promise.all([
      supabase.from("blackjack_stats").select("wins, losses, ties, blackjacks").eq("user_id", userId).single(),
      supabase.rpc("get_slots_stats",    { p_user_id: userId }),
      supabase.rpc("get_mines_stats",    { p_user_id: userId }),
      supabase.rpc("get_spaceman_stats", { p_user_id: userId }),
      supabase.rpc("get_horses_stats",   { p_user_id: userId }),
      supabase.from("chickenroad_stats").select("hist_net").eq("user_id", userId).single(),
    ]);
    const ctRows = await fetchAllCT(userId);






    /*
      const [bjRes, slotsRes, minesRes, spaceRes, horsesRes, chickenRes, ctRes] =
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

          // CrazyTime: máx 100 registros por el trim, sin problema de row limit
          supabase
            .from("crazytime_history")
            .select("segment, won, payout, multiplier, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false }),
            
        ]);
*/
      const bj     = bjRes.data    ?? { wins: 0, losses: 0, ties: 0, blackjacks: 0 };
      const slots  = slotsRes.data  ?? { giros: 0, pago_total: 0, tiros_gratis: 0 };
      const mines  = minesRes.data  ?? { partidas: 0, victorias: 0, net_total: 0 };
      const space  = spaceRes.data  ?? { vuelos: 0, crashes: 0, mult_promedio: 0, net_total: 0 };
      const horses = horsesRes.data ?? { apuestas: 0, victorias: 0 };

      // ── CrazyTime: calcular stats localmente ──────────────────────────────
      //const ctRows = ctRes.data || [];

      const segCounts = {};
      ctRows.forEach(r => {
        segCounts[r.segment] = (segCounts[r.segment] || 0) + 1;
      });

      const spinsSince = {};
      CT_TYPES.forEach(s => {
        spinsSince[s] = ctRows.findIndex(r => r.segment === s); // -1 = nunca
      });

      const maxMult = {};
      CT_BONUSES.forEach(b => {
        const rows = ctRows.filter(r => r.segment === b && (r.multiplier || 0) > 0);
        maxMult[b] = rows.length > 0 ? Math.max(...rows.map(r => r.multiplier)) : 0;
      });

      setStats({
        bj, slots, mines, space, horses,
        chicken: { netTotal: chickenRes.data?.hist_net ?? 0 },
        crazytime: {
          totalSpins: ctRows.length,
          segCounts,
          spinsSince,
          maxMult,
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

  const { bj, slots, mines, space, horses, chicken, crazytime } = stats;

  const bjTotal       = bj.wins + bj.losses + bj.ties;
  const bjWinRate     = bjTotal > 0 ? ((bj.wins / bjTotal) * 100).toFixed(1) : "0.0";
  const minesWinRate  = mines.partidas > 0 ? ((mines.victorias / mines.partidas) * 100).toFixed(1) : "0.0";
  const horsesWinRate = horses.apuestas > 0 ? ((horses.victorias / horses.apuestas) * 100).toFixed(1) : "0.0";

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

      {/* CrazyTime — ocupa las 2 columnas */}
      <CrazyTimeBlock ct={crazytime} />
    </div>
  );
}
