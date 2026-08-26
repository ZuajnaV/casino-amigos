import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase";
import { usePokerRealtime } from "./poker/usePokerRealtime";

// ═══════════════════════════════════════════════════════════════
//  CONSTANTES
// ═══════════════════════════════════════════════════════════════
const CARD_SUITS   = { s: "♠", h: "♥", d: "♦", c: "♣" };
const SUIT_COLOR   = { s: "#e2e8f0", h: "#ef4444", d: "#ef4444", c: "#e2e8f0" };
const RANK_DISPLAY = { T: "10", J: "J", Q: "Q", K: "K", A: "A" };
const SEAT_POSITIONS = [
  { top: "82%", left: "50%",  transform: "translate(-50%,-50%)" }, // 0 — bottom center (tú)
  { top: "65%", left: "88%",  transform: "translate(-50%,-50%)" }, // 1 — bottom right
  { top: "28%", left: "82%",  transform: "translate(-50%,-50%)" }, // 2 — top right
  { top: "12%", left: "50%",  transform: "translate(-50%,-50%)" }, // 3 — top center
  { top: "28%", left: "18%",  transform: "translate(-50%,-50%)" }, // 4 — top left
  { top: "65%", left: "12%",  transform: "translate(-50%,-50%)" }, // 5 — bottom left
];
const TURN_SECONDS = 20;

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════
function parseCard(card) {
  if (!card || card.length < 2) return { rank: "?", suit: "s", display: "?" };
  const rank = card.slice(0, -1);
  const suit  = card.slice(-1);
  return { rank, suit, display: RANK_DISPLAY[rank] || rank };
}

/*
function api(path, body) {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(r => r.json());
}*/

// ═══════════════════════════════════════════════════════════════
//  COMPONENTE: Carta individual
// ═══════════════════════════════════════════════════════════════
function Card({ card, faceDown = false, small = false, animate = false }) {
  const sz = small ? { w: 32, h: 44, font: 11, suitFont: 9 }
                   : { w: 52, h: 72, font: 17, suitFont: 13 };

  if (faceDown) return (
    <div style={{
      width: sz.w, height: sz.h, borderRadius: 6,
      background: "linear-gradient(135deg, #1e3a5f 0%, #0f2030 100%)",
      border: "1.5px solid #2a4a6f",
      boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: sz.suitFont + 2, flexShrink: 0,
    }}>
      <div style={{ opacity: 0.3, color: "#60a5fa", fontSize: sz.suitFont + 4 }}>🂠</div>
    </div>
  );

  const { rank, suit, display } = parseCard(card);
  const color = SUIT_COLOR[suit] || "#e2e8f0";

  return (
    <div style={{
      width: sz.w, height: sz.h, borderRadius: 6,
      background: "linear-gradient(160deg, #1a1a2e 0%, #16213e 100%)",
      border: `1.5px solid ${color}44`,
      boxShadow: animate ? `0 0 18px ${color}55, 0 4px 12px rgba(0,0,0,0.6)` : "0 2px 8px rgba(0,0,0,0.5)",
      display: "flex", flexDirection: "column",
      padding: "3px 4px", flexShrink: 0,
      transition: "box-shadow 0.3s ease",
      animation: animate ? "cardReveal 0.4s ease" : "none",
    }}>
      <div style={{ fontSize: sz.font, fontWeight: 900, color, lineHeight: 1, fontFamily: "Georgia, serif" }}>
        {display}
      </div>
      <div style={{ fontSize: sz.suitFont, color, lineHeight: 1 }}>{CARD_SUITS[suit]}</div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: sz.font + 4, color, opacity: 0.7 }}>{CARD_SUITS[suit]}</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  COMPONENTE: Temporizador de turno
