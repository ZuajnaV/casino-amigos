import { useState } from "react";
import RouletteGame from "./Roulette.jsx";
import BlackjackGame from "./Blackjack.jsx";
import MinesGames from "./Mines.jsx";
import SpacemanGame from "./Spaceman.jsx";
import ChickenRoadGame from "./ChickenRoad.jsx";
import HorseRace from "./HorseRace.jsx";
import SlotsGame from "./Slots.jsx";

const USERS = [
  { user: "Juan", pass: "1234", avatar: "🎩", balance: 10000000 },
  { user: "Santiago",    pass: "1234", avatar: "💃", balance: 10000000 },
  { user: "Angel",  pass: "1234", avatar: "🕶️", balance: 10000000 },
  { user: "Mauricio",  pass: "1234", avatar: "👑", balance: 10000000 },
];

const GAMES = [
  { id: "slots",      name: "Tragamonedas",  icon: "🎰", desc: "Tira y cruza los dedos",        color: "#ff6b35" },
  { id: "blackjack",  name: "Blackjack",    icon: "🃏", desc: "Planta o pide. 21 gana.",        color: "#00d4aa" },
  { id: "roulette",   name: "Ruleta",       icon: "🎡", desc: "Rojo, negro o tu número de la suerte", color: "#c084fc" },
  { id: "mines",      name: "Mines",        icon: "💣", desc: "Encuentra las minas sin explotar",   color: "#491cff" },
  { id: "spaceman",   name: "Spaceman",     icon: "🚀", desc: "Explora el espacio y evita estrellar",   color: "#8b5cf6" },
  { id: "chickenroad", name: "Chicken Road", icon: "🐔", desc: "Corre por la carretera y evita los obstáculos", color: "#f59e0b" },
  { id: "horses",   name: "Horse Race",   icon: "🐎", desc: "Apuesta en la carrera de caballos",       color: "#ef4444" },
];

