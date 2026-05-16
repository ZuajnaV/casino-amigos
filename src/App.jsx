import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";
import RouletteGame from "./Roulette.jsx";
import BlackjackGame from "./Blackjack.jsx";
import MinesGames from "./Mines.jsx";
import SpacemanGame from "./Spaceman.jsx";
import ChickenRoadGame from "./ChickenRoad.jsx";
import HorseRace from "./HorseRace.jsx";
import SlotsGame from "./Slots.jsx";

const GAMES = [
  { id: "slots",       name: "Tragamonedas",  icon: "🎰", desc: "Tira y cruza los dedos",                      color: "#ff6b35" },
  { id: "blackjack",   name: "Blackjack",     icon: "🃏", desc: "Planta o pide. 21 gana.",                      color: "#00d4aa" },
  { id: "roulette",    name: "Ruleta",        icon: "🎡", desc: "Rojo, negro o tu número de la suerte",          color: "#c084fc" },
  { id: "mines",       name: "Mines",         icon: "💣", desc: "Encuentra las minas sin explotar",             color: "#491cff" },
  { id: "spaceman",    name: "Spaceman",      icon: "🚀", desc: "Explora el espacio y evita estrellar",          color: "#8b5cf6" },
  { id: "chickenroad", name: "Chicken Road",  icon: "🐔", desc: "Corre por la carretera y evita los obstáculos", color: "#f59e0b" },
  { id: "horses",      name: "Horse Race",    icon: "🐎", desc: "Apuesta en la carrera de caballos",             color: "#ef4444" },
];

const AVATARS = ["🎩","💃","🕶️","👑","🎭","🦊","🐯","🎪","🃏","🎲"];

// ─── LOBBY ───────────────────────────────────────────────────────────────────
function Lobby({ profile, balance, setGame, onDeposit }) {
  const [profiles, setProfiles] = useState([]);
  const [showDeposit, setShowDeposit] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositLoading, setDepositLoading] = useState(false);

  useEffect(() => {
    supabase.from("profiles").select("username, avatar, balance")
      .order("balance", { ascending: false })
      .then(({ data }) => { if (data) setProfiles(data); });
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

  const neto = balance - (profile.total_deposited || 0);

  return (
    <div>
      <div style={styles.lobbyHeader}>
        <div>
          <div style={{ fontSize: 13, color: "#555" }}>Bienvenido</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{profile.avatar} {profile.username}</div>
          <div style={{ fontSize: 12, color: neto >= 0 ? "#00d4aa" : "#ff4444", marginTop: 2 }}>
            {neto >= 0 ? "📈" : "📉"} Neto: {neto >= 0 ? "+" : ""}{neto.toLocaleString()}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
          <div style={styles.balancePill}>💰 {balance.toLocaleString()} fichas</div>
          <button onClick={() => setShowDeposit(!showDeposit)} style={styles.depositBtn}>💵 Bolsillo</button>
        </div>
      </div>

      {showDeposit && (
        <div style={styles.depositBox}>
          <div style={{ fontWeight: 700, marginBottom: 8, color: "#fbbf24" }}>💵 Recargar Bolsillo</div>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>
            Total ingresado: {(profile.total_deposited || 0).toLocaleString()} fichas
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number"
              placeholder="Cantidad de fichas"
              value={depositAmount}
              onChange={e => setDepositAmount(e.target.value)}
              style={{ ...styles.input, marginBottom: 0, flex: 1 }}
            />
            <button
              onClick={handleDeposit}
              disabled={depositLoading}
              style={{ ...styles.loginBtn, width: "auto", padding: "12px 16px" }}
            >
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
            <div style={{ fontWeight: 700, color: g.color, fontSize: 15 }}>{g.name}</div>
            <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>{g.desc}</div>
          </button>
        ))}
      </div>

      <div style={styles.rankingBox}>
        <div style={{ color: "#555", fontSize: 12, marginBottom: 8, letterSpacing: 2 }}>RANKING</div>
        {profiles.map((u, i) => (
          <div key={u.username} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ color: i===0?"#fbbf24":i===1?"#aaa":i===2?"#cd7f32":"#666" }}>
              {i===0?"🥇":i===1?"🥈":i===2?"🥉":"  "} {u.avatar} {u.username}
            </span>
            <span style={{ color: "#fff", fontSize: 13 }}>{u.balance.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── LOGIN / REGISTRO ─────────────────────────────────────────────────────────
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
          <button onClick={() => setMode("login")} style={{ ...styles.tabBtn, background: mode==="login" ? "#ff6b35" : "transparent", color: mode==="login" ? "#fff" : "#666" }}>
            Entrar
          </button>
          <button onClick={() => setMode("register")} style={{ ...styles.tabBtn, background: mode==="register" ? "#ff6b35" : "transparent", color: mode==="register" ? "#fff" : "#666" }}>
            Registrarse
          </button>
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

// ─── APP PRINCIPAL ────────────────────────────────────────────────────────────
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

    /*
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
  console.log("Auth event:", event);
  if (event === "SIGNED_OUT") {
    setProfile(null);
    setBalanceState(0);
    setGame(null);
    setLoading(false);
    */

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
  console.log("Auth event:", event);
  if (event === "SIGNED_OUT") {
    setProfile(null);
    setBalanceState(0);
    setGame(null);
    setLoading(false);
  //}
    //});

  } else if (event === "SIGNED_IN") {
    // Solo procesar si no tenemos perfil aún
    setProfile(prev => {
      if (!prev) {
        maybeCreateProfile(session.user.id).then(() => loadProfile(session.user.id));
      }
      return prev;
    });
  } else if (event === "TOKEN_REFRESHED") {
    // Solo refrescar token, no recargar perfil
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

  // Esta función solo actualiza la UI, no Supabase
function setBalance(newBalance) {
  setBalanceState(newBalance);
}

// Esta guarda en Supabase
async function saveBalance(newBalance) {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    await supabase.from("profiles").update({ balance: newBalance }).eq("id", session.user.id);
  }
}
/*
// handleBack guarda el balance al volver al lobby
async function handleBack() {
  await saveBalance(balance);
  setGame(null);
  const { data: { session } } = await supabase.auth.getSession();
  if (session) await loadProfile(session.user.id);
}
*/

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

  /*
  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.reload();
  }
  */



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
        {/* {game === "mines"       && <MinesGames      balance={balance} setBalance={setBalance} onBack={handleBack} />} */}
        {game === "mines" && <MinesGames balance={balance} setBalance={setBalance} onBack={handleBack} onGameEnd={(fb) => { balanceRef.current = fb; }} />}
        {game === "spaceman"    && <SpacemanGame    balance={balance} setBalance={setBalance} onBack={handleBack} />}
        {game === "chickenroad" && <ChickenRoadGame balance={balance} onBalanceChange={setBalance} onBack={handleBack} />}
        {game === "horses"      && <HorseRace       balance={balance} setBalance={setBalance} onBack={handleBack} />}
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
