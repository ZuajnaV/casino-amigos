import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";
import RouletteGame from "./Roulette.jsx";
import BlackjackGame from "./Blackjack.jsx";
import MinesGames from "./Mines.jsx";
import SpacemanGame from "./Spaceman.jsx";
import ChickenRoadGame from "./ChickenRoad.jsx";
import HorseRace from "./HorseRace.jsx";
import SlotsGame from "./Slots.jsx";
import CrazyTimeGame from "./CrazyTime.jsx";
import PlayerSpace from "./Playerspace.jsx";
import PlayerStats from "./PlayerStats.jsx";


const GAMES = [
  { id: "slots",       name: "Tragamonedas",  icon: "🎰", desc: "Tira y cruza los dedos",                       color: "#ff6b35" },
  { id: "blackjack",   name: "Blackjack",     icon: "🃏", desc: "Planta o pide. 21 gana.",                       color: "#00d4aa" },
  { id: "roulette",    name: "Ruleta",        icon: "🎡", desc: "Rojo, negro o tu número de la suerte",           color: "#c084fc" },
  { id: "mines",       name: "Mines",         icon: "💣", desc: "Encuentra las minas sin explotar",              color: "#491cff" },
  { id: "spaceman",    name: "Spaceman",      icon: "🚀", desc: "Explora el espacio y evita estrellar",           color: "#8b5cf6" },
  { id: "chickenroad", name: "Chicken Road",  icon: "🐔", desc: "Corre por la carretera y evita los obstáculos",  color: "#f59e0b" },
  { id: "horses",      name: "Horse Race",    icon: "🐎", desc: "Apuesta en la carrera de caballos",              color: "#ef4444" },
  { id: "crazytime",   name: "Crazy Time",    icon: "💥🎆🎡🎆💥", desc: "¡El juego más loco del casino!",                color: "#f97316" },
];

const AVATARS = ["🎩","💃","🕶️","👑","🎭","🦊","🐯","🎪","🃏","🎲","😈","🗿","🚨","🗽","🛸","🛰️"];



function Lobby({ profile, balance, setGame, onDeposit }) {
  const [profiles, setProfiles] = useState([]);
  const [showDeposit, setShowDeposit] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositLoading, setDepositLoading] = useState(false);
  const [showStats, setShowStats] = useState(false);   // ← nuevo





  // En Lobby, junto a los otros useState:
const [marketToday, setMarketToday] = useState(null);

useEffect(() => {
  const today = new Date().toISOString().split("T")[0];
  supabase.from("market_daily").select("*").eq("date", today).single()
    .then(({ data }) => setMarketToday(data));
}, []);




/* Antes, el useEffect para cargar el ranking era así:

  useEffect(() => {
  //supabase.from("profiles").select("username, avatar, balance, total_deposited, deaths")
  supabase.from("profiles").select("username, avatar, balance, total_deposited, deaths, credit_score")
    .then(({ data }) => {
      if (data) {
        const BONUS = 100000;
        const sorted = data
          .map(u => {
            const dep = u.total_deposited || 0;
            const capitalBase = dep + BONUS;
            const neto = u.balance - capitalBase;
            const roi = (neto / capitalBase) * 100;
            return { ...u, neto, roi, dep };
          })
          .sort((a, b) => b.roi - a.roi); // sin .filter() — todos aparecen
        setProfiles(sorted);
      }
    });
}, [balance]);


*/  





  useEffect(() => {
  async function loadRanking() {
    const [{ data: profiles }, { data: assets }, { data: loans }] = await Promise.all([
      supabase.from("profiles").select("id, username, avatar, balance, deaths, credit_score"),
      supabase.from("player_assets").select("user_id, asset_key, quantity, mortgaged"),
      supabase.from("loans").select("user_id, total_debt, paid_amount").eq("status", "active"),
    ]);

    if (!profiles) return;

    // Precios de activos (mismos que en ShopPanel)
    const ASSET_PRICES = {
      bicicleta: 160000, moto: 1200000, carro: 4800000,
      choza: 240000, casa: 1200000, mansion: 32000000,
    };

    const sorted = profiles.map(u => {
      // Valor de activos no hipotecados
      const userAssets = (assets || []).filter(a => a.user_id === u.id && !a.mortgaged);
      const assetValue = userAssets.reduce((sum, a) => sum + (ASSET_PRICES[a.asset_key] || 0) * a.quantity, 0);

      // Deuda activa
      const userLoan = (loans || []).find(l => l.user_id === u.id);
      const deuda = userLoan ? userLoan.total_debt - userLoan.paid_amount : 0;

      const patrimonio = u.balance + assetValue - deuda;
      const sc = u.credit_score || 0;
      const deaths = u.deaths || 0;

      return { ...u, sc, deaths, patrimonio };
    }).sort((a, b) => {
      if (b.sc !== a.sc) return b.sc - a.sc;           // 1er criterio: más SC
      if (a.deaths !== b.deaths) return a.deaths - b.deaths;  // 2do: menos muertes
      return b.patrimonio - a.patrimonio;               // 3er: más patrimonio
    });

    setProfiles(sorted);
  }
  loadRanking();
}, [balance]);














  async function handleDeposit() {
    const amount = parseInt(depositAmount);
    if (!amount || amount <= 0) return;
    setDepositLoading(true);
    await onDeposit(amount);
    setDepositAmount("");
    setShowDeposit(false);
    setDepositLoading(false);
  }

