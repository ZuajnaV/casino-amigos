import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase";

// ═══════════════════════════════════════════════════════════════
//  CONSTANTES
// ═══════════════════════════════════════════════════════════════
const CARD_PRICE    = 20_000;
const MAX_CARDS     = 3;
const MAX_PLAYERS   = 10;
const RAKE_PCT      = 0.05;
const COLS          = 5;
const ROWS          = 5;
const BINGO_LETTERS = ["B", "I", "N", "G", "O"];
const COL_RANGES    = [[1,15],[16,30],[31,45],[46,60],[61,75]];
const BALL_INTERVAL = 5000; // ms entre bolas

const WIN_PATTERNS = {
  "Cartón lleno": Array.from({length:5},(_,r)=>Array.from({length:5},(_,c)=>[r,c])).flat(),
};

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════
function generateCard() {
  return COL_RANGES.map(([min, max]) => {
    const pool = Array.from({length: max - min + 1}, (_, i) => i + min);
    return pool.sort(() => Math.random() - 0.5).slice(0, 5);
  });
}

function cardHasNumber(card, num) {
  return card.some(col => col.includes(num));
}

function checkWin(card, markedSet) {
  for (const [patName, cells] of Object.entries(WIN_PATTERNS)) {
    const allMarked = cells.every(([r, c]) => {
      const num = card[c][r];
      return num === "FREE" || markedSet.has(num);
    });
    if (allMarked) return patName;
  }
  return null;
}

function Prize(gross) {
  return Math.round(gross * (1 - RAKE_PCT));
}

// Color de columna por número (B=0, I=1, N=2, G=3, O=4)
function colColor(n) {
  const idx = Math.min(4, Math.floor((n - 1) / 15));
  return ["#ef4444","#3b82f6","#22c55e","#f59e0b","#a855f7"][idx];
}

