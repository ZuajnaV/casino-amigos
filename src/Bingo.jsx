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
// Rangos por columna: B=1-15, I=16-30, N=31-45, G=46-60, O=61-75
const COL_RANGES    = [[1,15],[16,30],[31,45],[46,60],[61,75]];

// Patrones de victoria: línea horizontal, vertical, diagonal y cartón lleno
const WIN_PATTERNS = {
  /*"Línea H1": [[0,0],[0,1],[0,2],[0,3],[0,4]],
  "Línea H2": [[1,0],[1,1],[1,2],[1,3],[1,4]],
  "Línea H3": [[2,0],[2,1],[2,2],[2,3],[2,4]],
  "Línea H4": [[3,0],[3,1],[3,2],[3,3],[3,4]],
  "Línea H5": [[4,0],[4,1],[4,2],[4,3],[4,4]],
  "Línea V1": [[0,0],[1,0],[2,0],[3,0],[4,0]],
  "Línea V2": [[0,1],[1,1],[2,1],[3,1],[4,1]],
  "Línea V3": [[0,2],[1,2],[2,2],[3,2],[4,2]],
  "Línea V4": [[0,3],[1,3],[2,3],[3,3],[4,3]],
  "Línea V5": [[0,4],[1,4],[2,4],[3,4],[4,4]],
  "Diagonal ↘": [[0,0],[1,1],[2,2],[3,3],[4,4]],
  "Diagonal ↙": [[0,4],[1,3],[2,2],[3,1],[4,0]],    */
  "Cartón lleno": Array.from({length:5},(_,r)=>Array.from({length:5},(_,c)=>[r,c])).flat(),
};

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════
function generateCard() {
  return COL_RANGES.map(([min, max]) => {
    const pool = Array.from({length: max - min + 1}, (_, i) => i + min);
    const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, 5);
    return shuffled;
  });
  // Devuelve array[5 cols][5 filas] → acceso: card[col][row]
}

function cardHasNumber(card, num) {
  return card.some(col => col.includes(num));
}

