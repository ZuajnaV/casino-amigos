import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";
import { ASSETS } from "./ShopPanel.jsx";

// ─── MERCADO DIARIO ────────────────────────────────────────────────────────
function generateMarketForDate() {
  // Math.random() real — impredecible cada vez que se llama
  const r1 = Math.random();
  const r2 = Math.random();
  let state, pct;

  if (r1 < 0.25) {
    state = "crisis";
    pct = -(r2 * 5 + 5);           // -10% … -5%
  } else if (r1 < 0.75) {
    state = "stability";
    pct = r2 * 2 - 1;              // -1% … +1%
  } else {
    state = "growth";
    pct = r2 * 5 + 5;              // +5% … +10%
  }
  return { state, pct: Math.round(pct * 100) / 100 };
}

async function getOrCreateMarketForDate(dateStr) {
  // 1. ¿Ya existe el mercado de hoy? → devolverlo sin tocar nada
  const { data } = await supabase
    .from("market_daily").select("*").eq("date", dateStr).single();
  if (data) return data;

  // 2. No existe → generarlo con dados reales
  const { state, pct } = generateMarketForDate();   // ← sin parámetro
  const { data: inserted, error } = await supabase
    .from("market_daily").insert({ date: dateStr, state, pct }).select().single();

  if (error) {
    // Race condition: otro jugador lo creó milisegundos antes — releer
    const { data: retry } = await supabase
      .from("market_daily").select("*").eq("date", dateStr).single();
    return retry || { date: dateStr, state, pct };
  }
  return inserted;
}



// ─── PROCESADOR DEL FONDO ────────────────────────────────────────────────────
export async function processInvestmentFund(userId, creditScore) {
  const { data: fund } = await supabase
    .from("investment_fund").select("*")
    .eq("user_id", userId).eq("status", "active").maybeSingle();

  if (!fund) return { processed: false };

  const today     = todayStr();
  const lastProc  = fund.last_processed || today;
  const daysPend  = daysBetween(lastProc, today);
  if (daysPend <= 0) return { processed: false, fund };

  // Sin rendimiento si hay quiebra irrecuperable
  const { data: blocking } = await supabase
    .from("loans").select("id").eq("user_id", userId)
    .eq("status", "irrecoverable").limit(1);
  if (blocking && blocking.length > 0) return { processed: false, fund, blocked: true };

  // Número de activos activos (no hipotecados) — bonus por propiedades
  const { data: assets } = await supabase
    .from("player_assets").select("quantity, mortgaged").eq("user_id", userId);
  const totalAssets = (assets || [])
    .filter(a => !a.mortgaged)
    .reduce((sum, a) => sum + a.quantity, 0);

  let currentValue = fund.current_value;
  const events = [];

  for (let d = daysPend - 1; d >= 0; d--) {
  const dayDate = addDays(today, -d);
  const mkt = await getOrCreateMarketForDate(dayDate);

  // Todo en puntos porcentuales (pp), luego convertir UNA SOLA vez
  const scBonusPp    = creditScore * 0.0001;  // pp: 6000 SC → +0.6pp, 17500 SC → +1.75pp
  const assetBonusPp = totalAssets * 0.5;     // pp: 2 activos → +1pp
  const totalPp      = mkt.pct + scBonusPp + assetBonusPp; // todo en %
  const multiplier   = totalPp / 100;          // convertir a multiplicador decimal
  const returns      = Math.round(currentValue * multiplier);
  currentValue       = Math.max(0, currentValue + returns);

  events.push({
    date:     dayDate,
    state:    mkt.state,
    pct:      mkt.pct,
    finalPct: +totalPp.toFixed(2),   // muestra el % total aplicado
    returns,
  });
}

  await supabase.from("investment_fund").update({
    current_value:  currentValue,
    last_processed: today,
  }).eq("id", fund.id);

  return { processed: true, fund: { ...fund, current_value: currentValue }, events };
}

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
    scRequired: 2_500,
    loanLimit: 5_000_000,
    rate: 0.15,
    moraRate: 0.015,
    products: ["Préstamo Medio", "CDT"],
  },
  {
    level: 2,
    name: "Inversor",
    icon: "📈",
    scRequired: 6_500,
    loanLimit: 15_000_000,
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
  const now = new Date();
  // Restamos 12 horas (43.200.000 milisegundos)
  const adjustedDate = new Date(now.getTime() - 43200000);
  return adjustedDate.toISOString().split("T")[0];
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

  export async function processLoanPayments(userId, currentBalance) {
  const { data: loans } = await supabase
    .from("loans")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["active", "pending_mortgage", "grace"]);

  if (!loans || loans.length === 0) return { newBalance: currentBalance, events: [] };

  const today = todayStr();
  let balance = currentBalance;
  const events = [];

  for (const loan of loans) {
    const daysDue = daysBetween(loan.next_payment, today);

    // Sin días pendientes → solo verificar expiración de gracia
    if (daysDue <= 0) {
      if (loan.status === "grace" && loan.grace_until) {
        if (daysBetween(loan.grace_until, today) > 0 && loan.total_debt - loan.paid_amount > 0) {
          await handleGraceExpiry(userId, loan.id, events);
        }
      }
      continue;
    }

    let { paid_amount, days_paid, mora_days, total_debt, daily_payment, next_payment } = loan;
    const remainingDebt = total_debt - paid_amount;

    if (remainingDebt <= 0) {
      await supabase.from("loans").update({ status: "paid" }).eq("id", loan.id);
      events.push({ type: "paid", loanId: loan.id });
      continue;
    }

    let currentNextPayment = next_payment;
    let loanDone = false;

    for (let d = 0; d < daysDue; d++) {
      const moraMultiplier = 1 + mora_days * 0.02;
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
        await supabase.from("loans").update({
          paid_amount, days_paid, mora_days,
          status: "paid", next_payment: currentNextPayment,
        }).eq("id", loan.id);
        await supabase.from("profiles").update({ balance }).eq("id", userId);
        events.push({ type: "paid", loanId: loan.id });
        loanDone = true;
        break;
      }

      // Hipoteca: solo para préstamos activos (NO durante grace)
      if (mora_days >= 7 && loan.status === "active") {
        events.push({ type: "mortgage_trigger", loanId: loan.id, remainingDebt: total_debt - paid_amount });
        await supabase.from("loans").update({
          paid_amount, days_paid, mora_days,
          next_payment: currentNextPayment,
          status: "pending_mortgage",
        }).eq("id", loan.id);
        loanDone = true;
        break;
      }
    }

    if (loanDone) continue;

    // Actualizar estado intermedio
    const { data: cur } = await supabase.from("loans").select("status").eq("id", loan.id).single();
    if (cur?.status === "active" || cur?.status === "grace") {
      await supabase.from("loans").update({
        paid_amount, days_paid, mora_days,
        next_payment: currentNextPayment,
      }).eq("id", loan.id);
    }

    // Verificar expiración de gracia tras procesar días
    if (cur?.status === "grace" && loan.grace_until) {
      if (daysBetween(loan.grace_until, today) > 0 && paid_amount < total_debt) {
        await handleGraceExpiry(userId, loan.id, events);
      }
    }
  }

  await supabase.from("profiles").update({ balance }).eq("id", userId);
  return { newBalance: balance, events };
}


