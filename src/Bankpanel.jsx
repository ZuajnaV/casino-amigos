import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";
import { ASSETS } from "./ShopPanel.jsx";

// ─── MERCADO DIARIO ────────────────────────────────────────────────────────
function generateMarketForDate() {
  const r1 = Math.random(), r2 = Math.random();
  let state, pct;
  if      (r1 < 0.10) { state = "coletazo";  pct = -(r2 * 15 + 15); }
  else if (r1 < 0.35) { state = "crisis";     pct = -(r2 * 10 + 5);  }
  else if (r1 < 0.65) { state = "stability";  pct =   r2 * 6 - 3;    }
  else if (r1 < 0.90) { state = "growth";     pct =   r2 * 12 + 8;   }
  else                 { state = "subidon";    pct =   r2 * 30 + 40;  }
  return { state, pct: Math.round(pct * 100) / 100 };
}

async function getOrCreateMarketForDate(dateStr) {
  const { data } = await supabase.from("market_daily").select("*").eq("date", dateStr).single();
  if (data) return data;
  const { state, pct } = generateMarketForDate();
  const { data: inserted, error } = await supabase
    .from("market_daily").insert({ date: dateStr, state, pct }).select().single();
  if (error) {
    const { data: retry } = await supabase.from("market_daily").select("*").eq("date", dateStr).single();
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

  const today    = todayStr();
  const lastProc = fund.last_processed || today;
  const daysPend = daysBetween(lastProc, today);
  if (daysPend <= 0) return { processed: false, fund };

  const { data: blocking } = await supabase
    .from("loans").select("id").eq("user_id", userId).eq("status", "irrecoverable").limit(1);
  if (blocking && blocking.length > 0) return { processed: false, fund, blocked: true };

  const { data: assets } = await supabase
    .from("player_assets").select("quantity, mortgaged").eq("user_id", userId);
  const totalAssets = (assets || []).filter(a => !a.mortgaged).reduce((sum, a) => sum + a.quantity, 0);

  let currentValue = fund.current_value;
  const events = [];

  for (let d = daysPend - 1; d >= 0; d--) {
    const dayDate      = addDays(today, -d);
    const mkt          = await getOrCreateMarketForDate(dayDate);
    const scBonusPp    = creditScore * 0.0001;
    const assetBonusPp = totalAssets * 0.5;
    const totalPp      = mkt.pct + scBonusPp + assetBonusPp;
    const multiplier   = totalPp / 100;
    const returns      = Math.round(currentValue * multiplier);
    currentValue       = Math.max(0, currentValue + returns);
    events.push({ date: dayDate, state: mkt.state, pct: mkt.pct, finalPct: +totalPp.toFixed(2), returns });
  }

  await supabase.from("investment_fund").update({
    current_value: currentValue, last_processed: today,
  }).eq("id", fund.id);

  return { processed: true, fund: { ...fund, current_value: currentValue }, events };
}

// ─── CONFIGURACIÓN DEL BANCO ─────────────────────────────────────────────────
export const BANK_LEVELS = [
  { level: 0, name: "Nuevo",    icon: "🏦", scRequired: 0,     loanLimit: 500_000,    rate: 0.25, moraRate: 0.02,  products: ["Préstamo Menor"] },
  { level: 1, name: "Cliente",  icon: "💳", scRequired: 2_500, loanLimit: 5_000_000,  rate: 0.15, moraRate: 0.015, products: ["Préstamo Medio", "CDT"] },
  { level: 2, name: "Inversor", icon: "📈", scRequired: 6_500, loanLimit: 15_000_000, rate: 0.08, moraRate: 0.01,  products: ["Préstamo Mayor", "CDT", "Fondo de Inversión"] },
];

const ASSET_PRICES = Object.fromEntries(Object.values(ASSETS).map(a => [a.key, a.price]));

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function daysBetween(dateA, dateB) {
  const a = new Date(dateA); a.setHours(0,0,0,0);
  const b = new Date(dateB); b.setHours(0,0,0,0);
  return Math.floor((b - a) / 86_400_000);
}
function todayStr() {
  const now = new Date();
  return new Date(now.getTime() - 43_200_000).toISOString().split("T")[0];
}
function addDays(dateStr, n) {
  const d = new Date(dateStr); d.setDate(d.getDate() + n); return d.toISOString().split("T")[0];
}
function bankLevelFor(sc) {
  if (sc >= BANK_LEVELS[2].scRequired) return BANK_LEVELS[2];
  if (sc >= BANK_LEVELS[1].scRequired) return BANK_LEVELS[1];
  return BANK_LEVELS[0];
}

export async function processLoanPayments(userId, currentBalance) {
  const { data: loans } = await supabase.from("loans").select("*").eq("user_id", userId)
    .in("status", ["active", "pending_mortgage", "grace"]);
  if (!loans || loans.length === 0) return { newBalance: currentBalance, events: [] };

  const today = todayStr();
  let balance = currentBalance;
  const events = [];

  for (const loan of loans) {
    const daysDue = daysBetween(loan.next_payment, today);
    if (daysDue <= 0) {
      if (loan.status === "grace" && loan.grace_until) {
        if (daysBetween(loan.grace_until, today) > 0 && loan.total_debt - loan.paid_amount > 0)
          await handleGraceExpiry(userId, loan.id, events);
      }
      continue;
    }

    let { paid_amount, days_paid, mora_days, total_debt, daily_payment, next_payment } = loan;
    if (total_debt - paid_amount <= 0) {
      await supabase.from("loans").update({ status: "paid" }).eq("id", loan.id);
      events.push({ type: "paid", loanId: loan.id });
      continue;
    }

    let currentNextPayment = next_payment, loanDone = false;
    for (let d = 0; d < daysDue; d++) {
      const moraMultiplier = 1 + mora_days * 0.02;
      const cuota  = Math.round(daily_payment * moraMultiplier);
      const remDebt = total_debt - paid_amount;
      const toPay  = Math.min(cuota, remDebt);
      if (balance >= toPay) {
        balance -= toPay; paid_amount += toPay; days_paid++;
        currentNextPayment = addDays(currentNextPayment, 1);
        events.push({ type: "payment", amount: toPay, day: days_paid });
      } else {
        mora_days++; currentNextPayment = addDays(currentNextPayment, 1);
        events.push({ type: "mora", moraDays: mora_days });
      }
      if (paid_amount >= total_debt) {
        await supabase.from("loans").update({ paid_amount, days_paid, mora_days, status: "paid", next_payment: currentNextPayment }).eq("id", loan.id);
        await supabase.from("profiles").update({ balance }).eq("id", userId);
        events.push({ type: "paid", loanId: loan.id }); loanDone = true; break;
      }
      if (mora_days >= 7 && loan.status === "active") {
        events.push({ type: "mortgage_trigger", loanId: loan.id, remainingDebt: total_debt - paid_amount });
        await supabase.from("loans").update({ paid_amount, days_paid, mora_days, next_payment: currentNextPayment, status: "pending_mortgage" }).eq("id", loan.id);
        loanDone = true; break;
      }
    }
    if (loanDone) continue;

    const { data: cur } = await supabase.from("loans").select("status").eq("id", loan.id).single();
    if (cur?.status === "active" || cur?.status === "grace") {
      await supabase.from("loans").update({ paid_amount, days_paid, mora_days, next_payment: currentNextPayment }).eq("id", loan.id);
    }
    if (cur?.status === "grace" && loan.grace_until && daysBetween(loan.grace_until, today) > 0 && paid_amount < total_debt)
      await handleGraceExpiry(userId, loan.id, events);
  }

  await supabase.from("profiles").update({ balance }).eq("id", userId);
  return { newBalance: balance, events };
}

async function handleGraceExpiry(userId, loanId, events) {
  const { data: mortgagedAssets } = await supabase.from("player_assets").select("*").eq("user_id", userId).eq("mortgaged", true);
  if (mortgagedAssets && mortgagedAssets.length > 0) {
    for (const asset of mortgagedAssets) await supabase.from("player_assets").delete().eq("id", asset.id);
    events.push({ type: "foreclosure", loanId });
  }
  await supabase.from("loans").update({ status: "irrecoverable" }).eq("id", loanId);
  events.push({ type: "irrecoverable", loanId });
}

export async function processCDT(userId, currentBalance, creditScore, bankLevel, cdtBonus = 0) {
  if (bankLevel < 1) return { newBalance: currentBalance, interest: 0 };
  const { data: blockingLoan } = await supabase.from("loans").select("id").eq("user_id", userId).eq("status", "irrecoverable").limit(1);
  if (blockingLoan && blockingLoan.length > 0) return { newBalance: currentBalance, interest: 0 };

  const { data: profile } = await supabase.from("profiles").select("cdt_last_processed").eq("id", userId).single();
  if (!profile) return { newBalance: currentBalance, interest: 0 };

  const today       = todayStr();
  const lastProcessed = profile.cdt_last_processed || today;
  const daysPending = daysBetween(lastProcessed, today);
  if (daysPending <= 0) return { newBalance: currentBalance, interest: 0 };

  const cdtBonusPct = cdtBonus;
  const TASA_BASE   = 0.005;
  const TECHO       = 20_000_000;
  let balance = currentBalance, totalInterest = 0;

  for (let d = 0; d < daysPending; d++) {
    const base = Math.min(balance, TECHO);
    const tasa = TASA_BASE + (creditScore / 1_000_000) + ((cdtBonusPct / 13.75) / 100);
    const rend = Math.floor(base * tasa);
    balance += rend; totalInterest += rend;
  }

  balance = Math.round(balance); totalInterest = Math.round(totalInterest);
  await supabase.from("profiles").update({ balance, cdt_last_processed: today }).eq("id", userId);
  return { newBalance: balance, interest: totalInterest, daysPending, cdtBonusPct };
}

export async function executeMortgage(userId, loanId, remainingDebt) {
  const { data: playerAssets } = await supabase.from("player_assets").select("*").eq("user_id", userId).eq("mortgaged", false);
  const today = todayStr();

  if (!playerAssets || playerAssets.length === 0) {
    const graceUntil = addDays(today, 1);
    await supabase.from("loans").update({ status: "grace", grace_until: graceUntil }).eq("id", loanId);
    return { mortgaged: [], noAssets: true, graceUntil };
  }

  const sorted  = [...playerAssets].sort((a, b) => (ASSET_PRICES[b.asset_key]||0) - (ASSET_PRICES[a.asset_key]||0));
  let covered   = 0;
  const mortgaged = [];

  for (const asset of sorted) {
    if (covered >= remainingDebt) break;
    covered += (ASSET_PRICES[asset.asset_key] || 0) * asset.quantity;
    await supabase.from("player_assets").update({ mortgaged: true }).eq("id", asset.id);
    mortgaged.push(asset.asset_key);
    const assetData = ASSETS[asset.asset_key];
    if (assetData) {
      const { data: prof } = await supabase.from("profiles").select("credit_score").eq("id", userId).single();
      if (prof) await supabase.from("profiles").update({ credit_score: Math.max(0, (prof.credit_score||0) - assetData.sc * asset.quantity) }).eq("id", userId);
    }
  }

  const { data: loanData } = await supabase.from("loans").select("total_debt, paid_amount").eq("id", loanId).single();
  const currentPaid = loanData?.paid_amount || 0;
  const totalDebt   = loanData?.total_debt  || remainingDebt;

  if (covered >= remainingDebt) {
    await supabase.from("loans").update({ paid_amount: totalDebt, mora_days: 0, status: "paid", mortgaged_at: today }).eq("id", loanId);
    return { mortgaged, noAssets: false, debtCovered: true, excess: covered - remainingDebt };
  }

  const graceUntil = addDays(today, 1);
  await supabase.from("loans").update({ paid_amount: currentPaid + covered, mora_days: 0, status: "grace", mortgaged_at: today, grace_until: graceUntil }).eq("id", loanId);
  return { mortgaged, noAssets: false, debtCovered: false, remaining: remainingDebt - covered };
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function BankPanel({ profile, balance, setBalance, onScChange, onDeath }) {
  const [loan,          setLoan]          = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [requesting,    setRequesting]    = useState(false);
  const [paying,        setPaying]        = useState(false);
  const [loanAmount,    setLoanAmount]    = useState("");
  const [events,        setEvents]        = useState([]);
  const [tab,           setTab]           = useState("estado");
  const [creditScore,   setCreditScore]   = useState(profile.credit_score || 0);
  const [ownedAssets,   setOwnedAssets]   = useState([]);
  const [mortgageEvents,setMortgageEvents]= useState([]);
  const [cdtEvents,     setCdtEvents]     = useState(null);
  const [fund,          setFund]          = useState(null);
  const [marketHistory, setMarketHistory] = useState([]);
  const [fundAmount,    setFundAmount]    = useState("");
  // ── NUEVO: retiro parcial ─────────────────────────────────────────────────
  const [withdrawAmount,setWithdrawAmount]= useState("");
  const [fundEvents,    setFundEvents]    = useState([]);

  const bankLevel = bankLevelFor(creditScore);

  const load = useCallback(async () => {
    setLoading(true);
    const [loanRes, assetsRes, profileRes, fundRes, marketRes] = await Promise.all([
      supabase.from("loans").select("*").eq("user_id", profile.id)
        .in("status", ["active","grace","irrecoverable"]).order("created_at",{ascending:false}).limit(1),
      supabase.from("player_assets").select("*").eq("user_id", profile.id),
      supabase.from("profiles").select("credit_score").eq("id", profile.id).single(),
      supabase.from("investment_fund").select("*").eq("user_id", profile.id).eq("status","active").maybeSingle(),
      supabase.from("market_daily").select("*").order("date",{ascending:false}).limit(3),
    ]);
    setLoan(loanRes.data?.[0] || null);
    setOwnedAssets(assetsRes.data || []);
    if (profileRes.data) setCreditScore(profileRes.data.credit_score || 0);
    setFund(fundRes.data || null);
    setMarketHistory((marketRes.data || []).reverse());
    setLoading(false);
  }, [profile.id]);

  useEffect(() => {
    async function init() {
      await load();
      const result = await processLoanPayments(profile.id, balance);
      if (result.newBalance !== balance) setBalance(result.newBalance);

      const { data: profData } = await supabase.from("profiles").select("credit_score").eq("id", profile.id).single();
      const sc  = profData?.credit_score || 0;
      const lvl = bankLevelFor(sc);

      if (lvl.level >= 1) {
        const { data: assetsForCDT } = await supabase.from("player_assets").select("asset_key,quantity,mortgaged").eq("user_id", profile.id);
        const cdtBonus = (assetsForCDT || []).filter(a => !a.mortgaged).reduce((sum, a) => {
          const assetData = ASSETS[a.asset_key]; return sum + (assetData ? assetData.cdt * a.quantity : 0);
        }, 0);
        const cdtResult = await processCDT(profile.id, result.newBalance, sc, lvl.level, cdtBonus);
        if (cdtResult.interest > 0) { setBalance(cdtResult.newBalance); setCdtEvents({ interest: cdtResult.interest, days: cdtResult.daysPending }); }
      }

      if (result.events.length > 0) {
        setEvents(result.events);
        const mt = result.events.find(e => e.type === "mortgage_trigger");
        if (mt) { const mr = await executeMortgage(profile.id, mt.loanId, mt.remainingDebt); setMortgageEvents(mr.mortgaged); }
        await load();
      }

      const fundResult = await processInvestmentFund(profile.id, sc);
      if (fundResult.processed) {
        setFund(fundResult.fund); setFundEvents(fundResult.events || []);
        const { data: mkt } = await supabase.from("market_daily").select("*").order("date",{ascending:false}).limit(3);
        if (mkt) setMarketHistory([...mkt].reverse());
      }
    }
    init();
  }, [profile.id]);

  // ── Solicitar préstamo ────────────────────────────────────────────────────
  async function requestLoan() {
    const amount = parseInt(String(loanAmount));
    if (!amount || amount <= 0 || amount > bankLevel.loanLimit || loan || isInMora) return;
    setRequesting(true);
    const interest = Math.round(amount * bankLevel.rate);
    const totalDebt = amount + interest;
    const dailyPayment = Math.ceil(totalDebt / 7);
    const newBalance = balance + amount;
    await supabase.from("loans").insert({ user_id: profile.id, amount, total_debt: totalDebt, daily_payment: dailyPayment, paid_amount: 0, days_paid: 0, mora_days: 0, status: "active", next_payment: addDays(todayStr(), 1) });
    await supabase.from("profiles").update({ balance: newBalance }).eq("id", profile.id);
    setBalance(newBalance); setLoanAmount(""); setTab("estado"); await load(); setRequesting(false);
  }

  // ── Pago manual cuota ────────────────────────────────────────────────────
  async function payNow() {
    if (!loan || paying) return;
    const cuota   = Math.ceil(loan.daily_payment * (1 + loan.mora_days * 0.02));
    const remaining = loan.total_debt - loan.paid_amount;
    const toPay   = Math.min(cuota, remaining);
    if (balance < toPay) return;
    setPaying(true);
    const newBalance = balance - toPay;
    const newPaid    = loan.paid_amount + toPay;
    const isNowPaid  = newPaid >= loan.total_debt;
    await supabase.from("loans").update({ paid_amount: newPaid, days_paid: loan.days_paid + 1, mora_days: Math.max(0, loan.mora_days - 1), status: isNowPaid ? "paid" : (loan.status === "grace" ? "grace" : "active"), next_payment: addDays(loan.next_payment, 1) }).eq("id", loan.id);
    await supabase.from("profiles").update({ balance: newBalance }).eq("id", profile.id);
    setBalance(newBalance); await load(); setPaying(false);
  }

  // ── Saldar todo ──────────────────────────────────────────────────────────
  async function payAll() {
    if (!loan || paying) return;
    const baseRemaining  = loan.total_debt - loan.paid_amount;
    const moraMultiplier = loan.mora_days > 0 ? (1 + loan.mora_days * 0.02) : 1;
    const remaining      = Math.ceil(baseRemaining * moraMultiplier);
    if (balance < remaining) return;
    setPaying(true);
    const newBalance = balance - remaining;
    await supabase.from("loans").update({ paid_amount: loan.total_debt, status: "paid", mora_days: 0 }).eq("id", loan.id);
    await supabase.from("profiles").update({ balance: newBalance }).eq("id", profile.id);
    setBalance(newBalance); await load(); setPaying(false);
  }

  // ── FONDO: Inyectar capital (funciona tanto para crear como para añadir) ──
  // Siguiendo el orden cronológico: processInvestmentFund ya consolidó el
  // rendimiento pendiente en el mount, así que simplemente sumamos al valor actual.
  async function depositFund() {
    const amount = parseInt(String(fundAmount));
    if (!amount || amount <= 0 || amount > balance) return;
    if (bankLevel.level < 2) return;
    if (loan?.status === "irrecoverable") return;

    setRequesting(true);
    const newBalance = balance - amount;

    if (fund) {
      // ── Inyección sobre fondo activo ──────────────────────────────────────
      // El rendimiento de los días previos ya fue aplicado en el init(),
      // por lo que current_value está al día. Solo sumamos el nuevo capital.
      await supabase.from("investment_fund").update({
        current_value: fund.current_value + amount,
        deposited:     (fund.deposited || 0) + amount,
        // No tocamos last_processed: el rendimiento de HOY ya fue procesado
      }).eq("id", fund.id).eq("user_id", profile.id);
    } else {
      // ── Crear fondo nuevo ─────────────────────────────────────────────────
      await supabase.from("investment_fund").insert({
        user_id:        profile.id,
        deposited:      amount,
        current_value:  amount,
        status:         "active",
        last_processed: todayStr(),
      });
    }

    await supabase.from("profiles").update({ balance: newBalance }).eq("id", profile.id);
    setBalance(newBalance); setFundAmount(""); await load(); setRequesting(false);
  }

  // ── FONDO: Retiro parcial o total ────────────────────────────────────────
  // El impuesto (10%) se aplica SOLO sobre el monto que sale del fondo.
  // El saldo restante sigue generando rendimientos.
  async function withdrawFund() {
    if (!fund || paying) return;
    if (loan?.status === "irrecoverable") return;

    // Si no se especifica monto → retirar todo
    const rawAmount = parseInt(String(withdrawAmount));
    const amount    = (rawAmount > 0 && rawAmount <= fund.current_value) ? rawAmount : fund.current_value;
    if (!amount || amount <= 0) return;

    setPaying(true);
    const tax          = Math.round(amount * 0.10);   // 10% sobre lo que sale
    const received     = amount - tax;                // lo que llega al jugador
    const newFundValue = fund.current_value - amount; // saldo restante en fondo
    const newBalance   = balance + received;

    if (newFundValue <= 0) {
      // Retirar todo → cerrar fondo
      await supabase.from("investment_fund")
        .update({ status: "closed", current_value: 0 }).eq("id", fund.id);
      setFund(null);
    } else {
      // Retiro parcial → actualizar saldo
      await supabase.from("investment_fund")
        .update({ current_value: newFundValue }).eq("id", fund.id);
    }

    await supabase.from("profiles").update({ balance: newBalance }).eq("id", profile.id);
    setBalance(newBalance); setWithdrawAmount(""); await load(); setPaying(false);
  }

  // ── Reinicio (suicidio) ──────────────────────────────────────────────────
  async function handleSuicide() {
    if (paying) return;
    setPaying(true);
    const STARTING_BALANCE = 100_000;
    await supabase.from("player_assets").delete().eq("user_id", profile.id);
    await supabase.from("investment_fund").update({ status: "closed" }).eq("user_id", profile.id).eq("status","active");
    await supabase.from("loans").update({ status: "foreclosed" }).eq("user_id", profile.id).in("status",["active","grace","irrecoverable","pending_mortgage"]);
    await supabase.from("profiles").update({ deaths: (profile.deaths||0)+1, credit_score: 0, balance: STARTING_BALANCE, cdt_last_processed: todayStr() }).eq("id", profile.id);
    setFund(null); setBalance(STARTING_BALANCE);
    if (onDeath) onDeath();
    setPaying(false);
  }

  // ── Deshipotecar ─────────────────────────────────────────────────────────
  async function unmortgage(assetEntry) {
    const asset = ASSETS[assetEntry.asset_key];
    if (!asset) return;
    const penalty = Math.round(asset.price * 1.10);
    if (balance < penalty) return;
    const newBalance = balance - penalty;
    const newSC      = creditScore + asset.sc;
    await supabase.from("player_assets").update({ mortgaged: false }).eq("id", assetEntry.id);
    await supabase.from("profiles").update({ balance: newBalance, credit_score: newSC }).eq("id", profile.id);
    setBalance(newBalance); setCreditScore(newSC);
    if (onScChange) onScChange(newSC);
    await load();
  }

  if (loading) return (
    <div style={{ textAlign:"center", color:"#555", padding:32 }}>
      <div style={{ fontSize:28, marginBottom:8 }}>🏦</div>Cargando banco...
    </div>
  );

  const cdtAssetBonus = ownedAssets.filter(a => !a.mortgaged).reduce((sum, a) => {
    const assetData = ASSETS[a.asset_key]; return sum + (assetData ? assetData.cdt * a.quantity : 0);
  }, 0);

  const isInMora           = loan && loan.mora_days > 0 && loan.status !== "grace";
  const remaining          = loan ? loan.total_debt - loan.paid_amount : 0;
  const moraMultiplier     = loan?.mora_days > 0 ? (1 + loan.mora_days * 0.02) : 1;
  const remainingWithMora  = Math.ceil(remaining * moraMultiplier);
  const progress           = loan ? (loan.paid_amount / loan.total_debt) * 100 : 0;
  const cuotaHoy           = loan ? Math.min(Math.ceil(loan.daily_payment * moraMultiplier), remaining) : 0;
  const mortgagedAssets    = ownedAssets.filter(a => a.mortgaged);
  const hasMortgaged       = mortgagedAssets.length > 0;

  // ── Validación de retiro parcial ──────────────────────────────────────────
  const withdrawParsed    = parseInt(String(withdrawAmount)) || 0;
  const withdrawIsValid   = withdrawParsed > 0 && fund && withdrawParsed <= fund.current_value;
  const withdrawEffective = withdrawIsValid ? withdrawParsed : (fund?.current_value || 0);
  const withdrawTax       = Math.round(withdrawEffective * 0.10);
  const withdrawReceived  = withdrawEffective - withdrawTax;
  const fundAfterWithdraw = fund ? Math.max(0, fund.current_value - withdrawEffective) : 0;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

      {/* ── Alertas ── */}
      {isInMora && (
        <div style={alertStyle("#ff4444")}>
          <div style={{ fontSize:20, marginBottom:4 }}>⚠️ DEUDA EN MORA</div>
          <div style={{ fontSize:15, color:"#ffaaaa" }}>
            {loan.mora_days} {loan.mora_days===1?"día":"días"} sin pagar ·{" "}
            {loan.mora_days>=7?"¡Hipoteca activada!": `${7-loan.mora_days} día${7-loan.mora_days!==1?"s":""} para hipoteca`}
          </div>
          <div style={{ fontSize:15, color:"#cc7777", marginTop:4 }}>
            Cuota con mora: +{loan.mora_days*2}% = <strong style={{color:"#fff"}}>${cuotaHoy.toLocaleString()}</strong>
          </div>
        </div>
      )}

      {mortgageEvents.length > 0 && (
        <div style={alertStyle("#f97316")}>
          <div style={{ fontSize:20, fontWeight:700, marginBottom:4 }}>🏚️ Propiedades hipotecadas automáticamente</div>
          {mortgageEvents.map(k => (
            <div key={k} style={{ fontSize:15, color:"#ffdab9" }}>{ASSETS[k]?.icon} {ASSETS[k]?.label}</div>
          ))}
        </div>
      )}

      {/* ── Nivel del banco ── */}
      <div style={{ background:"rgba(13,13,20,0.9)", border:"1px solid #2a2a3a", borderRadius:12, padding:"12px 14px" }}>
        <div style={{ fontSize:15, color:"#fff", letterSpacing:1, textTransform:"uppercase", marginBottom:8 }}>Tu nivel bancario</div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ fontSize:40 }}>{bankLevel.icon}</div>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:800, fontSize:20, color:"#fbbf24" }}>Nivel {bankLevel.level} — {bankLevel.name}</div>
            <div style={{ fontSize:14, color:"#b2b2b2", marginTop:2 }}>
              SC actual: <span style={{color:"#00d4aa",fontWeight:700}}>{creditScore.toLocaleString()}</span>
              {bankLevel.level<2&&<span style={{color:"#555",marginLeft:8}}>· Siguiente: {BANK_LEVELS[bankLevel.level+1].scRequired.toLocaleString()} SC</span>}
            </div>
            {bankLevel.level<2&&(
              <div style={{ marginTop:6, height:5, background:"#1e1e2e", borderRadius:3, overflow:"hidden" }}>
                <div style={{ height:"100%", borderRadius:3, width:`${Math.min(100,(creditScore/BANK_LEVELS[bankLevel.level+1].scRequired)*100)}%`, background:"linear-gradient(90deg,#fbbf24,#f97316)", transition:"width 0.5s" }} />
              </div>
            )}
          </div>
        </div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:10 }}>
          {bankLevel.products.map(p=><span key={p} style={{ background:"#fbbf2415", border:"1px solid #fbbf2433", borderRadius:6, padding:"3px 8px", fontSize:13, color:"#fbbf24" }}>{p}</span>)}
          {BANK_LEVELS.filter(l=>l.level>bankLevel.level).flatMap(l=>l.products).map(p=><span key={p} style={{ background:"#1e1e2e", border:"1px solid #2a2a3a", borderRadius:6, padding:"3px 8px", fontSize:13, color:"#333" }}>🔒 {p}</span>)}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display:"flex", gap:6 }}>
        {[{id:"estado",label:"📋 Estado"},{id:"pedir",label:"💸 Pedir"},{id:"info",label:"ℹ️ Niveles"},{id:"fondo",label:"📈 Fondo"}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{ flex:1, padding:"8px 4px", background:tab===t.id?"rgba(251,191,36,0.12)":"rgba(13,13,20,0.8)", border:`1px solid ${tab===t.id?"#fbbf2466":"#2a2a3a"}`, borderRadius:8, color:tab===t.id?"#fbbf24":"#b4b4b4", fontSize:15, fontWeight:700, cursor:"pointer" }}>{t.label}</button>
        ))}
      </div>

      {/* ══════════════ TAB: ESTADO ══════════════ */}
      {tab==="estado"&&(
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {cdtEvents&&cdtEvents.interest>0&&(
            <div style={{ background:"rgba(0,212,170,0.08)", border:"1px solid #00d4aa44", borderRadius:10, padding:"10px 14px" }}>
              <div style={{ color:"#00d4aa", fontWeight:700, fontSize:20 }}>💰 Cuenta de Ahorros — interés aplicado</div>
              <div style={{ fontSize:15, color:"#aaa", marginTop:4 }}>+${cdtEvents.interest.toLocaleString()} en {cdtEvents.days} {cdtEvents.days===1?"día":"días"}</div>
            </div>
          )}
          {bankLevel.level>=1&&(
            <div style={{ background:"rgba(13,13,20,0.9)", border:"1px solid #00d4aa33", borderRadius:12, padding:"12px 14px" }}>
              <div style={{ fontSize:15, color:"#bababa", letterSpacing:1, textTransform:"uppercase", marginBottom:8 }}>📈 Cuenta de Ahorros (CDT)</div>
              {[
                ["Tasa base diaria","0.5%"],
                ["Bonus por SC",`+${(creditScore/10_000).toFixed(4)}%`],
                ["Bonus por activos",`+${(cdtAssetBonus/13.75).toFixed(2)}%`],
                ["Tasa efectiva hoy",`${((0.005+creditScore/1_000_000+(cdtAssetBonus/13.75)/100)*100).toFixed(3)}%`],
                ["Rendimiento est. hoy",`~$${Math.floor(Math.min(balance,20_000_000)*(0.005+creditScore/1_000_000+(cdtAssetBonus/13.75)/100)).toLocaleString()}`],
                ["Techo de ahorro","$20.000.000"],
              ].map(([label,val],i)=>(
                <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:15, marginBottom:5 }}>
                  <span style={{color:"#a2a2a2"}}>{label}</span><span style={{color:"#00d4aa",fontWeight:700}}>{val}</span>
                </div>
              ))}
            </div>
          )}
          {loan?(
            <div style={{ background:"rgba(13,13,20,0.9)", border:`1px solid ${isInMora?"#ff444444":"#fbbf2433"}`, borderRadius:12, padding:"14px" }}>
              <div style={{ fontSize:15, color:"#bdbdbd", letterSpacing:1, textTransform:"uppercase", marginBottom:10 }}>Préstamo activo</div>
              <div style={{ marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:14, color:"#fff", marginBottom:4 }}>
                  <span>Pagado: ${loan.paid_amount.toLocaleString()}</span><span>Total: ${loan.total_debt.toLocaleString()}</span>
                </div>
                <div style={{ height:8, background:"#1e1e2e", borderRadius:4, overflow:"hidden" }}>
                  <div style={{ height:"100%", borderRadius:4, width:`${progress}%`, background:isInMora?"linear-gradient(90deg,#ff4444,#ff8800)":"linear-gradient(90deg,#00d4aa,#fbbf24)", transition:"width 0.5s" }} />
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
                {[["Capital prestado",`$${loan.amount.toLocaleString()}`],["Deuda total",`$${loan.total_debt.toLocaleString()}`],["Saldo pendiente",`$${remaining.toLocaleString()}`],["Cuota diaria base",`$${loan.daily_payment.toLocaleString()}`],["Cuota de hoy",`$${cuotaHoy.toLocaleString()}`],["Días pagados",`${loan.days_paid}/7`],["Días de mora",loan.mora_days>0?`⚠️ ${loan.mora_days}`:"✅ 0"],["Próximo cobro",loan.next_payment]].map(([label,val],i)=>(
                  <div key={i} style={{ background:"#0d0d14", borderRadius:8, padding:"8px 10px" }}>
                    <div style={{ fontSize:11, color:"#c8c8c8", textTransform:"uppercase" }}>{label}</div>
                    <div style={{ fontSize:15, fontWeight:700, color:"#ddd", marginTop:2 }}>{val}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={payNow} disabled={paying||balance<cuotaHoy} style={{ flex:1, padding:"11px", background:balance>=cuotaHoy?"linear-gradient(135deg,#00d4aa,#009977)":"#1a1a26", border:"none", borderRadius:8, color:balance>=cuotaHoy?"#000":"#444", fontWeight:800, fontSize:15, cursor:balance>=cuotaHoy?"pointer":"not-allowed" }}>
                  {paying?"...": `💳 Cuota ($${cuotaHoy.toLocaleString()})`}
                </button>
                <button onClick={payAll} disabled={paying||balance<remainingWithMora} style={{ flex:1, padding:"11px", background:balance>=remainingWithMora?"linear-gradient(135deg,#fbbf24,#f97316)":"#1a1a26", border:"none", borderRadius:8, color:balance>=remainingWithMora?"#000":"#444", fontWeight:800, fontSize:15, cursor:balance>=remainingWithMora?"pointer":"not-allowed" }}>
                  {paying?"...":`⚡ Saldar ($${remainingWithMora.toLocaleString()})`}
                </button>
              </div>
            </div>
          ):(
            <div style={{ background:"rgba(0,212,170,0.06)", border:"1px solid #00d4aa22", borderRadius:12, padding:"20px", textAlign:"center" }}>
              <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
              <div style={{ color:"#00d4aa", fontWeight:700, fontSize:15 }}>Sin deudas activas</div>
            </div>
          )}
          {loan?.status==="grace"&&loan.grace_until&&(
            <div style={alertStyle("#ff4444")}>
              <div style={{ fontSize:20, fontWeight:700, marginBottom:4 }}>🚨 PERÍODO DE GRACIA</div>
              <div style={{ fontSize:15, color:"#ffaaaa" }}>Vence el {loan.grace_until} · Deuda restante: ${remaining.toLocaleString()}</div>
            </div>
          )}
          {loan?.status==="irrecoverable"&&(
            <div style={{ background:"rgba(127,0,0,0.15)", border:"2px solid #ff000066", borderRadius:12, padding:"16px 14px", textAlign:"center" }}>
              <div style={{ fontSize:30, marginBottom:6 }}>☠️</div>
              <div style={{ color:"#ff4444", fontWeight:900, fontSize:17, marginBottom:8 }}>DEUDA INCOBRABLE</div>
              <div style={{ fontSize:15, color:"#fff", fontWeight:700, marginBottom:12 }}>Deuda pendiente: ${remaining.toLocaleString()}</div>
              <button onClick={handleSuicide} disabled={paying} style={{ width:"100%", padding:"14px", background:paying?"#333":"linear-gradient(135deg,#7f0000,#cc0000)", border:"2px solid #ff4444", borderRadius:10, color:"#fff", fontSize:20, fontWeight:900, cursor:paying?"not-allowed":"pointer" }}>
                {paying?"...":"💀 COLGARSE"}
              </button>
            </div>
          )}
          {hasMortgaged&&(
            <div style={{ background:"rgba(255,68,68,0.06)", border:"1px solid #ff444433", borderRadius:12, padding:"12px 14px" }}>
              <div style={{ fontSize:15, color:"#ff4444", letterSpacing:1, textTransform:"uppercase", marginBottom:10 }}>⛓️ Activos hipotecados</div>
              {mortgagedAssets.map(a=>{
                const asset=ASSETS[a.asset_key]; if(!asset) return null;
                const penalty=Math.round(asset.price*1.10), canAfford=balance>=penalty;
                return (
                  <div key={a.id} style={{ display:"flex", alignItems:"center", gap:10, background:"#0d0d14", borderRadius:8, padding:"10px 12px", marginBottom:8 }}>
                    <span style={{fontSize:30}}>{asset.icon}</span>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:15,color:"#bbb"}}>{asset.label}</div>
                      <div style={{fontSize:15,color:"#d4d4d4"}}>Deshipotecar: ${penalty.toLocaleString()} (+10%)</div>
                    </div>
                    <button onClick={()=>unmortgage(a)} disabled={!canAfford} style={{ background:canAfford?"#fbbf24":"#1a1a26", border:"none", borderRadius:7, padding:"7px 12px", fontSize:15, fontWeight:800, color:canAfford?"#000":"#c5c5c5", cursor:canAfford?"pointer":"not-allowed", whiteSpace:"nowrap" }}>
                      {canAfford?"⛓️ Liberar":"Sin saldo"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {events.length>0&&(
            <div style={{ background:"rgba(13,13,20,0.7)", border:"1px solid #1e1e2e", borderRadius:10, padding:"10px 14px" }}>
              <div style={{ fontSize:15, color:"#c4c4c4", letterSpacing:1, textTransform:"uppercase", marginBottom:8 }}>Actividad automática</div>
              {events.slice(0,6).map((e,i)=>(
                <div key={i} style={{ fontSize:15, color:e.type==="mora"?"#ff8888":e.type==="payment"?"#00d4aa":"#fbbf24", marginBottom:3 }}>
                  {e.type==="payment"&&`✅ Cuota deducida: $${e.amount?.toLocaleString()}`}
                  {e.type==="mora"&&`⚠️ Día de mora #${e.moraDays}`}
                  {e.type==="paid"&&`🎉 ¡Préstamo saldado!`}
                  {e.type==="mortgage_trigger"&&`🏚️ Hipoteca activada`}
                </div>
              ))}
            </div>
          )}
          <details style={{ marginTop:8 }}>
            <summary style={{ cursor:"pointer", fontSize:13, color:"#ff0000", listStyle:"none", textAlign:"center" }}>··· opciones avanzadas</summary>
            <div style={{ background:"rgba(80,80,80,0.08)", border:"1px solid #33333366", borderRadius:12, padding:"14px", marginTop:8, textAlign:"center" }}>
              <div style={{ fontSize:20, color:"#bc0000", marginBottom:10 }}>¿Empezar de cero? Perderás todo y suma una muerte.</div>
              <button onClick={handleSuicide} disabled={paying} style={{ width:"100%", padding:"10px", background:"transparent", border:"1px solid #55555566", borderRadius:8, color:"#b9b9b9", fontSize:20, fontWeight:700, cursor:paying?"not-allowed":"pointer" }}>
                {paying?"...":"💀 Reiniciar personaje"}
              </button>
            </div>
          </details>
        </div>
      )}

      {/* ══════════════ TAB: PEDIR ══════════════ */}
      {tab==="pedir"&&(
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {loan&&<div style={alertStyle("#f97316")}><div style={{fontWeight:700,fontSize:15}}>⛔ Ya tienes un préstamo activo</div></div>}
          {isInMora&&!loan&&<div style={alertStyle("#ff4444")}><div style={{fontWeight:700,fontSize:15}}>🚫 Bloqueado por mora</div></div>}
          {!loan&&!isInMora&&(
            <>
              <div style={{ background:"rgba(13,13,20,0.9)", border:"1px solid #2a2a3a", borderRadius:12, padding:"12px 14px" }}>
                {[["Límite",`$${bankLevel.loanLimit.toLocaleString()}`],["Tasa",`${(bankLevel.rate*100).toFixed(0)}% semanal`],["Plazo","7 días"],["Mora",`+${(bankLevel.moraRate*100).toFixed(0)}%/día`]].map(([l,v],i)=>(
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:15, marginBottom:6 }}><span style={{color:"#c0c0c0"}}>{l}</span><span style={{color:"#ddd",fontWeight:700}}>{v}</span></div>
                ))}
              </div>
              <div style={{ background:"rgba(13,13,20,0.9)", border:"1px solid #2a2a3a", borderRadius:12, padding:"12px 14px" }}>
                <input type="number" placeholder={`Hasta $${bankLevel.loanLimit.toLocaleString()}`} value={loanAmount} onChange={e=>setLoanAmount(e.target.value)} style={{ width:"100%", background:"#0d0d14", border:"1px solid #2a2a3a", borderRadius:8, padding:"10px 12px", color:"#fff", fontSize:16, boxSizing:"border-box", outline:"none", marginBottom:8 }} />
                <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
                  {[100_000,250_000,500_000,bankLevel.loanLimit].filter((v,i,a)=>a.indexOf(v)===i).map(v=>(
                    <button key={v} onClick={()=>setLoanAmount(String(v))} style={{ background:"#0d0d14", border:"1px solid #2a2a3a", borderRadius:6, color:"#aaa", fontSize:13, padding:"5px 10px", cursor:"pointer" }}>${v>=1_000_000?`${v/1_000_000}M`:`${v/1_000}k`}</button>
                  ))}
                </div>
                {loanAmount&&parseInt(loanAmount)>0&&<LoanPreview amount={parseInt(loanAmount)} bankLevel={bankLevel} />}
                <button onClick={requestLoan} disabled={requesting||!loanAmount||parseInt(loanAmount)<=0||parseInt(loanAmount)>bankLevel.loanLimit} style={{ width:"100%", padding:"13px", background:(!requesting&&loanAmount&&parseInt(loanAmount)>0&&parseInt(loanAmount)<=bankLevel.loanLimit)?"linear-gradient(135deg,#fbbf24,#f97316)":"#1a1a26", border:"none", borderRadius:10, marginTop:8, color:(!requesting&&loanAmount)?"#000":"#444", fontWeight:800, fontSize:20, cursor:"pointer" }}>
                  {requesting?"Procesando...":"🏦 Solicitar préstamo"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════ TAB: INFO ══════════════ */}
      {tab==="info"&&(
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {BANK_LEVELS.map(lvl=>{
            const isCurrent=lvl.level===bankLevel.level, isUnlocked=creditScore>=lvl.scRequired;
            return (
              <div key={lvl.level} style={{ background:isCurrent?"rgba(251,191,36,0.07)":"rgba(13,13,20,0.85)", border:`1px solid ${isCurrent?"#fbbf2444":isUnlocked?"#2a2a3a":"#1a1a24"}`, borderRadius:12, padding:"12px 14px", opacity:isUnlocked?1:0.6 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                  <span style={{fontSize:28}}>{lvl.icon}</span>
                  <div>
                    <div style={{ fontWeight:800, fontSize:20, color:isCurrent?"#fbbf24":"#bbb" }}>Nivel {lvl.level} — {lvl.name}{isCurrent&&<span style={{marginLeft:8,fontSize:10,color:"#fbbf24",background:"#fbbf2422",padding:"2px 6px",borderRadius:4}}>ACTUAL</span>}</div>
                    <div style={{ fontSize:13, color:"#c0c0c0" }}>Requiere {lvl.scRequired.toLocaleString()} SC</div>
                  </div>
                </div>
                {[["Límite",`$${lvl.loanLimit.toLocaleString()}`],["Tasa",`${(lvl.rate*100).toFixed(0)}%`],["Mora",`+${(lvl.moraRate*100).toFixed(0)}%`]].map(([l,v],i)=>(
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:15, marginBottom:4 }}><span style={{color:"#c2c2c2"}}>{l}</span><span style={{color:"#aaa",fontWeight:700}}>{v}</span></div>
                ))}
                <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginTop:8 }}>
                  {lvl.products.map(p=><span key={p} style={{ background:isUnlocked?"#fbbf2415":"#1a1a26", border:`1px solid ${isUnlocked?"#fbbf2433":"#2a2a3a"}`, borderRadius:6, padding:"2px 7px", fontSize:12, color:isUnlocked?"#fbbf24":"#333" }}>{p}</span>)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══════════════ TAB: FONDO ══════════════ */}
      {tab==="fondo"&&(
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {bankLevel.level<2&&(
            <div style={{ background:"rgba(13,13,20,0.9)", border:"1px solid #2a2a3a", borderRadius:12, padding:"24px 16px", textAlign:"center", opacity:0.6 }}>
              <div style={{ fontSize:35, marginBottom:8 }}>🔒</div>
              <div style={{ color:"#b3b3b3", fontWeight:700, fontSize:15 }}>Requiere Nivel 2 — Inversor</div>
              <div style={{ color:"#ebebeb", fontSize:15, marginTop:6 }}>Alcanza {BANK_LEVELS[2].scRequired.toLocaleString()} SC</div>
            </div>
          )}

          {bankLevel.level>=2&&(
            <>
              {/* Mercado hoy */}
              {marketHistory.length>0&&(()=>{
                const today=marketHistory[marketHistory.length-1];
                const colors={crisis:"#ef4444",stability:"#fbbf24",growth:"#22c55e",coletazo:"#8b0000",subidon:"#0066cc"};
                const labels={crisis:"Crisis",stability:"Estabilidad",growth:"Crecimiento",coletazo:"Coletazo",subidon:"Subidón"};
                const col=colors[today.state]||"#fff";
                return (
                  <div style={{ background:`${col}0f`, border:`1px solid ${col}44`, borderRadius:12, padding:"12px 14px" }}>
                    <div style={{ fontSize:15, color:"#fff", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Mercado hoy</div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <span style={{color:col,fontWeight:800,fontSize:20}}>{today.state==="crisis"?"📉":today.state==="growth"?"📈":today.state==="coletazo"?"💥":today.state==="subidon"?"⬆️":"➡️"} {labels[today.state]}</span>
                      <span style={{color:col,fontWeight:900,fontSize:25}}>{today.pct>0?"+":""}{today.pct}%</span>
                    </div>
                  </div>
                );
              })()}

              {/* Gráfica */}
              {marketHistory.length>0&&(
                <div style={{ background:"rgba(13,13,20,0.9)", border:"1px solid #fff", borderRadius:12, padding:"12px 14px" }}>
                  <div style={{ fontSize:15, color:"#bababa", textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>Histórico ({marketHistory.length} días)</div>
                  <CandlestickChart days={marketHistory} />
                </div>
              )}

              {/* Rendimiento aplicado */}
              {fundEvents.length>0&&(
                <div style={{ background:"rgba(13,13,20,0.7)", border:"1px solid #1e1e2e", borderRadius:10, padding:"10px 14px" }}>
                  <div style={{ fontSize:15, color:"#d2d2d2", textTransform:"uppercase", marginBottom:8 }}>Rendimiento aplicado hoy</div>
                  {fundEvents.map((e,i)=>{
                    const col=e.state==="crisis"?"#ef4444":e.state==="growth"?"#22c55e":e.state==="coletazo"?"#8b0000":e.state==="subidon"?"#0066cc":"#fbbf24";
                    return <div key={i} style={{fontSize:15,color:col,marginBottom:3}}>{e.date} · {e.state} {e.finalPct>0?"+":""}{e.finalPct}% → {e.returns>=0?"+":""}${e.returns.toLocaleString()}</div>;
                  })}
                </div>
              )}

              {/* ── Fondo activo ── */}
              {fund&&(()=>{
                const gain    = fund.current_value - fund.deposited;
                const gainPct = fund.deposited>0 ? ((gain/fund.deposited)*100).toFixed(2) : "0.00";
                const isPos   = gain>=0;
                return (
                  <div style={{ background:"rgba(13,13,20,0.9)", border:`1px solid ${isPos?"#22c55e44":"#ef444444"}`, borderRadius:12, padding:"14px" }}>
                    <div style={{ fontSize:15, color:"#fff", letterSpacing:1, textTransform:"uppercase", marginBottom:12 }}>Inversión activa</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
                      {[["Total invertido",`$${fund.deposited.toLocaleString()}`],["Valor actual",`$${fund.current_value.toLocaleString()}`],["Ganancia/pérdida",`${isPos?"+":""}$${gain.toLocaleString()} (${gainPct}%)`],["Disponible para retirar",`$${fund.current_value.toLocaleString()}`]].map(([label,val],i)=>(
                        <div key={i} style={{ background:"#0d0d14", borderRadius:8, padding:"8px 10px" }}>
                          <div style={{ fontSize:11, color:"#c3c3c3", textTransform:"uppercase" }}>{label}</div>
                          <div style={{ fontSize:14, fontWeight:700, marginTop:2, color:i===2?(isPos?"#22c55e":"#ef4444"):"#ddd" }}>{val}</div>
                        </div>
                      ))}
                    </div>

                    {/* ── RETIRO PARCIAL ── */}
                    <div style={{ background:"rgba(249,115,22,0.06)", border:"1px solid #f9731622", borderRadius:10, padding:"12px 12px", marginBottom:10 }}>
                      <div style={{ fontSize:13, color:"#f97316", textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Retirar del fondo</div>
                      <input
                        type="number"
                        placeholder={`Hasta $${fund.current_value.toLocaleString()} — vacío = retirar todo`}
                        value={withdrawAmount}
                        onChange={e => setWithdrawAmount(e.target.value)}
                        style={{ width:"100%", background:"#0d0d14", border:"1px solid #2a2a3a", borderRadius:8, padding:"10px 12px", color:"#fff", fontSize:15, boxSizing:"border-box", outline:"none", marginBottom:8 }}
                      />
                      {/* Atajos de retiro */}
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:10 }}>
                        {[0.25,0.50,0.75,1.00].map(frac=>{
                          const amt = Math.floor(fund.current_value * frac);
                          return (
                            <button key={frac} onClick={()=>setWithdrawAmount(String(amt))} style={{ background:"#0d0d14", border:"1px solid #f9731633", borderRadius:6, color:"#f97316", fontSize:12, padding:"4px 10px", cursor:"pointer" }}>
                              {(frac*100).toFixed(0)}% (${amt.toLocaleString()})
                            </button>
                          );
                        })}
                      </div>
                      {/* Preview del retiro */}
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6, marginBottom:10 }}>
                        {[
                          ["Retiro bruto",`$${withdrawEffective.toLocaleString()}`],
                          ["Impuesto (10%)",`-$${withdrawTax.toLocaleString()}`],
                          ["Recibirás",`$${withdrawReceived.toLocaleString()}`],
                          ["Fondo restante",`$${fundAfterWithdraw.toLocaleString()}`],
                        ].map(([label,val],i)=>(
                          <div key={i} style={{ background:"#0d0d14", borderRadius:6, padding:"6px 8px", textAlign:"center" }}>
                            <div style={{ fontSize:9, color:"#888", textTransform:"uppercase" }}>{label}</div>
                            <div style={{ fontSize:13, fontWeight:700, color:i===1?"#ff8888":i===2?"#00d4aa":"#ddd", marginTop:2 }}>{val}</div>
                          </div>
                        ))}
                      </div>
                      {loan?.status==="irrecoverable"&&<div style={{ fontSize:14, color:"#ff6666", textAlign:"center", marginBottom:8 }}>⛓️ Retiro bloqueado en estado de quiebra</div>}
                      <button
                        onClick={withdrawFund}
                        disabled={paying || loan?.status==="irrecoverable"}
                        style={{ width:"100%", padding:"11px", background:(paying||loan?.status==="irrecoverable")?"#1a1a26":"linear-gradient(135deg,#f97316,#dc2626)", border:"none", borderRadius:10, color:"#fff", fontWeight:800, fontSize:15, cursor:"pointer" }}
                      >
                        {paying?"...":withdrawIsValid?`💸 Retirar $${withdrawEffective.toLocaleString()}`:"💸 Liquidar fondo completo"}
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* ── Inyectar capital (siempre visible en nivel 2) ── */}
              <div style={{ background:"rgba(13,13,20,0.9)", border:"1px solid #2a2a3a", borderRadius:12, padding:"14px" }}>
                <div style={{ fontSize:15, color:"#f3f3f3", letterSpacing:1, textTransform:"uppercase", marginBottom:4 }}>
                  {fund ? "💉 Inyectar capital adicional" : "📈 Abrir nueva inversión"}
                </div>
                {fund&&<div style={{ fontSize:12, color:"#888", marginBottom:10 }}>El rendimiento pendiente ya fue consolidado. El nuevo capital entra desde el próximo turno.</div>}
                <input type="number" placeholder="Cantidad a invertir" value={fundAmount} onChange={e=>setFundAmount(e.target.value)} style={{ width:"100%", background:"#0d0d14", border:"1px solid #2a2a3a", borderRadius:8, padding:"10px 12px", color:"#fff", fontSize:20, boxSizing:"border-box", outline:"none", marginBottom:8 }} />
                <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
                  {[100_000,500_000,1_000_000,5_000_000].map(v=>(
                    <button key={v} onClick={()=>setFundAmount(String(v))} style={{ background:"#0d0d14", border:"1px solid #2a2a3a", borderRadius:6, color:"#aaa", fontSize:13, padding:"5px 10px", cursor:"pointer" }}>${v>=1_000_000?`${v/1_000_000}M`:`${v/1_000}k`}</button>
                  ))}
                  <button onClick={()=>setFundAmount(String(balance))} style={{ background:"#0d0d14", border:"1px solid #fbbf2444", borderRadius:6, color:"#fbbf24", fontSize:13, padding:"5px 10px", cursor:"pointer" }}>Todo</button>
                </div>
                {parseInt(fundAmount)>0&&(()=>{
                  const amt=parseInt(fundAmount); const mktDay=marketHistory[marketHistory.length-1]; if(!mktDay) return null;
                  const sc=creditScore, scBonus=sc*0.0001, finalPct=(mktDay.pct/100)+scBonus, est=Math.round(amt*finalPct);
                  return (
                    <div style={{ background:"rgba(139,92,246,0.06)", border:"1px solid #8b5cf622", borderRadius:10, padding:"10px 12px", marginBottom:10 }}>
                      {[["Inversión",`$${amt.toLocaleString()}`],["SC bonus",`+${(scBonus*100).toFixed(3)}%`],["Rend. estimado",`${mktDay.pct>0?"+":""}${mktDay.pct}%`],["Resultado est.",`${est>=0?"+":""}$${est.toLocaleString()}`]].map(([l,v],i)=>(
                        <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:15, marginBottom:4 }}><span style={{color:"#b6b6b6"}}>{l}</span><span style={{color:i===3?(est>=0?"#22c55e":"#ef4444"):"#aaa",fontWeight:700}}>{v}</span></div>
                      ))}
                    </div>
                  );
                })()}
                {parseInt(fundAmount)>balance&&<div style={{ fontSize:13, color:"#ff6666", marginBottom:8 }}>Saldo insuficiente</div>}
                <button onClick={depositFund} disabled={requesting||!fundAmount||parseInt(fundAmount)<=0||parseInt(fundAmount)>balance||loan?.status==="irrecoverable"} style={{ width:"100%", padding:"12px", background:(!requesting&&fundAmount&&parseInt(fundAmount)>0&&parseInt(fundAmount)<=balance)?"linear-gradient(135deg,#8b5cf6,#6d28d9)":"#1a1a26", border:"none", borderRadius:10, color:"#fff", fontWeight:800, fontSize:16, cursor:"pointer" }}>
                  {requesting?"...":(fund?"💉 Inyectar capital":"📈 Abrir inversión")}
                </button>
                <div style={{ fontSize:12, color:"#cbcbcb", textAlign:"center", marginTop:8 }}>
                  {fund?"Capital añadido al fondo existente · Rendimiento aplica desde mañana":"Capital congelado hasta retiro · 10% impuesto al retirar"}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── LoanPreview ─────────────────────────────────────────────────────────────
function LoanPreview({ amount, bankLevel }) {
  const interest = Math.round(amount * bankLevel.rate);
  const totalDebt = amount + interest;
  const dailyPayment = Math.ceil(totalDebt / 7);
  return (
    <div style={{ background:"rgba(251,191,36,0.06)", border:"1px solid #fbbf2422", borderRadius:10, padding:"10px 12px", marginBottom:8 }}>
      {[["Capital",`$${amount.toLocaleString()}`],[`Interés (${(bankLevel.rate*100).toFixed(0)}%)`,`+$${interest.toLocaleString()}`],["Total a devolver",`$${totalDebt.toLocaleString()}`],["Cuota diaria",`$${dailyPayment.toLocaleString()} × 7 días`]].map(([label,val],i)=>(
        <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:15, marginBottom:5, paddingBottom:5, borderBottom:i<3?"1px solid #1e1e2e":"none" }}>
          <span style={{color:"#666"}}>{label}</span><span style={{color:i===2?"#fbbf24":"#bbb",fontWeight:i===2?800:600}}>{val}</span>
        </div>
      ))}
    </div>
  );
}

// ─── CandlestickChart ────────────────────────────────────────────────────────
function CandlestickChart({ days }) {
  const W=300,H=130,candleW=26,maxRange=12,midY=H*0.52,scale=(H*0.42)/maxRange,spacing=W/(days.length+1);
  const stateColors={crisis:"#ef4444",stability:"#fbbf24",growth:"#22c55e",coletazo:"#8b0000",subidon:"#0066cc"};
  const dayLabels=["Anteayer","Ayer","Hoy"];
  return (
    <svg width={W} height={H} style={{display:"block",width:"100%"}} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      {[-10,-5,0,5,10].map(p=>(
        <line key={p} x1={0} y1={midY-p*scale} x2={W} y2={midY-p*scale} stroke={p===0?"#747474":"#767676"} strokeWidth={p===0?1.5:1} strokeDasharray={p!==0?"3,4":undefined} />
      ))}
      {[-10,-5,0,5,10].map(p=><text key={p} x={2} y={midY-p*scale+3.5} fill="#ffffff" fontSize={10}>{p>0?"+":""}{p}%</text>)}
      {days.map((day,i)=>{
        const pct=parseFloat(day.pct),col=stateColors[day.state]||"#aaa",cx=spacing*(i+1),barH=Math.max(2,Math.abs(pct)*scale),barY=pct>=0?midY-barH:midY,labelI=days.length===3?i:days.length===2?i+1:2;
        return (
          <g key={i}>
            <line x1={cx} y1={midY} x2={cx} y2={pct>=0?midY-barH:midY+barH} stroke={col} strokeWidth={2} />
            <rect x={cx-candleW/2} y={barY} width={candleW} height={barH} fill={col} opacity={0.85} rx={2} />
            <text x={cx} y={pct>=0?barY-5:barY+barH+11} textAnchor="middle" fill={col} fontSize={9} fontWeight="bold">{pct>0?"+":""}{pct.toFixed(1)}%</text>
            <text x={cx} y={H-1} textAnchor="middle" fill="#ffffff" fontSize={10}>{dayLabels[labelI]}</text>
          </g>
        );
      })}
    </svg>
  );
}

function alertStyle(color) {
  return { background:`${color}12`, border:`1px solid ${color}44`, borderRadius:10, padding:"10px 14px" };
}