function Lobby({ user, balance, setGame }) {
  return (
    <div>
      <div style={styles.lobbyHeader}>
        <div>
          <div style={{ fontSize: 13, color: "#555" }}>Bienvenido</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{user.avatar} {user.user}</div>
        </div>
        <div style={styles.balancePill}>
          💰 {balance.toLocaleString()} fichas
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
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
        {USERS.sort((a,b) => b.balance - a.balance).map((u, i) => (
          <div key={u.user} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ color: i===0?"#fbbf24":i===1?"#aaa":i===2?"#cd7f32":"#666" }}>
              {i===0?"🥇":i===1?"🥈":"🥉"} {u.avatar} {u.user}
            </span>
            <span style={{ color: "#fff", fontSize: 13 }}>{u.balance.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Login({ onLogin }) {
  const [u, setU] = useState(""); const [p, setP] = useState(""); const [err, setErr] = useState("");
  function submit() {
    const found = USERS.find(x => x.user === u && x.pass === p);
    if (found) onLogin(found);
    else setErr("Usuario o contraseña incorrectos");
  }
  return (
    <div style={styles.loginWrap}>
      <div style={styles.loginCard}>
        <div style={{ fontSize: 48, marginBottom: 8, color: "#ffffff" }}>🎰</div>
        <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1, marginBottom: 4, color: "#FFD700" }}>Casino</h1>
        <p style={{ color: "#ffffff", fontSize: 13, marginBottom: 28 }}>Solo para amigos 🎲</p>
        <input placeholder="Usuario" value={u} onChange={e => setU(e.target.value)}
          style={styles.input} onKeyDown={e => e.key==="Enter" && submit()} />
        <input placeholder="Contraseña" type="password" value={p} onChange={e => setP(e.target.value)}
          style={styles.input} onKeyDown={e => e.key==="Enter" && submit()} />
        {err && <div style={{ color: "#ff6b35", fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <button onClick={submit} style={styles.loginBtn}>Entrar →</button>
        <p style={{ color: "#ffffff", fontSize: 13, marginTop: 16 }}>Demo: carlos / 1234 · ana / 1234 · pablo / 1234</p>
      </div>
    </div>
  );
}

export default function App() {
  const [logged, setLogged] = useState(null);
  const [balance, setBalance] = useState(0);
  const [game, setGame] = useState(null);

  function handleLogin(user) { setLogged(user); setBalance(user.balance); }
  function handleLogout() { setLogged(null); setGame(null); }

  if (!logged) return <Login onLogin={handleLogin} />;

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
        {!game && <Lobby user={logged} balance={balance} setGame={setGame} />}
        {game === "slots" && <SlotsGame balance={balance} setBalance={setBalance} onBack={() => setGame(null)} />}
        {game === "blackjack" && <BlackjackGame balance={balance} setBalance={setBalance} onBack={() => setGame(null)} />}
        {game === "roulette" && <RouletteGame balance={balance} setBalance={setBalance} onBack={() => setGame(null)} />}
        {game === "mines" && <MinesGames balance={balance} setBalance={setBalance} onBack={() => setGame(null)} />} 
        {game === "spaceman" && <SpacemanGame balance={balance} setBalance={setBalance} onBack={() => setGame(null)} />}
        {game === "chickenroad" && <ChickenRoadGame balance={balance} onBalanceChange={setBalance} onBack={() => setGame(null)} />}
        {game === "horses" && <HorseRace balance={balance} setBalance={setBalance} onBack={() => setGame(null)} />}
      </div>
    </div>
  );
}

const styles = {
  appWrap: { minHeight: "100vh", background: "#0d0d14", color: "#ffffff", fontFamily: "'Georgia', serif" },
  topBar: { background: "#16161f", borderBottom: "1px solid #1e1e2e", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 10 },
  loginWrap: { minHeight: "100vh", background: "#0d0d14", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Georgia', serif" },
  loginCard: { background: "#16161f", border: "1px solid #1e1e2e", borderRadius: 16, padding: "40px 32px", width: "100%", maxWidth: 340, textAlign: "center" },
  input: { width: "100%", background: "#0d0d14", border: "1px solid #ffffff", borderRadius: 8, padding: "12px 14px", color: "#ffffff", fontSize: 15, marginBottom: 10, boxSizing: "border-box", outline: "none" },
  loginBtn: { width: "100%", background: "#ff6b35", border: "none", borderRadius: 8, padding: "14px", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer" },
  logoutBtn: { background: "transparent", border: "1px solid #2a2a3a", borderRadius: 6, color: "#666", fontSize: 12, padding: "4px 10px", cursor: "pointer" },
  lobbyHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  balancePill: { background: "#1e1e2e", border: "1px solid #2a2a3a", borderRadius: 20, padding: "6px 14px", fontSize: 14, fontWeight: 700, color: "#fbbf24" },
  gameBtn: { background: "#16161f", border: "1px solid", borderRadius: 12, padding: "16px 10px", cursor: "pointer", textAlign: "center", transition: "transform 0.1s", color: "#fff" },
  rankingBox: { background: "#16161f", border: "1px solid #1e1e2e", borderRadius: 12, padding: "14px 16px", marginTop: 20 },
  gameCard: { background: "#16161f", border: "1px solid #1e1e2e", borderRadius: 14, padding: 20 },
  reelsRow: { display: "flex", gap: 12, justifyContent: "center", margin: "20px 0" },
  reel: { fontSize: 52, background: "#0d0d14", border: "2px solid #2a2a3a", borderRadius: 10, width: 80, height: 80, display: "flex", alignItems: "center", justifyContent: "center" },
  betRow: { display: "flex", gap: 8, alignItems: "center", margin: "12px 0", flexWrap: "wrap" },
  betBtn: { border: "none", borderRadius: 6, padding: "6px 12px", color: "#fff", cursor: "pointer", fontSize: 13 },
  spinBtn: { width: "100%", background: "#ff6b35", border: "none", borderRadius: 8, padding: "13px", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", marginTop: 8 },
  msgBox: { textAlign: "center", fontWeight: 700, fontSize: 16, margin: "10px 0", padding: "10px", background: "#0d0d14", borderRadius: 8 },
  backBtn: { background: "transparent", border: "none", color: "#555", fontSize: 14, cursor: "pointer", marginBottom: 12, padding: 0 },
  card: { background: "#1e1e2e", border: "1px solid #2a2a3a", borderRadius: 8, padding: "10px 8px", fontSize: 20, minWidth: 44, textAlign: "center" },
};