function checkWin(card, markedSet) {
  // card[col][row], markedSet = Set de números cantados
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

// ═══════════════════════════════════════════════════════════════
//  COMPONENTE CARTÓN
// ═══════════════════════════════════════════════════════════════
function BingoCard({ card, markedNumbers, isWinner, cardIndex, justCalled }) {
  return (
    <div style={{
      background: isWinner ? "rgba(251,191,36,0.12)" : "rgba(13,13,20,0.9)",
      border: `2px solid ${isWinner ? "#fbbf24" : "#2a2a3a"}`,
      borderRadius: 12,
      overflow: "hidden",
      boxShadow: isWinner ? "0 0 24px #fbbf2444" : "none",
      transition: "all 0.3s",
      //minWidth: 180,
      width: 400,
    }}>
      {/* Header BINGO */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)" }}>
        {BINGO_LETTERS.map((l, i) => (
          <div key={l} style={{
            background: ["#ef4444","#3b82f6","#22c55e","#f59e0b","#a855f7"][i],
            textAlign: "center", padding: "6px 0",
            fontWeight: 900, fontSize: 18, color: "#fff",
            letterSpacing: 1,
          }}>{l}</div>
        ))}
      </div>

      {/* Números */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 2, padding: 4 }}>
        {Array.from({length: 5}, (_, row) =>
          Array.from({length: 5}, (_, col) => {
            const num = card[col][row];
            const isFree  = num === "FREE";
            const isMarked = isFree || markedNumbers.has(num);
            const isNew   = justCalled === num;
            return (
              <div key={`${row}-${col}`} style={{
                aspectRatio: "1",
                display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 6,
                background: isFree    ? "#fbbf2433"
                           : isNew   ? "#00d4aa"
                           : isMarked ? "#1e3a2e"
                           : "#0d0d18",
                border: isNew ? "2px solid #00d4aa" : isMarked ? "1px solid #00d4aa55" : "1px solid #1e1e2e",
                fontSize: 15, fontWeight: isMarked ? 800 : 400,     //CAMBIAR TAMAÑO NUMEROS
                color: isFree    ? "#fbbf24"
                     : isNew    ? "#000"
                     : isMarked ? "#00d4aa"
                     : "#555",
                transition: "all 0.2s",
                transform: isNew ? "scale(1.08)" : "scale(1)",
              }}>
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
      {/* Info sala */}
      <div style={{
        background: "rgba(13,13,20,0.9)", border: "1px solid #2a2a3a",
        borderRadius: 12, padding: "14px 16px",
      }}>
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
            ["🎴 Cartones", `${totalCards}/30`],
            ["💰 Pozo bruto", `$${gross.toLocaleString()}`],
          ].map(([label, val]) => (
            <div key={label} style={{ background: "#0d0d14", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "#555" }}>{label}</div>
              <div style={{ fontWeight: 700, color: "#ddd", fontSize: 13, marginTop: 2 }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Mis cartones */}
      <div>
        <div style={{ fontSize: 12, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
          Mis cartones ({myCount}/{MAX_CARDS})
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", flexDirection: "column" }}>
          {myCards.map((card, i) => (
            <BingoCard key={i} card={card} markedNumbers={new Set()} isWinner={false} cardIndex={i} justCalled={null} />
          ))}
        </div>
        <button
          onClick={onBuyCard}
          disabled={!canBuy || loading}
          style={{
            marginTop: 10,
            background: canBuy ? "#fbbf24" : "#1a1a26",
            border: "none", borderRadius: 10,
            padding: "10px 20px", fontSize: 14, fontWeight: 800,
            cursor: canBuy ? "pointer" : "not-allowed",
            color: canBuy ? "#000" : "#444",
          }}
        >
          {loading ? "..." : `🎴 Comprar cartón ($${CARD_PRICE.toLocaleString()})`}
          {!canBuy && myCount === 0 && " — Sin saldo"}
          {!canBuy && myCount >= MAX_CARDS && " — Máximo alcanzado"}
        </button>
      </div>

      {/* Jugadores en sala */}
      <div style={{
        background: "rgba(13,13,20,0.9)", border: "1px solid #1e1e2e",
        borderRadius: 12, padding: "12px 14px",
      }}>
        <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
          Jugadores en sala
        </div>
        {(room.players || []).map(p => (
          <div key={p.user_id} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "6px 0", borderBottom: "1px solid #1e1e2e",
          }}>
            <span style={{ color: "#bbb", fontSize: 13 }}>{p.avatar} {p.username}</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: "#555", fontSize: 12 }}>🎴 ×{p.card_count}</span>
              {p.ready
                ? <span style={{ color: "#00d4aa", fontSize: 11, fontWeight: 700 }}>✓ Listo</span>
                : <span style={{ color: "#444", fontSize: 11 }}>Esperando</span>
              }
            </div>
          </div>
        ))}
      </div>

      {/* Botón listo */}
      {myCount > 0 && (
        <button
          onClick={onReady}
          disabled={isReady || loading}
          style={{
            background: isReady ? "#1a1a26" : "linear-gradient(135deg, #00d4aa, #059669)",
            border: "none", borderRadius: 10,
            padding: "13px", fontSize: 15, fontWeight: 900,
            cursor: isReady ? "not-allowed" : "pointer",
            color: isReady ? "#444" : "#000",
          }}
        >
          {isReady ? "✓ Esperando a los demás..." : "✅ ¡Estoy listo!"}
        </button>
      )}

      <div style={{ fontSize: 11, color: "#333", textAlign: "center" }}>
        La partida inicia cuando todos los jugadores confirmen estar listos · Mín. 2 jugadores
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════
export default function BingoGame({ profile, balance, setBalance, onBack }) {
  // ── Fases: "lobby_list" | "room_lobby" | "playing" | "finished"
  const [phase,      setPhase]      = useState("lobby_list");
  const [rooms,      setRooms]      = useState([]);
  const [room,       setRoom]       = useState(null);
  const [myCards,    setMyCards]    = useState([]);       // array de cartones generados
  const [markedNums, setMarkedNums] = useState(new Set()); // números cantados
  const [calledBalls,setCalledBalls]= useState([]);       // historial de bolas
  const [justCalled, setJustCalled] = useState(null);     // última bola (animación)
  const [winner,     setWinner]     = useState(null);     // { username, pattern, prize }
  const [myWin,      setMyWin]      = useState(null);     // patrón ganador propio
  const [loading,    setLoading]    = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [earned,     setEarned]     = useState(0);

  const balRef      = useRef(balance);
  const channelRef  = useRef(null);
  const roomRef     = useRef(room);

  useEffect(() => { balRef.current  = balance; }, [balance]);
  useEffect(() => { roomRef.current = room;    }, [room]);

  // ═══════════════════════════════════════════════════════════
  //  REALTIME SUBSCRIPTION
  // ═══════════════════════════════════════════════════════════
  const subscribeToRoom = useCallback((roomId) => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const ch = supabase
      .channel(`bingo_room_${roomId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "bingo_rooms",
        filter: `id=eq.${roomId}`,
      }, ({ new: newRoom }) => {
        if (!newRoom) return;
        setRoom(prev => ({ ...prev, ...newRoom }));

        // Detectar nueva bola
        const balls = newRoom.called_balls || [];
        if (balls.length > (roomRef.current?.called_balls?.length || 0)) {
          const lastBall = balls[balls.length - 1];
          setJustCalled(lastBall);
          setCalledBalls(balls);
          setMarkedNums(new Set(balls));
          setTimeout(() => setJustCalled(null), 1500);
        }

        // Detectar ganador
        if (newRoom.status === "finished" && newRoom.winner_id) {
          const winnerPlayer = newRoom.players?.find(p => p.user_id === newRoom.winner_id);
          setWinner({
            username: winnerPlayer?.username || "Alguien",
            avatar:   winnerPlayer?.avatar   || "🎲",
            pattern:  newRoom.win_pattern,
            prize:    newRoom.prize,
          });
          if (newRoom.winner_id === profile.id) {
            setEarned(newRoom.prize);
            saveWin(newRoom.prize);
          }
          setPhase("finished");
        }

        // Detectar inicio de partida
        if (newRoom.status === "playing" && phase !== "playing") {
          setPhase("playing");
        }
      })
      .on("postgres_changes", {
        event: "*", schema: "public", table: "bingo_players",
        filter: `room_id=eq.${roomId}`,
      }, () => {
        // Recargar jugadores de la sala
        loadRoom(roomId);
      })
      .subscribe();

    channelRef.current = ch;
  }, [profile.id, phase]);

  // ── Cargar salas disponibles ──────────────────────────────
  async function loadRooms() {
    const { data } = await supabase
      .from("bingo_rooms")
      .select("*, bingo_players(count)")
      .eq("status", "waiting")
      .order("created_at", { ascending: false })
      .limit(10);
    setRooms(data || []);
  }

  // ── Cargar sala específica con jugadores ──────────────────
  async function loadRoom(roomId) {
    const [{ data: roomData }, { data: players }] = await Promise.all([
      supabase.from("bingo_rooms").select("*").eq("id", roomId).single(),
      supabase.from("bingo_players").select("user_id, username, avatar, card_count, ready, cards").eq("room_id", roomId),
    ]);
    if (roomData) {
      setRoom({ ...roomData, players: players || [], myId: profile.id });
    }
  }

  useEffect(() => {
    loadRooms();
    // Actualizar lista de salas en tiempo real
    const ch = supabase
      .channel("bingo_rooms_list")
      .on("postgres_changes", {
        event: "*", schema: "public", table: "bingo_rooms",
      }, loadRooms)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  // ── Guardar ganancia ──────────────────────────────────────
  async function saveWin(amount) {
    setSaving(true);
    const newBal = balRef.current + amount;
    setBalance(newBal);
    balRef.current = newBal;
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase.from("profiles").update({ balance: newBal }).eq("id", session.user.id);
    }
    setSaving(false);
  }

  // ── Crear sala nueva ──────────────────────────────────────
  async function createRoom() {
    setLoading(true);
    const { data, error } = await supabase.from("bingo_rooms").insert({
      status:       "waiting",
      called_balls: [],
      host_id:      profile.id,
      prize:        0,
      winner_id:    null,
      win_pattern:  null,
    }).select().single();

    if (error || !data) { setLoading(false); return; }

    await supabase.from("bingo_players").insert({
      room_id:    data.id,
      user_id:    profile.id,
      username:   profile.username,
      avatar:     profile.avatar || "🎲",
      card_count: 0,
      ready:      false,
      cards:      [],
    });

    setRoom({ ...data, players: [], myId: profile.id });
    setMyCards([]);
    subscribeToRoom(data.id);
    await loadRoom(data.id);
    setPhase("room_lobby");
    setLoading(false);
  }

  // ── Unirse a sala existente ───────────────────────────────
  async function joinRoom(roomId) {
    setLoading(true);

    // Verificar si ya está en la sala
    const { data: existing } = await supabase
      .from("bingo_players")
      .select("id")
      .eq("room_id", roomId)
      .eq("user_id", profile.id)
      .single();

    if (!existing) {
      const { data: roomData } = await supabase
        .from("bingo_rooms").select("*").eq("id", roomId).single();

      const playerCount = (await supabase
        .from("bingo_players").select("id", { count: "exact" })
        .eq("room_id", roomId)).count;

      if (playerCount >= MAX_PLAYERS) {
        alert("Sala llena");
        setLoading(false);
        return;
      }

      await supabase.from("bingo_players").insert({
        room_id:    roomId,
        user_id:    profile.id,
        username:   profile.username,
        avatar:     profile.avatar || "🎲",
        card_count: 0,
        ready:      false,
        cards:      [],
      });
    }

    subscribeToRoom(roomId);
    await loadRoom(roomId);
    setMyCards([]);
    setPhase("room_lobby");
    setLoading(false);
  }

  // ── Comprar cartón ────────────────────────────────────────
  async function buyCard() {
    if (myCards.length >= MAX_CARDS || balance < CARD_PRICE) return;
    setLoading(true);

    const newCard = generateCard();
    // Celda central = FREE
    newCard[2][2] = "FREE";

    const updatedCards = [...myCards, newCard];
    const newBalance   = balance - CARD_PRICE;

    // Actualizar balance
    await supabase.from("profiles").update({ balance: newBalance }).eq("id", profile.id);
    setBalance(newBalance);
    balRef.current = newBalance;

    // Actualizar jugador en sala
    const roomId = room?.id;
    await supabase.from("bingo_players").update({
      card_count: updatedCards.length,
      cards:      updatedCards,
    }).eq("room_id", roomId).eq("user_id", profile.id);

    // Actualizar premio en sala
    const { data: allPlayers } = await supabase
      .from("bingo_players").select("card_count").eq("room_id", roomId);
    const totalCards = (allPlayers || []).reduce((s, p) => s + (p.card_count || 0), 0);
    const gross      = totalCards * CARD_PRICE;
    await supabase.from("bingo_rooms").update({ prize: Prize(gross) }).eq("id", roomId);

    setMyCards(updatedCards);
    await loadRoom(roomId);
    setLoading(false);
  }

  // ── Marcar listo ──────────────────────────────────────────
  async function markReady() {
    if (myCards.length === 0) return;
    setLoading(true);
    const roomId = room?.id;

    await supabase.from("bingo_players")
      .update({ ready: true })
      .eq("room_id", roomId)
      .eq("user_id", profile.id);

    await loadRoom(roomId);

    // Verificar si todos están listos para iniciar
    const { data: players } = await supabase
      .from("bingo_players").select("ready, card_count").eq("room_id", roomId);

    const allReady     = players?.every(p => p.ready && p.card_count > 0);
    const enoughPlayers = (players?.length || 0) >= 2;

    if (allReady && enoughPlayers) {
      await startGame(roomId);
    }

    setLoading(false);
  }

  // ── Iniciar partida (host) ────────────────────────────────
  async function startGame(roomId) {
    // Generar todas las bolas 1–75 mezcladas
    const balls = Array.from({length: 75}, (_, i) => i + 1)
      .sort(() => Math.random() - 0.5);

    await supabase.from("bingo_rooms").update({
      status:       "playing",
      all_balls:    balls,
      called_balls: [],
    }).eq("id", roomId);

    // Iniciar la extracción automática de bolas (función Edge o RPC)
    // Por simplicidad, aquí lo haremos desde el cliente del host
    startBallExtraction(roomId, balls);
  }

  // ── Extracción de bolas (solo el host lo ejecuta) ─────────
  function startBallExtraction(roomId, balls) {
    let index = 0;
    const called = [];

    const interval = setInterval(async () => {
      if (index >= balls.length) {
        clearInterval(interval);
        return;
      }

      const ball = balls[index];
      called.push(ball);
      index++;

      await supabase.from("bingo_rooms").update({
        called_balls: [...called],
      }).eq("id", roomId);

      // Verificar ganadores en todos los cartones
      const { data: players } = await supabase
        .from("bingo_players").select("*").eq("room_id", roomId);

      const { data: roomData } = await supabase
        .from("bingo_rooms").select("prize").eq("id", roomId).single();

      const markedSet = new Set(called);

      for (const player of (players || [])) {
        for (const card of (player.cards || [])) {
          const winPattern = checkWin(card, markedSet);
          if (winPattern) {
            clearInterval(interval);
            await supabase.from("bingo_rooms").update({
              status:      "finished",
              winner_id:   player.user_id,
              win_pattern: winPattern,
            }).eq("id", roomId);

            // Pagar al ganador
            const { data: winProfile } = await supabase
              .from("profiles").select("balance").eq("id", player.user_id).single();
            if (winProfile) {
              await supabase.from("profiles")
                .update({ balance: winProfile.balance + roomData.prize })
                .eq("id", player.user_id);
            }
            return;
          }
        }
      }
    }, 5000); //2000 Bola cada 2 segundos
  }

  // ── Salir de sala ─────────────────────────────────────────
  async function leaveRoom() {
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    if (room?.id) {
      // Devolver fichas si había cartones comprados
      if (myCards.length > 0) {
        const refund = myCards.length * CARD_PRICE;
        const newBal = balRef.current + refund;
        await supabase.from("profiles").update({ balance: newBal }).eq("id", profile.id);
        setBalance(newBal);
        balRef.current = newBal;
      }
      await supabase.from("bingo_players").delete()
        .eq("room_id", room.id).eq("user_id", profile.id);

      // Si no quedan jugadores, borrar la sala
      const { count } = await supabase
        .from("bingo_players").select("id", { count: "exact" })
        .eq("room_id", room.id);
      if (count === 0) {
        await supabase.from("bingo_rooms").delete().eq("id", room.id);
      }
    }
    setRoom(null);
    setMyCards([]);
    setMarkedNums(new Set());
    setCalledBalls([]);
    setPhase("lobby_list");
    await loadRooms();
  }

  // ═══════════════════════════════════════════════════════════
  //  RENDER — Lista de salas
  // ═══════════════════════════════════════════════════════════
  if (phase === "lobby_list") return (
    <div style={{
      minHeight: "100vh", background: "#07070f", color: "#fff",
      fontFamily: "'Georgia', serif", padding: "0 0 40px",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "12px 16px", background: "rgba(0,0,0,0.4)",
        borderBottom: "1px solid #1e1e2e", marginBottom: 20,
      }}>
        <button onClick={onBack} style={{
          background: "rgba(10,10,18,0.75)", border: "1px solid #2a2a3a",
          borderRadius: 8, color: "#aaa", fontSize: 13, padding: "6px 14px", cursor: "pointer",
        }}>← Volver</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#fbbf24", fontWeight: 900, fontSize: 22 }}>🎱 Bingo</div>
          <div style={{ color: "#555", fontSize: 11 }}>Multijugador P2P · $20.000/cartón</div>
        </div>
        <div style={{ color: "#fbbf24", fontWeight: 700 }}>💰 {balance.toLocaleString()}</div>
      </div>

      <div style={{ padding: "0 16px", maxWidth: 500, margin: "0 auto" }}>
        {/* Crear sala */}
        <button
          onClick={createRoom}
          disabled={loading || balance < CARD_PRICE}
          style={{
            width: "100%", padding: "14px",
            background: loading || balance < CARD_PRICE ? "#1a1a26" : "linear-gradient(135deg, #fbbf24, #f97316)",
            border: "none", borderRadius: 12,
            fontSize: 16, fontWeight: 900, cursor: "pointer",
            color: loading || balance < CARD_PRICE ? "#444" : "#000",
            marginBottom: 20,
          }}
        >
          {loading ? "Creando..." : "🎱 Crear nueva sala"}
        </button>

        {/* Info financiera */}
        <div style={{
          background: "rgba(251,191,36,0.06)", border: "1px solid #fbbf2422",
          borderRadius: 12, padding: "12px 16px", marginBottom: 20,
        }}>
          <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
            Economía de la mesa
          </div>
          {[
            ["💰 Costo por cartón", "$20.000"],
            ["🎴 Máx. cartones", "3 por jugador"],
            ["👥 Máx. jugadores", "10 por sala"],
            ["🏆 Premio máximo", "$570.000 (pozo lleno)"],
            ["🏦 Comisión casino", "5%"],
          ].map(([label, val]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}>
              <span style={{ color: "#666" }}>{label}</span>
              <span style={{ color: "#ddd", fontWeight: 700 }}>{val}</span>
            </div>
          ))}
        </div>

        {/* Salas disponibles */}
        <div style={{ fontSize: 12, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
          Salas abiertas ({rooms.length})
        </div>

        {rooms.length === 0 ? (
          <div style={{
            background: "rgba(13,13,20,0.8)", border: "1px solid #1e1e2e",
            borderRadius: 12, padding: "32px", textAlign: "center",
          }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🎱</div>
            <div style={{ color: "#555" }}>No hay salas activas · Crea una nueva</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rooms.map(r => {
              const pCount = r.bingo_players?.[0]?.count || 0;
              const gross  = (r.current_cards || 0) * CARD_PRICE;
              return (
                <div key={r.id} style={{
                  background: "rgba(13,13,20,0.9)", border: "1px solid #2a2a3a",
                  borderRadius: 12, padding: "12px 14px",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontWeight: 700, color: "#fbbf24" }}>Sala #{r.id?.slice(-6)}</div>
                    <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
                      {pCount}/{MAX_PLAYERS} jugadores · Pozo: ${Prize(gross).toLocaleString()}
                    </div>
                  </div>
                  <button
                    onClick={() => joinRoom(r.id)}
                    disabled={loading}
                    style={{
                      background: "#fbbf24", border: "none", borderRadius: 8,
                      padding: "8px 16px", fontSize: 13, fontWeight: 800,
                      cursor: "pointer", color: "#000",
                    }}
                  >
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
    <div style={{
      minHeight: "100vh", background: "#07070f", color: "#fff",
      fontFamily: "'Georgia', serif", padding: "0 0 40px",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "12px 16px", background: "rgba(0,0,0,0.4)",
        borderBottom: "1px solid #1e1e2e", marginBottom: 20,
      }}>
        <button onClick={leaveRoom} style={{
          background: "rgba(10,10,18,0.75)", border: "1px solid #2a2a3a",
          borderRadius: 8, color: "#aaa", fontSize: 13, padding: "6px 14px", cursor: "pointer",
        }}>← Salir</button>
        <div style={{ color: "#fbbf24", fontWeight: 900, fontSize: 18 }}>🎱 Sala de espera</div>
        <div style={{ color: "#fbbf24", fontWeight: 700, fontSize: 13 }}>💰 {balance.toLocaleString()}</div>
      </div>

      <div style={{ padding: "0 16px", maxWidth: 500, margin: "0 auto" }}>
        {room && (
          <RoomLobby
            room={room}
            myCards={myCards}
            onBuyCard={buyCard}
            onReady={markReady}
            balance={balance}
            loading={loading}
          />
        )}
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════
  //  RENDER — Partida en curso
  // ═══════════════════════════════════════════════════════════
  if (phase === "playing") return (
    <div style={{
      minHeight: "100vh", background: "#07070f", color: "#fff",
      fontFamily: "'Georgia', serif", paddingBottom: 40,
    }}>
      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "10px 16px", background: "rgba(0,0,0,0.5)",
        borderBottom: "1px solid #1e1e2e", position: "sticky", top: 0, zIndex: 10,
      }}>
        <div style={{ color: "#fbbf24", fontWeight: 900, fontSize: 16 }}>🎱 BINGO EN VIVO</div>
        <div style={{
          background: "rgba(0,212,170,0.1)", border: "1px solid #00d4aa44",
          borderRadius: 8, padding: "4px 12px",
          color: "#00d4aa", fontWeight: 800, fontSize: 14,
        }}>
          🏆 ${(room?.prize || 0).toLocaleString()}
        </div>
        <div style={{ color: "#fbbf24", fontSize: 13 }}>💰 {balance.toLocaleString()}</div>
      </div>

      <div style={{ padding: "12px 12px", maxWidth: 540, margin: "0 auto" }}>

        {/* Última bola cantada */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          {justCalled ? (
            <div style={{
              display: "inline-block",
              background: "radial-gradient(circle, #fbbf24, #f97316)",
              borderRadius: "50%", width: 80, height: 80,
              lineHeight: "80px", fontSize: 28, fontWeight: 900, color: "#000",
              boxShadow: "0 0 40px #fbbf2466",
              animation: "ballPop 0.3s ease",
            }}>
              {justCalled}
            </div>
          ) : (
            <div style={{
              display: "inline-block",
              background: "#1e1e2e", borderRadius: "50%",
              width: 80, height: 80, lineHeight: "80px",
              fontSize: 14, color: "#444",
            }}>
              {calledBalls.length === 0 ? "..." : "—"}
            </div>
          )}
          <style>{`@keyframes ballPop { from { transform: scale(0.5); opacity:0 } to { transform: scale(1); opacity:1 } }`}</style>
          <div style={{ marginTop: 6, fontSize: 12, color: "#555" }}>
            {calledBalls.length}/75 bolas cantadas
          </div>
        </div>

        {/* Historial de bolas */}
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 4,
          justifyContent: "center", marginBottom: 16,
          maxHeight: 80, overflow: "hidden",
        }}>
          {calledBalls.slice(-25).map(n => {
            const colIdx = Math.floor((n - 1) / 15);
            const colors = ["#ef4444","#3b82f6","#22c55e","#f59e0b","#a855f7"];
            return (
              <div key={n} style={{
                width: 28, height: 28, borderRadius: "50%",
                background: colors[colIdx] + "33",
                border: `1px solid ${colors[colIdx]}66`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 700, color: colors[colIdx],
              }}>{n}</div>
            );
          })}
        </div>

        {/* Mis cartones */}
        <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
          Mis cartones
        </div>
        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8 }}>
          {myCards.map((card, i) => (
            <BingoCard
              key={i}
              card={card}
              markedNumbers={markedNums}
              isWinner={!!myWin}
              cardIndex={i}
              justCalled={justCalled}
            />
          ))}
        </div>

        {/* Jugadores */}
        <div style={{
          marginTop: 16,
          background: "rgba(13,13,20,0.8)", border: "1px solid #1e1e2e",
          borderRadius: 10, padding: "10px 14px",
        }}>
          <div style={{ fontSize: 10, color: "#555", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
            Jugadores ({room?.players?.length || 0})
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {(room?.players || []).map(p => (
              <div key={p.user_id} style={{
                background: "#0d0d14", borderRadius: 8, padding: "5px 10px",
                fontSize: 12, color: "#aaa",
              }}>
                {p.avatar} {p.username} · 🎴×{p.card_count}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════
  //  RENDER — Resultado final
  // ═══════════════════════════════════════════════════════════
  if (phase === "finished") return (
    <div style={{
      minHeight: "100vh", background: "#07070f", color: "#fff",
      fontFamily: "'Georgia', serif",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: 24,
    }}>
      <div style={{ textAlign: "center", maxWidth: 380 }}>
        <div style={{ fontSize: 64, marginBottom: 12 }}>
          {winner?.username === profile.username ? "🏆" : "🎱"}
        </div>

        {winner?.username === profile.username ? (
          <>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#fbbf24", marginBottom: 8 }}>
              ¡GANASTE!
            </div>
            <div style={{ color: "#aaa", marginBottom: 8 }}>
              Patrón: <span style={{ color: "#fff", fontWeight: 700 }}>{winner.pattern}</span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#00d4aa", marginBottom: 24 }}>
              +${winner.prize.toLocaleString()} 🎉
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 24, fontWeight: 900, color: "#ff5555", marginBottom: 8 }}>
              ¡BINGO!
            </div>
            <div style={{ color: "#aaa", marginBottom: 4 }}>Ganó</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#fbbf24", marginBottom: 6 }}>
              {winner?.avatar} {winner?.username}
            </div>
            <div style={{ color: "#555", marginBottom: 8, fontSize: 13 }}>
              {winner?.pattern} · ${winner?.prize.toLocaleString()}
            </div>
            <div style={{ color: "#333", fontSize: 12, marginBottom: 24 }}>
              Mejor suerte la próxima vez
            </div>
          </>
        )}

        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button
            onClick={() => {
              setPhase("lobby_list");
              setRoom(null);
              setMyCards([]);
              setMarkedNums(new Set());
              setCalledBalls([]);
              setWinner(null);
              setMyWin(null);
              setEarned(0);
              loadRooms();
            }}
            style={{
              background: "#fbbf24", border: "none", borderRadius: 10,
              padding: "12px 28px", fontSize: 15, fontWeight: 900,
              cursor: "pointer", color: "#000",
            }}
          >🎱 Jugar otra vez</button>
          <button
            onClick={onBack}
            style={{
              background: "transparent", border: "1px solid #444",
              borderRadius: 10, padding: "12px 20px",
              fontSize: 14, color: "#888", cursor: "pointer",
            }}
          >← Lobby</button>
        </div>
      </div>
    </div>
  );

  return null;
}