async function handleGraceExpiry(userId, loanId, events) {
  // Eliminar activos hipotecados ("vendidos" por el banco)
  const { data: mortgagedAssets } = await supabase
    .from("player_assets")
    .select("*")
    .eq("user_id", userId)
    .eq("mortgaged", true);

  if (mortgagedAssets && mortgagedAssets.length > 0) {
    for (const asset of mortgagedAssets) {
      await supabase.from("player_assets").delete().eq("id", asset.id);
    }
    events.push({ type: "foreclosure", loanId });
  }

  // En ambos casos (con o sin activos) → deuda incobrable
  await supabase.from("loans").update({ status: "irrecoverable" }).eq("id", loanId);
  events.push({ type: "irrecoverable", loanId });
}

// ─── PROCESADOR DE CDT (interés diario) ─────────────────────────────────────
export async function processCDT(userId, currentBalance, creditScore, bankLevel) {
  if (bankLevel < 1) return { newBalance: currentBalance, interest: 0 };

  // Sin CDT si hay deuda irrecuperable
  const { data: blockingLoan } = await supabase
    .from("loans")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "irrecoverable")
    .limit(1);

  if (blockingLoan && blockingLoan.length > 0) {
    return { newBalance: currentBalance, interest: 0 };
  }

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
    const graceUntil = addDays(today, 1);     //7
    await supabase.from("loans").update({
      status: "grace",
      grace_until: graceUntil,
    }).eq("id", loanId);
    return { mortgaged: [], noAssets: true, graceUntil };
  }

  // Ordenar por precio descendente (hipotecar los más valiosos primero)
  const sorted = [...playerAssets].sort(
    (a, b) => (ASSET_PRICES[b.asset_key] || 0) - (ASSET_PRICES[a.asset_key] || 0)
  );

  let covered = 0;
  const mortgaged = [];

  for (const asset of sorted) {
    if (covered >= remainingDebt) break; // ya cubrimos la deuda, parar

    covered += (ASSET_PRICES[asset.asset_key] || 0) * asset.quantity;

    await supabase.from("player_assets")
      .update({ mortgaged: true })
      .eq("id", asset.id);
    mortgaged.push(asset.asset_key);

    // Penalización SC por hipoteca
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

  // Obtener datos actuales del préstamo
  const { data: loanData } = await supabase
    .from("loans").select("total_debt, paid_amount").eq("id", loanId).single();
  const currentPaid = loanData?.paid_amount || 0;
  const totalDebt   = loanData?.total_debt   || remainingDebt;

  // ── Activos cubren la deuda (incluso si sobrepasan) → préstamo saldado ──
  if (covered >= remainingDebt) {
    await supabase.from("loans").update({
      paid_amount:  totalDebt,   // marcado como totalmente pagado
      mora_days:    0,
      status:       "paid",
      mortgaged_at: today,
    }).eq("id", loanId);
    return { mortgaged, noAssets: false, debtCovered: true, excess: covered - remainingDebt };
  }

  // ── Activos no alcanzan → se abona lo que cubrieron y queda deuda pendiente ──
  const graceUntil = addDays(today, 1);   //7
  await supabase.from("loans").update({
    paid_amount:  currentPaid + covered,  // se abona el valor de los activos
    mora_days:    0,
    status:       "grace",
    mortgaged_at: today,
    grace_until:  graceUntil,
  }).eq("id", loanId);

  return {
    mortgaged,
    noAssets:    false,
    debtCovered: false,
    remaining:   remainingDebt - covered,
  };
}


// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function BankPanel({ profile, balance, setBalance, onScChange, onDeath }) {
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


  const [fund,         setFund]         = useState(null);
