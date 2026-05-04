// ============================================================
// APEX CHALLENGE MODULE — JoTa_Metrics Integration
// ============================================================
// INSTRUCCIONES DE INTEGRACIÓN AL FINAL DEL ARCHIVO
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase"; // usa tu supabase existente
import {
  Target,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  UserPlus,
  KeyRound,
  LogOut,
  Shield,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  BookOpen,
  Settings2,
} from "lucide-react";

// ─── CONSTANTES ─────────────────────────────────────────────
const FLOOR = 48000;
const TARGET_PROFIT = 3000;
const START_BAL = 50000;
const INITIAL_LOSS = -100; // May 4

const TRADING_DAYS = [
  ["1","May 5","L"],["2","May 6","Ma"],["3","May 7","Mi"],
  ["4","May 8","J"],["5","May 9","V"],["6","May 12","L"],
  ["7","May 13","Ma"],["8","May 14","Mi"],["9","May 15","J"],
  ["10","May 16","V"],["11","May 19","L"],["12","May 20","Ma"],
  ["13","May 21","Mi"],["14","May 22","J"],["15","May 23","V"],
  ["16","May 26","L"],["17","May 27","Ma"],["18","May 28","Mi"],
  ["19","May 29","J"],["20","May 30","V"],["21","Jun 2","L"],
  ["22","Jun 3","Ma"],["23","Jun 4","Mi"],
];

const RULES = [
  { color: "#ef4444", title: "SL = 200 pts — NUNCA cambiar", body: "El backtest con SL=120 colapsó el WR a 27%, generó 16 pérdidas seguidas y -$2,955. Es el parámetro más crítico." },
  { color: "#f97316", title: "ATR Trailing + Stepped Runner = AMBOS activados", body: "Sin ATR hay un hueco de 105 pts sin protección. Sin Stepped Runner perdiste +$607 en abril (Mar31, Abr1, Abr3)." },
  { color: "#3b82f6", title: "Después de 2 pérdidas = tradea OBLIGATORIO", body: "En abril ese día fue ganador el 100% de las veces. Es el día de mayor probabilidad del ciclo." },
  { color: "#22c55e", title: "No intervenir en el bot durante la sesión", body: "No mover SL, no cerrar manualmente, no agregar contratos a mitad. El bot ya sabe qué hacer." },
  { color: "#a855f7", title: "Tradea los 23 días sin excepción", body: "Saltarte un día por miedo = perder el día de recuperación más predecible. El bot no siente presión." },
];

const BOT_SETTINGS = [
  { s: "01. Inputs", rows: [
    { p: "Total Contracts", v: "9", flag: "ok", n: "TP1×2 + Runner×7 — escala 2.3x" },
    { p: "TP1 Contracts", v: "2", flag: "ok", n: "Duplica ingreso fijo por señal" },
    { p: "TP1 (points)", v: "100", flag: "ok", n: "No cambiar" },
    { p: "Runner TP", v: "500", flag: "ok", n: "Apr 17 llegó a 439 pts → $523" },
    { p: "Initial Stop Loss", v: "200 ⛔", flag: "crit", n: "INAMOVIBLE. SL=120 → WR 27%" },
    { p: "Use BE After TP1", v: "☑ Activo", flag: "ok", n: "Protege en BE tras TP1" },
    { p: "BE Offset After TP1", v: "20", flag: "ok", n: "OK" },
    { p: "Use ATR Trailing", v: "☑ Activo ⚠", flag: "warn", n: "Sin esto: hueco de 105 pts sin protección" },
    { p: "ATR Multiplier", v: "2.5", flag: "ok", n: "Reducido de 3.5" },
    { p: "Use Stepped Runner", v: "☑ Activo ⚠", flag: "warn", n: "Sin esto: -$607/mes en abril" },
  ]},
  { s: "Stepped Runner", rows: [
    { p: "Step 1: Trigger/Lock", v: "125 / 100", flag: "ok", n: "OK" },
    { p: "Step 2: Trigger/Lock", v: "200 / 165", flag: "ok", n: "Ajustado — protege 82%" },
    { p: "Step 3: Trigger/Lock", v: "300 / 250", flag: "ok", n: "Ajustado — activa 50 pts antes" },
    { p: "Step 4: Trigger/Lock", v: "430 / 350", flag: "ok", n: "No tocar — Apr17: $523 exacto" },
  ]},
  { s: "02. Time", rows: [
    { p: "Start Trade Time", v: "70000 (7:00 AM)", flag: "ok", n: "Señal entra a 7:01" },
    { p: "End Trade Time", v: "113000 (11:30 AM)", flag: "ok", n: "OK" },
    { p: "Decision Hour/Min", v: "7 / 0", flag: "ok", n: "No tocar" },
  ]},
];

