import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";
import { ASSETS } from "./ShopPanel.jsx";

// ─── CONFIGURACIÓN DEL BANCO ─────────────────────────────────────────────────
export const BANK_LEVELS = [
  {
    level: 0,
    name: "Nuevo",
    icon: "🏦",
    scRequired: 0,
    loanLimit: 500_000,
    rate: 0.25,          // 25% semanal
    moraRate: 0.02,      // +2% por día de mora sobre cuota restante
    products: ["Préstamo Menor"],
  },
  {
    level: 1,
    name: "Cliente",
    icon: "💳",
    scRequired: 3_000,
    loanLimit: 3_000_000,
    rate: 0.15,
    moraRate: 0.015,
    products: ["Préstamo Medio", "CDT"],
  },
  {
    level: 2,
    name: "Inversor",
    icon: "📈",
    scRequired: 6_000,
    loanLimit: 10_000_000,
    rate: 0.08,
    moraRate: 0.01,
    products: ["Préstamo Mayor", "CDT", "Fondo de Inversión"],
  },
];

// Precio de cada activo (para priorizar hipoteca por valor)
const ASSET_PRICES = Object.fromEntries(
  Object.values(ASSETS).map(a => [a.key, a.price])
);

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function daysBetween(dateA, dateB) {
  const msPerDay = 86_400_000;
  const a = new Date(dateA); a.setHours(0, 0, 0, 0);
  const b = new Date(dateB); b.setHours(0, 0, 0, 0);
  return Math.floor((b - a) / msPerDay);
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

function bankLevelFor(sc) {
  if (sc >= BANK_LEVELS[2].scRequired) return BANK_LEVELS[2];
  if (sc >= BANK_LEVELS[1].scRequired) return BANK_LEVELS[1];
  return BANK_LEVELS[0];
}

// ─── PROCESADOR AUTOMÁTICO DE CUOTAS ─────────────────────────────────────────
// Llámalo al montar el componente. Evalúa los días transcurridos desde
// next_payment y aplica las cuotas/mora que correspondan.
export async function processLoanPayments(userId, currentBalance) {
  const { data: loans } = await supabase
    .from("loans")
    .select("*")
    .eq("user_id", userId)
    //.eq("status", "active");
    .in("status", ["active", "pending_mortgage"])

  if (!loans || loans.length === 0) return { newBalance: currentBalance, events: [] };

  const today = todayStr();
  let balance = currentBalance;
  const events = [];

  for (const loan of loans) {
    const daysDue = daysBetween(loan.next_payment, today);
    if (daysDue <= 0) continue;  // aún no vence

    let { paid_amount, days_paid, mora_days, total_debt, daily_payment, next_payment } = loan;
    const remainingDebt = total_debt - paid_amount;
    if (remainingDebt <= 0) {
      await supabase.from("loans").update({ status: "paid" }).eq("id", loan.id);
      events.push({ type: "paid", loanId: loan.id });
      continue;
    }

    let currentNextPayment = next_payment;

    for (let d = 0; d < daysDue; d++) {
      // Calcular cuota del día (con mora acumulada)
      const moraMultiplier = 1 + loan.mora_days * 0.02; // +2% por cada día previo de mora
      const cuota = Math.round(daily_payment * moraMultiplier);
      const remDebt = total_debt - paid_amount;
      const toPay = Math.min(cuota, remDebt);

      if (balance >= toPay) {
        balance -= toPay;
        paid_amount += toPay;
        days_paid += 1;
        currentNextPayment = addDays(currentNextPayment, 1);
        events.push({ type: "payment", amount: toPay, day: days_paid });
      } else {
        mora_days += 1;
        currentNextPayment = addDays(currentNextPayment, 1);
        events.push({ type: "mora", moraDays: mora_days });
      }

      if (paid_amount >= total_debt) {
        // Préstamo saldado
        await supabase.from("loans").update({
          paid_amount, days_paid, mora_days,
          status: "paid",
          next_payment: currentNextPayment,
        }).eq("id", loan.id);
        // Actualizar balance en DB
        await supabase.from("profiles").update({ balance }).eq("id", userId);
        events.push({ type: "paid", loanId: loan.id });
        break;
      }

      // Verificar hipoteca (mora >= 7)
      if (mora_days >= 7) {
        events.push({ type: "mortgage_trigger", loanId: loan.id, remainingDebt: total_debt - paid_amount });
        await supabase.from("loans").update({
          paid_amount, days_paid, mora_days,
          next_payment: currentNextPayment,

          status: "pending_mortgage",

        }).eq("id", loan.id);
        break;
      }
    }

    // Actualizar préstamo si sigue activo
    const stillActive = (await supabase.from("loans").select("status").eq("id", loan.id).single())?.data?.status;
    if (stillActive === "active") {
      await supabase.from("loans").update({
        paid_amount, days_paid, mora_days,
        next_payment: currentNextPayment,
      }).eq("id", loan.id);
    }
  }

  // Guardar balance actualizado
  await supabase.from("profiles").update({ balance }).eq("id", userId);









// ── Verificar préstamos en grace period vencido ──
const { data: graceLoans } = await supabase
  .from("loans")
  .select("*")
  .eq("user_id", userId)
  .eq("status", "grace");

for (const graceLoan of (graceLoans || [])) {
  if (!graceLoan.grace_until) continue;
  const daysOverdue = daysBetween(graceLoan.grace_until, today);
  if (daysOverdue <= 0) continue;

  // Ejecución forzada: eliminar todos los activos hipotecados
  const { data: mortgagedAssets } = await supabase
    .from("player_assets")
    .select("*")
    .eq("user_id", userId)
    .eq("mortgaged", true);

  for (const asset of (mortgagedAssets || [])) {
    await supabase.from("player_assets").delete().eq("id", asset.id);
  }

  // Marcar préstamo como ejecutado
  await supabase.from("loans").update({
    status: "foreclosed",
    mora_days: 0,
  }).eq("id", graceLoan.id);

  events.push({ type: "foreclosure", loanId: graceLoan.id });
}
















  return { newBalance: balance, events };
}






// ─── PROCESADOR DE CDT (interés diario) ─────────────────────────────────────
export async function processCDT(userId, currentBalance, creditScore, bankLevel) {
  if (bankLevel < 1) return { newBalance: currentBalance, interest: 0 };

  const { data: profile } = await supabase
    .from("profiles")
    .select("cdt_last_processed")
    .eq("id", userId)
    .single();

  if (!profile) return { newBalance: currentBalance, interest: 0 };

  const today = todayStr();
  const lastProcessed = profile.cdt_last_processed || today;
  const daysPending = daysBetween(lastProcessed, today);

  if (daysPending <= 0) return { newBalance: currentBalance, interest: 0 };

  const TASA_BASE = 0.005;          // 0.5% diario
  const TECHO_AHORRO = 5_000_000;   // solo genera sobre los primeros 5M

  let balance = currentBalance;
  let totalInterest = 0;

  for (let d = 0; d < daysPending; d++) {
    const baseEfectiva = Math.min(balance, TECHO_AHORRO);
    //const tasa = TASA_BASE + (creditScore / 10000);
    const tasa = TASA_BASE + (creditScore / 1_000_000);
    const rendimiento = Math.floor(baseEfectiva * tasa);
    balance += rendimiento;
    totalInterest += rendimiento;
  }

  // Guardar nuevo balance y fecha
  await supabase.from("profiles").update({
    balance,
    cdt_last_processed: today,
  }).eq("id", userId);





  // Al final de processCDT, antes del update:
balance = Math.round(balance);
totalInterest = Math.round(totalInterest);

await supabase.from("profiles").update({
  balance,
  cdt_last_processed: today,
}).eq("id", userId);
  return { newBalance: balance, interest: totalInterest, daysPending };

}












export async function executeMortgage(userId, loanId, remainingDebt) {
  const { data: playerAssets } = await supabase
    .from("player_assets")
    .select("*")
    .eq("user_id", userId)
    .eq("mortgaged", false);

  const today = todayStr();

  // ── Sin activos → período de gracia 7 días ──
  if (!playerAssets || playerAssets.length === 0) {
    const graceUntil = addDays(today, 7);
    await supabase.from("loans").update({
      status: "grace",
      grace_until: graceUntil,
    }).eq("id", loanId);
    return { mortgaged: [], noAssets: true, graceUntil };
  }

  // Ordenar por precio descendente
  const sorted = [...playerAssets].sort(
    (a, b) => (ASSET_PRICES[b.asset_key] || 0) - (ASSET_PRICES[a.asset_key] || 0)
  );

  // Calcular valor total de activos disponibles
  const totalAssetValue = sorted.reduce(
    (sum, a) => sum + (ASSET_PRICES[a.asset_key] || 0) * a.quantity, 0
  );

  let covered = 0;
  const mortgaged = [];

  for (const asset of sorted) {
    if (covered >= remainingDebt) break;
    covered += (ASSET_PRICES[asset.asset_key] || 0) * asset.quantity;

    await supabase.from("player_assets")
      .update({ mortgaged: true })
      .eq("id", asset.id);
    mortgaged.push(asset.asset_key);

    // Restar SC
    const assetData = ASSETS[asset.asset_key];
    if (assetData) {
      const { data: prof } = await supabase
        .from("profiles").select("credit_score").eq("id", userId).single();
      if (prof) {
        await supabase.from("profiles")
          .update({ credit_score: Math.max(0, (prof.credit_score || 0) - assetData.sc * asset.quantity) })
          .eq("id", userId);
      }
    }
  }

  // ── Caso A y B: activos >= deuda → préstamo saldado ──
  if (totalAssetValue >= remainingDebt) {
    await supabase.from("loans").update({
      paid_amount: (await supabase.from("loans").select("total_debt").eq("id", loanId).single()).data?.total_debt || remainingDebt,
      mora_days: 0,
      status: "mortgaged",   // activo, deuda saldada — pero activos bloqueados
      mortgaged_at: today,
    }).eq("id", loanId);
    return { mortgaged, noAssets: false, debtCovered: true };
  }

  // ── Caso C: activos < deuda → mora prolongada ──
  const { data: loanData } = await supabase
    .from("loans").select("total_debt, paid_amount").eq("id", loanId).single();
  const newPaidAmount = (loanData?.paid_amount || 0) + totalAssetValue;
  const graceUntil = addDays(today, 7);

  await supabase.from("loans").update({
    paid_amount: newPaidAmount,
    mora_days: 0,
    status: "grace",
    mortgaged_at: today,
    grace_until: graceUntil,
  }).eq("id", loanId);

  return { mortgaged, noAssets: false, debtCovered: false, remaining: remainingDebt - totalAssetValue };
}



















/*
//Hipoteca automatica
export async function executeMortgage(userId, loanId, remainingDebt) {
  const { data: playerAssets } = await supabase
    .from("player_assets")
    .select("*")
    .eq("user_id", userId)
    .eq("mortgaged", false);

  if (!playerAssets || playerAssets.length === 0) {
    await supabase.from("loans").update({ status: "grace" }).eq("id", loanId);
    return { mortgaged: [], noAssets: true };
  }

  // Ordenar por precio descendente
  const sorted = [...playerAssets].sort(
    (a, b) => (ASSET_PRICES[b.asset_key] || 0) - (ASSET_PRICES[a.asset_key] || 0)
  );

  let covered = 0;
  const mortgaged = [];

  for (const asset of sorted) {
    if (covered >= remainingDebt) break;
    covered += (ASSET_PRICES[asset.asset_key] || 0) * asset.quantity;

    await supabase.from("player_assets")
      .update({ mortgaged: true })
      .eq("id", asset.id);
    mortgaged.push(asset.asset_key);

    // Restar SC del activo hipotecado
    const assetData = ASSETS[asset.asset_key];
    if (assetData) {
      const { data: prof } = await supabase
        .from("profiles").select("credit_score").eq("id", userId).single();
      if (prof) {
        await supabase.from("profiles")
          .update({ credit_score: Math.max(0, (prof.credit_score || 0) - assetData.sc * asset.quantity) })
          .eq("id", userId);
      }
    }
  }

  // ── CLAVE: saldar la deuda completamente ──
  await supabase.from("loans").update({
    paid_amount: (await supabase.from("loans").select("total_debt").eq("id", loanId).single())
      .data?.total_debt || remainingDebt,
    mora_days: 0,
    status: "paid",
  }).eq("id", loanId);

  return { mortgaged, noAssets: false };
}

*/












// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function BankPanel({ profile, balance, setBalance, onScChange }) {
  const [loan, setLoan]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [paying, setPaying]       = useState(false);
  const [loanAmount, setLoanAmount] = useState("");
  const [events, setEvents]       = useState([]);
  const [tab, setTab]             = useState("estado"); // "estado" | "pedir" | "info"
  const [creditScore, setCreditScore] = useState(profile.credit_score || 0);
  const [ownedAssets, setOwnedAssets] = useState([]);
  const [mortgageEvents, setMortgageEvents] = useState([]);


    const [cdtEvents, setCdtEvents] = useState(null);


  const bankLevel = bankLevelFor(creditScore);

  // ── Cargar préstamo activo + activos ───────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const [loanRes, assetsRes, profileRes] = await Promise.all([
      supabase.from("loans").select("*").eq("user_id", profile.id).eq("status", "active").order("created_at", { ascending: false }).limit(1),
      supabase.from("player_assets").select("*").eq("user_id", profile.id),
      supabase.from("profiles").select("credit_score").eq("id", profile.id).single(),
    ]);

    setLoan(loanRes.data?.[0] || null);
    setOwnedAssets(assetsRes.data || []);
    if (profileRes.data) setCreditScore(profileRes.data.credit_score || 0);
    setLoading(false);
  }, [profile.id]);

  useEffect(() => {
  async function init() {
    await load();

    // 1. Procesar cuotas de préstamo
    const result = await processLoanPayments(profile.id, balance);
    if (result.newBalance !== balance) setBalance(result.newBalance);

    // 2. Procesar CDT si el jugador es nivel 1+
    const sc = (await supabase.from("profiles").select("credit_score").eq("id", profile.id).single())?.data?.credit_score || 0;
    const lvl = bankLevelFor(sc);
    if (lvl.level >= 1) {
      const cdtResult = await processCDT(profile.id, result.newBalance, sc, lvl.level);
      if (cdtResult.interest > 0) {
        setBalance(cdtResult.newBalance);
        setCdtEvents({ interest: cdtResult.interest, days: cdtResult.daysPending });
      }
    }

    // 3. Hipoteca automática si aplica
    if (result.events.length > 0) {
      setEvents(result.events);
      const mortgageTrigger = result.events.find(e => e.type === "mortgage_trigger");
      if (mortgageTrigger) {
        const mResult = await executeMortgage(profile.id, mortgageTrigger.loanId, mortgageTrigger.remainingDebt);
        setMortgageEvents(mResult.mortgaged);
      }
      await load();
    }
  }
  init();
}, [profile.id]);

  // ── Solicitar préstamo ─────────────────────────────────────────────────────
  async function requestLoan() {
    //const amount = parseInt(loanAmount.replace(/\D/g, ""));
    const amount = parseInt(String(loanAmount));
    
    if (!amount || amount <= 0) return;
    if (amount > bankLevel.loanLimit) return;
    if (loan) return; // ya tiene préstamo activo
    if (isInMora) return;

    setRequesting(true);
    const interest = Math.round(amount * bankLevel.rate);
    const totalDebt = amount + interest;
    const dailyPayment = Math.ceil(totalDebt / 7);
    const nextPayment = addDays(todayStr(), 1);

    const newBalance = balance + amount;

    await supabase.from("loans").insert({
      user_id: profile.id,
      amount,
      total_debt: totalDebt,
      daily_payment: dailyPayment,
      paid_amount: 0,
      days_paid: 0,
      mora_days: 0,
      status: "active",
      next_payment: nextPayment,
    });

    await supabase.from("profiles").update({ balance: newBalance }).eq("id", profile.id);
    setBalance(newBalance);
    setLoanAmount("");
    setTab("estado");
    await load();
    setRequesting(false);
  }

  // ── Pago manual adelantado ─────────────────────────────────────────────────
  async function payNow() {
    if (!loan || paying) return;
    const cuota = Math.ceil(
      loan.daily_payment * (1 + loan.mora_days * 0.02)
    );
    const remaining = loan.total_debt - loan.paid_amount;
    const toPay = Math.min(cuota, remaining);

    if (balance < toPay) return;
    setPaying(true);

    const newBalance = balance - toPay;
    const newPaid = loan.paid_amount + toPay;
    const newDaysPaid = loan.days_paid + 1;
    const isNowPaid = newPaid >= loan.total_debt;

    await supabase.from("loans").update({
      paid_amount: newPaid,
      days_paid: newDaysPaid,
      mora_days: Math.max(0, loan.mora_days - 1), // cada pago reduce 1 día de mora
      status: isNowPaid ? "paid" : "active",
      next_payment: addDays(loan.next_payment, 1),
    }).eq("id", loan.id);

    await supabase.from("profiles").update({ balance: newBalance }).eq("id", profile.id);
    setBalance(newBalance);
    await load();
    setPaying(false);
  }

  // ── Pago total anticipado (sin penalización si < 7 días) ──────────────────
  async function payAll() {
    if (!loan || paying) return;
    const remaining = loan.total_debt - loan.paid_amount;
    if (balance < remaining) return;
    setPaying(true);

    const newBalance = balance - remaining;
    await supabase.from("loans").update({
      paid_amount: loan.total_debt,
      status: "paid",
      mora_days: 0,
    }).eq("id", loan.id);
    await supabase.from("profiles").update({ balance: newBalance }).eq("id", profile.id);
    setBalance(newBalance);
    await load();
    setPaying(false);
  }

  // ── Deshipotecar (paga deuda + 10% penalización) ──────────────────────────
  async function unmortgage(assetEntry) {
    const asset = ASSETS[assetEntry.asset_key];
    if (!asset) return;
    const penalty = Math.round(asset.price * 1.10);
    if (balance < penalty) return;

    const newBalance = balance - penalty;
    const newSC = creditScore + asset.sc;

    await supabase.from("player_assets")
      .update({ mortgaged: false })
      .eq("id", assetEntry.id);
    await supabase.from("profiles")
      .update({ balance: newBalance, credit_score: newSC })
      .eq("id", profile.id);

    setBalance(newBalance);
    setCreditScore(newSC);
    if (onScChange) onScChange(newSC);
    await load();
  }

  if (loading) return (
    <div style={{ textAlign: "center", color: "#555", padding: 32 }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>🏦</div>
      Cargando banco...
    </div>
  );

  const isInMora = loan && loan.mora_days > 0;
  const remaining = loan ? loan.total_debt - loan.paid_amount : 0;
  const progress = loan ? (loan.paid_amount / loan.total_debt) * 100 : 0;
  const cuotaHoy = loan
    ? Math.min(
        Math.ceil(loan.daily_payment * (1 + loan.mora_days * 0.02)),
        remaining
      )
    : 0;

  const mortgagedAssets = ownedAssets.filter(a => a.mortgaged);
  const hasMortgaged = mortgagedAssets.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Alertas de mora / hipoteca ── */}
      {isInMora && (
        <div style={alertStyle("#ff4444")}>
          <div style={{ fontSize: 18, marginBottom: 4 }}>⚠️ DEUDA EN MORA</div>
          <div style={{ fontSize: 12, color: "#ffaaaa" }}>
            {loan.mora_days} {loan.mora_days === 1 ? "día" : "días"} sin pagar ·{" "}
            {loan.mora_days >= 7
              ? "¡Hipoteca activada!"
              : `${7 - loan.mora_days} día${7 - loan.mora_days !== 1 ? "s" : ""} para hipoteca`}
          </div>
          <div style={{ fontSize: 11, color: "#cc7777", marginTop: 4 }}>
            Cuota con mora: +{(loan.mora_days * 2)}% ={" "}
            <strong style={{ color: "#fff" }}>${cuotaHoy.toLocaleString()}</strong>
          </div>
        </div>
      )}

      {mortgageEvents.length > 0 && (
        <div style={alertStyle("#f97316")}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>🏚️ Propiedades hipotecadas automáticamente</div>
          {mortgageEvents.map(k => (
            <div key={k} style={{ fontSize: 12, color: "#ffdab9" }}>
              {ASSETS[k]?.icon} {ASSETS[k]?.label}
            </div>
          ))}
        </div>
      )}

      {/* ── Nivel del banco ── */}
      <div style={{
        background: "rgba(13,13,20,0.9)",
        border: "1px solid #2a2a3a",
        borderRadius: 12,
        padding: "12px 14px",
      }}>
        <div style={{ fontSize: 10, color: "#444", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
          Tu nivel bancario
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 36 }}>{bankLevel.icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#fbbf24" }}>
              Nivel {bankLevel.level} — {bankLevel.name}
            </div>
            <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
              SC actual: <span style={{ color: "#00d4aa", fontWeight: 700 }}>{creditScore.toLocaleString()}</span>
              {bankLevel.level < 2 && (
                <span style={{ color: "#555", marginLeft: 8 }}>
                  · Siguiente nivel: {BANK_LEVELS[bankLevel.level + 1].scRequired.toLocaleString()} SC
                </span>
              )}
            </div>
            {/* Barra de progreso al siguiente nivel */}
            {bankLevel.level < 2 && (
              <div style={{ marginTop: 6, height: 5, background: "#1e1e2e", borderRadius: 3, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 3,
                  width: `${Math.min(100, (creditScore / BANK_LEVELS[bankLevel.level + 1].scRequired) * 100)}%`,
                  background: "linear-gradient(90deg, #fbbf24, #f97316)",
                  transition: "width 0.5s",
                }} />
              </div>
            )}
          </div>
        </div>

        {/* Productos disponibles */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {bankLevel.products.map(p => (
            <span key={p} style={{
              background: "#fbbf2415", border: "1px solid #fbbf2433",
              borderRadius: 6, padding: "3px 8px",
              fontSize: 10, color: "#fbbf24",
            }}>{p}</span>
          ))}
          {BANK_LEVELS.filter(l => l.level > bankLevel.level).flatMap(l => l.products).map(p => (
            <span key={p} style={{
              background: "#1e1e2e", border: "1px solid #2a2a3a",
              borderRadius: 6, padding: "3px 8px",
              fontSize: 10, color: "#333",
            }}>🔒 {p}</span>
          ))}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 6 }}>
        {[
          { id: "estado", label: "📋 Estado" },
          { id: "pedir",  label: "💸 Pedir préstamo" },
          { id: "info",   label: "ℹ️ Niveles" },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: "8px 4px",
            background: tab === t.id ? "rgba(251,191,36,0.12)" : "rgba(13,13,20,0.8)",
            border: `1px solid ${tab === t.id ? "#fbbf2466" : "#2a2a3a"}`,
            borderRadius: 8, color: tab === t.id ? "#fbbf24" : "#555",
            fontSize: 11, fontWeight: 700, cursor: "pointer",
          }}>{t.label}</button>
        ))}
      </div>

      {/* ══════════════ TAB: ESTADO ══════════════ */}
      {tab === "estado" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

            {/* ── Notificación CDT ── */}
{cdtEvents && cdtEvents.interest > 0 && (
  <div style={{
    background: "rgba(0,212,170,0.08)",
    border: "1px solid #00d4aa44",
    borderRadius: 10, padding: "10px 14px",
  }}>
    <div style={{ color: "#00d4aa", fontWeight: 700, fontSize: 13 }}>
      💰 Cuenta de Ahorros — interés aplicado
    </div>
    <div style={{ fontSize: 12, color: "#aaa", marginTop: 4 }}>
      +${cdtEvents.interest.toLocaleString()} en {cdtEvents.days} {cdtEvents.days === 1 ? "día" : "días"}
    </div>
  </div>
)}

{/* ── Info CDT si tiene nivel ── */}
{bankLevel.level >= 1 && (
  <div style={{
    background: "rgba(13,13,20,0.9)",
    border: "1px solid #00d4aa33",
    borderRadius: 12, padding: "12px 14px",
  }}>
    <div style={{ fontSize: 11, color: "#555", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
      📈 Cuenta de Ahorros (CDT)
    </div>
    {[
      
      ["Tasa base diaria", "0.5%"],
      /*
      ["Bonus por SC", `+${(creditScore / 10000).toFixed(4)}%`],
      ["Tasa efectiva hoy", `${((0.005 + creditScore / 10000) * 100).toFixed(3)}%`],
        */
      ["Bonus por SC",      `+${(creditScore / 10_000).toFixed(4)}%`],
["Tasa efectiva hoy", `${((0.005 + creditScore / 1_000_000) * 100).toFixed(3)}%`],
["Rendimiento estimado hoy", `~$${Math.floor(Math.min(balance, 5_000_000) * (0.005 + creditScore / 1_000_000)).toLocaleString()}`],


      ["Techo de ahorro", "$5.000.000"],
      ["Base efectiva", `$${Math.min(balance, 5_000_000).toLocaleString()}`],
     // ["Rendimiento estimado hoy", `~$${Math.floor(Math.min(balance, 5_000_000) * (0.005 + creditScore / 10000)).toLocaleString()}`],
    ].map(([label, val], i) => (
      <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
        <span style={{ color: "#555" }}>{label}</span>
        <span style={{ color: "#00d4aa", fontWeight: 700 }}>{val}</span>
      </div>
    ))}
    <div style={{ fontSize: 10, color: "#333", marginTop: 6 }}>
      Se aplica automáticamente cada día al abrir el banco · Solo sobre los primeros $5M
    </div>
  </div>
)}

          {/* Préstamo activo */}
          {loan ? (
            <div style={{
              background: "rgba(13,13,20,0.9)",
              border: `1px solid ${isInMora ? "#ff444444" : "#fbbf2433"}`,
              borderRadius: 12, padding: "14px",
            }}>
              <div style={{ fontSize: 11, color: "#555", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
                Préstamo activo
              </div>

              {/* Barra de progreso */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#555", marginBottom: 4 }}>
                  <span>Pagado: ${loan.paid_amount.toLocaleString()}</span>
                  <span>Total: ${loan.total_debt.toLocaleString()}</span>
                </div>
                <div style={{ height: 8, background: "#1e1e2e", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 4,
                    width: `${progress}%`,
                    background: isInMora
                      ? "linear-gradient(90deg, #ff4444, #ff8800)"
                      : "linear-gradient(90deg, #00d4aa, #fbbf24)",
                    transition: "width 0.5s",
                  }} />
                </div>
                <div style={{ fontSize: 10, color: "#444", marginTop: 3, textAlign: "right" }}>
                  {progress.toFixed(1)}% completado
                </div>
              </div>

              {/* Detalles */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                {[
                  ["Capital prestado", `$${loan.amount.toLocaleString()}`],
                  ["Deuda total", `$${loan.total_debt.toLocaleString()}`],
                  ["Saldo pendiente", `$${remaining.toLocaleString()}`],
                  ["Cuota diaria base", `$${loan.daily_payment.toLocaleString()}`],
                  ["Cuota de hoy", `$${cuotaHoy.toLocaleString()}`],
                  ["Días pagados", `${loan.days_paid}/7`],
                  ["Días de mora", loan.mora_days > 0 ? `⚠️ ${loan.mora_days}` : "✅ 0"],
                  ["Próximo cobro", loan.next_payment],
                ].map(([label, val], i) => (
                  <div key={i} style={{ background: "#0d0d14", borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ fontSize: 9, color: "#444", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#ddd", marginTop: 2 }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Botones de pago */}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={payNow}
                  disabled={paying || balance < cuotaHoy}
                  style={{
                    flex: 1, padding: "11px",
                    background: balance >= cuotaHoy ? "linear-gradient(135deg, #00d4aa, #009977)" : "#1a1a26",
                    border: "none", borderRadius: 8,
                    color: balance >= cuotaHoy ? "#000" : "#444",
                    fontWeight: 800, fontSize: 13, cursor: balance >= cuotaHoy ? "pointer" : "not-allowed",
                  }}
                >
                  {paying ? "..." : `💳 Pagar cuota ($${cuotaHoy.toLocaleString()})`}
                </button>
                <button
                  onClick={payAll}
                  disabled={paying || balance < remaining}
                  style={{
                    flex: 1, padding: "11px",
                    background: balance >= remaining ? "linear-gradient(135deg, #fbbf24, #f97316)" : "#1a1a26",
                    border: "none", borderRadius: 8,
                    color: balance >= remaining ? "#000" : "#444",
                    fontWeight: 800, fontSize: 13, cursor: balance >= remaining ? "pointer" : "not-allowed",
                  }}
                >
                  {paying ? "..." : `⚡ Saldar todo ($${remaining.toLocaleString()})`}
                </button>
              </div>

              {balance < cuotaHoy && (
                <div style={{ fontSize: 11, color: "#ff6666", textAlign: "center", marginTop: 8 }}>
                  ⚠️ Saldo insuficiente — la cuota se cobrará automáticamente mañana con mora adicional
                </div>
              )}
            </div>
          ) : (
            <div style={{
              background: "rgba(0,212,170,0.06)",
              border: "1px solid #00d4aa22",
              borderRadius: 12, padding: "20px",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
              <div style={{ color: "#00d4aa", fontWeight: 700, fontSize: 15 }}>Sin deudas activas</div>
              <div style={{ color: "#555", fontSize: 12, marginTop: 4 }}>
                Puedes solicitar un préstamo en la pestaña "Pedir préstamo"
              </div>
            </div>
          )}













{/* ── Alerta de período de gracia ── */}
{loan?.status === "grace" && loan.grace_until && (
  <div style={alertStyle("#ff4444")}>
    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
      🚨 PERÍODO DE GRACIA — DEUDA PENDIENTE
    </div>
    <div style={{ fontSize: 12, color: "#ffaaaa" }}>
      Vence el {loan.grace_until} · Paga o perderás todos los activos hipotecados
    </div>
    <div style={{ fontSize: 12, color: "#fff", marginTop: 4, fontWeight: 700 }}>
      Deuda restante: ${remaining.toLocaleString()}
    </div>
  </div>
)}

{/* ── Alerta de ejecución forzada ── */}
{events.some(e => e.type === "foreclosure") && (
  <div style={alertStyle("#ff0000")}>
    <div style={{ fontSize: 15, fontWeight: 700 }}>💀 EJECUCIÓN BANCARIA</div>
    <div style={{ fontSize: 12, color: "#ffaaaa", marginTop: 4 }}>
      Tus activos hipotecados fueron confiscados por el banco.
    </div>
  </div>
)}

















          {/* Activos hipotecados */}
          {hasMortgaged && (
            <div style={{
              background: "rgba(255,68,68,0.06)",
              border: "1px solid #ff444433",
              borderRadius: 12, padding: "12px 14px",
            }}>
              <div style={{ fontSize: 11, color: "#ff4444", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
                ⛓️ Activos hipotecados
              </div>
              {mortgagedAssets.map(a => {
                const asset = ASSETS[a.asset_key];
                if (!asset) return null;
                const penalty = Math.round(asset.price * 1.10);
                const canAfford = balance >= penalty;
                return (
                  <div key={a.id} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    background: "#0d0d14", borderRadius: 8, padding: "10px 12px", marginBottom: 8,
                  }}>
                    <span style={{ fontSize: 24 }}>{asset.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#bbb" }}>{asset.label}</div>
                      <div style={{ fontSize: 11, color: "#555" }}>
                        Deshipotecar: ${penalty.toLocaleString()} (+10% penalización)
                      </div>
                    </div>
                    <button
                      onClick={() => unmortgage(a)}
                      disabled={!canAfford}
                      style={{
                        background: canAfford ? "#fbbf24" : "#1a1a26",
                        border: "none", borderRadius: 7,
                        padding: "7px 12px", fontSize: 11, fontWeight: 800,
                        color: canAfford ? "#000" : "#444",
                        cursor: canAfford ? "pointer" : "not-allowed",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {canAfford ? "⛓️ Liberar" : "Sin saldo"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Historial de eventos de este ciclo */}
          {events.length > 0 && (
            <div style={{
              background: "rgba(13,13,20,0.7)",
              border: "1px solid #1e1e2e",
              borderRadius: 10, padding: "10px 14px",
            }}>
              <div style={{ fontSize: 10, color: "#444", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
                Actividad automática de hoy
              </div>
              {events.slice(0, 6).map((e, i) => (
                <div key={i} style={{ fontSize: 12, color: e.type === "mora" ? "#ff8888" : e.type === "payment" ? "#00d4aa" : "#fbbf24", marginBottom: 3 }}>
                  {e.type === "payment" && `✅ Cuota deducida: $${e.amount?.toLocaleString()}`}
                  {e.type === "mora" && `⚠️ Día de mora #${e.moraDays} — sin fondos suficientes`}
                  {e.type === "paid" && `🎉 ¡Préstamo saldado!`}
                  {e.type === "mortgage_trigger" && `🏚️ Hipoteca activada tras 7 días de mora`}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════ TAB: PEDIR PRÉSTAMO ══════════════ */}
      {tab === "pedir" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {loan && (
            <div style={alertStyle("#f97316")}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>⛔ Ya tienes un préstamo activo</div>
              <div style={{ fontSize: 12, color: "#ffdab9", marginTop: 4 }}>
                Debes saldarlo antes de pedir otro.
              </div>
            </div>
          )}

          {isInMora && !loan && (
            <div style={alertStyle("#ff4444")}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>🚫 Bloqueado por mora</div>
              <div style={{ fontSize: 12, color: "#ffaaaa", marginTop: 4 }}>
                Regulariza tu deuda antes de solicitar nuevos préstamos.
              </div>
            </div>
          )}

          {!loan && !isInMora && (
            <>
              <div style={{
                background: "rgba(13,13,20,0.9)", border: "1px solid #2a2a3a",
                borderRadius: 12, padding: "12px 14px",
              }}>
                <div style={{ fontSize: 11, color: "#555", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
                  Condiciones actuales
                </div>
                {[
                  ["Límite de préstamo", `$${bankLevel.loanLimit.toLocaleString()}`],
                  ["Tasa de interés", `${(bankLevel.rate * 100).toFixed(0)}% semanal`],
                  ["Plazo", "7 días"],
                  ["Mora por día", `+${(bankLevel.moraRate * 100).toFixed(0)}% sobre cuota`],
                ].map(([label, val], i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                    <span style={{ color: "#666" }}>{label}</span>
                    <span style={{ color: "#ddd", fontWeight: 700 }}>{val}</span>
                  </div>
                ))}
              </div>

              {/* Calculadora */}
              <div style={{
                background: "rgba(13,13,20,0.9)", border: "1px solid #2a2a3a",
                borderRadius: 12, padding: "12px 14px",
              }}>
                <div style={{ fontSize: 11, color: "#555", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
                  Simulador de préstamo
                </div>
                <input
                  type="number"
                  placeholder={`Hasta $${bankLevel.loanLimit.toLocaleString()}`}
                  value={loanAmount}
                  onChange={e => setLoanAmount(e.target.value)}
                  style={{
                    width: "100%", background: "#0d0d14", border: "1px solid #2a2a3a",
                    borderRadius: 8, padding: "10px 12px", color: "#fff",
                    fontSize: 16, boxSizing: "border-box", outline: "none", marginBottom: 8,
                  }}
                />

                {/* Atajos */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                  {[100_000, 250_000, 500_000, bankLevel.loanLimit].filter((v, i, a) => a.indexOf(v) === i).map(v => (
                    <button key={v} onClick={() => setLoanAmount(String(v))} style={{
                      background: "#0d0d14", border: "1px solid #2a2a3a", borderRadius: 6,
                      color: "#aaa", fontSize: 11, padding: "5px 10px", cursor: "pointer",
                    }}>
                      ${v >= 1_000_000 ? `${v / 1_000_000}M` : v >= 1_000 ? `${v / 1_000}k` : v}
                    </button>
                  ))}
                </div>

                {/* Preview */}
                {loanAmount && parseInt(loanAmount) > 0 && (
                  <LoanPreview amount={parseInt(loanAmount)} bankLevel={bankLevel} />
                )}

                <button
                  onClick={requestLoan}
                  disabled={
                    requesting ||
                    !loanAmount ||
                    parseInt(loanAmount) <= 0 ||
                    parseInt(loanAmount) > bankLevel.loanLimit
                  }
                  style={{
                    width: "100%", padding: "13px",
                    background: !requesting && loanAmount && parseInt(loanAmount) > 0 && parseInt(loanAmount) <= bankLevel.loanLimit
                      ? "linear-gradient(135deg, #fbbf24, #f97316)"
                      : "#1a1a26",
                    border: "none", borderRadius: 10, marginTop: 8,
                    color: !requesting && loanAmount ? "#000" : "#444",
                    fontWeight: 800, fontSize: 14, cursor: "pointer",
                  }}
                >
                  {requesting ? "Procesando..." : "🏦 Solicitar préstamo"}
                </button>

                {parseInt(loanAmount) > bankLevel.loanLimit && (
                  <div style={{ fontSize: 11, color: "#ff6666", textAlign: "center", marginTop: 6 }}>
                    Supera tu límite de ${bankLevel.loanLimit.toLocaleString()}
                    {bankLevel.level < 2 && ` — sube tu SC a ${BANK_LEVELS[bankLevel.level + 1].scRequired.toLocaleString()} para acceder al siguiente nivel`}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════ TAB: INFO ══════════════ */}
      {tab === "info" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {BANK_LEVELS.map(lvl => {
            const isCurrentLevel = lvl.level === bankLevel.level;
            const isUnlocked = creditScore >= lvl.scRequired;
            return (
              <div key={lvl.level} style={{
                background: isCurrentLevel ? "rgba(251,191,36,0.07)" : "rgba(13,13,20,0.85)",
                border: `1px solid ${isCurrentLevel ? "#fbbf2444" : isUnlocked ? "#2a2a3a" : "#1a1a24"}`,
                borderRadius: 12, padding: "12px 14px",
                opacity: isUnlocked ? 1 : 0.6,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 28 }}>{lvl.icon}</span>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: isCurrentLevel ? "#fbbf24" : "#bbb" }}>
                      Nivel {lvl.level} — {lvl.name}
                      {isCurrentLevel && <span style={{ marginLeft: 8, fontSize: 10, color: "#fbbf24", background: "#fbbf2422", padding: "2px 6px", borderRadius: 4 }}>ACTUAL</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "#555" }}>
                      Requiere {lvl.scRequired.toLocaleString()} SC
                    </div>
                  </div>
                </div>
                {[
                  ["Límite préstamo", `$${lvl.loanLimit.toLocaleString()}`],
                  ["Tasa semanal", `${(lvl.rate * 100).toFixed(0)}%`],
                  ["Mora diaria", `+${(lvl.moraRate * 100).toFixed(0)}%`],
                ].map(([label, val], i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: "#555" }}>{label}</span>
                    <span style={{ color: "#aaa", fontWeight: 700 }}>{val}</span>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
                  {lvl.products.map(p => (
                    <span key={p} style={{
                      background: isUnlocked ? "#fbbf2415" : "#1a1a26",
                      border: `1px solid ${isUnlocked ? "#fbbf2433" : "#2a2a3a"}`,
                      borderRadius: 6, padding: "2px 7px",
                      fontSize: 10, color: isUnlocked ? "#fbbf24" : "#333",
                    }}>{p}</span>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Reglas de mora */}
          <div style={{
            background: "rgba(255,68,68,0.05)",
            border: "1px solid #ff444422",
            borderRadius: 12, padding: "12px 14px",
          }}>
            <div style={{ fontWeight: 700, color: "#ff6666", marginBottom: 8, fontSize: 13 }}>
              📋 Reglas de mora y embargo
            </div>
            {[
              ["Días 1–7", "Se descuenta la cuota diaria automáticamente. Si no hay saldo, se acumula mora."],
              ["Día 8", "Con 7 días de mora: se hipoteca el activo de mayor valor para cubrir la deuda."],
              ["Sin activos", "7 días de gracia extra. Si no paga al día 14, entra en Quiebra Irrecuperable."],
              ["Deshipotecar", "Paga la deuda original + 10% de penalización para recuperar el activo."],
            ].map(([fase, desc], i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#ff8888" }}>{fase}</div>
                <div style={{ fontSize: 11, color: "#555", lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componente preview de préstamo ──────────────────────────────────────────
function LoanPreview({ amount, bankLevel }) {
  const interest = Math.round(amount * bankLevel.rate);
  const totalDebt = amount + interest;
  const dailyPayment = Math.ceil(totalDebt / 7);

  return (
    <div style={{
      background: "rgba(251,191,36,0.06)",
      border: "1px solid #fbbf2422",
      borderRadius: 10, padding: "10px 12px", marginBottom: 8,
    }}>
      <div style={{ fontSize: 10, color: "#555", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
        Resumen del préstamo
      </div>
      {[
        ["Capital", `$${amount.toLocaleString()}`],
        [`Interés (${(bankLevel.rate * 100).toFixed(0)}%)`, `+$${interest.toLocaleString()}`],
        ["Total a devolver", `$${totalDebt.toLocaleString()}`],
        ["Cuota diaria", `$${dailyPayment.toLocaleString()} × 7 días`],
      ].map(([label, val], i) => (
        <div key={i} style={{
          display: "flex", justifyContent: "space-between", fontSize: 12,
          marginBottom: 5, paddingBottom: 5,
          borderBottom: i < 3 ? "1px solid #1e1e2e" : "none",
        }}>
          <span style={{ color: "#666" }}>{label}</span>
          <span style={{ color: i === 2 ? "#fbbf24" : "#bbb", fontWeight: i === 2 ? 800 : 600 }}>{val}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Helpers de estilo ────────────────────────────────────────────────────────
function alertStyle(color) {
  return {
    background: `${color}12`,
    border: `1px solid ${color}44`,
    borderRadius: 10,
    padding: "10px 14px",
  };
}