// ═══════════════════════════════════════════════════════════════
function TurnTimer({ expiresAt, isMyTurn }) {
  const [pct, setPct] = useState(100);

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const remaining = expiresAt - Date.now();
      setPct(Math.max(0, (remaining / (TURN_SECONDS * 1000)) * 100));
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [expiresAt]);

  const color = pct > 50 ? "#22c55e" : pct > 20 ? "#f59e0b" : "#ef4444";
  const r = 28, stroke = 4, norm = r - stroke / 2;
  const circ = 2 * Math.PI * norm;

  return (
    <svg width={r*2} height={r*2} style={{ position: "absolute", top: -r, left: -r, pointerEvents: "none" }}>
      <circle cx={r} cy={r} r={norm} fill="none" stroke="#1e1e2e" strokeWidth={stroke} />
      <circle
        cx={r} cy={r} r={norm} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - pct / 100)}
        strokeLinecap="round"
        transform={`rotate(-90 ${r} ${r})`}
        style={{ transition: "stroke-dashoffset 0.1s linear, stroke 0.3s" }}
      />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════
//  COMPONENTE: Asiento de jugador
// ═══════════════════════════════════════════════════════════════
function PlayerSeat({
  player, isMe, isEmpty, seatIndex, isCurrentTurn,
  expiresAt, dealerSeat, sbUserId, bbUserId,
  myHoleCards, onSit, revealedCards,
}) {
  const pos = SEAT_POSITIONS[seatIndex];

  if (isEmpty) return (
    <div onClick={() => onSit(seatIndex)} style={{
      position: "absolute", ...pos,
      width: 72, height: 72, borderRadius: "50%",
      background: "rgba(255,255,255,0.04)",
      border: "2px dashed rgba(255,255,255,0.15)",
      display: "flex", alignItems: "center", justifyContent: "center",
      cursor: "pointer", transition: "all 0.2s",
      fontSize: 22, color: "rgba(255,255,255,0.3)",
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = "#fbbf24"}
      onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"}
    >
      +
    </div>
  );

  const isFolded  = player.status === "folded";
  const isAllIn   = player.status === "all_in";
  const isDealerS = player.seat_index === dealerSeat;
  const isSB      = player.user_id === sbUserId;
  const isBB      = player.user_id === bbUserId;
  const cards     = isMe ? (myHoleCards || []) : (revealedCards?.[player.user_id] || []);
  const showCards = cards.length === 2;

  return (
    <div style={{
      position: "absolute", ...pos,
      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
      opacity: isFolded ? 0.4 : 1,
      transition: "opacity 0.3s",
      zIndex: isCurrentTurn ? 20 : 10,
    }}>
      {/* Cartas sobre el avatar */}
      <div style={{ display: "flex", gap: 3, marginBottom: 2 }}>
        {showCards
          ? cards.map((c, i) => <Card key={i} card={c} small animate={isMe} />)
          : [0,1].map(i => <Card key={i} faceDown small />)
        }
      </div>

      {/* Avatar + temporizador */}
      <div style={{ position: "relative", width: 52, height: 52 }}>
        {isCurrentTurn && (
          <TurnTimer expiresAt={expiresAt} isMyTurn={isMe} />
        )}
        <div style={{
          width: 52, height: 52, borderRadius: "50%",
          background: isCurrentTurn
            ? "linear-gradient(135deg, #fbbf24, #f97316)"
            : isFolded ? "#1a1a26"
            : "linear-gradient(135deg, #1e3a5f, #0f2030)",
          border: `2px solid ${isCurrentTurn ? "#fbbf24" : isMe ? "#3b82f6" : "#2a3a4f"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, boxShadow: isCurrentTurn ? "0 0 20px #fbbf2466" : "none",
          transition: "all 0.3s",
        }}>
          {player.avatar || "🎰"}
        </div>

        {/* Badges de rol */}
        {isDealerS && (
          <div style={{
            position: "absolute", top: -6, right: -6,
            background: "#fbbf24", color: "#000",
            borderRadius: "50%", width: 18, height: 18,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 9, fontWeight: 900,
          }}>D</div>
        )}
        {isSB && !isDealerS && (
          <div style={{
            position: "absolute", top: -6, right: -6,
            background: "#3b82f6", color: "#fff",
            borderRadius: "50%", width: 18, height: 18,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 8, fontWeight: 900,
          }}>SB</div>
        )}
        {isBB && (
          <div style={{
            position: "absolute", top: -6, left: -6,
            background: "#ef4444", color: "#fff",
            borderRadius: "50%", width: 18, height: 18,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 8, fontWeight: 900,
          }}>BB</div>
        )}
        {isAllIn && (
          <div style={{
            position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%)",
            background: "#a855f7", color: "#fff",
            borderRadius: 4, padding: "1px 5px",
            fontSize: 7, fontWeight: 900, whiteSpace: "nowrap",
          }}>ALL IN</div>
        )}
      </div>

      {/* Nombre + fichas */}
      <div style={{ textAlign: "center" }}>
        <div style={{
          fontSize: 11, fontWeight: 700,
          color: isMe ? "#60a5fa" : "#cbd5e1",
          maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{player.username}</div>
        <div style={{ fontSize: 10, color: "#64748b" }}>
          💰 {(player.chips_stack || 0).toLocaleString()}
        </div>
        {player.current_bet > 0 && (
          <div style={{
            fontSize: 10, fontWeight: 700, color: "#fbbf24",
            background: "rgba(251,191,36,0.1)", borderRadius: 4,
            padding: "1px 6px", marginTop: 2,
          }}>
            Apuesta: {player.current_bet.toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  COMPONENTE: Panel de control de apuestas
// ═══════════════════════════════════════════════════════════════
function BettingControls({ room, myPlayer, onAction, disabled }) {
  const [raiseAmount, setRaiseAmount] = useState(0);
  const bigBlind = room?.big_blind || 1000;
  const maxBet   = myPlayer?.chips_stack || 0;
  const callAmt  = Math.max(0, (room?.current_high_bet || 0) - (myPlayer?.current_bet || 0));
  const canCheck = callAmt === 0;
  const pot      = room?.pot_total || 0;

  useEffect(() => {
    setRaiseAmount(Math.min(bigBlind * 2, maxBet));
  }, [bigBlind, maxBet]);

  if (!myPlayer || disabled) return null;

  const btn = (label, color, onClick, enabled = true) => (
    <button onClick={onClick} disabled={!enabled} style={{
      padding: "12px 20px", borderRadius: 10, border: "none",
      background: enabled ? color : "#1a1a26",
      color: enabled ? "#fff" : "#444",
      fontWeight: 800, fontSize: 14, cursor: enabled ? "pointer" : "not-allowed",
      transition: "all 0.15s",
      boxShadow: enabled ? `0 4px 14px ${color}55` : "none",
    }}
      onMouseEnter={e => enabled && (e.currentTarget.style.transform = "translateY(-2px)")}
      onMouseLeave={e => enabled && (e.currentTarget.style.transform = "translateY(0)")}
    >{label}</button>
  );

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0,
      background: "linear-gradient(0deg, rgba(7,7,15,0.98) 0%, rgba(7,7,15,0.85) 100%)",
      borderTop: "1px solid rgba(255,255,255,0.07)",
      padding: "14px 20px", zIndex: 100,
    }}>
      {/* Raise slider */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: "#64748b", whiteSpace: "nowrap" }}>Subir a:</span>
        <input
          type="range" min={bigBlind * 2} max={maxBet} step={bigBlind}
          value={raiseAmount}
          onChange={e => setRaiseAmount(Number(e.target.value))}
          style={{ flex: 1, accentColor: "#fbbf24" }}
        />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#fbbf24", minWidth: 70, textAlign: "right" }}>
          {raiseAmount.toLocaleString()}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          {[
            { label: "2BB",  val: bigBlind * 2 },
            { label: "3BB",  val: bigBlind * 3 },
            { label: "Pot",  val: pot },
            { label: "A-In", val: maxBet },
          ].map(({ label, val }) => (
            <button key={label} onClick={() => setRaiseAmount(Math.min(val, maxBet))} style={{
              padding: "4px 8px", fontSize: 10, fontWeight: 700,
              background: "#1e1e2e", border: "1px solid #2a2a3a",
              borderRadius: 6, color: "#94a3b8", cursor: "pointer",
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Botones principales */}
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        {btn("🗑 Fold",  "#7f1d1d", () => onAction("fold"))}
        {canCheck
          ? btn("✓ Check", "#1e40af", () => onAction("check"))
          : btn(`📞 Call ${callAmt.toLocaleString()}`, "#1e40af", () => onAction("call"), callAmt > 0)
        }
        {btn(
          `⬆ Raise ${raiseAmount.toLocaleString()}`,
          "#92400e",
          () => onAction("raise", raiseAmount),
          raiseAmount >= bigBlind * 2 && raiseAmount > callAmt
        )}
        {btn("💥 All-In", "#7e22ce", () => onAction("all_in"), maxBet > 0)}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  COMPONENTE: Lobby de salas
// ═══════════════════════════════════════════════════════════════
function PokerLobby({ profile, balance, onJoinRoom, onCreateRoom }) {
  const [rooms,    setRooms]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadRooms();
    const ch = supabase.channel("poker_lobby")
      .on("postgres_changes", { event: "*", schema: "public", table: "poker_rooms" }, loadRooms)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  async function loadRooms() {
    const { data } = await supabase.from("poker_rooms")
      .select("*, poker_players(count)")
      .not("status", "eq", "finished")
      .order("created_at", { ascending: false });
    if (data) setRooms(data);
    setLoading(false);
  }

  /*
  async function createRoom() {
    setCreating(true);
    const res = await api("/api/poker/create", {
      userId: profile.id,
      name: `Mesa de ${profile.username}`,
      smallBlind: 500, bigBlind: 1000,
      buyInMin: 10000, buyInMax: 200000, maxSeats: 6,
    });
    setCreating(false);
    if (res.room) onCreateRoom(res.room);
  }*/

  async function createRoom() {
  setCreating(true);
  try {
    const { data: room, error } = await supabase
      .from("poker_rooms")
      .insert({
        name:        `Mesa de ${profile.username}`,
        small_blind: 500,
        big_blind:   1000,
        buy_in_min:  10000,
        buy_in_max:  200000,
        max_seats:   6,
        status:      "waiting",
      })
      .select()
      .single();
    if (error) throw error;
    onCreateRoom(room);
  } catch (e) {
    console.error("Error creando mesa:", e.message);
  } finally {
    setCreating(false);
  }
}





  return (
    <div style={{
      maxWidth: 700, margin: "0 auto", padding: "0 16px 40px",
    }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 38 }}>🃏</div>
        <div style={{ fontSize: 26, fontWeight: 900, color: "#22c55e", letterSpacing: 2, marginTop: 4 }}>
          TEXAS HOLD'EM
        </div>
        <div style={{ fontSize: 12, color: "#475569", marginTop: 4, letterSpacing: 1 }}>
          NO-LIMIT · 2–6 JUGADORES
        </div>
      </div>

      <button onClick={createRoom} disabled={creating} style={{
        width: "100%", padding: "14px", marginBottom: 16,
        background: creating ? "#1a1a26" : "linear-gradient(135deg, #22c55e, #16a34a)",
        border: "none", borderRadius: 12,
        color: creating ? "#444" : "#000", fontSize: 15, fontWeight: 800,
        cursor: creating ? "not-allowed" : "pointer",
        boxShadow: creating ? "none" : "0 4px 20px rgba(34,197,94,0.3)",
      }}>
        {creating ? "Creando..." : "+ Crear nueva mesa"}
      </button>

      {loading ? (
        <div style={{ textAlign: "center", color: "#475569", padding: 40 }}>Cargando mesas...</div>
      ) : rooms.length === 0 ? (
        <div style={{
          textAlign: "center", padding: 40, color: "#334155",
          border: "1px dashed #1e293b", borderRadius: 12,
        }}>
          No hay mesas disponibles.<br/>
          <span style={{ color: "#22c55e", cursor: "pointer" }} onClick={createRoom}>
            Crea la primera
          </span>
        </div>
      ) : rooms.map(room => {
        const playerCount = room.poker_players?.[0]?.count || 0;
        const isFull      = playerCount >= room.max_seats;
        return (
          <div key={room.id} style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 12, padding: "14px 16px", marginBottom: 8,
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#e2e8f0" }}>{room.name}</div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 3 }}>
                BB {room.big_blind.toLocaleString()} · Buy-in {room.buy_in_min.toLocaleString()}–{room.buy_in_max.toLocaleString()}
              </div>
            </div>
            <div style={{ fontSize: 11, color: isFull ? "#ef4444" : "#22c55e" }}>
              {playerCount}/{room.max_seats}
            </div>
            <div style={{
              fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
              background: room.status === "playing" ? "#1e3a2e" : "#1e293b",
              color: room.status === "playing" ? "#22c55e" : "#64748b",
            }}>
              {room.status === "playing" ? "EN JUEGO" : "ESPERANDO"}
            </div>
            <button
              onClick={() => !isFull && onJoinRoom(room)}
              disabled={isFull}
              style={{
                padding: "8px 16px", borderRadius: 8, border: "none",
                background: isFull ? "#1a1a26" : "#22c55e",
                color: isFull ? "#444" : "#000",
                fontWeight: 700, fontSize: 12, cursor: isFull ? "not-allowed" : "pointer",
              }}
            >
              {isFull ? "Llena" : "Entrar"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  COMPONENTE: Diálogo de buy-in
// ═══════════════════════════════════════════════════════════════
function BuyInDialog({ room, seatIndex, balance, onConfirm, onCancel }) {
  const [amount, setAmount] = useState(room.buy_in_min);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
    }}>
      <div style={{
        background: "#0f0f1a", border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 16, padding: 28, width: 340,
      }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#22c55e", marginBottom: 4 }}>
          Sentarse en asiento {seatIndex + 1}
        </div>
        <div style={{ fontSize: 12, color: "#475569", marginBottom: 20 }}>
          BB: {room.big_blind.toLocaleString()} · Tu saldo: {balance.toLocaleString()}
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 6 }}>
            Buy-in ({room.buy_in_min.toLocaleString()} – {room.buy_in_max.toLocaleString()})
          </label>
          <input
            type="range"
            min={room.buy_in_min} max={Math.min(room.buy_in_max, balance)}
            step={room.big_blind}
            value={amount}
            onChange={e => setAmount(Number(e.target.value))}
            style={{ width: "100%", accentColor: "#22c55e" }}
          />
          <div style={{ textAlign: "center", fontSize: 22, fontWeight: 900, color: "#22c55e", marginTop: 8 }}>
            {amount.toLocaleString()}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: 12, borderRadius: 10, border: "1px solid #2a2a3a",
            background: "transparent", color: "#64748b", fontWeight: 700, cursor: "pointer",
          }}>Cancelar</button>
          <button onClick={() => onConfirm(amount, seatIndex)} style={{
            flex: 1, padding: 12, borderRadius: 10, border: "none",
            background: "linear-gradient(135deg, #22c55e, #16a34a)",
            color: "#000", fontWeight: 800, cursor: "pointer",
          }}>Sentarse</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  COMPONENTE: Mesa de juego
// ═══════════════════════════════════════════════════════════════
function PokerTable({ room, players, profile, myHoleCards, expiresAt, onAction, onLeave, revealedCards, toast }) {
  const myPlayer = players.find(p => p.user_id === profile.id);
  const isMyTurn = room?.current_turn_user_id === profile.id;
  const [sitTarget, setSitTarget] = useState(null);
  const [joining,   setJoining]   = useState(false);

  const maxSeats = room?.max_seats || 6;
  const seats    = Array.from({ length: maxSeats }, (_, i) => {
    const player = players.find(p => p.seat_index === i);
    return { index: i, player, isEmpty: !player };
  });

  async function handleSit(seatIndex) {
    if (myPlayer) return;
    setSitTarget(seatIndex);
  }

  /*
  async function confirmBuyIn(amount, seatIndex) {
    setJoining(true);
    await api("/api/poker/join", {
      userId: profile.id, roomId: room.id,
      seatIndex, buyIn: amount,
      username: profile.username,
      avatar: profile.avatar || "🎰",
    });
    setSitTarget(null);
    setJoining(false);
  }*/



  async function confirmBuyIn(amount, seatIndex) {
  setJoining(true);
  try {
    const { error } = await supabase.rpc("sit_at_poker_table", {
      p_user_id:  profile.id,
      p_room_id:  room.id,
      p_seat:     seatIndex,
      p_buy_in:   amount,
      p_username: profile.username,
      p_avatar:   profile.avatar || "🎰",
    });
    if (error) throw error;

    // Ver si hay 2+ jugadores para iniciar
    const { data: players } = await supabase
      .from("poker_players")
      .select("id")
      .eq("room_id", room.id)
      .neq("status", "sitting_out");

    if (players?.length >= 2) {
      await supabase.from("poker_rooms")
        .update({ status: "playing" })
        .eq("id", room.id);
    }
  } catch (e) {
    console.error("Error al sentarse:", e.message);
  } finally {
    setSitTarget(null);
    setJoining(false);
  }
}




  return (
    <div style={{
      position: "relative", width: "100%", height: "100vh",
      background: "radial-gradient(ellipse at 50% 50%, #0a1628 0%, #050810 100%)",
      overflow: "hidden",
    }}>
      <style>{`
        @keyframes cardReveal {
          0%   { transform: rotateY(90deg) scale(0.8); opacity: 0; }
          60%  { transform: rotateY(-10deg) scale(1.05); }
          100% { transform: rotateY(0deg) scale(1); opacity: 1; }
        }
        @keyframes chipFly {
          0%   { transform: translate(0,0) scale(1); opacity: 1; }
          100% { transform: translate(0,-60px) scale(0); opacity: 0; }
        }
        @keyframes toastIn {
          0%   { transform: translateY(20px); opacity: 0; }
          15%  { transform: translateY(0); opacity: 1; }
          85%  { transform: translateY(0); opacity: 1; }
          100% { transform: translateY(-20px); opacity: 0; }
        }
      `}</style>

      {/* Mesa ovalada */}
      <div style={{
        position: "absolute",
        top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        width: "64%", height: "52%",
        borderRadius: "50%",
        background: "radial-gradient(ellipse at 50% 40%, #1a4731 0%, #0d2b1e 60%, #0a2218 100%)",
        border: "14px solid #2d1a0e",
        boxShadow: `
          0 0 0 3px #4a2d0f,
          0 0 60px rgba(0,0,0,0.8),
          inset 0 0 80px rgba(0,0,0,0.4)
        `,
        zIndex: 1,
      }}>
        {/* Logo central */}
        <div style={{
          position: "absolute", top: "15%", left: "50%",
          transform: "translateX(-50%)",
          fontSize: 11, color: "rgba(255,255,255,0.08)",
          fontWeight: 900, letterSpacing: 4, textTransform: "uppercase",
        }}>Casino Amigos</div>

        {/* Bote */}
        {(room?.pot_total || 0) > 0 && (
          <div style={{
            position: "absolute", top: "30%", left: "50%",
            transform: "translateX(-50%)",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 2, textTransform: "uppercase" }}>
              Bote
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: "#fbbf24",
              textShadow: "0 0 20px rgba(251,191,36,0.5)" }}>
              {room.pot_total.toLocaleString()}
            </div>
          </div>
        )}

        {/* Cartas comunitarias */}
        <div style={{
          position: "absolute", bottom: "20%", left: "50%",
          transform: "translateX(-50%)",
          display: "flex", gap: 6,
        }}>
          {(room?.community_cards || []).map((card, i) => (
            <Card key={i} card={card} animate />
          ))}
          {/* Slots vacíos */}
          {Array.from({ length: Math.max(0, 5 - (room?.community_cards?.length || 0)) }, (_, i) => (
            <div key={`empty-${i}`} style={{
              width: 52, height: 72, borderRadius: 6,
              border: "1px dashed rgba(255,255,255,0.08)",
            }} />
          ))}
        </div>

        {/* Fase */}
        {room?.phase && room.phase !== "waiting" && (
          <div style={{
            position: "absolute", bottom: "8%", left: "50%",
            transform: "translateX(-50%)",
            fontSize: 10, color: "rgba(255,255,255,0.25)",
            letterSpacing: 2, textTransform: "uppercase",
          }}>
            {room.phase.toUpperCase()}
          </div>
        )}
      </div>

      {/* Asientos */}
      {seats.slice(0, maxSeats).map(({ index, player, isEmpty }) => (
        <PlayerSeat
          key={index}
          seatIndex={index}
          player={player}
          isEmpty={isEmpty}
          isMe={player?.user_id === profile.id}
          isCurrentTurn={player?.user_id === room?.current_turn_user_id}
          expiresAt={player?.user_id === room?.current_turn_user_id ? expiresAt : null}
          dealerSeat={room?.dealer_seat}
          sbUserId={room?.sb_user_id}
          bbUserId={room?.bb_user_id}
          myHoleCards={myHoleCards}
          revealedCards={revealedCards}
          onSit={handleSit}
        />
      ))}

      {/* Header */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "10px 16px",
        background: "linear-gradient(180deg, rgba(5,8,16,0.95) 0%, transparent 100%)",
        zIndex: 30,
      }}>
        <button onClick={onLeave} style={{
          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8, color: "#64748b", fontSize: 12, padding: "6px 12px", cursor: "pointer",
        }}>← Salir</button>

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#22c55e" }}>{room?.name}</div>
          <div style={{ fontSize: 10, color: "#475569" }}>
            BB {room?.big_blind?.toLocaleString()} · {players.length} jugadores
          </div>
        </div>

        <div style={{
          background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)",
          borderRadius: 20, padding: "5px 12px", fontSize: 12, fontWeight: 700, color: "#fbbf24",
        }}>
          {myPlayer ? `💰 ${myPlayer.chips_stack.toLocaleString()}` : `Saldo: ${profile.balance?.toLocaleString()}`}
        </div>
      </div>

      {/* Toast de eventos */}
      {toast && (
        <div style={{
          position: "fixed", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          background: "rgba(0,0,0,0.92)", border: "1px solid rgba(251,191,36,0.3)",
          borderRadius: 14, padding: "16px 28px", textAlign: "center", zIndex: 150,
          animation: "toastIn 3s ease forwards",
          boxShadow: "0 0 40px rgba(251,191,36,0.2)",
        }}>
          <div style={{ fontSize: 26 }}>{toast.emoji}</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#fbbf24", marginTop: 6 }}>{toast.title}</div>
          {toast.sub && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{toast.sub}</div>}
        </div>
      )}

      {/* Controles de apuesta */}
      {isMyTurn && myPlayer && (
        <BettingControls
          room={room}
          myPlayer={myPlayer}
          onAction={onAction}
          disabled={!isMyTurn}
        />
      )}

      {/* Diálogo de buy-in */}
      {sitTarget !== null && (
        <BuyInDialog
          room={room}
          seatIndex={sitTarget}
          balance={profile.balance}
          onConfirm={confirmBuyIn}
          onCancel={() => setSitTarget(null)}
        />
      )}

      {/* Esperando jugadores */}
      {room?.status === "waiting" && players.length < 2 && (
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          background: "rgba(0,0,0,0.7)", borderRadius: 12, padding: "16px 24px",
          textAlign: "center", zIndex: 5, pointerEvents: "none",
        }}>
          <div style={{ fontSize: 12, color: "#475569", letterSpacing: 1 }}>
            Esperando {2 - players.length} jugador{players.length === 0 ? "es" : ""} más...
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  COMPONENTE RAÍZ: PokerGame
// ═══════════════════════════════════════════════════════════════
export default function PokerGame({ profile, balance, setBalance, onBack }) {
  const [view,          setView]         = useState("lobby");  // lobby | table
  const [activeRoom,    setActiveRoom]   = useState(null);
  const [myHoleCards,   setMyHoleCards]  = useState([]);
  const [revealedCards, setRevealedCards]= useState({});
  const [expiresAt,     setExpiresAt]    = useState(null);
  const [toast,         setToast]        = useState(null);
  const toastTimer = useRef(null);

  // ── Mostrar toast ──────────────────────────────────────────
  function showToast(emoji, title, sub) {
    clearTimeout(toastTimer.current);
    setToast({ emoji, title, sub });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }

  // ── Handler de eventos Realtime ────────────────────────────
  function handleEvent(event, payload) {
    switch (event) {
      case "YOUR_HOLE_CARDS":
        setMyHoleCards(payload.cards || []);
        setRevealedCards({});
        break;

      case "NEXT_TURN":
        setExpiresAt(payload.expiresAt);
        break;

      case "HAND_STARTED":
        setExpiresAt(payload.expiresAt);
        setRevealedCards({});
        showToast("🃏", "Nueva mano", `Dealer: Asiento ${(payload.dealerSeat || 0) + 1}`);
        break;

      case "PLAYER_ACTION": {
        const icons = { fold:"🗑", check:"✓", call:"📞", bet:"💰", raise:"⬆", all_in:"💥" };
        showToast(icons[payload.action] || "🎲", payload.username, payload.action.toUpperCase() + (payload.amount ? ` · ${payload.amount.toLocaleString()}` : ""));
        break;
      }

      case "DEAL_COMMUNITY_CARDS":
        showToast("🃏", payload.phase.toUpperCase(), `${payload.newCards.length} carta${payload.newCards.length > 1 ? "s" : ""} comunitaria${payload.newCards.length > 1 ? "s" : ""}`);
        break;

      case "SHOWDOWN_REVEAL":
        const revealed = {};
        (payload.players || []).forEach(p => { revealed[p.userId] = p.holeCards; });
        setRevealedCards(revealed);
        break;

      case "SHOWDOWN_WINNER":
        if (payload.userId === profile.id) {
          showToast("🏆", `¡Ganaste! +${payload.potWon.toLocaleString()}`, payload.byFold ? "Los demás se rindieron" : payload.handName);
          setBalance(b => b + payload.potWon);
        } else {
          showToast("😔", `${payload.username} gana`, `+${payload.potWon?.toLocaleString()}`);
        }
        break;

      case "PLAYER_JOINED":
        showToast("👋", `${payload.username} se unió`, `Asiento ${(payload.seatIndex || 0) + 1}`);
        break;

      case "PLAYER_LEFT":
        showToast("🚪", "Un jugador se fue", "");
        break;
    }
  }

  // ── Hook de Realtime ───────────────────────────────────────
  const { room, players, sendAction, reload } = usePokerRealtime(
    activeRoom?.id,
    profile?.id,
    handleEvent,
  );

  // ── Entrar a una sala ──────────────────────────────────────
  function enterRoom(room) {
    setActiveRoom(room);
    setMyHoleCards([]);
    setRevealedCards({});
    setView("table");
  }

  // ── Salir de la sala ───────────────────────────────────────
  /*
  async function leaveRoom() {
    if (activeRoom && profile) {
      await api("/api/poker/leave", { userId: profile.id, roomId: activeRoom.id });
    }
    setActiveRoom(null);
    setMyHoleCards([]);
    setView("lobby");
  }*/

async function leaveRoom() {
  if (activeRoom && profile) {
    try {
      const { data: player } = await supabase
        .from("poker_players")
        .select("chips_stack")
        .eq("room_id", activeRoom.id)
        .eq("user_id", profile.id)
        .single();

      if (player?.chips_stack > 0) {
        const newBal = balance + player.chips_stack;
        await supabase.from("profiles")
          .update({ balance: newBal })
          .eq("id", profile.id);
        setBalance(newBal);
      }

      await supabase.from("poker_players")
        .update({ status: "sitting_out", chips_stack: 0 })
        .eq("room_id", activeRoom.id)
        .eq("user_id", profile.id);
    } catch (e) {
      console.error("Error al salir:", e.message);
    }
  }
  setActiveRoom(null);
  setMyHoleCards([]);
  setView("lobby");
}


  // ── Enviar acción ──────────────────────────────────────────
  async function handleAction(action, amount = 0) {
    await sendAction(action, amount);
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#050810",
      color: "#fff", fontFamily: "'Inter', system-ui, sans-serif",
      overflowY: view === "lobby" ? "auto" : "hidden",
    }}>
      {/* Header solo en lobby */}
      {view === "lobby" && (
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)",
          position: "sticky", top: 0, background: "#050810", zIndex: 10,
        }}>
          <button onClick={onBack} style={{
            background: "transparent", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8, color: "#64748b", fontSize: 12, padding: "6px 12px", cursor: "pointer",
          }}>← Lobby</button>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#22c55e" }}>🃏 Póquer</div>
          <div style={{ fontSize: 12, color: "#fbbf24" }}>💰 {balance.toLocaleString()}</div>
        </div>
      )}

      {view === "lobby" && (
        <PokerLobby
          profile={profile}
          balance={balance}
          onJoinRoom={enterRoom}
          onCreateRoom={enterRoom}
        />
      )}

      {view === "table" && room && (
        <PokerTable
          room={room}
          players={players}
          profile={{ ...profile, balance }}
          myHoleCards={myHoleCards}
          expiresAt={expiresAt}
          revealedCards={revealedCards}
          onAction={handleAction}
          onLeave={leaveRoom}
          toast={toast}
        />
      )}
    </div>
  );
}