// ─── HELPERS ────────────────────────────────────────────────
function getCfg(cum, idx) {
  const day = idx + 1;
  if (day <= 8) return { label: "7 Contratos", detail: "TP1×1 · Runner×6", win: 320, loss: 640, tag: "FASE 1", tc: "#3b82f6" };
  if (day >= 17) {
    if (cum >= 2500) return { label: "4 Contratos", detail: "TP1×1 · Runner×3 — PROTEGER", win: 185, loss: 370, tag: "PROTEGER", tc: "#22c55e" };
    if (cum < 1500) return { label: "12 Contratos", detail: "TP1×2 · Runner×10 — ALL-IN", win: 540, loss: 1080, tag: "ALL-IN", tc: "#ef4444" };
  }
  if (cum >= 800) return { label: "9 Contratos", detail: "TP1×2 · Runner×7", win: 430, loss: 860, tag: "FASE 2", tc: "#22c55e" };
  return { label: "7 Contratos", detail: "TP1×1 · Runner×6", win: 320, loss: 640, tag: "FASE 1", tc: "#3b82f6" };
}

function fmtPnl(n) {
  if (n === null || n === undefined || n === "") return "—";
  const v = parseFloat(n);
  if (isNaN(v)) return "—";
  return (v >= 0 ? "+" : "") + "$" + Math.abs(Math.round(v)).toLocaleString();
}

// ─── SUB-COMPONENTES ────────────────────────────────────────

function KpiCard({ label, value, sub, color }) {
  return (
    <div className="rounded-[18px] border border-[#243041] bg-[#111827] p-3">
      <div className="text-[10px] uppercase tracking-[0.1em] text-[#8fa0b7] mb-1">{label}</div>
      <div className="text-[20px] font-bold" style={{ color }}>{value}</div>
      {sub && <div className="text-[11px] text-[#6b7a90] mt-1">{sub}</div>}
    </div>
  );
}

