//cat > /mnt/user-data/outputs/ShopPanel.jsx << 'ENDOFFILE'
import { useState, useEffect } from "react";
import { supabase } from "./supabase";

// ── Catálogo de activos ───────────────────────────────────────────────────────
export const ASSETS = {
  bicicleta: {
    key: "bicicleta", label: "Bicicleta", icon: "🚲",
    img: "/Bicicleta.png", category: "vehiculos",
    price: 200000, sc: 50, cdt: 0.2,
    desc: "Vehículo básico — gana movilidad y puntaje",
  },
  moto: {
    key: "moto", label: "Moto", icon: "🏍️",
    img: "/Moto.png", category: "vehiculos",
    price: 1500000, sc: 500, cdt: 2,
    desc: "Vehículo veloz — gran salto crediticio",
  },
  carro: {
    key: "carro", label: "Carro Lujoso", icon: "🚗",
    img: "/Carro.png", category: "vehiculos",
    price: 6000000, sc: 1000, cdt: 5,
    desc: "Símbolo de estatus",
  },
  jet: {
    key: "jet", label: "Jet privado", icon: "✈️",
    img: "/Jet.png", category: "vehiculos",
    price: 15000000, sc: 3400, cdt: 10,
    desc: "Lujos privados",
  },
  choza: {
    key: "choza", label: "Choza", icon: "🛖",
    img: "/Choza.png", category: "vivienda",
    price: 300000, sc: 50, cdt: 0.2,
    desc: "Primera propiedad — el inicio del camino",
  },
  casa: {
    key: "casa", label: "Casa de Santiago", icon: "🏠",
    img: "/Casa.png", category: "vivienda",
    price: 1500000, sc: 500, cdt: 5,
    desc: "Hogar propio — sólido historial crediticio",
  },
    cabaña: {
    key: "cabaña", label: "Cabaña", icon: "⛺",
    img: "/Cabaña.png", category: "vivienda",
    price: 6000000, sc: 1000, cdt: 10,
    desc: "Lugar vacacional propio",
  },
  mansion: {
    key: "mansion", label: "Mansión", icon: "🏰",
    img: "/Mansion.png", category: "vivienda",
    price: 40000000, sc: 10000, cdt: 50,     // estaba en 15 el aumento del CDT
    desc: "Propiedad de lujo — el pináculo del score",
  },
};

const CATEGORY_LABELS = { vehiculos: "🚗 Vehículos", vivienda: "🏠 Vivienda" };

// ── Lógica de descuento diario ────────────────────────────────────────────────
// Se genera una vez al día y es igual para todos los jugadores.
// Si no existe el registro de hoy, el primero que abra la tienda lo crea.
async function getTodayDiscount() {
  const today = new Date().toISOString().split("T")[0];
  const { data } = await supabase
    .from("daily_discounts")
    .select("*")
    .eq("date", today)
    .single();

  if (data) return data;

  // Generar descuento para hoy
  const rand = Math.random();
  const pct = rand < 0.05 ? 50 : rand < 0.30 ? 10 : 0;
  const category = Math.random() < 0.5 ? "vehiculos" : "vivienda";

  const newDiscount = { date: today, category: pct > 0 ? category : null, discount_pct: pct };
  const { data: inserted, error } = await supabase
    .from("daily_discounts")
    .insert(newDiscount)
    .select()
    .single();

  // Si hubo conflicto (otro jugador ya lo creó al mismo tiempo), releer
  if (error) {
    const { data: retry } = await supabase
      .from("daily_discounts").select("*").eq("date", today).single();
    return retry;
  }
  return inserted;
}