const [marketHistory, setMarketHistory] = useState([]);
const [fundAmount,   setFundAmount]   = useState("");
const [fundEvents,   setFundEvents]   = useState([]);

  const bankLevel = bankLevelFor(creditScore);
  const load = useCallback(async () => {
  setLoading(true);
  const [loanRes, assetsRes, profileRes, fundRes, marketRes] = await Promise.all([
    supabase.from("loans").select("*").eq("user_id", profile.id)
      .in("status", ["active", "grace", "irrecoverable"])
      .order("created_at", { ascending: false }).limit(1),
    supabase.from("player_assets").select("*").eq("user_id", profile.id),
    supabase.from("profiles").select("credit_score").eq("id", profile.id).single(),
    supabase.from("investment_fund").select("*").eq("user_id", profile.id)
      .eq("status", "active").maybeSingle(),                          // ← nuevo
    supabase.from("market_daily").select("*")
      .order("date", { ascending: false }).limit(3),                  // ← nuevo
  ]);

  setLoan(loanRes.data?.[0] || null);
  setOwnedAssets(assetsRes.data || []);
  if (profileRes.data) setCreditScore(profileRes.data.credit_score || 0);
  setFund(fundRes.data || null);                                        // ← nuevo
  setMarketHistory((marketRes.data || []).reverse());                  // ← nuevo (cronológico)
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


    // Paso 4: Procesar fondo de inversión si existe
const fundResult = await processInvestmentFund(profile.id, sc);
if (fundResult.processed) {
  setFund(fundResult.fund);
  setFundEvents(fundResult.events || []);
  // Recargar historial de mercado
  const { data: mkt } = await supabase
    .from("market_daily").select("*")
    .order("date", { ascending: false }).limit(3);
  if (mkt) setMarketHistory([...mkt].reverse());
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
      //status: isNowPaid ? "paid" : "active",
      status: isNowPaid ? "paid" : (loan.status === "grace" ? "grace" : "active"),
      next_payment: addDays(loan.next_payment, 1),
    }).eq("id", loan.id);

    await supabase.from("profiles").update({ balance: newBalance }).eq("id", profile.id);
    setBalance(newBalance);
    await load();
    setPaying(false);
  }

  async function payAll() {
  if (!loan || paying) return;
  const baseRemaining = loan.total_debt - loan.paid_amount;
  const moraMultiplier = loan.mora_days > 0 ? (1 + loan.mora_days * 0.02) : 1;
  const remaining = Math.ceil(baseRemaining * moraMultiplier);
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

async function depositFund() {
  const amount = parseInt(String(fundAmount));
  if (!amount || amount <= 0 || amount > balance) return;
  if (fund || bankLevel.level < 2) return;
  if (loan?.status === "irrecoverable") return;

  setRequesting(true);
  const newBalance = balance - amount;

  await supabase.from("investment_fund").insert({
    user_id:       profile.id,
    deposited:     amount,
    current_value: amount,
    status:        "active",
    last_processed: todayStr(),
  });
  await supabase.from("profiles")
    .update({ balance: newBalance }).eq("id", profile.id);

  setBalance(newBalance);
  setFundAmount("");
  await load();
  setRequesting(false);
}

async function withdrawFund() {
  if (!fund || paying) return;
  if (loan?.status === "irrecoverable") return;  // bloqueado en quiebra

  setPaying(true);
  const tax      = Math.round(fund.current_value * 0.10);
  const received = fund.current_value - tax;
  const newBalance = balance + received;

  await supabase.from("investment_fund")
    .update({ status: "closed" }).eq("id", fund.id);
  await supabase.from("profiles")
    .update({ balance: newBalance }).eq("id", profile.id);

  setFund(null);
  setBalance(newBalance);
  await load();
  setPaying(false);
}

  async function handleSuicide() {
  if (paying) return;
  setPaying(true);
  const STARTING_BALANCE = 100_000;

  const { error: assetError, count } = await supabase
    .from("player_assets").delete({ count: "exact" }).eq("user_id", profile.id);
  if (assetError) console.error("❌ Error borrando activos:", assetError);
  else console.log(`✅ Activos eliminados: ${count}`);

  // Cerrar fondo (capital congelado se pierde)
  await supabase.from("investment_fund")
    .update({ status: "closed" })
    .eq("user_id", profile.id).eq("status", "active");

  await supabase.from("loans")
    .update({ status: "foreclosed" })
    .eq("user_id", profile.id)
    .in("status", ["active", "grace", "irrecoverable", "pending_mortgage"]);

  await supabase.from("profiles").update({
    deaths:             (profile.deaths || 0) + 1,
    credit_score:       0,
    balance:            STARTING_BALANCE,
    cdt_last_processed: todayStr(),
  }).eq("id", profile.id);

  setFund(null);
  setBalance(STARTING_BALANCE);
  if (onDeath) onDeath();
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

  const isInMora       = loan && loan.mora_days > 0 && loan.status !== "grace";
const remaining      = loan ? loan.total_debt - loan.paid_amount : 0;
const moraMultiplier = loan?.mora_days > 0 ? (1 + loan.mora_days * 0.02) : 1;
const remainingWithMora = Math.ceil(remaining * moraMultiplier);
const progress = loan ? (loan.paid_amount / loan.total_debt) * 100 : 0;
const cuotaHoy = loan
  ? Math.min(Math.ceil(loan.daily_payment * moraMultiplier), remaining)
  : 0;


  const mortgagedAssets = ownedAssets.filter(a => a.mortgaged);
  const hasMortgaged = mortgagedAssets.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Alertas de mora / hipoteca ── */}
      {isInMora && (
        <div style={alertStyle("#ff4444")}>
          <div style={{ fontSize: 20, marginBottom: 4 }}>⚠️ DEUDA EN MORA</div>
          <div style={{ fontSize: 15, color: "#ffaaaa" }}>
            {loan.mora_days} {loan.mora_days === 1 ? "día" : "días"} sin pagar ·{" "}
            {loan.mora_days >= 7
              ? "¡Hipoteca activada!"
              : `${7 - loan.mora_days} día${7 - loan.mora_days !== 1 ? "s" : ""} para hipoteca`}
          </div>
          <div style={{ fontSize: 15, color: "#cc7777", marginTop: 4 }}>
            Cuota con mora: +{(loan.mora_days * 2)}% ={" "}
            <strong style={{ color: "#fff" }}>${cuotaHoy.toLocaleString()}</strong>
          </div>
        </div>
      )}

      {mortgageEvents.length > 0 && (
        <div style={alertStyle("#f97316")}>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>🏚️ Propiedades hipotecadas automáticamente</div>
          {mortgageEvents.map(k => (
            <div key={k} style={{ fontSize: 15, color: "#ffdab9" }}>
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
        <div style={{ fontSize: 15, color: "#ffffff", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
          Tu nivel bancario
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 40 }}>{bankLevel.icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 20, color: "#fbbf24" }}>
              Nivel {bankLevel.level} — {bankLevel.name}
            </div>
            <div style={{ fontSize: 14, color: "#b2b2b2", marginTop: 2 }}>
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
              fontSize: 13, color: "#fbbf24",
            }}>{p}</span>
          ))}
          {BANK_LEVELS.filter(l => l.level > bankLevel.level).flatMap(l => l.products).map(p => (
            <span key={p} style={{
              background: "#1e1e2e", border: "1px solid #2a2a3a",
              borderRadius: 6, padding: "3px 8px",
              fontSize: 13, color: "#333",
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
          { id: "fondo", label: "📈 Fondo" },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: "8px 4px",
            background: tab === t.id ? "rgba(251,191,36,0.12)" : "rgba(13,13,20,0.8)",
            border: `1px solid ${tab === t.id ? "#fbbf2466" : "#2a2a3a"}`,
            borderRadius: 8, color: tab === t.id ? "#fbbf24" : "#b4b4b4",
            fontSize: 15, fontWeight: 700, cursor: "pointer",
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
    <div style={{ color: "#00d4aa", fontWeight: 700, fontSize: 20 }}>
      💰 Cuenta de Ahorros — interés aplicado
    </div>
    <div style={{ fontSize: 15, color: "#aaa", marginTop: 4 }}>
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
    <div style={{ fontSize: 15, color: "#bababa", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
      📈 Cuenta de Ahorros (CDT)
    </div>
    {[
      
      ["Tasa base diaria", "0.5%"],
      ["Bonus por SC",      `+${(creditScore / 10_000).toFixed(4)}%`],
["Tasa efectiva hoy", `${((0.005 + creditScore / 1_000_000) * 100).toFixed(3)}%`],
["Rendimiento estimado hoy", `~$${Math.floor(Math.min(balance, 20_000_000) * (0.005 + creditScore / 1_000_000)).toLocaleString()}`],


      ["Techo de ahorro", "$20.000.000"],
      ["Base efectiva", `$${Math.min(balance, 20_000_000).toLocaleString()}`],
     // ["Rendimiento estimado hoy", `~$${Math.floor(Math.min(balance, 5_000_000) * (0.005 + creditScore / 10000)).toLocaleString()}`],
    ].map(([label, val], i) => (
      <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 15, marginBottom: 5 }}>
        <span style={{ color: "#a2a2a2" }}>{label}</span>
        <span style={{ color: "#00d4aa", fontWeight: 700 }}>{val}</span>
      </div>
    ))}
    <div style={{ fontSize: 12, color: "#ececec", marginTop: 6 }}>
      Se aplica automáticamente cada día al abrir el banco · Solo sobre los primeros $20M
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
              <div style={{ fontSize: 15, color: "#bdbdbd", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
                Préstamo activo
              </div>

              {/* Barra de progreso */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#ffffff", marginBottom: 4 }}>
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
                <div style={{ fontSize: 12, color: "#8000ff", marginTop: 3, textAlign: "right" }}>
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
                    <div style={{ fontSize: 11, color: "#c8c8c8", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#ddd", marginTop: 2 }}>{val}</div>
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
                    fontWeight: 800, fontSize: 15, cursor: balance >= cuotaHoy ? "pointer" : "not-allowed",
                  }}
                >
                  {paying ? "..." : `💳 Pagar cuota ($${cuotaHoy.toLocaleString()})`}
                </button>
                <button
                  onClick={payAll}
                  //disabled={paying || balance < remaining}
                  disabled={paying || balance < remainingWithMora}
                  style={{
                    flex: 1, padding: "11px",
                    //background: balance >= remaining ? "linear-gradient(135deg, #fbbf24, #f97316)" : "#1a1a26",
                    background: balance >= remainingWithMora ? "linear-gradient(135deg, #fbbf24, #f97316)" : "#1a1a26",
                    border: "none", borderRadius: 8,
                    color: balance >= remaining ? "#000" : "#444",
                    fontWeight: 800, fontSize: 15, cursor: balance >= remaining ? "pointer" : "not-allowed",
                  }}
                >
                  {paying ? "..." : `⚡ Saldar todo ($${remainingWithMora.toLocaleString()})`}
                </button>
              </div>

              {balance < cuotaHoy && (
                <div style={{ fontSize: 15, color: "#ff6666", textAlign: "center", marginTop: 8 }}>
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
              <div style={{ color: "#bebebe", fontSize: 12, marginTop: 4 }}>
                Puedes solicitar un préstamo en la pestaña "Pedir préstamo"
              </div>
            </div>
          )}

{/* ── Alerta de período de gracia ── */}
{loan?.status === "grace" && loan.grace_until && (
  <div style={alertStyle("#ff4444")}>
    <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
      🚨 PERÍODO DE GRACIA — DEUDA PENDIENTE
    </div>
    <div style={{ fontSize: 15, color: "#ffaaaa" }}>
      Vence el {loan.grace_until} · Paga o perderás todos los activos hipotecados
    </div>
    <div style={{ fontSize: 15, color: "#fff", marginTop: 4, fontWeight: 700 }}>
      Deuda restante: ${remaining.toLocaleString()}
    </div>
  </div>
)}

  {/* ── Deuda Incobrable ── */}
{loan?.status === "irrecoverable" && (
  <div style={{
    background: "rgba(127,0,0,0.15)",
    border: "2px solid #ff000066",
    borderRadius: 12, padding: "16px 14px",
    textAlign: "center",
  }}>
    <div style={{ fontSize: 30, marginBottom: 6 }}>☠️</div>
    <div style={{ color: "#ff4444", fontWeight: 900, fontSize: 17, marginBottom: 8 }}>
      DEUDA INCOBRABLE
    </div>
    <div style={{ fontSize: 17, color: "#ff8888", marginBottom: 4 }}>
      Tus propiedades fueron ejecutadas por el banco.
    </div>
    <div style={{ fontSize: 15, color: "#fff", fontWeight: 700, marginBottom: 12 }}>
      Deuda pendiente: ${remaining.toLocaleString()}
    </div>
    <div style={{ fontSize: 14, color: "#666", marginBottom: 16, lineHeight: 1.6 }}>
      No tienes activos ni liquidez para pagar.<br />Solo hay una salida.
    </div>
    <button
      onClick={handleSuicide}
      disabled={paying}
      style={{
        width: "100%", padding: "14px",
        background: paying ? "#333" : "linear-gradient(135deg, #7f0000, #cc0000)",
        border: "2px solid #ff4444",
        borderRadius: 10, color: "#fff",
        fontSize: 20, fontWeight: 900,
        cursor: paying ? "not-allowed" : "pointer",
        letterSpacing: 1,
      }}
    >
      {paying ? "..." : "💀 COLGARSE"}
    </button>
    <div style={{ fontSize: 15, color: "#c8c8c8", marginTop: 8 }}>
      Reinicia tu personaje · suma al contador de muertes
    </div>
  </div>
)}

{/* ── Alerta de ejecución forzada ── */}
{events.some(e => e.type === "foreclosure") && (
  <div style={alertStyle("#ff0000")}>
    <div style={{ fontSize: 20, fontWeight: 700 }}>💀 EJECUCIÓN BANCARIA</div>
    <div style={{ fontSize: 15, color: "#ffaaaa", marginTop: 4 }}>
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
              <div style={{ fontSize: 15, color: "#ff4444", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
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
                    <span style={{ fontSize: 30 }}>{asset.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: "#bbb" }}>{asset.label}</div>
                      <div style={{ fontSize: 15, color: "#d4d4d4" }}>
                        Deshipotecar: ${penalty.toLocaleString()} (+10% penalización)
                      </div>
                    </div>
                    <button
                      onClick={() => unmortgage(a)}
                      disabled={!canAfford}
                      style={{
                        background: canAfford ? "#fbbf24" : "#1a1a26",
                        border: "none", borderRadius: 7,
                        padding: "7px 12px", fontSize: 15, fontWeight: 800,
                        color: canAfford ? "#000" : "#c5c5c5",
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
              <div style={{ fontSize: 15, color: "#c4c4c4", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
                Actividad automática de hoy
              </div>
              {events.slice(0, 6).map((e, i) => (
                <div key={i} style={{ fontSize: 15, color: e.type === "mora" ? "#ff8888" : e.type === "payment" ? "#00d4aa" : "#fbbf24", marginBottom: 3 }}>
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
              <div style={{ fontWeight: 700, fontSize: 15 }}>⛔ Ya tienes un préstamo activo</div>
              <div style={{ fontSize: 15, color: "#ffdab9", marginTop: 4 }}>
                Debes saldarlo antes de pedir otro.
              </div>
            </div>
          )}

          {isInMora && !loan && (
            <div style={alertStyle("#ff4444")}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>🚫 Bloqueado por mora</div>
              <div style={{ fontSize: 15, color: "#ffaaaa", marginTop: 4 }}>
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
                <div style={{ fontSize: 15, color: "#c8c8c8", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
                  Condiciones actuales
                </div>
                {[
                  ["Límite de préstamo", `$${bankLevel.loanLimit.toLocaleString()}`],
                  ["Tasa de interés", `${(bankLevel.rate * 100).toFixed(0)}% semanal`],
                  ["Plazo", "7 días"],
                  ["Mora por día", `+${(bankLevel.moraRate * 100).toFixed(0)}% sobre cuota`],
                ].map(([label, val], i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 15, marginBottom: 6 }}>
                    <span style={{ color: "#c0c0c0" }}>{label}</span>
                    <span style={{ color: "#ddd", fontWeight: 700 }}>{val}</span>
                  </div>
                ))}
              </div>

              {/* Calculadora */}
              <div style={{
                background: "rgba(13,13,20,0.9)", border: "1px solid #2a2a3a",
                borderRadius: 12, padding: "12px 14px",
              }}>
                <div style={{ fontSize: 15, color: "#d8d8d8", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
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
                      color: "#aaa", fontSize: 13, padding: "5px 10px", cursor: "pointer",
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
                    fontWeight: 800, fontSize: 20, cursor: "pointer",
                  }}
                >
                  {requesting ? "Procesando..." : "🏦 Solicitar préstamo"}
                </button>

                {parseInt(loanAmount) > bankLevel.loanLimit && (
                  <div style={{ fontSize: 15, color: "#ff6666", textAlign: "center", marginTop: 6 }}>
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
                    <div style={{ fontWeight: 800, fontSize: 20, color: isCurrentLevel ? "#fbbf24" : "#bbb" }}>
                      Nivel {lvl.level} — {lvl.name}
                      {isCurrentLevel && <span style={{ marginLeft: 8, fontSize: 10, color: "#fbbf24", background: "#fbbf2422", padding: "2px 6px", borderRadius: 4 }}>ACTUAL</span>}
                    </div>
                    <div style={{ fontSize: 13, color: "#c0c0c0" }}>
                      Requiere {lvl.scRequired.toLocaleString()} SC
                    </div>
                  </div>
                </div>
                {[
                  ["Límite préstamo", `$${lvl.loanLimit.toLocaleString()}`],
                  ["Tasa semanal", `${(lvl.rate * 100).toFixed(0)}%`],
                  ["Mora diaria", `+${(lvl.moraRate * 100).toFixed(0)}%`],
                ].map(([label, val], i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 15, marginBottom: 4 }}>
                    <span style={{ color: "#c2c2c2" }}>{label}</span>
                    <span style={{ color: "#aaa", fontWeight: 700 }}>{val}</span>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
                  {lvl.products.map(p => (
                    <span key={p} style={{
                      background: isUnlocked ? "#fbbf2415" : "#1a1a26",
                      border: `1px solid ${isUnlocked ? "#fbbf2433" : "#2a2a3a"}`,
                      borderRadius: 6, padding: "2px 7px",
                      fontSize: 12, color: isUnlocked ? "#fbbf24" : "#333",
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
            <div style={{ fontWeight: 700, color: "#ff6666", marginBottom: 8, fontSize: 15 }}>
              📋 Reglas de mora y embargo
            </div>
            {[
              ["Días 1–7", "Se descuenta la cuota diaria automáticamente. Si no hay saldo, se acumula mora."],
              ["Día 8", "Con 7 días de mora: se hipoteca el activo de mayor valor para cubrir la deuda."],
              ["Sin activos", "7 días de gracia extra. Si no paga al día 14, entra en Quiebra Irrecuperable."],
              ["Deshipotecar", "Paga la deuda original + 10% de penalización para recuperar el activo."],
            ].map(([fase, desc], i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#ff8888" }}>{fase}</div>
                <div style={{ fontSize: 13, color: "#e7e7e7", lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════ TAB: FONDO DE INVERSIÓN ══════════════ */}
{tab === "fondo" && (
  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

    {/* Bloqueado si no es nivel 2 */}
    {bankLevel.level < 2 && (
      <div style={{
        background: "rgba(13,13,20,0.9)", border: "1px solid #2a2a3a",
        borderRadius: 12, padding: "24px 16px", textAlign: "center", opacity: 0.6,
      }}>
        <div style={{ fontSize: 35, marginBottom: 8 }}>🔒</div>
        <div style={{ color: "#b3b3b3", fontWeight: 700, fontSize: 15 }}>
          Requiere Nivel 2 — Inversor
        </div>
        <div style={{ color: "#ebebeb", fontSize: 15, marginTop: 6 }}>
          Alcanza {BANK_LEVELS[2].scRequired.toLocaleString()} SC para desbloquear
        </div>
      </div>
    )}

    {bankLevel.level >= 2 && (
      <>
        {/* ── Estado del mercado hoy ── */}
        {marketHistory.length > 0 && (() => {
          const today = marketHistory[marketHistory.length - 1];
          const colors = { crisis: "#ef4444", stability: "#fbbf24", growth: "#22c55e" };
          const labels = { crisis: "Crisis", stability: "Estabilidad", growth: "Crecimiento" };
          const col    = colors[today.state] || "#ffffff";
          return (
            <div style={{
              background: `${col}0f`,
              border: `1px solid ${col}44`,
              borderRadius: 12, padding: "12px 14px",
            }}>
              <div style={{ fontSize: 15, color: "#ffffff", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                Mercado hoy
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: col, fontWeight: 800, fontSize: 20 }}>
                  {today.state === "crisis" ? "📉" : today.state === "growth" ? "📈" : "➡️"}{" "}
                  {labels[today.state]}
                </span>
                <span style={{ color: col, fontWeight: 900, fontSize: 25 }}>
                  {today.pct > 0 ? "+" : ""}{today.pct}%
                </span>
              </div>
            </div>
          );
        })()}

        {/* ── Gráfica de velas (últimos 3 días) ── */}
        {marketHistory.length > 0 && (
          <div style={{
            background: "rgba(13,13,20,0.9)", border: "1px solid #ffffff",
            borderRadius: 12, padding: "12px 14px",
          }}>
            <div style={{ fontSize: 15, color: "#bababa", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
              Histórico (últimos {marketHistory.length} días)
            </div>
            <CandlestickChart days={marketHistory} />
          </div>
        )}

        {/* ── Eventos de hoy del fondo ── */}
        {fundEvents.length > 0 && (
          <div style={{
            background: "rgba(13,13,20,0.7)", border: "1px solid #1e1e2e",
            borderRadius: 10, padding: "10px 14px",
          }}>
            <div style={{ fontSize: 15, color: "#d2d2d2", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
              Rendimiento aplicado
            </div>
            {fundEvents.map((e, i) => {
              const col = e.state === "crisis" ? "#ef4444" : e.state === "growth" ? "#22c55e" : "#fbbf24";
              return (
                <div key={i} style={{ fontSize: 15, color: col, marginBottom: 3 }}>
                  {e.date} · {e.state} {e.finalPct > 0 ? "+" : ""}{e.finalPct}%
                  {" "}→ {e.returns >= 0 ? "+" : ""}${e.returns.toLocaleString()}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Fondo activo ── */}
        {fund && (
          <div style={{
            background: "rgba(13,13,20,0.9)",
            border: `1px solid ${fund.current_value >= fund.deposited ? "#22c55e44" : "#ef444444"}`,
            borderRadius: 12, padding: "14px",
          }}>
            <div style={{ fontSize: 15, color: "#ffffff", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>
              Inversión activa
            </div>

            {/* Barra de rendimiento */}
            {(() => {
              const gain   = fund.current_value - fund.deposited;
              const gainPct = fund.deposited > 0
                ? ((gain / fund.deposited) * 100).toFixed(2) : "0.00";
              const isPos  = gain >= 0;
              const tax    = Math.round(fund.current_value * 0.10);
              const recv   = fund.current_value - tax;

              return (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                    {[
                      ["Capital invertido",  `$${fund.deposited.toLocaleString()}`],
                      ["Valor actual",       `$${fund.current_value.toLocaleString()}`],
                      ["Ganancia/pérdida",   `${isPos ? "+" : ""}$${gain.toLocaleString()} (${gainPct}%)`],
                      ["Abierto el",         fund.opened_at?.split("T")[0] || "—"],
                      ["Impuesto salida (10%)", `$${tax.toLocaleString()}`],
                      ["Recibirías",         `$${recv.toLocaleString()}`],
                    ].map(([label, val], i) => (
                      <div key={i} style={{ background: "#0d0d14", borderRadius: 8, padding: "8px 10px" }}>
                        <div style={{ fontSize: 11, color: "#c3c3c3", textTransform: "uppercase" }}>{label}</div>
                        <div style={{
                          fontSize: 14, fontWeight: 700, marginTop: 2,
                          color: i === 2 ? (isPos ? "#22c55e" : "#ef4444")
                               : i === 4 ? "#ff8888"
                               : i === 5 ? "#00d4aa"
                               : "#ddd",
                        }}>{val}</div>
                      </div>
                    ))}
                  </div>

                  {/* Bloqueo durante quiebra */}
                  {loan?.status === "irrecoverable" && (
                    <div style={{ fontSize: 20, color: "#ff6666", textAlign: "center", marginBottom: 10 }}>
                      ⛓️ Retiro bloqueado en estado de quiebra
                    </div>
                  )}

                  <button
                    onClick={withdrawFund}
                    disabled={paying || loan?.status === "irrecoverable"}
                    style={{
                      width: "100%", padding: "12px",
                      background: (paying || loan?.status === "irrecoverable")
                        ? "#1a1a26"
                        : "linear-gradient(135deg, #f97316, #dc2626)",
                      border: "none", borderRadius: 10, color: "#fff",
                      fontWeight: 800, fontSize: 15, cursor: "pointer",
                    }}
                  >
                    {paying ? "..." : `💸 Retirar inversión ($${recv.toLocaleString()})`}
                  </button>
                  <div style={{ fontSize: 15, color: "#cecece", textAlign: "center", marginTop: 6 }}>
                    Se descuenta 10% del total retirado como impuesto de salida
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* ── Formulario de depósito (sin fondo activo) ── */}
        {!fund && (
          <div style={{
            background: "rgba(13,13,20,0.9)", border: "1px solid #2a2a3a",
            borderRadius: 12, padding: "14px",
          }}>
            <div style={{ fontSize: 15, color: "#f3f3f3", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
              Abrir nueva inversión
            </div>
            <input
              type="number"
              placeholder="Cantidad a invertir"
              value={fundAmount}
              onChange={e => setFundAmount(e.target.value)}
              style={{
                width: "100%", background: "#0d0d14", border: "1px solid #2a2a3a",
                borderRadius: 8, padding: "10px 12px", color: "#fff",
                fontSize: 20, boxSizing: "border-box", outline: "none", marginBottom: 8,
              }}
            />

            {/* Atajos */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {[100_000, 500_000, 1_000_000, 5_000_000].map(v => (
                <button key={v} onClick={() => setFundAmount(String(v))} style={{
                  background: "#0d0d14", border: "1px solid #2a2a3a", borderRadius: 6,
                  color: "#aaa", fontSize: 13, padding: "5px 10px", cursor: "pointer",
                }}>
                  ${v >= 1_000_000 ? `${v / 1_000_000}M` : `${v / 1_000}k`}
                </button>
              ))}
              <button onClick={() => setFundAmount(String(balance))} style={{
                background: "#0d0d14", border: "1px solid #fbbf2444", borderRadius: 6,
                color: "#fbbf24", fontSize: 13, padding: "5px 10px", cursor: "pointer",
              }}>
                Todo
              </button>
            </div>

            {/* Preview si hay monto */}
            {parseInt(fundAmount) > 0 && (() => {
              const amt    = parseInt(fundAmount);
              const mktDay = marketHistory[marketHistory.length - 1];
              const sc     = creditScore;
              if (!mktDay) return null;
              const scBonus  = sc * 0.0001;
              const finalPct = (mktDay.pct / 100) + scBonus;
              const est      = Math.round(amt * finalPct);
              return (
                <div style={{
                  background: "rgba(139,92,246,0.06)", border: "1px solid #8b5cf622",
                  borderRadius: 10, padding: "10px 12px", marginBottom: 10,
                }}>
                  <div style={{ fontSize: 15, color: "#f3f3f3", textTransform: "uppercase", marginBottom: 6 }}>
                    Estimado con el mercado de hoy
                  </div>
                  {[
                    ["Inversión",    `$${amt.toLocaleString()}`],
                    ["SC bonus",     `+${(scBonus * 100).toFixed(3)}%`],
                    ["Rendimiento",  `${mktDay.pct > 0 ? "+" : ""}${mktDay.pct}% + SC`],
                    ["Resultado est.", `${est >= 0 ? "+" : ""}$${est.toLocaleString()}`],
                  ].map(([l, v], i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 15, marginBottom: 4 }}>
                      <span style={{ color: "#b6b6b6" }}>{l}</span>
                      <span style={{ color: i === 3 ? (est >= 0 ? "#22c55e" : "#ef4444") : "#aaa", fontWeight: 700 }}>{v}</span>
                    </div>
                  ))}
                </div>
              );
            })()}

            <button
              onClick={depositFund}
              disabled={
                requesting ||
                !fundAmount ||
                parseInt(fundAmount) <= 0 ||
                parseInt(fundAmount) > balance ||
                loan?.status === "irrecoverable"
              }
              style={{
                width: "100%", padding: "12px",
                background: (!requesting && fundAmount && parseInt(fundAmount) > 0 && parseInt(fundAmount) <= balance)
                  ? "linear-gradient(135deg, #8b5cf6, #6d28d9)"
                  : "#1a1a26",
                border: "none", borderRadius: 10, color: "#fff",
                fontWeight: 800, fontSize: 16, cursor: "pointer",
              }}
            >
              {requesting ? "..." : "📈 Abrir inversión"}
            </button>

            <div style={{ fontSize: 12, color: "#cbcbcb", textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>
              Capital congelado hasta retiro · 10% impuesto al retirar<br />
              Rendimiento varía cada día según el mercado
            </div>
          </div>
        )}
      </>
    )}
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
      <div style={{ fontSize: 15, color: "#e5e5e5", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
        Resumen del préstamo
      </div>
      {[
        ["Capital", `$${amount.toLocaleString()}`],
        [`Interés (${(bankLevel.rate * 100).toFixed(0)}%)`, `+$${interest.toLocaleString()}`],
        ["Total a devolver", `$${totalDebt.toLocaleString()}`],
        ["Cuota diaria", `$${dailyPayment.toLocaleString()} × 7 días`],
      ].map(([label, val], i) => (
        <div key={i} style={{
          display: "flex", justifyContent: "space-between", fontSize: 15,
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

function CandlestickChart({ days }) {
  const W = 300, H = 130;
  const candleW = 26;
  const maxRange = 12;
  const midY = H * 0.52;
  const scale = (H * 0.42) / maxRange;
  const spacing = W / (days.length + 1);
  const stateColors = { crisis: "#ef4444", stability: "#fbbf24", growth: "#22c55e" };
  const dayLabels = ["Antayer", "Ayer", "Hoy"];

  return (
    <svg width={W} height={H} style={{ display: "block", width: "100%" }}
         viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">

      {/* Grid */}
      {[-10, -5, 0, 5, 10].map(p => (
        <line key={p}
          x1={0} y1={midY - p * scale} x2={W} y2={midY - p * scale}
          stroke={p === 0 ? "#747474" : "#767676"}
          strokeWidth={p === 0 ? 1.5 : 1}
          strokeDasharray={p !== 0 ? "3,4" : undefined}
        />
      ))}

      {/* Y labels */}
      {[-10, -5, 0, 5, 10].map(p => (
        <text key={p} x={2} y={midY - p * scale + 3.5}
          fill="#ffffff" fontSize={10}>
          {p > 0 ? "+" : ""}{p}%
        </text>
      ))}

      {/* Barras simples (sin seededRandom) */}
      {days.map((day, i) => {
        const pct  = parseFloat(day.pct);
        const col  = stateColors[day.state] || "#aaa";
        const cx   = spacing * (i + 1);
        const barH = Math.max(2, Math.abs(pct) * scale);
        const barY = pct >= 0 ? midY - barH : midY;
        const labelI = days.length === 3 ? i : days.length === 2 ? i + 1 : 2;

        return (
          <g key={i}>
            {/* Línea central (eje 0) → tope de la barra */}
            <line
              x1={cx} y1={midY}
              x2={cx} y2={pct >= 0 ? midY - barH : midY + barH}
              stroke={col} strokeWidth={2}
            />
            {/* Barra */}
            <rect
              x={cx - candleW / 2} y={barY}
              width={candleW} height={barH}
              fill={col} opacity={0.85} rx={2}
            />
            {/* Pct label */}
            <text
              x={cx} y={pct >= 0 ? barY - 5 : barY + barH + 11}
              textAnchor="middle" fill={col} fontSize={9} fontWeight="bold"
            >
              {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
            </text>
            {/* Day label */}
            <text x={cx} y={H - 1}
              textAnchor="middle" fill="#ffffff" fontSize={10}>
              {dayLabels[labelI]}
            </text>
          </g>
        );
      })}
    </svg>
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