const BONUS = 100000;
const dep = profile.total_deposited || 0;
const capitalBase = dep + BONUS;
const neto = balance - capitalBase;
const roi = ((neto / capitalBase) * 100).toFixed(1);

  return (
    <div>
      <div style={styles.lobbyHeader}>
        <div>






        {/* Justo antes de los botones del header */}
{marketToday && (
  <div style={{
    background: marketToday.state === "crisis" ? "rgba(239,68,68,0.08)"
              : marketToday.state === "growth"  ? "rgba(34,197,94,0.08)"
              : "rgba(251,191,36,0.08)",
    border: `1px solid ${marketToday.state === "crisis" ? "#ef444433"
           : marketToday.state === "growth" ? "#22c55e33" : "#fbbf2433"}`,
    borderRadius: 8, padding: "5px 12px",
    fontSize: 11, color: "#aaa",
    textAlign: "center", marginBottom: 12,
  }}>
    📊 Mercado hoy:{" "}
    <strong style={{ color: marketToday.state === "crisis" ? "#ef4444" : marketToday.state === "growth" ? "#22c55e" : "#fbbf24" }}>
      {marketToday.state === "crisis" ? "Crisis" : marketToday.state === "growth" ? "Crecimiento" : "Estabilidad"}{" "}
      {marketToday.pct > 0 ? "+" : ""}{marketToday.pct}%
    </strong>
  </div>
)}


















          <div style={{ fontSize: 13, color: "#555" }}>Bienvenido</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{profile.avatar} {profile.username}</div>
          <div style={{ fontSize: 12, color: neto >= 0 ? "#00d4aa" : "#ff4444", marginTop: 2 }}>
            {neto >= 0 ? "📈" : "📉"} Neto: {neto >= 0 ? "+" : ""}{neto.toLocaleString()}
            {roi !== null && (
              <span style={{ marginLeft: 8, color: parseFloat(roi) >= 0 ? "#00d4aa" : "#ff4444" }}>
                ({roi >= 0 ? "+" : ""}{roi}% ROI)
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
          <div style={styles.balancePill}>💰 {balance.toLocaleString()} fichas</div>
          <div style={{ display: "flex", gap: 8 }}>







              
















            <button onClick={() => setShowStats(s => !s)} style={styles.depositBtn}>
              📊 {showStats ? "Ocultar" : "Mis stats"}
            </button>
            
          </div>
        </div>



            <button onClick={() => setGame("space")} style={{
  ...styles.depositBtn,
  borderColor: "#fbbf2455",
  color: "#fbbf24",
  fontWeight: 700,
}}>
  🏠 Mi Espacio
</button>

      </div>

      {/* Panel de stats del jugador */}
      {/*{showStats && <PlayerStats userId={profile.id} />}*/}
      {showStats && <PlayerStats userId={profile.id} layout="flex" />}



      {showDeposit && (
        <div style={styles.depositBox}>
          <div style={{ fontWeight: 700, marginBottom: 8, color: "#fbbf24" }}>💵 Recargar Bolsillo</div>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>
            Total ingresado: {dep.toLocaleString()} fichas
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number"
              placeholder="Cantidad de fichas"
              value={depositAmount}
              onChange={e => setDepositAmount(e.target.value)}
              style={{ ...styles.input, marginBottom: 0, flex: 1 }}
            />
            <button onClick={handleDeposit} disabled={depositLoading}
              style={{ ...styles.loginBtn, width: "auto", padding: "12px 16px" }}>
              {depositLoading ? "..." : "Añadir"}
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {[50000, 100000, 500000, 1000000].map(a => (
              <button key={a} onClick={() => setDepositAmount(String(a))} style={styles.quickBtn}>
                +{a.toLocaleString()}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 16 }}>
        {GAMES.map(g => (
          <button key={g.id} onClick={() => setGame(g.id)} style={{ ...styles.gameBtn, borderColor: g.color }}>
            <div style={{ fontSize: 36, marginBottom: 6 }}>{g.icon}</div>
            <div style={{ fontWeight: 700, color: g.color, fontSize: 20 }}>{g.name}</div>
            <div style={{ fontSize: 15, color: "#666", marginTop: 4 }}>{g.desc}</div>
          </button>
        ))}
      </div>

      <div style={styles.rankingBox}>
        <div style={{ color: "#ffffff", fontSize: 20, marginBottom: 8, letterSpacing: 2 }}>
          RANKING — SC <span style={{ color: "#959595", fontWeight: 400 }}>(Score crediticio. Muertes. Patrimonio)</span>
        </div>
        {profiles.length === 0 && (
          <div style={{ color: "#333", fontSize: 12 }}>Nadie califica aún</div>
        )}



          {profiles.map((u, i) => (
  <div key={u.username} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, fontSize: 20 }}>
    <span style={{ color: i===0?"#fbbf24":i===1?"#c7c7c7":i===2?"#cd7f32":"#cfcfcf" }}>
      {i===0?"🥇":i===1?"🥈":i===2?"🥉":"  "} {u.avatar} {u.username}
      <span style={{ color: "#ffffff", fontSize: 16, marginLeft: 6 }}>💀{u.deaths}</span>
    </span>
    <div style={{ textAlign: "right" }}>
      <div style={{ color: "#fbbf24", fontSize: 20, fontWeight: 700 }}>
        ⭐ {u.sc.toLocaleString()} SC
      </div>
      <div style={{ color: "#b1b1b1", fontSize: 15 }}>
        patrimonio: {u.patrimonio >= 0 ? "+" : ""}{u.patrimonio.toLocaleString()}
      </div>
    </div>
  </div>
))}










      </div>
    </div>
  );
}

function Login() {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [avatar, setAvatar] = useState("🎰");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true); setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) setErr("Usuario o contraseña incorrectos");
    setLoading(false);
  }

  async function handleRegister() {
    setLoading(true); setErr("");
    if (!username || !email || !pass) { setErr("Completa todos los campos"); setLoading(false); return; }
    if (pass.length < 6) { setErr("La contraseña debe tener al menos 6 caracteres"); setLoading(false); return; }
    const { data: existing } = await supabase.from("profiles").select("id").eq("username", username).single();
    if (existing) { setErr("Ese nombre de usuario ya está en uso"); setLoading(false); return; }
    const { error } = await supabase.auth.signUp({ email, password: pass });
    if (error) { setErr(error.message); setLoading(false); return; }
    localStorage.setItem("pending_username", username);
    localStorage.setItem("pending_avatar", avatar);
    setLoading(false);
  }

  return (
    <div style={styles.loginWrap}>
      <div style={styles.loginCard}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🎰</div>
        <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1, marginBottom: 4, color: "#FFD700" }}>Casino</h1>
        <p style={{ color: "#aaa", fontSize: 13, marginBottom: 24 }}>A apostar 🎲</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button onClick={() => setMode("login")} style={{ ...styles.tabBtn, background: mode==="login" ? "#ff6b35" : "transparent", color: mode==="login" ? "#fff" : "#666" }}>Entrar</button>
          <button onClick={() => setMode("register")} style={{ ...styles.tabBtn, background: mode==="register" ? "#ff6b35" : "transparent", color: mode==="register" ? "#fff" : "#666" }}>Registrarse</button>
        </div>
        {mode === "register" && (
          <>
            <input placeholder="Nombre de usuario" value={username} onChange={e => setUsername(e.target.value)} style={styles.input} />
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>Elige tu avatar:</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                {AVATARS.map(a => (
                  <button key={a} onClick={() => setAvatar(a)} style={{ fontSize: 22, background: avatar===a ? "#ff6b35" : "#0d0d14", border: `2px solid ${avatar===a ? "#ff6b35" : "#2a2a3a"}`, borderRadius: 8, padding: "4px 8px", cursor: "pointer" }}>
                    {a}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={styles.input} onKeyDown={e => e.key==="Enter" && (mode==="login" ? handleLogin() : handleRegister())} />
        <input placeholder="Contraseña" type="password" value={pass} onChange={e => setPass(e.target.value)} style={styles.input} onKeyDown={e => e.key==="Enter" && (mode==="login" ? handleLogin() : handleRegister())} />
        {err && <div style={{ color: "#ff6b35", fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <button onClick={mode==="login" ? handleLogin : handleRegister} disabled={loading} style={styles.loginBtn}>
          {loading ? "..." : mode==="login" ? "Entrar →" : "Crear cuenta →"}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [profile, setProfile] = useState(null);
  const [balance, setBalanceState] = useState(0);
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);

  const balanceRef = useRef(balance);
  useEffect(() => { balanceRef.current = balance; }, [balance]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        await maybeCreateProfile(session.user.id);
        await loadProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") {
        setProfile(null);
        setBalanceState(0);
        setGame(null);
        setLoading(false);
      } else if (event === "SIGNED_IN") {
        setProfile(prev => {
          if (!prev) {
            maybeCreateProfile(session.user.id).then(() => loadProfile(session.user.id));
          }
          return prev;
        });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function maybeCreateProfile(userId) {
    const { data } = await supabase.from("profiles").select("id").eq("id", userId).single();
    if (!data) {
      const username = localStorage.getItem("pending_username") || "jugador";
      const avatar = localStorage.getItem("pending_avatar") || "🎰";
      await supabase.from("profiles").insert({ id: userId, username, avatar, balance: 100000, total_deposited: 0 });
      await supabase.from("blackjack_stats").insert({ user_id: userId });
      await supabase.from("chickenroad_stats").insert({ user_id: userId, hist_net: 0 });
      localStorage.removeItem("pending_username");
      localStorage.removeItem("pending_avatar");
    }
  }

  async function loadProfile(userId) {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (data) { setProfile(data); setBalanceState(data.balance); }
    setLoading(false);
  }

  function setBalance(newBalance) {
  setBalanceState(newBalance);
  balanceRef.current = newBalance;
}

  async function saveBalance(newBalance) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase.from("profiles").update({ balance: newBalance }).eq("id", session.user.id);
    }
  }

  async function handleBack() {
    await saveBalance(balanceRef.current);
    setGame(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (session) await loadProfile(session.user.id);
  }

  async function handleLogout() {
    await saveBalance(balanceRef.current);
    await supabase.auth.signOut();
    window.location.reload();
  }

  async function handleDeposit(amount) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { console.error("Sin sesión"); return; }
    const newBalance = balance + amount;
    const newTotal = (profile.total_deposited || 0) + amount;
    const { error } = await supabase.from("profiles")
      .update({ balance: newBalance, total_deposited: newTotal })
      .eq("id", session.user.id);
    if (!error) {
      await supabase.from("deposits").insert({ user_id: session.user.id, amount });
      setBalanceState(newBalance);
      setProfile(p => ({ ...p, balance: newBalance, total_deposited: newTotal }));
    } else {
      console.error("Error depósito:", error);
    }
  }

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0d0d14", display: "flex", alignItems: "center", justifyContent: "center", color: "#fbbf24", fontSize: 24 }}>
      🎰 Cargando...
    </div>
  );

  if (!profile) return <Login />;

  return (
    <div style={styles.appWrap}>
      <div style={styles.topBar}>
        <span style={{ fontWeight: 800, letterSpacing: -0.5, color: "#fbbf24" }}>🎰 Casino</span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "#fbbf24", fontWeight: 700 }}>💰 {balance.toLocaleString()}</span>
          <button onClick={handleLogout} style={styles.logoutBtn}>Salir</button>
        </div>
      </div>
      <div style={{ padding: "20px 16px" }}>
        {!game && <Lobby profile={profile} balance={balance} setGame={setGame} onDeposit={handleDeposit} />}
        {game === "slots"       && <SlotsGame       balance={balance} setBalance={setBalance} onBack={handleBack} />}
        {game === "blackjack"   && <BlackjackGame   balance={balance} setBalance={setBalance} onBack={handleBack} />}
        {game === "roulette"    && <RouletteGame    balance={balance} setBalance={setBalance} onBack={handleBack} />}
        {game === "mines"       && <MinesGames      balance={balance} setBalance={setBalance} onBack={handleBack} onGameEnd={(fb) => { balanceRef.current = fb; }} />}
        {game === "spaceman"    && <SpacemanGame    balance={balance} setBalance={setBalance} onBack={handleBack} />}
        {game === "chickenroad" && <ChickenRoadGame balance={balance} onBalanceChange={setBalance} onBack={handleBack} />}
        {game === "horses"      && <HorseRace       balance={balance} setBalance={setBalance} onBack={handleBack} />}
        {game === "crazytime"   && <CrazyTimeGame   balance={balance} setBalance={setBalance} onBack={handleBack} />}
        {game === "space" && (<PlayerSpace profile={profile} balance={balance} setBalance={setBalance}   // ← añadir esto
    deaths={profile.deaths || 0}
    onBack={handleBack}
    onDeath={async () => {
      // loadProfile recarga desde DB (ya tiene deaths+1 y balance reseteado)
      const { data: { session } } = await supabase.auth.getSession();
      if (session) await loadProfile(session.user.id);
      setGame(null);
    }}
  />
)}
      </div>
    </div>
  );
}

const styles = {
  appWrap:     { minHeight: "100vh", background: "#0d0d14", color: "#ffffff", fontFamily: "'Georgia', serif" },
  topBar:      { background: "#16161f", borderBottom: "1px solid #1e1e2e", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 10 },
  loginWrap:   { minHeight: "100vh", background: "#0d0d14", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Georgia', serif" },
  loginCard:   { background: "#16161f", border: "1px solid #1e1e2e", borderRadius: 16, padding: "40px 32px", width: "100%", maxWidth: 360, textAlign: "center" },
  input:       { width: "100%", background: "#0d0d14", border: "1px solid #2a2a3a", borderRadius: 8, padding: "12px 14px", color: "#ffffff", fontSize: 15, marginBottom: 10, boxSizing: "border-box", outline: "none" },
  loginBtn:    { width: "100%", background: "#ff6b35", border: "none", borderRadius: 8, padding: "14px", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer" },
  logoutBtn:   { background: "transparent", border: "1px solid #2a2a3a", borderRadius: 6, color: "#666", fontSize: 12, padding: "4px 10px", cursor: "pointer" },
  lobbyHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  balancePill: { background: "#1e1e2e", border: "1px solid #2a2a3a", borderRadius: 20, padding: "6px 14px", fontSize: 14, fontWeight: 700, color: "#fbbf24" },
  depositBtn:  { background: "#1e1e2e", border: "1px solid #2a2a3a", borderRadius: 20, padding: "6px 14px", fontSize: 13, color: "#aaa", cursor: "pointer" },
  depositBox:  { background: "#16161f", border: "1px solid #2a2a3a", borderRadius: 12, padding: 16, marginBottom: 16 },
  quickBtn:    { background: "#0d0d14", border: "1px solid #2a2a3a", borderRadius: 6, color: "#aaa", fontSize: 12, padding: "6px 10px", cursor: "pointer" },
  gameBtn:     { background: "#16161f", border: "1px solid", borderRadius: 12, padding: "16px 10px", cursor: "pointer", textAlign: "center", transition: "transform 0.1s", color: "#fff" },
  rankingBox:  { background: "#16161f", border: "1px solid #1e1e2e", borderRadius: 12, padding: "14px 16px", marginTop: 20 },
  tabBtn:      { flex: 1, border: "1px solid #2a2a3a", borderRadius: 8, padding: "10px", cursor: "pointer", fontSize: 14, fontWeight: 600 },
  gameCard:    { background: "#16161f", border: "1px solid #1e1e2e", borderRadius: 14, padding: 20 },
};