function ProgressBar({ pct }) {
  const color = pct >= 100 ? "#22c55e" : "#3b82f6";
  return (
    <div className="rounded-[18px] border border-[#243041] bg-[#111827] p-4">
      <div className="flex justify-between text-[12px] mb-2">
        <span className="text-[#8fa0b7]">Progreso hacia $3,000</span>
        <span className="font-bold" style={{ color }}>{Math.round(pct)}%</span>
      </div>
      <div className="h-[10px] rounded-full bg-[#0b1220] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, pct)}%`, background: pct >= 100 ? "linear-gradient(90deg,#22c55e,#16a34a)" : "linear-gradient(90deg,#3b82f6,#6366f1)" }} />
      </div>
      <div className="flex justify-between text-[10px] text-[#4a4a6a] mt-1">
        {["$0","$750","$1,500","$2,250","$3,000"].map(v => <span key={v}>{v}</span>)}
      </div>
    </div>
  );
}

function DayRow({ idx, day, calc, onUpdate, isOwner }) {
  const filled = day.pnl !== "" && !isNaN(parseFloat(day.pnl));
  const pnlVal = parseFloat(day.pnl);
  const rowBg = !filled ? "transparent" : pnlVal > 0 ? "rgba(34,197,94,0.05)" : "rgba(239,68,68,0.05)";

  return (
    <div style={{ background: rowBg, borderBottom: "1px solid #1a2535", display: "grid", gridTemplateColumns: "52px 64px 100px 84px 96px 96px 64px", alignItems: "center" }}>
      <div className="px-2 py-2 text-[11px] text-[#8fa0b7]">{TRADING_DAYS[idx][2]} {TRADING_DAYS[idx][0]}</div>
      <div className="px-2 text-[11px] text-[#6b7a90]">{TRADING_DAYS[idx][1]}</div>
      <div className="px-2 py-1">
        <select
          value={day.result}
          disabled={!isOwner}
          onChange={e => {
            const res = e.target.value;
            const cfg = getCfg(calc.prev, idx);
            const auto = res === "W" ? String(cfg.win) : res === "L" ? String(-cfg.loss) : "";
            onUpdate(idx, "result", res, auto);
          }}
          className="w-full rounded-[8px] border border-[#243041] bg-[#0b1220] text-[11px] px-2 py-1.5 outline-none disabled:opacity-50"
          style={{ color: day.result === "W" ? "#22c55e" : day.result === "L" ? "#ef4444" : "#8fa0b7" }}
        >
          <option value="">— Pendiente</option>
          <option value="W">✓ WIN</option>
          <option value="L">✗ LOSS</option>
        </select>
      </div>
      <div className="px-2">
        <input type="number" disabled={!isOwner} value={day.pnl} placeholder="P&L"
          onChange={e => onUpdate(idx, "pnl", day.result, e.target.value)}
          className="w-full rounded-[8px] border border-[#243041] bg-[#0b1220] text-[11px] px-2 py-1.5 text-white outline-none disabled:opacity-50" />
      </div>
      <div className="px-2 text-[11px] font-bold" style={{ color: filled ? (calc.bal >= START_BAL ? "#22c55e" : "#ef4444") : "#4a4a6a" }}>
        {filled ? "$" + Math.round(calc.bal).toLocaleString() : "—"}
      </div>
      <div className="px-2 text-[11px] font-bold" style={{ color: filled ? (calc.cum >= 0 ? "#22c55e" : "#ef4444") : "#4a4a6a" }}>
        {filled ? fmtPnl(calc.cum) : "—"}
      </div>
      <div className="px-2">
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
          style={{ background: calc.cfg.tc + "22", color: calc.cfg.tc }}>{calc.cfg.tag}</span>
      </div>
    </div>
  );
}

// ─── PANTALLA: TRACKER ──────────────────────────────────────
function TrackerScreen({ apexDays, setApexDays, userId, isOwner, saving, onSave }) {
  // Calculate running totals
  let cum = INITIAL_LOSS;
  const dayCalcs = apexDays.map((d, i) => {
    const prev = cum;
    const v = d.pnl !== "" && !isNaN(parseFloat(d.pnl)) ? parseFloat(d.pnl) : null;
    const cfg = getCfg(prev, i);
    if (v !== null) cum += v;
    return { cum, bal: START_BAL + cum, cfg, v, prev };
  });

  const finalCum = cum;
  const wins = apexDays.filter(d => d.result === "W").length;
  const losses = apexDays.filter(d => d.result === "L").length + 1; // +1 for May 4
  const total = wins + losses;
  const wr = total > 0 ? Math.round(wins / total * 100) : 0;
  const buf = START_BAL + finalCum - FLOOR;
  const pct = Math.min(100, Math.max(0, finalCum / TARGET_PROFIT * 100));
  const nextIdx = apexDays.findIndex(d => d.result === "");
  const nextCfg = getCfg(finalCum, nextIdx >= 0 ? nextIdx : 22);

  const handleUpdate = useCallback((idx, field, result, pnlVal) => {
    const nd = apexDays.map((d, i) => i === idx ? { ...d, result, pnl: pnlVal !== undefined ? pnlVal : d.pnl } : d);
    setApexDays(nd);
    onSave(nd);
  }, [apexDays, setApexDays, onSave]);

  const bufColor = buf > 1200 ? "#22c55e" : buf > 600 ? "#f97316" : "#ef4444";
  const wrColor = wr >= 70 ? "#22c55e" : wr >= 60 ? "#f97316" : "#ef4444";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <KpiCard label="Balance actual" value={"$" + Math.round(START_BAL + finalCum).toLocaleString()}
          sub={fmtPnl(finalCum) + " desde inicio"} color={finalCum >= 0 ? "#22c55e" : "#ef4444"} />
        <KpiCard label="Falta para meta"
          value={finalCum >= TARGET_PROFIT ? "✓ LOGRADO" : "$" + Math.round(Math.max(0, TARGET_PROFIT - finalCum)).toLocaleString()}
          sub="Target: $53,000" color={finalCum >= TARGET_PROFIT ? "#22c55e" : "#ef4444"} />
        <KpiCard label="Buffer DD" value={"$" + Math.round(buf).toLocaleString()} sub="Floor: $48,000" color={bufColor} />
        <KpiCard label="Win Rate" value={wr + "%"} sub={`${wins}W · ${losses}L`} color={wrColor} />
      </div>

      <ProgressBar pct={pct} />

      {buf < 800 && (
        <div className="rounded-[14px] border border-[#5b2121] bg-[#311616] px-4 py-3 text-[12px] text-[#f87171]">
          ⚠️ <strong>ALERTA DD:</strong> Buffer en ${Math.round(buf)}. Reduce a 1x (TP1×1 · Runner×3) inmediatamente.
        </div>
      )}

      {/* Next day config */}
      <div className="rounded-[18px] border border-[#243041] bg-[#111827] p-4">
        <div className="text-[10px] uppercase tracking-[0.1em] text-[#8fa0b7] mb-3">Config para mañana</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2 rounded-[12px] bg-[#0b1220] p-3 border" style={{ borderColor: nextCfg.tc + "44" }}>
            <div className="text-[10px] font-bold mb-1" style={{ color: nextCfg.tc }}>{nextCfg.tag}</div>
            <div className="text-[18px] font-bold text-white">{nextCfg.label}</div>
            <div className="text-[11px] text-[#8fa0b7] mt-1">{nextCfg.detail} · SL 200 pts</div>
          </div>
          <div className="rounded-[12px] bg-[#0b1220] border border-[#1a2535] p-3">
            <div className="text-[10px] text-[#8fa0b7] mb-1">WIN/día</div>
            <div className="text-[17px] font-bold text-[#22c55e]">+${nextCfg.win}</div>
          </div>
          <div className="rounded-[12px] bg-[#0b1220] border border-[#1a2535] p-3">
            <div className="text-[10px] text-[#8fa0b7] mb-1">LOSS/día</div>
            <div className="text-[17px] font-bold text-[#ef4444]">-${nextCfg.loss}</div>
          </div>
        </div>
      </div>

      {/* Tracker table */}
      <div className="rounded-[18px] border border-[#243041] bg-[#111827] overflow-hidden">
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "52px 64px 100px 84px 96px 96px 64px", background: "#0b1220", borderBottom: "1px solid #243041" }}>
          {["Día","Fecha","Resultado","P&L Real","Balance","Acum.","Config"].map(h => (
            <div key={h} className="px-2 py-2 text-[10px] font-bold text-[#8fa0b7] uppercase tracking-wider">{h}</div>
          ))}
        </div>
        {/* Day 0 fixed */}
        <div style={{ background: "rgba(239,68,68,0.05)", borderBottom: "1px solid #1a2535", display: "grid", gridTemplateColumns: "52px 64px 100px 84px 96px 96px 64px", alignItems: "center" }}>
          <div className="px-2 py-2 text-[11px] text-[#8fa0b7]">L May4</div>
          <div className="px-2 text-[11px] text-[#6b7a90]">Día 0</div>
          <div className="px-2"><span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[rgba(239,68,68,0.15)] text-[#ef4444]">LOSS</span></div>
          <div className="px-2 text-[11px] font-bold text-[#ef4444]">-$100</div>
          <div className="px-2 text-[11px] font-bold text-[#ef4444]">$49,900</div>
          <div className="px-2 text-[11px] font-bold text-[#ef4444]">-$100</div>
          <div className="px-2"><span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "#3b82f622", color: "#3b82f6" }}>F1</span></div>
        </div>
        {dayCalcs.map((calc, i) => (
          <DayRow key={i} idx={i} day={apexDays[i]} calc={calc} onUpdate={handleUpdate} isOwner={isOwner} />
        ))}
      </div>

      {saving && <div className="text-center text-[11px] text-[#8fa0b7]">Guardando...</div>}
    </div>
  );
}