// ── Componente ShopPanel ──────────────────────────────────────────────────────
export default function ShopPanel({ profile, balance, setBalance, onPurchase }) {
  const [discount, setDiscount]     = useState(null);   // { category, discount_pct }
  const [assets, setAssets]         = useState({});     // { key: { quantity, mortgaged } }
  const [creditScore, setCreditScore] = useState(profile.credit_score || 0);
  const [loading, setLoading]       = useState(true);
  const [buying, setBuying]         = useState(null);   // key del activo en proceso
  const [msg, setMsg]               = useState(null);   // { text, ok }
  const [activeTab, setActiveTab]   = useState("vehiculos");

  // Cargar descuento del día + activos del jugador
  useEffect(() => {
    async function load() {
      const [disc, { data: playerAssets }] = await Promise.all([
        getTodayDiscount(),
        supabase.from("player_assets").select("*").eq("user_id", profile.id),
      ]);
      setDiscount(disc);
      // Agrupar activos por key
      const map = {};
      (playerAssets || []).forEach(a => {
        map[a.asset_key] = { quantity: a.quantity, mortgaged: a.mortgaged, id: a.id };
      });
      setAssets(map);
      setLoading(false);
    }
    load();
  }, [profile.id]);

  function getDiscountedPrice(asset) {
    if (!discount || discount.discount_pct === 0) return asset.price;
    if (discount.category !== asset.category) return asset.price;
    return Math.round(asset.price * (1 - discount.discount_pct / 100));
  }

  async function buyAsset(asset) {
    const existing   = assets[asset.key];


    if (existing && existing.quantity >= 1) {
    setMsg({ text: `❌ Ya tienes una ${asset.label}`, ok: false });
    return;
  }
    
    const finalPrice = getDiscountedPrice(asset);
    if (balance < finalPrice) {
      setMsg({ text: "❌ Saldo insuficiente", ok: false });
      return;
    }
    setBuying(asset.key);

    const newBalance = balance - finalPrice;
    const newScore   = creditScore + asset.sc;
    //const existing   = assets[asset.key];

    // Actualizar balance y credit_score en profiles
    await supabase.from("profiles")
      .update({ balance: newBalance, credit_score: newScore })
      .eq("id", profile.id);

    // Insertar o actualizar el activo en player_assets
    if (existing) {
      await supabase.from("player_assets")
        .update({ quantity: existing.quantity + 1 })
        .eq("id", existing.id);
      setAssets(prev => ({
        ...prev,
        [asset.key]: { ...prev[asset.key], quantity: existing.quantity + 1 },
      }));
    } else {
      const { data: newAsset } = await supabase.from("player_assets")
        .insert({ user_id: profile.id, asset_key: asset.key, quantity: 1, mortgaged: false })
        .select().single();
      setAssets(prev => ({
        ...prev,
        [asset.key]: { quantity: 1, mortgaged: false, id: newAsset?.id },
      }));
    }

    setBalance(newBalance);
    setCreditScore(newScore);
    setMsg({ text: `✅ ¡${asset.label} comprado! +${asset.sc} SC`, ok: true });
    if (onPurchase) onPurchase({ asset, newBalance, newScore });
    setBuying(null);
    setTimeout(() => setMsg(null), 3500);
  }

  if (loading) return (
    <div style={{ padding: 24, textAlign: "center", color: "#555" }}>
      Cargando tienda...
    </div>
  );

  const discountActive = discount?.discount_pct > 0;
  const isSuper = discount?.discount_pct === 50;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Score crediticio ── */}
      <div style={{
        background: "rgba(251,191,36,0.07)",
        border: "1px solid #fbbf2433",
        borderRadius: 12, padding: "10px 14px",
      }}>
        <div style={{ fontSize: 15, color: "#00ffff", letterSpacing: 1, marginBottom: 6, textTransform: "uppercase" }}>
          Score Crediticio
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ height: 8, borderRadius: 4, background: "#1e1e2e", overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 4,
                width: `${Math.min(100, (creditScore / 10000) * 100)}%`,
                background: creditScore >= 5000 ? "#00d4aa"
                  : creditScore >= 2000 ? "#fbbf24"
                  : creditScore >= 500  ? "#8b5cf6"
                  : "#ff6b35",
                transition: "width 0.5s",
              }} />
            </div>
            <div style={{ fontSize: 12, color: "#ffffff", marginTop: 3 }}>
              {creditScore < 500 ? "Básico" : creditScore < 2000 ? "Bronce" : creditScore < 5000 ? "Plata" : creditScore < 10000 ? "Oro" : "Platino"}
            </div>
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#fbbf24" }}>
            {creditScore.toLocaleString()}
          </div>
        </div>
      </div>

      {/* ── Banner de descuento ── */}
      {discountActive ? (
        <div style={{
          background: isSuper ? "rgba(255,68,68,0.12)" : "rgba(0,212,170,0.10)",
          border: `1px solid ${isSuper ? "#ff444466" : "#00d4aa44"}`,
          borderRadius: 10, padding: "10px 14px",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 18, marginBottom: 2 }}>
            {isSuper ? "🔥 SUPER DESCUENTO" : "🏷️ DESCUENTO DEL DÍA"}
          </div>
          <div style={{
            fontSize: 25, fontWeight: 900,
            color: isSuper ? "#ff4444" : "#00d4aa",
          }}>
            -{discount.discount_pct}% en {CATEGORY_LABELS[discount.category]}
          </div>
          <div style={{ fontSize: 15, color: "#ffffff", marginTop: 3 }}>
            Solo hoy · igual para todos los jugadores
          </div>
        </div>
      ) : (
        <div style={{
          background: "rgba(13,13,20,0.7)", border: "1px solid #1e1e2e",
          borderRadius: 10, padding: "8px 14px", textAlign: "center",
          fontSize: 15, color: "#ffffff",
        }}>
          Sin descuento hoy — vuelve mañana para nuevas ofertas
        </div>
      )}

      {/* ── Mensaje de compra ── */}
      {msg && (
        <div style={{
          background: msg.ok ? "rgba(0,212,170,0.1)" : "rgba(255,68,68,0.1)",
          border: `1px solid ${msg.ok ? "#00d4aa44" : "#ff444444"}`,
          borderRadius: 8, padding: "8px 12px",
          fontSize: 15, color: msg.ok ? "#00d4aa" : "#ff6666",
          fontWeight: 700, textAlign: "center",
        }}>
          {msg.text}
        </div>
      )}

      {/* ── Tabs de categoría ── */}
      <div style={{ display: "flex", gap: 8 }}>
        {["vehiculos", "vivienda"].map(cat => (
          <button key={cat} onClick={() => setActiveTab(cat)} style={{
            flex: 1, padding: "8px",
            background: activeTab === cat ? "rgba(251,191,36,0.12)" : "rgba(13,13,20,0.8)",
            border: `1px solid ${activeTab === cat ? "#fbbf2466" : "#2a2a3a"}`,
            borderRadius: 8, color: activeTab === cat ? "#fbbf24" : "#666",
            fontSize: 15, fontWeight: 700, cursor: "pointer",
          }}>
            {CATEGORY_LABELS[cat]}
            {discountActive && discount.category === cat && (
              <span style={{ marginLeft: 4, color: isSuper ? "#ff4444" : "#00d4aa" }}>
                -{discount.discount_pct}%
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Lista de activos ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {Object.values(ASSETS)
          .filter(a => a.category === activeTab)
          .map(asset => {
            const owned    = assets[asset.key];
            const finalPrice = getDiscountedPrice(asset);
            const hasDiscount = finalPrice < asset.price;
            const canAfford = balance >= finalPrice;
            const isBuying  = buying === asset.key;
            
            const alreadyOwned = owned && owned.quantity >= 1;



            return (
              <div key={asset.key} style={{
                background: "rgba(13,13,20,0.9)",
                border: `1px solid ${owned ? "#fbbf2433" : "#1e1e2e"}`,
                borderRadius: 12, overflow: "hidden",
              }}>
                {/* Imagen + info */}
                <div style={{ display: "flex", gap: 12, padding: "12px 14px", alignItems: "center" }}>
                  {/* Imagen del activo */}
                  <div style={{
                    width: 64, height: 64, flexShrink: 0,
                    borderRadius: 10, overflow: "hidden",
                    background: "#0d0d18",
                    border: "1px solid #2a2a3a",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    position: "relative",
                  }}>
                    <img
                      src={asset.img}
                      alt={asset.label}
                      style={{ width: "100%", height: "100%", objectFit: "contain" }}
                      onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}
                    />
                    <div style={{
                      display: "none", fontSize: 28,
                      position: "absolute", inset: 0,
                      alignItems: "center", justifyContent: "center",
                    }}>{asset.icon}</div>
                    {/* Badge cantidad */}
                    {owned && (
                      <div style={{
                        position: "absolute", top: -4, right: -4,
                        background: "#fbbf24", color: "#000",
                        borderRadius: "50%", width: 18, height: 18,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 10, fontWeight: 900,
                        border: "1.5px solid #0d0d18",
                      }}>
                        {owned.quantity}
                      </div>
                    )}
                    {/* Badge hipotecado */}
                    {owned?.mortgaged && (
                      <div style={{
                        position: "absolute", inset: 0,
                        background: "rgba(0,0,0,0.7)",
                        display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center",
                        fontSize: 8, color: "#ff4444", fontWeight: 900,
                        letterSpacing: 0.5,
                      }}>
                        <div>⛓️</div>
                        <div>HIPO-</div>
                        <div>TECADO</div>
                      </div>
                    )}
                  </div>

                  {/* Texto */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#ddd", marginBottom: 2 }}>
                      {asset.label}
                      {owned && (
                        <span style={{ marginLeft: 6, color: "#fbbf24", fontSize: 12 }}>
                          ×{owned.quantity}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: "#ffffff", marginBottom: 4, lineHeight: 1.4 }}>
                      {asset.desc}
                    </div>
                    {/* Bonos */}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span style={{
                        background: "#fbbf2415", border: "1px solid #fbbf2433",
                        borderRadius: 4, padding: "2px 6px",
                        fontSize: 12, color: "#fbbf24",
                      }}>
                        +{asset.sc} SC
                      </span>
                      <span style={{
                        background: "#00d4aa15", border: "1px solid #00d4aa33",
                        borderRadius: 4, padding: "2px 6px",
                        fontSize: 12, color: "#00d4aa",
                      }}>
                        +{asset.cdt}% CDT
                      </span>
                    </div>
                  </div>

                  {/* Precio + botón */}
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    {hasDiscount && (
                      <div style={{ fontSize: 14, color: "#a0a0a0", textDecoration: "line-through" }}>
                        ${asset.price.toLocaleString()}
                      </div>
                    )}
                    <div style={{
                      fontSize: 16, fontWeight: 800,
                      color: hasDiscount ? (isSuper ? "#ff4444" : "#00d4aa") : "#fff",
                      marginBottom: 6,
                    }}>
                      ${finalPrice.toLocaleString()}
                    </div>

{/*Cambia estas líneas en el botón:
const alreadyOwned = owned && owned.quantity >= 1;*/}

<button
  onClick={() => !isBuying && canAfford && !alreadyOwned && buyAsset(asset)}
  disabled={isBuying || !canAfford || alreadyOwned}
  style={{
    background: isBuying ? "#333"
      : alreadyOwned ? "#1a1a26"        // ← nuevo
      : !canAfford ? "#1a1a26"
      : hasDiscount ? (isSuper ? "#ff4444" : "#00d4aa")
      : "#fbbf24",
    // ... resto igual
    color: (!canAfford || alreadyOwned) ? "#444" : "#000",
    cursor: canAfford && !isBuying && !alreadyOwned ? "pointer" : "not-allowed",
  }}
>
  {isBuying ? "..." : alreadyOwned ? "Ya tienes 1" : !canAfford ? "Sin saldo" : "Comprar"}
</button>
                  </div>
                </div>

                {/* Barra de mora si hipotecado */}
                {owned?.mortgaged && (
                  <div style={{
                    background: "rgba(255,68,68,0.08)",
                    borderTop: "1px solid #ff444422",
                    padding: "6px 14px",
                    fontSize: 15, color: "#ff6666",
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    ⛓️ Hipotecado — paga tu deuda para liberar este activo
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* ── Resumen de activos poseídos ── */}
      {Object.keys(assets).length > 0 && (
        <div style={{
          background: "rgba(13,13,20,0.7)", border: "1px solid #1e1e2e",
          borderRadius: 10, padding: "10px 14px",
        }}>
          <div style={{ fontSize: 15, color: "#e1ff00", letterSpacing: 1, marginBottom: 8, textTransform: "uppercase" }}>
            Mis activos
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Object.entries(assets).map(([key, info]) => {
              const a = ASSETS[key];
              if (!a || info.quantity === 0) return null;
              return (
                <div key={key} style={{
                  background: info.mortgaged ? "rgba(255,68,68,0.08)" : "rgba(251,191,36,0.06)",
                  border: `1px solid ${info.mortgaged ? "#ff444433" : "#fbbf2422"}`,
                  borderRadius: 8, padding: "6px 10px",
                  display: "flex", alignItems: "center", gap: 6,
                  opacity: info.mortgaged ? 0.7 : 1,
                }}>
                  <span style={{ fontSize: 16 }}>{a.icon}</span>
                  <span style={{ fontSize: 15, color: "#bbb" }}>{a.label}</span>
                  <span style={{
                    background: "#fbbf24", color: "#000",
                    borderRadius: 10, padding: "1px 6px",
                    fontSize: 12, fontWeight: 900,
                  }}>×{info.quantity}</span>
                  {info.mortgaged && <span style={{ fontSize: 14 }}>⛓️</span>}
                </div>
              );
            })}
          </div>

          {/* CDT total */}
          <div style={{ marginTop: 10, fontSize: 15, color: "#b2b2b2" }}>
            Bonificación CDT total:{" "}
            <span style={{ color: "#00d4aa", fontWeight: 700 }}>
              +{Object.entries(assets).reduce((acc, [key, info]) => {
                const a = ASSETS[key];
                if (!a || info.mortgaged) return acc;
                return acc + a.cdt * info.quantity;
              }, 0).toFixed(1)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
//ENDOFFILE