// ═══════════════════════════════════════════════════════════════
//  COMPONENTE CARTÓN — soporte para marcado manual
// ═══════════════════════════════════════════════════════════════
// Props:
//   calledNumbers  → Set de bolas oficialmente cantadas por el servidor
//   playerMarked   → Set de celdas que el jugador ha marcado manualmente
//   onMarkNumber   → callback(num): marca o desmarca un número
//   justCalled     → última bola (activa animación de destello)
//   isWinner       → mostrar banner BINGO
function BingoCard({ card, calledNumbers, playerMarked, onMarkNumber, isWinner, justCalled }) {
  return (
    <div style={{
      background: isWinner ? "rgba(251,191,36,0.12)" : "rgba(13,13,20,0.9)",
      border: `2px solid ${isWinner ? "#fbbf24" : "#2a2a3a"}`,
      borderRadius: 12,
      overflow: "hidden",
      boxShadow: isWinner ? "0 0 24px #fbbf2444" : "none",
      transition: "all 0.3s",
      width: "100%",
    }}>
      {/* Header BINGO */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)" }}>
        {BINGO_LETTERS.map((l, i) => (
          <div key={l} style={{
            background: ["#ef4444","#3b82f6","#22c55e","#f59e0b","#a855f7"][i],
            textAlign: "center", padding: "10px 0",
            fontWeight: 900, fontSize: 30, color: "#fff", letterSpacing: 1,
          }}>{l}</div>
        ))}
      </div>

      {/* Cuadrícula de números */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 2, padding: 4 }}>
        {Array.from({length: 5}, (_, row) =>
          Array.from({length: 5}, (_, col) => {
            const num    = card[col][row];
            const isFree = num === "FREE";

            // Estado de la celda
            const isCalled   = isFree || calledNumbers.has(num);
            const isMarked   = isFree || playerMarked.has(num);
            const isNew      = justCalled === num;  // acaba de ser cantado
            const isCallable = isCalled && !isMarked && !isFree; // puede marcarse

            // Colores según estado
            let bg, border, color;
            if (isFree) {
              bg = "#fbbf2433"; border = "1px solid #fbbf2444"; color = "#fbbf24";
            } else if (isNew) {
              bg = "#00d4aa";   border = "2px solid #00d4aa";   color = "#000";
            } else if (isMarked) {
              bg = "#1e3a2e";   border = "1px solid #00d4aa55"; color = "#00d4aa";
            } else if (isCallable) {
              // Cantado pero no marcado → llamada de atención (ámbar)
              bg = "#2a1a06";   border = "2px solid #f5a623";   color = "#f5a623";
            } else {
              bg = "#0d0d18";   border = "1px solid #1e1e2e";   color = "#444";
            }

            return (
              <div
                key={`${row}-${col}`}
                onClick={() => {
                  // Solo se puede marcar/desmarcar si la bola ya fue cantada
                  if (isCalled && !isFree && onMarkNumber) onMarkNumber(num);
                }}
                style={{
                  aspectRatio: "1",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  borderRadius: 6,
                  background: bg,
                  border,
                  fontSize: 30, fontWeight: isMarked ? 800 : 400,
                  color,
                  cursor: isCalled && !isFree ? "pointer" : "default",
                  transition: "all 0.2s",
                  transform: isNew ? "scale(1.08)" : "scale(1)",
                  // Pulso suave en celdas que necesitan ser marcadas
                  animation: isCallable ? "cellPulse 1.2s ease-in-out infinite" : "none",
                }}
              >
                {isFree ? "★" : num}
              </div>
            );
          })
        )}
      </div>

      {isWinner && (
        <div style={{
          background: "#fbbf24", color: "#000",
          textAlign: "center", padding: "4px",
          fontWeight: 900, fontSize: 12, letterSpacing: 2,
        }}>🎉 ¡BINGO!</div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  LOBBY DE SALA
// ═══════════════════════════════════════════════════════════════
function RoomLobby({ room, myCards, onBuyCard, onReady, balance, loading }) {
  const totalPlayers = room.players?.length || 0;
  const totalCards   = room.players?.reduce((s, p) => s + (p.card_count || 0), 0) || 0;
  const gross        = totalCards * CARD_PRICE;
  const prize        = Prize(gross);
  const myCount      = myCards.length;
  const canBuy       = myCount < MAX_CARDS && balance >= CARD_PRICE;
  const isReady      = room.players?.find(p => p.user_id === room.myId)?.ready;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ background: "rgba(13,13,20,0.9)", border: "1px solid #2a2a3a", borderRadius: 12, padding: "14px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: "#444", letterSpacing: 1, textTransform: "uppercase" }}>Sala</div>
            <div style={{ fontWeight: 800, fontSize: 18, color: "#fbbf24" }}>#{room.id?.slice(-6)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "#444", textTransform: "uppercase" }}>Premio actual</div>
            <div style={{ fontWeight: 800, fontSize: 20, color: "#00d4aa" }}>${prize.toLocaleString()}</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[
            ["👥 Jugadores", `${totalPlayers}/${MAX_PLAYERS}`],
            ["🎴 Cartones",  `${totalCards}/30`],
            ["💰 Pozo bruto", `$${gross.toLocaleString()}`],
          ].map(([label, val]) => (
            <div key={label} style={{ background: "#0d0d14", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "#555" }}>{label}</div>
              <div style={{ fontWeight: 700, color: "#ddd", fontSize: 13, marginTop: 2 }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
          Mis cartones ({myCount}/{MAX_CARDS})
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {myCards.map((card, i) => (
            <BingoCard
              key={i} card={card}
              calledNumbers={new Set()} playerMarked={new Set()}
              isWinner={false} justCalled={null}
            />
          ))}
        </div>
        <button onClick={onBuyCard} disabled={!canBuy || loading} style={{
          marginTop: 10,
          background: canBuy ? "#fbbf24" : "#1a1a26",
          border: "none", borderRadius: 10, padding: "10px 20px",
          fontSize: 14, fontWeight: 800,
          cursor: canBuy ? "pointer" : "not-allowed",
          color: canBuy ? "#000" : "#444",
        }}>
          {loading ? "..." : `🎴 Comprar cartón ($${CARD_PRICE.toLocaleString()})`}
          {!canBuy && myCount >= MAX_CARDS && " — Máximo alcanzado"}
        </button>
      </div>

      <div style={{ background: "rgba(13,13,20,0.9)", border: "1px solid #1e1e2e", borderRadius: 12, padding: "12px 14px" }}>
        <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
          Jugadores en sala
        </div>
        {(room.players || []).map(p => (
          <div key={p.user_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #1e1e2e" }}>
            <span style={{ color: "#bbb", fontSize: 13 }}>{p.avatar} {p.username}</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: "#555", fontSize: 12 }}>🎴 ×{p.card_count}</span>
              {p.ready
                ? <span style={{ color: "#00d4aa", fontSize: 11, fontWeight: 700 }}>✓ Listo</span>
                : <span style={{ color: "#444", fontSize: 11 }}>Esperando</span>}
            </div>
          </div>
        ))}
      </div>

      {myCount > 0 && (
        <button onClick={onReady} disabled={isReady || loading} style={{
          background: isReady ? "#1a1a26" : "linear-gradient(135deg, #00d4aa, #059669)",
          border: "none", borderRadius: 10, padding: "13px",
          fontSize: 15, fontWeight: 900,
          cursor: isReady ? "not-allowed" : "pointer",
          color: isReady ? "#444" : "#000",
        }}>
          {isReady ? "✓ Esperando a los demás..." : "✅ ¡Estoy listo!"}
        </button>
      )}
      <div style={{ fontSize: 11, color: "#333", textAlign: "center" }}>
        La partida inicia cuando todos los jugadores confirmen · Mín. 2 jugadores
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════
export default function BingoGame({ profile, balance, setBalance, onBack }) {
  const [phase,       setPhase]       = useState("lobby_list");
  const [rooms,       setRooms]       = useState([]);
  const [room,        setRoom]        = useState(null);
  const [myCards,     setMyCards]     = useState([]);
  // ── Cambio 3: marcado manual ──────────────────────────────────────────────
  // calledNumbers: bolas oficialmente cantadas (servidor)
  // playerMarked:  números que el jugador ha marcado a mano (UI)
  const [calledNumbers, setCalledNumbers] = useState(new Set());
  const [playerMarked,  setPlayerMarked]  = useState(new Set());
  // ── Cambio 2: temporizador ────────────────────────────────────────────────
  const [countdown,   setCountdown]   = useState(BALL_INTERVAL / 1000);
  const countdownRef  = useRef(null);
  // ─────────────────────────────────────────────────────────────────────────
  const [calledBalls, setCalledBalls] = useState([]);
  const [justCalled,  setJustCalled]  = useState(null);
  const [winner,      setWinner]      = useState(null);
  const [myWin,       setMyWin]       = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [saving,      setSaving]      = useState(false);

  const balRef     = useRef(balance);
  const channelRef = useRef(null);
  const roomRef    = useRef(room);

  useEffect(() => { balRef.current  = balance; }, [balance]);
  useEffect(() => { roomRef.current = room;    }, [room]);

  // ── Cambio 2: countdown se resetea cada vez que llega una bola nueva ─────
  useEffect(() => {
    if (phase !== "playing") return;

    // Limpiar intervalo anterior
    if (countdownRef.current) clearInterval(countdownRef.current);

    const secs = BALL_INTERVAL / 1000;
    setCountdown(secs);

    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) return secs; // llegó la bola, se reseteará por el efecto
        return prev - 1;
      });
    }, 1000);

    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [calledBalls.length, phase]); // eslint-disable-line

  // ── Marcado manual: toggle de una celda ──────────────────────────────────
  function toggleMark(num) {
    if (!calledNumbers.has(num)) return; // bola no cantada todavía
    setPlayerMarked(prev => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  REALTIME SUBSCRIPTION
  // ═══════════════════════════════════════════════════════════
  const subscribeToRoom = useCallback((roomId) => {
    if (channelRef.current) supabase.removeChannel(channelRef.current);

    const ch = supabase
      .channel(`bingo_room_${roomId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "bingo_rooms",
        filter: `id=eq.${roomId}`,
      }, ({ new: newRoom }) => {
        if (!newRoom) return;
        setRoom(prev => ({ ...prev, ...newRoom }));

        // Nueva bola cantada
        const balls = newRoom.called_balls || [];
        if (balls.length > (roomRef.current?.called_balls?.length || 0)) {
          const lastBall = balls[balls.length - 1];
          setJustCalled(lastBall);
          setCalledBalls(balls);
          // Cambio 3: actualizar el Set de bolas oficiales (NO marca automáticamente)
          setCalledNumbers(new Set(balls));
          setTimeout(() => setJustCalled(null), 1500);
        }

        // Ganador detectado
        if (newRoom.status === "finished" && newRoom.winner_id) {
          const winnerPlayer = newRoom.players?.find(p => p.user_id === newRoom.winner_id);
          setWinner({
            username: winnerPlayer?.username || "Alguien",
            avatar:   winnerPlayer?.avatar   || "🎲",
            pattern:  newRoom.win_pattern,
            prize:    newRoom.prize,
            isMe:     newRoom.winner_id === profile.id,
          });
          if (newRoom.winner_id === profile.id) {
            setMyWin(newRoom.win_pattern);
            saveWin(newRoom.prize);
          }
          setPhase("finished");
        }

        // Inicio de partida
        if (newRoom.status === "playing" && phase !== "playing") {
          setPhase("playing");
        }
      })
      .on("postgres_changes", {
        event: "*", schema: "public", table: "bingo_players",
        filter: `room_id=eq.${roomId}`,
      }, () => loadRoom(roomId))
      .subscribe();

    channelRef.current = ch;
  }, [profile.id, phase]);

  async function loadRooms() {
    const { data } = await supabase
      .from("bingo_rooms")
      .select("*, bingo_players(count)")
      .eq("status", "waiting")
      .order("created_at", { ascending: false })
      .limit(10);
    setRooms(data || []);
  }

  async function loadRoom(roomId) {
    const [{ data: roomData }, { data: players }] = await Promise.all([
      supabase.from("bingo_rooms").select("*").eq("id", roomId).single(),
      supabase.from("bingo_players").select("user_id, username, avatar, card_count, ready, cards").eq("room_id", roomId),
    ]);
    if (roomData) setRoom({ ...roomData, players: players || [], myId: profile.id });
  }

  useEffect(() => {
    loadRooms();
    const ch = supabase
      .channel("bingo_rooms_list")
      .on("postgres_changes", { event: "*", schema: "public", table: "bingo_rooms" }, loadRooms)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  async function saveWin(amount) {
    setSaving(true);
    const newBal = balRef.current + amount;
    setBalance(newBal);
    balRef.current = newBal;
    const { data: { session } } = await supabase.auth.getSession();
    if (session) await supabase.from("profiles").update({ balance: newBal }).eq("id", session.user.id);
    setSaving(false);
  }

  async function createRoom() {
    setLoading(true);
    const { data, error } = await supabase.from("bingo_rooms").insert({
      status: "waiting", called_balls: [], host_id: profile.id, prize: 0, winner_id: null, win_pattern: null,
    }).select().single();
    if (error || !data) { setLoading(false); return; }
    await supabase.from("bingo_players").insert({
      room_id: data.id, user_id: profile.id, username: profile.username,
      avatar: profile.avatar || "🎲", card_count: 0, ready: false, cards: [],
    });
    setRoom({ ...data, players: [], myId: profile.id });
    setMyCards([]);
    subscribeToRoom(data.id);
    await loadRoom(data.id);
    setPhase("room_lobby");
    setLoading(false);
  }

  async function joinRoom(roomId) {
    setLoading(true);
    const { data: existing } = await supabase.from("bingo_players")
      .select("id").eq("room_id", roomId).eq("user_id", profile.id).single();
    if (!existing) {
      const { count: playerCount } = await supabase
        .from("bingo_players").select("id", { count: "exact" }).eq("room_id", roomId);
      if (playerCount >= MAX_PLAYERS) { alert("Sala llena"); setLoading(false); return; }
      await supabase.from("bingo_players").insert({
        room_id: roomId, user_id: profile.id, username: profile.username,
        avatar: profile.avatar || "🎲", card_count: 0, ready: false, cards: [],
      });
    }
    subscribeToRoom(roomId);
    await loadRoom(roomId);
    setMyCards([]);
    setPhase("room_lobby");
    setLoading(false);
  }

  async function buyCard() {
    if (myCards.length >= MAX_CARDS || balance < CARD_PRICE) return;
    setLoading(true);
    const newCard = generateCard();
    newCard[2][2] = "FREE"; // centro libre
    const updatedCards = [...myCards, newCard];
    const newBalance   = balance - CARD_PRICE;
    await supabase.from("profiles").update({ balance: newBalance }).eq("id", profile.id);
    setBalance(newBalance);
    balRef.current = newBalance;
    const roomId = room?.id;
    await supabase.from("bingo_players").update({
      card_count: updatedCards.length, cards: updatedCards,
    }).eq("room_id", roomId).eq("user_id", profile.id);
    const { data: allPlayers } = await supabase.from("bingo_players").select("card_count").eq("room_id", roomId);
    const totalCards = (allPlayers || []).reduce((s, p) => s + (p.card_count || 0), 0);
    await supabase.from("bingo_rooms").update({ prize: Prize(totalCards * CARD_PRICE) }).eq("id", roomId);
    setMyCards(updatedCards);
    await loadRoom(roomId);
    setLoading(false);
  }

  async function markReady() {
    if (myCards.length === 0) return;
    setLoading(true);
    const roomId = room?.id;
    await supabase.from("bingo_players").update({ ready: true }).eq("room_id", roomId).eq("user_id", profile.id);
    await loadRoom(roomId);
    const { data: players } = await supabase.from("bingo_players").select("ready, card_count").eq("room_id", roomId);
    if (players?.every(p => p.ready && p.card_count > 0) && players.length >= 2) {
      await startGame(roomId);
    }
    setLoading(false);
  }

  async function startGame(roomId) {
    const balls = Array.from({length: 75}, (_, i) => i + 1).sort(() => Math.random() - 0.5);
    await supabase.from("bingo_rooms").update({
      status: "playing", all_balls: balls, called_balls: [],
    }).eq("id", roomId);
    startBallExtraction(roomId, balls);
  }

  function startBallExtraction(roomId, balls) {
    let index = 0;
    const called = [];
    const interval = setInterval(async () => {
      if (index >= balls.length) { clearInterval(interval); return; }
      const ball = balls[index];
      called.push(ball);
      index++;
      await supabase.from("bingo_rooms").update({ called_balls: [...called] }).eq("id", roomId);

      const { data: players } = await supabase.from("bingo_players").select("*").eq("room_id", roomId);
      const { data: roomData } = await supabase.from("bingo_rooms").select("prize").eq("id", roomId).single();
      const markedSet = new Set(called);
      for (const player of (players || [])) {
        for (const card of (player.cards || [])) {
          const winPattern = checkWin(card, markedSet);
          if (winPattern) {
            clearInterval(interval);
            await supabase.from("bingo_rooms").update({
              status: "finished", winner_id: player.user_id, win_pattern: winPattern,
            }).eq("id", roomId);
            const { data: winProfile } = await supabase.from("profiles").select("balance").eq("id", player.user_id).single();
            if (winProfile) {
              await supabase.from("profiles").update({ balance: winProfile.balance + roomData.prize }).eq("id", player.user_id);
            }
            return;
          }
        }
      }
    }, BALL_INTERVAL);
  }

  async function leaveRoom() {
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (room?.id) {
      if (myCards.length > 0) {
        const refund = myCards.length * CARD_PRICE;
        const newBal = balRef.current + refund;
        await supabase.from("profiles").update({ balance: newBal }).eq("id", profile.id);
        setBalance(newBal);
        balRef.current = newBal;
      }
      await supabase.from("bingo_players").delete().eq("room_id", room.id).eq("user_id", profile.id);
      const { count } = await supabase.from("bingo_players").select("id", { count: "exact" }).eq("room_id", room.id);
      if (count === 0) await supabase.from("bingo_rooms").delete().eq("id", room.id);
    }
    setRoom(null); setMyCards([]); setCalledNumbers(new Set()); setPlayerMarked(new Set());
    setCalledBalls([]); setCountdown(BALL_INTERVAL / 1000);
    setPhase("lobby_list");
    await loadRooms();
  }

  // ─── CSS compartido ────────────────────────────────────────────────────────
  const globalCss = `
    @keyframes ballPop  { from { transform: scale(0.5); opacity:0 } to { transform: scale(1); opacity:1 } }
    @keyframes cellPulse { 0%,100% { box-shadow: 0 0 0 0 #f5a62300 } 50% { box-shadow: 0 0 0 4px #f5a62355 } }
    @keyframes winGlow  { 0%,100% { box-shadow: 0 0 20px #fbbf2444 } 50% { box-shadow: 0 0 40px #fbbf24aa } }
  `;

  // ═══════════════════════════════════════════════════════════
  //  RENDER — Lista de salas
  // ═══════════════════════════════════════════════════════════
  if (phase === "lobby_list") return (
    <div style={{ minHeight: "100vh", background: "#07070f", color: "#fff", fontFamily: "'Georgia', serif", padding: "0 0 40px" }}>
      <style>{globalCss}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "rgba(0,0,0,0.4)", borderBottom: "1px solid #1e1e2e", marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: "rgba(10,10,18,0.75)", border: "1px solid #2a2a3a", borderRadius: 8, color: "#aaa", fontSize: 13, padding: "6px 14px", cursor: "pointer" }}>← Volver</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#fbbf24", fontWeight: 900, fontSize: 22 }}>🎱 Bingo</div>
          <div style={{ color: "#555", fontSize: 11 }}>Multijugador P2P · $20.000/cartón</div>
        </div>
        <div style={{ color: "#fbbf24", fontWeight: 700 }}>💰 {balance.toLocaleString()}</div>
      </div>

      <div style={{ padding: "0 16px", maxWidth: "100%", margin: "0 auto" }}>
        <button onClick={createRoom} disabled={loading || balance < CARD_PRICE} style={{
          width: "100%", padding: "14px",
          background: loading || balance < CARD_PRICE ? "#1a1a26" : "linear-gradient(135deg, #fbbf24, #f97316)",
          border: "none", borderRadius: 12, fontSize: 16, fontWeight: 900,
          cursor: "pointer", color: loading || balance < CARD_PRICE ? "#444" : "#000", marginBottom: 20,
        }}>
          {loading ? "Creando..." : "🎱 Crear nueva sala"}
        </button>

        <div style={{ background: "rgba(251,191,36,0.06)", border: "1px solid #fbbf2422", borderRadius: 12, padding: "12px 16px", marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Economía de la mesa</div>
          {[
            ["💰 Costo por cartón", "$20.000"],
            ["🎴 Máx. cartones",    "3 por jugador"],
            ["👥 Máx. jugadores",   "10 por sala"],
            ["🏆 Premio máximo",    "$570.000 (pozo lleno)"],
            ["🏦 Comisión casino",  "5%"],
          ].map(([label, val]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}>
              <span style={{ color: "#666" }}>{label}</span>
              <span style={{ color: "#ddd", fontWeight: 700 }}>{val}</span>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
          Salas abiertas ({rooms.length})
        </div>
        {rooms.length === 0 ? (
          <div style={{ background: "rgba(13,13,20,0.8)", border: "1px solid #1e1e2e", borderRadius: 12, padding: "32px", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🎱</div>
            <div style={{ color: "#555" }}>No hay salas activas · Crea una nueva</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rooms.map(r => {
              const pCount = r.bingo_players?.[0]?.count || 0;
              return (
                <div key={r.id} style={{ background: "rgba(13,13,20,0.9)", border: "1px solid #2a2a3a", borderRadius: 12, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700, color: "#fbbf24" }}>Sala #{r.id?.slice(-6)}</div>
                    <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{pCount}/{MAX_PLAYERS} jugadores</div>
                  </div>
                  <button onClick={() => joinRoom(r.id)} disabled={loading} style={{ background: "#fbbf24", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 800, cursor: "pointer", color: "#000" }}>
                    Unirse →
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════
  //  RENDER — Lobby de sala
  // ═══════════════════════════════════════════════════════════
  if (phase === "room_lobby") return (
    <div style={{ minHeight: "100vh", background: "#07070f", color: "#fff", fontFamily: "'Georgia', serif", padding: "0 0 40px" }}>
      <style>{globalCss}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "rgba(0,0,0,0.4)", borderBottom: "1px solid #1e1e2e", marginBottom: 20 }}>
        <button onClick={leaveRoom} style={{ background: "rgba(10,10,18,0.75)", border: "1px solid #2a2a3a", borderRadius: 8, color: "#aaa", fontSize: 13, padding: "6px 14px", cursor: "pointer" }}>← Salir</button>
        <div style={{ color: "#fbbf24", fontWeight: 900, fontSize: 18 }}>🎱 Sala de espera</div>
        <div style={{ color: "#fbbf24", fontWeight: 700, fontSize: 13 }}>💰 {balance.toLocaleString()}</div>
      </div>
      <div style={{ padding: "0 16px" }}>
        {room && <RoomLobby room={room} myCards={myCards} onBuyCard={buyCard} onReady={markReady} balance={balance} loading={loading} />}
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════
  //  RENDER — Partida en curso
  // ═══════════════════════════════════════════════════════════
  if (phase === "playing") {
    // ── Cambio 2: color del temporizador según urgencia ──────
    const timerColor = countdown <= 1 ? "#00d4aa"
                     : countdown <= 2 ? "#fbbf24"
                     : "#555";

    return (
      <div style={{ minHeight: "100vh", background: "#07070f", color: "#fff", fontFamily: "'Georgia', serif", paddingBottom: 40 }}>
        <style>{globalCss}</style>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", background: "rgba(0,0,0,0.5)", borderBottom: "1px solid #1e1e2e", position: "sticky", top: 0, zIndex: 10 }}>
          <div style={{ color: "#fbbf24", fontWeight: 900, fontSize: 16 }}>🎱 BINGO EN VIVO</div>
          <div style={{ background: "rgba(0,212,170,0.1)", border: "1px solid #00d4aa44", borderRadius: 8, padding: "4px 12px", color: "#00d4aa", fontWeight: 800, fontSize: 14 }}>
            🏆 ${(room?.prize || 0).toLocaleString()}
          </div>
          <div style={{ color: "#fbbf24", fontSize: 13 }}>💰 {balance.toLocaleString()}</div>
        </div>

        <div style={{ padding: "12px 12px", maxWidth: "100%", margin: "0 auto" }}>

          {/* ── Cambio 2: bola cantada + temporizador ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24, marginBottom: 14 }}>
            {/* Bola */}
            <div style={{ textAlign: "center" }}>
              {justCalled ? (
                <div style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  background: `radial-gradient(circle, ${colColor(justCalled)}, ${colColor(justCalled)}aa)`,
                  borderRadius: "50%", width: 80, height: 80,
                  fontSize: 28, fontWeight: 900, color: "#fff",
                  boxShadow: `0 0 40px ${colColor(justCalled)}88`,
                  animation: "ballPop 0.3s ease",
                }}>
                  {justCalled}
                </div>
              ) : (
                <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#1e1e2e", borderRadius: "50%", width: 80, height: 80, fontSize: 14, color: "#444" }}>
                  {calledBalls.length === 0 ? "..." : "—"}
                </div>
              )}
              <div style={{ marginTop: 6, fontSize: 12, color: "#555" }}>
                {calledBalls.length}/75 bolas
              </div>
            </div>

            {/* Temporizador próxima bola */}
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#444", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>
                Próxima bola
              </div>
              {/* Anillo animado */}
              <svg width={68} height={68} style={{ display: "block", margin: "0 auto" }}>
                <circle cx={34} cy={34} r={28} fill="none" stroke="#1e1e2e" strokeWidth={6} />
                <circle
                  cx={34} cy={34} r={28}
                  fill="none"
                  stroke={timerColor}
                  strokeWidth={6}
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 28}`}
                  strokeDashoffset={`${2 * Math.PI * 28 * (1 - countdown / (BALL_INTERVAL / 1000))}`}
                  transform="rotate(-90 34 34)"
                  style={{ transition: "stroke-dashoffset 0.9s linear, stroke 0.3s" }}
                />
                <text x={34} y={34} textAnchor="middle" dominantBaseline="central"
                  fill={timerColor} fontSize={22} fontWeight={900} style={{ transition: "fill 0.3s" }}>
                  {countdown}
                </text>
              </svg>
            </div>
          </div>

          {/* Historial de bolas */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center", marginBottom: 14, maxHeight: 80, overflow: "hidden" }}>
            {calledBalls.slice(-25).map(n => (
              <div key={n} style={{
                width: 28, height: 28, borderRadius: "50%",
                background: colColor(n) + "33",
                border: `1px solid ${colColor(n)}66`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 700, color: colColor(n),
              }}>{n}</div>
            ))}
          </div>

          {/* ── Cambio 3: cartones con marcado manual ── */}
          <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
            Mis cartones · <span style={{ color: "#f5a623" }}>Toca los números para marcarlos</span>
          </div>
          <div style={{ display: "flex", gap: 8, paddingBottom: 8 }}>
            {myCards.map((card, i) => (
              <BingoCard
                key={i}
                card={card}
                calledNumbers={calledNumbers}
                playerMarked={playerMarked}
                onMarkNumber={toggleMark}
                isWinner={!!myWin}
                justCalled={justCalled}
              />
            ))}
          </div>

          {/* Leyenda */}
          <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#555", marginTop: 8, flexWrap: "wrap" }}>
            <span><span style={{ color: "#f5a623" }}>⬛ Naranja</span> = cantada, ¡márcala!</span>
            <span><span style={{ color: "#00d4aa" }}>⬛ Verde</span> = marcada por ti</span>
            <span><span style={{ color: "#00d4aa" }}>⬛ Destello</span> = recién cantada</span>
          </div>

          {/* Jugadores */}
          <div style={{ marginTop: 16, background: "rgba(13,13,20,0.8)", border: "1px solid #1e1e2e", borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ fontSize: 10, color: "#555", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
              Jugadores ({room?.players?.length || 0})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {(room?.players || []).map(p => (
                <div key={p.user_id} style={{ background: "#0d0d14", borderRadius: 8, padding: "5px 10px", fontSize: 12, color: "#aaa" }}>
                  {p.avatar} {p.username} · 🎴×{p.card_count}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  //  RENDER — Resultado final
  //  Cambio 1: siempre muestra nombre del ganador + monto
  // ═══════════════════════════════════════════════════════════
  if (phase === "finished") {
    const iWon = winner?.isMe;
    return (
      <div style={{
        minHeight: "100vh", background: "#07070f", color: "#fff",
        fontFamily: "'Georgia', serif",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}>
        <style>{globalCss}</style>

        <div style={{
          textAlign: "center", maxWidth: 420, width: "100%",
          background: "rgba(13,13,20,0.95)",
          border: `2px solid ${iWon ? "#fbbf24" : "#2a2a3a"}`,
          borderRadius: 20, padding: "32px 24px",
          boxShadow: iWon ? "0 0 60px #fbbf2433" : "0 0 20px #00000088",
          animation: iWon ? "winGlow 2s ease-in-out infinite" : "none",
        }}>
          {/* Ícono principal */}
          <div style={{ fontSize: 72, marginBottom: 8 }}>
            {iWon ? "🏆" : "🎱"}
          </div>

          {/* ── GANADOR: nombre + avatar siempre visible ── */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 10,
            background: iWon ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${iWon ? "#fbbf2444" : "#2a2a3a"}`,
            borderRadius: 12, padding: "10px 18px",
            marginBottom: 16,
          }}>
            <span style={{ fontSize: 32 }}>{winner?.avatar}</span>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1 }}>
                {iWon ? "¡Tú ganaste!" : "Ganador"}
              </div>
              <div style={{ fontWeight: 900, fontSize: 20, color: iWon ? "#fbbf24" : "#ddd" }}>
                {winner?.username}
              </div>
            </div>
          </div>

          {/* Patrón ganador */}
          <div style={{ fontSize: 13, color: "#555", marginBottom: 12 }}>
            Patrón: <span style={{ color: "#aaa", fontWeight: 700 }}>{winner?.pattern}</span>
          </div>

          {/* Premio */}
          <div style={{
            fontSize: 40, fontWeight: 900,
            color: iWon ? "#00d4aa" : "#666",
            marginBottom: 8,
          }}>
            {iWon ? "+" : ""} ${(winner?.prize || 0).toLocaleString()}
          </div>
          <div style={{ fontSize: 13, color: "#444", marginBottom: 28 }}>
            {iWon ? "🎉 ¡Felicidades! El premio ya está en tu saldo." : "Mejor suerte en la próxima partida."}
          </div>

          {/* Botones */}
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button
              onClick={() => {
                setPhase("lobby_list"); setRoom(null); setMyCards([]);
                setCalledNumbers(new Set()); setPlayerMarked(new Set());
                setCalledBalls([]); setWinner(null); setMyWin(null);
                setCountdown(BALL_INTERVAL / 1000);
                loadRooms();
              }}
              style={{ background: "#fbbf24", border: "none", borderRadius: 10, padding: "12px 28px", fontSize: 15, fontWeight: 900, cursor: "pointer", color: "#000" }}
            >
              🎱 Jugar otra vez
            </button>
            <button onClick={onBack} style={{ background: "transparent", border: "1px solid #444", borderRadius: 10, padding: "12px 20px", fontSize: 14, color: "#888", cursor: "pointer" }}>
              ← Lobby
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