// ─── PANTALLA: REGLAS ───────────────────────────────────────
function RulesScreen() {
  const tree = [
    { e: "✅", t: "Día GANADOR", c: "#22c55e", b: "No hagas nada. Anota el resultado. Cierra NinjaTrader. El bot hizo su trabajo." },
    { e: "⚠️", t: "1 PÉRDIDA", c: "#f97316", b: "Después de 1 pérdida el siguiente día fue ganador el 100% de las veces en abril. Opera mañana al mismo tamaño o mayor." },
    { e: "🚨", t: "2 PÉRDIDAS CONSECUTIVAS", c: "#ef4444", b: "Buffer ~$300. En abril ocurrió 2 veces y ambas el siguiente fue WIN. Opera obligatorio mañana. No reduzcas." },
    { e: "🚫", t: "NUNCA hacer", c: "#a855f7", b: "Añadir trades manuales · Cerrar bot a mitad · Cambiar tamaño durante el trade · Saltarte un día post-pérdida." },
  ];

  return (
    <div className="space-y-3">
      <div className="text-[16px] font-bold text-white">Las 5 Reglas del Challenge</div>
      <div className="text-[12px] text-[#8fa0b7]">Léelas antes de cada sesión. No son sugerencias.</div>
      {RULES.map((r, i) => (
        <div key={i} className="rounded-[0_14px_14px_0] px-4 py-3" style={{ background: r.color + "10", borderLeft: `4px solid ${r.color}` }}>
          <div className="text-[12px] font-bold mb-1" style={{ color: r.color }}>{i + 1}. {r.title}</div>
          <div className="text-[12px] text-[#c4d0df] leading-relaxed">{r.body}</div>
        </div>
      ))}
      <div className="text-[15px] font-bold text-white mt-4 pt-2">Árbol de decisión diaria</div>
      {tree.map((item, i) => (
        <div key={i} className="rounded-[14px] p-3 border" style={{ background: item.c + "10", borderColor: item.c + "33" }}>
          <div className="text-[12px] font-bold mb-1" style={{ color: item.c }}>{item.e} {item.t}</div>
          <div className="text-[12px] text-[#c4d0df] leading-relaxed">{item.b}</div>
        </div>
      ))}
    </div>
  );
}

// ─── PANTALLA: SETTINGS DEL BOT ─────────────────────────────
function BotSettingsScreen() {
  return (
    <div className="space-y-3">
      <div className="text-[16px] font-bold text-white">V3JoTaBOT_Full — Settings óptimos</div>
      <div className="text-[12px] text-[#8fa0b7]">Confirmados por análisis de 23 días reales de abril 2026.</div>
      {BOT_SETTINGS.map((sec, si) => (
        <div key={si} className="rounded-[14px] border border-[#243041] bg-[#111827] overflow-hidden">
          <div className="bg-[#0b1220] px-3 py-2 text-[10px] font-bold text-[#8fa0b7] uppercase tracking-wider">{sec.s}</div>
          {sec.rows.map((row, ri) => (
            <div key={ri} className="grid px-3 py-2.5" style={{
              gridTemplateColumns: "160px 110px 1fr",
              borderBottom: ri < sec.rows.length - 1 ? "1px solid #1a2535" : "none",
              background: row.flag === "crit" ? "rgba(239,68,68,0.05)" : row.flag === "warn" ? "rgba(249,115,22,0.05)" : "transparent"
            }}>
              <span className="text-[12px] text-[#e5edf7] font-medium">{row.p}</span>
              <span className="text-[12px] font-bold" style={{ color: row.flag === "crit" ? "#ef4444" : row.flag === "warn" ? "#f97316" : "#22c55e" }}>{row.v}</span>
              <span className="text-[11px] text-[#8fa0b7] leading-relaxed">{row.n}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── PANTALLA: GESTIÓN DE USUARIOS (ADMIN) ─────────────────
function UserManagementScreen({ currentUserEmail }) {
  const [tab, setTab] = useState("create"); // create | reset
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [msg, setMsg] = useState(null); // { type: ok|err, text }
  const [loading, setLoading] = useState(false);

  const inputCls = "w-full rounded-[12px] border border-[#243041] bg-[#0b1220] px-3 py-2.5 text-[13px] text-white outline-none placeholder:text-[#6f8198]";

  const handleCreate = async () => {
    if (!email || !password) { setMsg({ type: "err", text: "Email y contraseña son requeridos." }); return; }
    if (password.length < 6) { setMsg({ type: "err", text: "La contraseña debe tener al menos 6 caracteres." }); return; }
    setLoading(true); setMsg(null);
    const { error } = await supabase.auth.signUp({ email: email.trim().toLowerCase(), password });
    setLoading(false);
    if (error) setMsg({ type: "err", text: error.message });
    else { setMsg({ type: "ok", text: `Usuario ${email} creado. Recibirá email de confirmación.` }); setEmail(""); setPassword(""); }
  };

  const handleReset = async () => {
    if (!resetEmail) { setMsg({ type: "err", text: "Ingresa el email del usuario." }); return; }
    setLoading(true); setMsg(null);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim().toLowerCase(), {
      redirectTo: window.location.origin + "/?reset=1",
    });
    setLoading(false);
    if (error) setMsg({ type: "err", text: error.message });
    else { setMsg({ type: "ok", text: `Email de recuperación enviado a ${resetEmail}.` }); setResetEmail(""); }
  };

  return (
    <div className="space-y-4">
      <div className="text-[16px] font-bold text-white">Gestión de usuarios</div>
      <div className="flex gap-2">
        {["create","reset"].map(t => (
          <button key={t} onClick={() => { setTab(t); setMsg(null); }}
            className="flex-1 rounded-[12px] px-3 py-2.5 text-[12px] border transition-colors"
            style={{ background: tab === t ? "#10253f" : "#111827", color: tab === t ? "#93c5fd" : "#8fa0b7", borderColor: tab === t ? "#1e3a5f" : "#243041" }}>
            {t === "create" ? "Crear usuario" : "Recuperar contraseña"}
          </button>
        ))}
      </div>

      {tab === "create" && (
        <div className="space-y-3">
          <div className="rounded-[12px] border border-[#243041] bg-[#0b1220] px-3 py-2.5 text-[11px] text-[#8fa0b7]">
            El nuevo usuario recibirá un email de confirmación antes de poder ingresar. Puedes configurar esto en Supabase → Auth → Email Templates.
          </div>
          <div>
            <label className="block text-[12px] text-[#c4d0df] mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="usuario@email.com" className={inputCls} />
          </div>
          <div>
            <label className="block text-[12px] text-[#c4d0df] mb-1">Contraseña inicial</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" className={inputCls} />
          </div>
          <button onClick={handleCreate} disabled={loading}
            className="w-full rounded-[12px] bg-[#2563eb] px-4 py-3 text-[13px] font-medium text-white disabled:opacity-60 flex items-center justify-center gap-2">
            <UserPlus className="h-4 w-4" />
            {loading ? "Creando..." : "Crear usuario"}
          </button>
        </div>
      )}

      {tab === "reset" && (
        <div className="space-y-3">
          <div className="rounded-[12px] border border-[#243041] bg-[#0b1220] px-3 py-2.5 text-[11px] text-[#8fa0b7]">
            El usuario recibirá un email con un enlace para establecer una nueva contraseña. El enlace expira en 1 hora.
          </div>
          <div>
            <label className="block text-[12px] text-[#c4d0df] mb-1">Email del usuario</label>
            <input type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)} placeholder="usuario@email.com" className={inputCls} />
          </div>
          <button onClick={handleReset} disabled={loading}
            className="w-full rounded-[12px] bg-[#2563eb] px-4 py-3 text-[13px] font-medium text-white disabled:opacity-60 flex items-center justify-center gap-2">
            <KeyRound className="h-4 w-4" />
            {loading ? "Enviando..." : "Enviar email de recuperación"}
          </button>

          <div className="rounded-[12px] border border-[#1d4d34] bg-[#0f2a1e] px-3 py-2.5 text-[11px] text-[#86efac]">
            <div className="font-bold mb-1">El usuario también puede recuperarla por su cuenta:</div>
            En la pantalla de login → "¿Olvidé mi contraseña" → ingresa el email → revisa el correo.
          </div>
        </div>
      )}

      {msg && (
        <div className={`rounded-[12px] border px-3 py-2.5 text-[12px] flex items-start gap-2 ${msg.type === "ok" ? "border-[#1d4d34] bg-[#0f2a1e] text-[#86efac]" : "border-[#5b2121] bg-[#311616] text-[#f87171]"}`}>
          {msg.type === "ok" ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
          {msg.text}
        </div>
      )}
    </div>
  );
}

// ─── PANTALLA: CAMBIAR CONTRASEÑA PROPIA ────────────────────
function ChangePasswordScreen() {
  const [newPass, setNewPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = async () => {
    if (!newPass || newPass.length < 6) { setMsg({ type: "err", text: "Mínimo 6 caracteres." }); return; }
    if (newPass !== confirm) { setMsg({ type: "err", text: "Las contraseñas no coinciden." }); return; }
    setLoading(true); setMsg(null);
    const { error } = await supabase.auth.updateUser({ password: newPass });
    setLoading(false);
    if (error) setMsg({ type: "err", text: error.message });
    else { setMsg({ type: "ok", text: "Contraseña actualizada correctamente." }); setNewPass(""); setConfirm(""); }
  };

  const inputCls = "w-full rounded-[12px] border border-[#243041] bg-[#0b1220] px-3 py-2.5 text-[13px] text-white outline-none placeholder:text-[#6f8198]";

  return (
    <div className="space-y-3">
      <div className="text-[16px] font-bold text-white">Cambiar contraseña</div>
      <div>
        <label className="block text-[12px] text-[#c4d0df] mb-1">Nueva contraseña</label>
        <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="Mínimo 6 caracteres" className={inputCls} />
      </div>
      <div>
        <label className="block text-[12px] text-[#c4d0df] mb-1">Confirmar contraseña</label>
        <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repite la contraseña" className={inputCls} />
      </div>
      <button onClick={handleChange} disabled={loading}
        className="w-full rounded-[12px] bg-[#2563eb] px-4 py-3 text-[13px] font-medium text-white disabled:opacity-60">
        {loading ? "Guardando..." : "Actualizar contraseña"}
      </button>
      {msg && (
        <div className={`rounded-[12px] border px-3 py-2.5 text-[12px] flex items-start gap-2 ${msg.type === "ok" ? "border-[#1d4d34] bg-[#0f2a1e] text-[#86efac]" : "border-[#5b2121] bg-[#311616] text-[#f87171]"}`}>
          {msg.type === "ok" ? <CheckCircle2 className="h-4 w-4 mt-0.5" /> : <XCircle className="h-4 w-4 mt-0.5" />}
          {msg.text}
        </div>
      )}
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL: ApexScreen ───────────────────────
export function ApexScreen({ isAdmin, currentUserEmail }) {
  const [innerTab, setInnerTab] = useState("tracker");
  const [apexDays, setApexDays] = useState(TRADING_DAYS.map(() => ({ result: "", pnl: "" })));
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState("");
  const [userId, setUserId] = useState(null);
  const [isOwner, setIsOwner] = useState(false);

  // Load user and data
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id;
      setUserId(uid);
      setIsOwner(!!uid); // Any logged-in user can edit their own data
      if (uid) loadData(uid);
    });
  }, []);

  const loadData = async (uid) => {
    const { data } = await supabase
      .from("apex_days")
      .select("*")
      .eq("user_id", uid)
      .order("day_num", { ascending: true });
    if (data && data.length > 0) {
      const loaded = TRADING_DAYS.map((_, i) => {
        const row = data.find(r => r.day_num === i);
        return row ? { result: row.result || "", pnl: row.pnl !== null ? String(row.pnl) : "" } : { result: "", pnl: "" };
      });
      setApexDays(loaded);
    }
  };

  const handleSave = useCallback(async (days) => {
    if (!userId) return;
    setSaving(true);
    const upserts = days.map((d, i) => ({
      user_id: userId,
      day_num: i,
      result: d.result || null,
      pnl: d.pnl !== "" && !isNaN(parseFloat(d.pnl)) ? parseFloat(d.pnl) : null,
    }));
    await supabase.from("apex_days").upsert(upserts, { onConflict: "user_id,day_num" });
    const now = new Date();
    setLastSaved(`${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`);
    setSaving(false);
  }, [userId]);

  const tabs = [
    { key: "tracker", label: "Tracker", icon: Target },
    { key: "rules", label: "Reglas", icon: BookOpen },
    { key: "bot", label: "Settings", icon: Settings2 },
    ...(isAdmin ? [{ key: "users", label: "Usuarios", icon: Shield }] : []),
    { key: "password", label: "Contraseña", icon: KeyRound },
  ];

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[20px] font-bold text-white tracking-tight">Apex Challenge</div>
          <div className="text-[11px] text-[#8fa0b7]">May–Jun 2026 · {isOwner ? "Tu registro" : "Solo lectura"}</div>
        </div>
        <div className="text-right">
          {lastSaved && <div className="text-[10px] text-[#4a4a6a]">Guardado {lastSaved}</div>}
          {saving && <div className="text-[10px] text-[#3b82f6]">Guardando...</div>}
        </div>
      </div>

      {/* Inner tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setInnerTab(t.key)}
              className="flex items-center gap-1 rounded-[10px] px-3 py-2 text-[11px] whitespace-nowrap border transition-colors shrink-0"
              style={{ background: innerTab === t.key ? "#10253f" : "#111827", color: innerTab === t.key ? "#93c5fd" : "#8fa0b7", borderColor: innerTab === t.key ? "#1e3a5f" : "#243041" }}>
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {innerTab === "tracker" && <TrackerScreen apexDays={apexDays} setApexDays={setApexDays} userId={userId} isOwner={isOwner} saving={saving} onSave={handleSave} />}
      {innerTab === "rules" && <RulesScreen />}
      {innerTab === "bot" && <BotSettingsScreen />}
      {innerTab === "users" && isAdmin && <UserManagementScreen currentUserEmail={currentUserEmail} />}
      {innerTab === "password" && <ChangePasswordScreen />}
    </div>
  );
}

// ============================================================
// ══════════════════════════════════════════════════════════════
//
//  INSTRUCCIONES DE INTEGRACIÓN EN TU APP
//
// ══════════════════════════════════════════════════════════════
//
// PASO 1 — Crea la tabla en Supabase (SQL Editor):
//
//   CREATE TABLE apex_days (
//     id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
//     user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
//     day_num      integer NOT NULL,
//     result       text,
//     pnl          numeric,
//     created_at   timestamptz DEFAULT now(),
//     updated_at   timestamptz DEFAULT now(),
//     UNIQUE(user_id, day_num)
//   );
//
//   -- Row Level Security
//   ALTER TABLE apex_days ENABLE ROW LEVEL SECURITY;
//
//   CREATE POLICY "Users see own data"
//     ON apex_days FOR SELECT USING (auth.uid() = user_id);
//
//   CREATE POLICY "Users insert own data"
//     ON apex_days FOR INSERT WITH CHECK (auth.uid() = user_id);
//
//   CREATE POLICY "Users update own data"
//     ON apex_days FOR UPDATE USING (auth.uid() = user_id);
//
//   -- Admin ve todo (opcional)
//   CREATE POLICY "Admin sees all"
//     ON apex_days FOR SELECT
//     USING (auth.jwt() ->> 'email' = 'habanojo@gmail.com');
//
//
// PASO 2 — En tu App.jsx, importa el componente:
//
//   import { ApexScreen } from "./ApexModule";
//
//
// PASO 3 — Agrega "apex" a BottomNav en App.jsx:
//
//   // En el array items de BottomNav, agrega:
//   { key: "apex", label: "Apex", icon: Target },
//
//   // Importa Target desde lucide-react (ya lo tienes si usas el módulo)
//
//
// PASO 4 — Agrega el case en el useMemo de content en App.jsx:
//
//   if (activeTab === "apex") {
//     return (
//       <ApexScreen
//         isAdmin={isAdmin}
//         currentUserEmail={authEmail}
//       />
//     );
//   }
//
//
// PASO 5 — En BottomNav, actualiza grid-cols:
//
//   // Si isAdmin tiene 3 tabs → ahora tendrá 4
//   // Si viewer tiene 2 tabs → ahora tendrá 3
//   // Cambia grid-cols-3 / grid-cols-2 según corresponda
//   // O usa grid-cols dinámico ya existente + 1
//
//
// PASO 6 — "Olvidé mi contraseña" en el login existente:
//
//   // Agrega este botón debajo del form de login en tu App.jsx:
//
//   const [forgotEmail, setForgotEmail] = useState("");
//   const [forgotSent, setForgotSent] = useState(false);
//   const [showForgot, setShowForgot] = useState(false);
//
//   const handleForgotPassword = async () => {
//     if (!forgotEmail) return;
//     await supabase.auth.resetPasswordForEmail(forgotEmail, {
//       redirectTo: window.location.origin,
//     });
//     setForgotSent(true);
//   };
//
//   // En el JSX del login form, después del botón "Sign in":
//   {!showForgot ? (
//     <button onClick={() => setShowForgot(true)}
//       className="w-full text-center text-[11px] text-[#60a5fa] mt-2">
//       ¿Olvidé mi contraseña?
//     </button>
//   ) : forgotSent ? (
//     <div className="text-[11px] text-[#86efac] text-center mt-2">
//       Email enviado. Revisa tu correo.
//     </div>
//   ) : (
//     <div className="mt-2 space-y-2">
//       <input type="email" value={forgotEmail}
//         onChange={e => setForgotEmail(e.target.value)}
//         placeholder="Tu email"
//         className="w-full rounded-[12px] border border-[#243041] bg-[#0b1220] px-3 py-2 text-[12px] text-white outline-none" />
//       <button onClick={handleForgotPassword}
//         className="w-full rounded-[12px] bg-[#10253f] border border-[#1e3a5f] px-3 py-2 text-[12px] text-[#93c5fd]">
//         Enviar enlace de recuperación
//       </button>
//     </div>
//   )}
//
//
// ══════════════════════════════════════════════════════════════
// ESO ES TODO. Son 6 pasos, ~30 minutos de integración.
// ══════════════════════════════════════════════════════════════
