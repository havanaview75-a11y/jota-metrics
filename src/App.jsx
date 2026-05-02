import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import {
  BarChart3,
  ClipboardList,
  MoreHorizontal,
  Circle,
  Filter,
  TrendingUp,
  TrendingDown,
  Target,
  Activity,
  PlusCircle,
  Upload,
  Pencil,
  Trash2,
} from "lucide-react";

// ─── CSV helpers ────────────────────────────────────────────────────────────

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseTradesCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());

  return lines
    .slice(1)
    .map((line) => {
      const values = parseCsvLine(line);
      const row = {};
      headers.forEach((header, i) => {
        row[header] = (values[i] || "").trim();
      });

      const rawDate =
        row.date ||
        row.trade_date ||
        row.entry_date ||
        row["entry time"] ||
        new Date().toISOString().slice(0, 10);

      const date = String(rawDate).includes(" ")
        ? String(rawDate).split(" ")[0]
        : String(rawDate).includes("T")
        ? String(rawDate).split("T")[0]
        : rawDate;

      const symbolRaw = row.symbol || row.instrument || row.market || "MYM";
      const symbol = String(symbolRaw).trim().split(" ")[0].toUpperCase();

      const directionRaw = (
        row.direction ||
        row.side ||
        row.position ||
        row["market position"] ||
        "LONG"
      ).toUpperCase();

      const direction =
        directionRaw.includes("SHORT") || directionRaw === "SELL"
          ? "SHORT"
          : "LONG";

      const pnlRaw =
        row.pnl || row.profit || row.netprofit || row["net profit"] || "0";
      const pnl = Number(String(pnlRaw).replace(/[$,]/g, "").trim());

      if (Number.isNaN(pnl)) return null;

      const TP1_USD = 50;
      const tp1hit = pnl >= TP1_USD;
      const tp1pnl = tp1hit ? TP1_USD : 0;
      const runnerpnl = tp1hit ? pnl - TP1_USD : pnl;
      const runnerhit = tp1hit && runnerpnl > 0;

      const notes = row.notes || row.note || row.comment || "";

      return { date, symbol, direction, tp1hit, runnerhit, tp1pnl, runnerpnl, pnl, notes };
    })
    .filter(Boolean);
}

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    signDisplay: "always",
  }).format(Number(value || 0));
}

function formatDateShort(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Filter / metric helpers ─────────────────────────────────────────────────

function applyFilters(trades, range, symbol, customFrom, customTo) {
  let filtered = [...trades];

  if (symbol !== "ALL") {
    filtered = filtered.filter(
      (trade) => String(trade.symbol || "").toUpperCase() === symbol
    );
  }

  if (range === "CUSTOM") {
    return filtered.filter((trade) => {
      const tradeDate = new Date(`${trade.date}T00:00:00`);
      if (customFrom) {
        const fromDate = new Date(`${customFrom}T00:00:00`);
        if (tradeDate < fromDate) return false;
      }
      if (customTo) {
        const toDate = new Date(`${customTo}T23:59:59`);
        if (tradeDate > toDate) return false;
      }
      return true;
    });
  }

  if (range !== "ALL") {
    const now = new Date();
    let days = 0;
    if (range === "7D") days = 7;
    if (range === "30D") days = 30;
    if (range === "90D") days = 90;

    const cutoff = new Date();
    cutoff.setDate(now.getDate() - days);

    filtered = filtered.filter((trade) => {
      const tradeDate = new Date(`${trade.date}T00:00:00`);
      return tradeDate >= cutoff;
    });
  }

  return filtered;
}

function getRangeLabel(trades, range, customFrom, customTo) {
  if (range === "CUSTOM" && (customFrom || customTo)) {
    const left = customFrom
      ? new Date(`${customFrom}T00:00:00`).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "Start";
    const right = customTo
      ? new Date(`${customTo}T00:00:00`).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "Today";
    return `${left} — ${right}`;
  }

  if (!trades.length) return "No data";

  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  const first = new Date(`${sorted[0].date}T00:00:00`);
  const last = new Date(`${sorted[sorted.length - 1].date}T00:00:00`);

  const left = first.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const right = last.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${left} — ${right}`;
}

function getOverviewMetrics(trades) {
  const totalPnL = trades.reduce((sum, t) => sum + Number(t.pnl || 0), 0);
  const totalTP1 = trades.reduce((sum, t) => sum + Number(t.tp1pnl || 0), 0);
  const totalRunner = trades.reduce((sum, t) => sum + Number(t.runnerpnl || 0), 0);

  const wins = trades.filter((t) => Number(t.pnl || 0) > 0).length;
  const tp1Hits = trades.filter((t) => t.tp1hit).length;
  const runnerHits = trades.filter((t) => t.runnerhit).length;

  const winRate = trades.length ? Math.round((wins / trades.length) * 100) : 0;
  const tp1Rate = trades.length ? Math.round((tp1Hits / trades.length) * 100) : 0;
  const runnerRate = trades.length ? Math.round((runnerHits / trades.length) * 100) : 0;
  const expectancy = trades.length ? Math.round(totalPnL / trades.length) : 0;

  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;

  [...trades]
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((trade) => {
      equity += Number(trade.pnl || 0);
      peak = Math.max(peak, equity);
      const drawdown = equity - peak;
      maxDrawdown = Math.min(maxDrawdown, drawdown);
    });

  const runnerCaptureRate = totalPnL
    ? Math.round((totalRunner / totalPnL) * 100)
    : 0;

  return {
    totalPnL,
    totalTP1,
    totalRunner,
    winRate,
    tp1Rate,
    runnerRate,
    expectancy,
    maxDrawdown,
    runnerCaptureRate,
  };
}

function getChartBars(trades) {
  return [...trades]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-5)
    .map((trade) => ({
      label: new Date(`${trade.date}T00:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      pnl: Number(trade.pnl || 0),
    }));
}

// ─── Shared UI atoms ─────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, tone = "blue" }) {
  const toneClasses = {
    blue: "from-[#10253f] to-[#0f172a] border-[#1e3a5f] text-[#93c5fd]",
    green: "from-[#0f2a1e] to-[#0f172a] border-[#1d4d34] text-[#86efac]",
    red: "from-[#311616] to-[#0f172a] border-[#5b2121] text-[#fca5a5]",
    gold: "from-[#352914] to-[#0f172a] border-[#5f4718] text-[#fcd34d]",
  };

  return (
    <div
      className={`rounded-2xl border bg-gradient-to-br p-3 shadow-[0_10px_30px_rgba(0,0,0,0.25)] ${toneClasses[tone]}`}
    >
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-[0.14em] text-[#8fa0b7]">
          {label}
        </div>
        {Icon ? <Icon className="h-4 w-4" /> : null}
      </div>
      <div className="mt-2 text-[24px] font-semibold">{value}</div>
      {sub ? <div className="mt-1 text-[12px] text-[#9fb0c6]">{sub}</div> : null}
    </div>
  );
}

function StatusPill({ children, color = "gray" }) {
  const colors = {
    green: "bg-[#0f2a1e] text-[#86efac] border border-[#1d4d34]",
    red: "bg-[#311616] text-[#fca5a5] border border-[#5b2121]",
    blue: "bg-[#10253f] text-[#93c5fd] border border-[#1e3a5f]",
    gold: "bg-[#352914] text-[#fcd34d] border border-[#5f4718]",
    gray: "bg-[#16202f] text-[#c4d0df] border border-[#283445]",
  };

  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] ${colors[color]}`}>
      {children}
    </span>
  );
}

function MiniBarChart({ data }) {
  const maxAbs = Math.max(...data.map((item) => Math.abs(item.pnl)), 1);

  return (
    <div className="rounded-[20px] border border-[#243041] bg-[#111827] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[14px] font-medium text-[#e5edf7]">Recent P&amp;L</div>
        <div className="text-[11px] text-[#8fa0b7]">Last {data.length} trades</div>
      </div>

      <div className="flex h-[110px] items-end gap-2">
        {data.map((item) => {
          const positive = item.pnl >= 0;
          const height = Math.max(12, Math.round((Math.abs(item.pnl) / maxAbs) * 80));

          return (
            <div key={item.label} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex h-[82px] w-full items-end">
                <div
                  className={`w-full rounded-t-md ${positive ? "bg-[#22c55e]" : "bg-[#ef4444]"}`}
                  style={{ height: `${height}px` }}
                />
              </div>
              <div className="text-center text-[10px] leading-tight text-[#8fa0b7]">
                {item.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Screens ─────────────────────────────────────────────────────────────────

function OverviewScreen({ trades, range, symbol, customFrom, customTo }) {
  const metrics = getOverviewMetrics(trades);
  const bars = getChartBars(trades);

  const filterLabel =
    range === "CUSTOM"
      ? `Custom${customFrom || customTo ? ` · ${customFrom || "..."} → ${customTo || "..."}` : ""}`
      : `${range} · ${symbol}`;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[24px] leading-none tracking-tight text-white">JoTa</div>
          <div className="mt-1 text-[12px] text-[#8fa0b7]">Trading performance dashboard</div>
        </div>
        <div className="text-right">
          <div className="text-[12px] text-[#dbe5f3]">
            {getRangeLabel(trades, range, customFrom, customTo)}
          </div>
          <div className="mt-1 text-[11px] text-[#8fa0b7]">
            {range === "CUSTOM" ? `${filterLabel} · ${symbol}` : filterLabel}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={TrendingUp}
          label="Total P&L"
          value={formatCurrency(metrics.totalPnL)}
          sub="Net result"
          tone={metrics.totalPnL >= 0 ? "green" : "red"}
        />
        <StatCard
          icon={Target}
          label="Win Rate"
          value={`${metrics.winRate}%`}
          sub="Winning trades"
          tone="blue"
        />
        <StatCard
          icon={Activity}
          label="TP1 Hit"
          value={`${metrics.tp1Rate}%`}
          sub={formatCurrency(metrics.totalTP1)}
          tone="gold"
        />
        <StatCard
          icon={BarChart3}
          label="Runner Hit"
          value={`${metrics.runnerRate}%`}
          sub={formatCurrency(metrics.totalRunner)}
          tone="blue"
        />
      </div>

      <MiniBarChart data={bars} />

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={TrendingUp}
          label="Expectancy"
          value={formatCurrency(metrics.expectancy)}
          sub="Per trade"
          tone="green"
        />
        <StatCard
          icon={TrendingDown}
          label="Max DD"
          value={formatCurrency(metrics.maxDrawdown)}
          sub="Equity drawdown"
          tone="red"
        />
      </div>

      <div className="rounded-[20px] border border-[#243041] bg-[#111827] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[14px] font-medium text-[#e5edf7]">Runner performance</div>
          <StatusPill color="blue">Pro metric</StatusPill>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[28px] font-semibold text-[#93c5fd]">
              {metrics.runnerCaptureRate}%
            </div>
            <div className="text-[12px] text-[#8fa0b7]">Runner Capture Rate</div>
          </div>
          <div className="text-right text-[12px] text-[#8fa0b7]">
            <div>TP1 Total: {formatCurrency(metrics.totalTP1)}</div>
            <div>Runner Total: {formatCurrency(metrics.totalRunner)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RecordCard({ trade, onDelete, onEdit, isAdmin }) {
  const positive = Number(trade.pnl || 0) >= 0;

  return (
  <div className="rounded-[22px] border border-[#243041] bg-[#111827] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-[13px] text-[#e5edf7]">
          <Circle
            className={`h-2.5 w-2.5 fill-current ${
              positive ? "text-[#22c55e]" : "text-[#ef4444]"
            }`}
          />
          <span>{formatDateShort(trade.date)}</span>
        </div>

       <div className="text-[11px] text-[#6b7a90]">
  Total:{" "}
  {Math.max(
    trade.tp1Level || 100,
    trade.runnerCustomLevel || trade.runnerLevel || 90
  )}{" "}
  ticks
</div>
      </div>

      <div
  className={`text-[26px] font-bold tracking-tight ${
    positive ? "text-[#22c55e]" : "text-[#f87171]"
  }`}
>
  {formatCurrency(trade.pnl)}
</div>
    </div>

    <div className="mt-4 rounded-[16px] border border-[#243041] bg-[#0b1220] p-3">
      <div className="grid grid-cols-3 gap-2 text-[12px]">
        <div className="text-[#8fa0b7]">Target</div>
        <div className="text-center text-[#8fa0b7]">Ticks</div>
        <div className="text-right text-[#8fa0b7]">Status</div>

        <div className="font-medium text-[#e5edf7]">TP1</div>
        <div className="text-center text-[#93c5fd]">
          {trade.tp1Level || 100}
        </div>
        <div className={`text-right font-semibold ${trade.tp1hit ? "text-[#22c55e]" : "text-[#f87171]"}`}>
          {trade.tp1hit ? "✓" : "✕"}
        </div>

        <div className="font-medium text-[#e5edf7]">Runner</div>
        <div className="text-center font-semibold text-[#fbbf24]">
          {trade.runnerCustomLevel || trade.runnerLevel || 90}
        </div>
        <div className={`text-right font-semibold ${trade.runnerhit ? "text-[#22c55e]" : "text-[#f87171]"}`}>
          {trade.runnerhit ? "✓" : "✕"}
        </div>
      </div>
    </div>

    <div className="mt-4 flex items-center justify-between gap-2">
      <StatusPill color={trade.direction === "LONG" ? "blue" : "gold"}>
        {trade.direction}
      </StatusPill>

      {isAdmin ? (
        <div className="flex gap-2">
          <button
            onClick={() => onEdit(trade)}
            className="flex items-center gap-1 rounded-full border border-[#1e3a5f] bg-[#10253f] px-3 py-1.5 text-[11px] text-[#93c5fd] transition hover:opacity-90"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>

          <button
            onClick={() => onDelete(trade.id)}
            className="flex items-center gap-1 rounded-full border border-[#5b2121] bg-[#311616] px-3 py-1.5 text-[11px] text-[#fca5a5] transition hover:opacity-90"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      ) : null}
    </div>

    {trade.notes ? (
      <div className="mt-3 rounded-xl border border-[#1d2939] bg-[#0b1220] px-3 py-2 text-[12px] text-[#9fb0c6]">
        {trade.notes}
      </div>
    ) : null}
  </div>
);
}

function RecordsScreen({ trades, onDelete, onEdit, isAdmin }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[24px] tracking-tight text-white">Registro</div>
        <div className="text-[12px] text-[#8fa0b7]">{trades.length} trades</div>
      </div>

      {!trades.length ? (
        <div className="rounded-[20px] border border-[#243041] bg-[#111827] p-6 text-center text-[13px] text-[#8fa0b7]">
          No trades found for the selected filters.
        </div>
      ) : (
        <div className="space-y-3">
          {[...trades]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((trade) => (
              <RecordCard
                key={trade.id}
                trade={trade}
                onDelete={onDelete}
                onEdit={onEdit}
                isAdmin={isAdmin}
              />
            ))}
        </div>
      )}
    </div>
  );
}

function NewTradeScreen({ onSave, onImport, editingTrade, onCancelEdit }) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [mode, setMode] = useState("manual");
  const [date, setDate] = useState(editingTrade?.date || today);
  const [symbol, setSymbol] = useState(editingTrade?.symbol || "MYM");
  const [direction, setDirection] = useState(editingTrade?.direction || "LONG");
  const [contracts, setContracts] = useState(editingTrade?.contracts || 9);
const [tp1Level, setTp1Level] = useState(editingTrade?.tp1Level || 100);
const [runnerLevel, setRunnerLevel] = useState(editingTrade?.runnerLevel || 90);
const [runnerCustomLevel, setRunnerCustomLevel] = useState(editingTrade?.runnerCustomLevel || "");
const [tp1Contracts, setTp1Contracts] = useState(editingTrade?.tp1Contracts || 1);
const [runnerContracts, setRunnerContracts] = useState(editingTrade?.runnerContracts || 3);
const [slLevel, setSlLevel] = useState(editingTrade?.slLevel || -150);
const [slCustomLevel, setSlCustomLevel] = useState(editingTrade?.slCustomLevel || "");
  const [pnlInput, setPnlInput] = useState(editingTrade ? String(editingTrade.pnl ?? "") : "");
  const [tp1CustomLevel, setTp1CustomLevel] = useState("");
  const [notes, setNotes] = useState(editingTrade?.notes || "");
  const [csvText, setCsvText] = useState(
    "date,symbol,direction,pnl,notes\n2026-04-12,MYM,LONG,120,Imported sample"
  );
  const [importMessage, setImportMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingTrade) {
      setMode("manual");
      setDate(editingTrade.date || today);
      setSymbol(editingTrade.symbol || "MYM");
      setDirection(editingTrade.direction || "LONG");
      setContracts(editingTrade.contracts || 9);
setTp1Level(editingTrade.tp1Level || 100);
setRunnerLevel(editingTrade.runnerLevel || 90);
setRunnerCustomLevel(editingTrade.runnerCustomLevel || "");
setTp1Contracts(editingTrade.tp1Contracts || 1);
setRunnerContracts(editingTrade.runnerContracts || 8);
setSlLevel(editingTrade.slLevel || -150);
setSlCustomLevel(editingTrade.slCustomLevel || "");
      setPnlInput(String(editingTrade.pnl ?? ""));
      setNotes(editingTrade.notes || "");
    } else {
      setDate(today);
      setSymbol("MYM");
      setDirection("LONG");
      setPnlInput("");
      setNotes("");
      setContracts(9);
setTp1Level(100);
setRunnerLevel(90);
setRunnerCustomLevel("");
setTp1Contracts(1);
setRunnerContracts(4);
setSlLevel(-150);
setSlCustomLevel("");
    }
  }, [editingTrade, today]);

const effectiveTp1Ticks =
  tp1Level === "OTHER"
    ? Number(tp1CustomLevel || 0)
    : tp1Level === "BE"
    ? 0
    : Number(tp1Level);

const disableRunner = effectiveTp1Ticks <= 0;

const autoSL =
  effectiveTp1Ticks >= 0
    ? 0
    : -150;

const disableSL = true;

useEffect(() => {
  if (effectiveTp1Ticks < 0) {
    setSlLevel(effectiveTp1Ticks);
    setSlCustomLevel("");
  }
}, [effectiveTp1Ticks]);

useEffect(() => {
  if (disableRunner) {
    setRunnerContracts(0);
    setRunnerLevel(0);
    setRunnerCustomLevel("");
  }
}, [disableRunner]);

  const handleSubmit = async () => {
    const tickValue = 0.5;

const totalContracts = tp1Contracts + runnerContracts;

const slTicks =
  autoSL !== null
    ? autoSL
    : slLevel === "MANUAL"
    ? Number(slCustomLevel || 0)
    : slLevel;

let pnl = 0;
let tp1pnl = 0;
let runnerpnl = 0;
let tp1hit = false;
let runnerhit = false;

// 🟡 TP1 = BE → total en 0
if (effectiveTp1Ticks === 0) {
  pnl = 0;
  tp1pnl = 0;
  runnerpnl = 0;
  tp1hit = false;
  runnerhit = false;
}

// 🔴 TP1 < 0 → toda la entrada al SL
else if (effectiveTp1Ticks < 0) {
  pnl = slTicks * tickValue * totalContracts;
  tp1pnl = pnl;
  runnerpnl = 0;
  tp1hit = false;
  runnerhit = false;
}

// 🟢 TP1 pega
else {
  const tp1Ticks =
    tp1Level === "OTHER"
      ? Number(tp1CustomLevel || 0)
      : tp1Level;

  const runnerTicks =
    runnerLevel === "OTHER"
      ? Number(runnerCustomLevel || 0)
      : runnerLevel;

  tp1hit = true;

  tp1pnl = tp1Ticks * tickValue * tp1Contracts;

  // 🔥 regla: TP1 ≤ 50 → runner muere en SL
  if (tp1Ticks <= 50) {
    runnerpnl = slTicks * tickValue * runnerContracts;
  } else {
    runnerpnl = runnerTicks * tickValue * runnerContracts;
runnerhit = runnerTicks > 0;
  }

  pnl = tp1pnl + runnerpnl;
}

    setSaving(true);
  await onSave({
  id: editingTrade?.id,
  date,
  symbol: String(symbol || "MYM").toUpperCase(),
  direction,
  contracts: tp1Contracts + runnerContracts,
  tp1Level: tp1Level === "OTHER"
  ? Number(tp1CustomLevel || 0)
  : tp1Level === "BE"
  ? 0
  : tp1Level,
  runnerLevel: runnerLevel === "OTHER" ? null : runnerLevel,
runnerCustomLevel: runnerLevel === "OTHER"
  ? Number(runnerCustomLevel || 0)
  : null,
  tp1hit,
  runnerhit,
  tp1pnl,
  runnerpnl,
  pnl,
  notes,
});
    setSaving(false);

    if (!editingTrade) {
      setPnlInput("");
      setNotes("");
      setDirection("LONG");
      setSymbol("MYM");
      setDate(today);
    }
  };

  const handleImport = async () => {
    try {
      const parsed = parseTradesCsv(csvText);
      if (!parsed.length) {
        setImportMessage("No valid rows found.");
        return;
      }
      await onImport(parsed);
      setImportMessage(`${parsed.length} trades imported.`);
    } catch (error) {
      console.error(error);
      setImportMessage("Import failed. Check CSV columns.");
    }
  };

  const segmentedBase =
    "flex-1 rounded-[12px] border px-3 py-3 text-center text-[13px] transition-colors";

  const inputClass =
    "w-full rounded-[12px] border border-[#243041] bg-[#111827] px-3 py-3 text-[14px] text-white outline-none placeholder:text-[#6f8198]";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
  <div className="text-[24px] tracking-tight text-white">
    {editingTrade ? "Editar entrada" : "Nueva entrada"}
  </div>

  <input
    value={symbol}
    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
    className="w-[88px] rounded-[12px] border border-[#243041] bg-[#111827] px-3 py-2 text-center text-[13px] text-white outline-none"
  />
</div>

      <div className="flex gap-2">
        <button
          onClick={() => setMode("manual")}
          className={`${segmentedBase} ${
            mode === "manual"
              ? "border-[#1e3a5f] bg-[#10253f] text-[#93c5fd]"
              : "border-[#243041] bg-[#111827] text-[#c4d0df]"
          }`}
        >
          Manual
        </button>
        <button
          onClick={() => setMode("import")}
          className={`${segmentedBase} ${
            mode === "import"
              ? "border-[#1e3a5f] bg-[#10253f] text-[#93c5fd]"
              : "border-[#243041] bg-[#111827] text-[#c4d0df]"
          }`}
        >
          Import CSV
        </button>
      </div>

      {mode === "manual" ? (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[13px] text-[#c4d0df]">Fecha</label>
            <input
              value={date}
              onChange={(e) => setDate(e.target.value)}
              type="date"
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-2 block text-[13px] text-[#c4d0df]">Dirección</label>
            <div className="flex gap-2">
              <button
                onClick={() => setDirection("LONG")}
                className={`${segmentedBase} ${
                  direction === "LONG"
                    ? "border-[#166534] bg-[#0f2a1e] text-[#86efac]"
                    : "border-[#243041] bg-[#111827] text-[#c4d0df]"
                }`}
              >
                LONG
              </button>
              <button
                onClick={() => setDirection("SHORT")}
                className={`${segmentedBase} ${
                  direction === "SHORT"
                    ? "border-[#7f1d1d] bg-[#311616] text-[#fca5a5]"
                    : "border-[#243041] bg-[#111827] text-[#c4d0df]"
                }`}
              >
                SHORT
              </button>
            </div>
          </div>
          <div>
  <label className="mb-1 block text-[13px] text-[#c4d0df]">Contracts</label>

  <div className="grid grid-cols-3 gap-2 items-end">
    <div>
      <label className="mb-1 block text-[11px] text-[#8fa0b7]">TP1</label>
      <select
        value={tp1Contracts}
        onChange={(e) => setTp1Contracts(Number(e.target.value))}
        className={inputClass}
      >
        {[0,1,2,3,4,5,6,7,8,9].map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
    </div>

    <div>
      <label className="mb-1 block text-[11px] text-[#8fa0b7]">Runner</label>
      <select
        value={runnerContracts}
        onChange={(e) => setRunnerContracts(Number(e.target.value))}
        className={inputClass}
      >
        {[0,1,2,3,4,5,6,7,8,9].map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
    </div>

    <div>
      <label className="mb-1 block text-[11px] text-[#8fa0b7]">Total</label>
      <div className="h-[46px] flex items-center justify-center rounded-[12px] border border-[#243041] bg-[#0b1220] text-[14px] text-white">
        {tp1Contracts + runnerContracts}
      </div>
    </div>
  </div>
</div>
     

<div>
  <label className="mb-1 block text-[13px] text-[#c4d0df]">TP1 Level</label>
  <select
  value={tp1Level}
  onChange={(e) => {
    const value = e.target.value;
    setTp1Level(value === "OTHER" || value === "BE" ? value : Number(value));
  }}
  className={inputClass}
>
  <option value="BE">BE</option>
  <option value={50}>+50 ticks</option>
    <option value={100}>+100 ticks</option>
<option value={120}>+120 ticks</option>
<option value={155}>+155 ticks</option>
<option value={175}>+175 ticks</option>
<option value="OTHER">Other</option>
  </select>
  {tp1Level === "OTHER" ? (
  <div>
    <label className="mb-1 block text-[13px] text-[#c4d0df]">
      Custom TP1 Level
    </label>
    <input
      type="number"
      value={tp1CustomLevel}
      onChange={(e) => setTp1CustomLevel(e.target.value)}
      placeholder="ej. 130"
      className={inputClass}
    />
  </div>
) : null}
</div>

<div>
  <label className="mb-1 block text-[13px] text-[#c4d0df]">Runner Level</label>
  <select
  value={runnerLevel}
  onChange={(e) => {
    const value = e.target.value;
    setRunnerLevel(value === "OTHER" ? value : Number(value));
  }}
  className={inputClass}
  disabled={disableRunner}
>
    <option value={50}>50 ticks</option>
<option value={90}>90 ticks</option>
<option value={120}>120 ticks</option>
<option value={155}>155 ticks</option>
<option value={175}>175 ticks</option>
<option value={200}>200 ticks</option>
<option value="OTHER">Other</option>
  </select>
  {runnerLevel === "OTHER" && !disableRunner ? (
  <div>
    <label className="mb-1 block text-[13px] text-[#c4d0df]">
      Custom Runner Level
    </label>
    <input
      type="number"
      value={runnerCustomLevel}
      onChange={(e) => setRunnerCustomLevel(e.target.value)}
      placeholder="ej. 240"
      className={inputClass}
    />
  </div>
) : null}
</div>

          <div>
  
</div>

<div>
  
</div>

<div>
  <label className="mb-1 block text-[13px] text-[#c4d0df]">
    SL Level
  </label>

  {disableSL ? (
    <div className="h-[46px] flex items-center justify-center rounded-[12px] border border-[#243041] bg-[#0b1220] text-[14px] text-white">
      {autoSL ?? "-"}
    </div>
  ) : (
    <select
      value={slLevel}
      onChange={(e) => {
        const value = e.target.value;
        setSlLevel(value === "MANUAL" ? value : Number(value));
      }}
      className={inputClass}
    >
      <option value={-150}>-150 ticks</option>
      <option value={-100}>-100 ticks</option>
      <option value={-50}>-50 ticks</option>
      <option value="MANUAL">Manual</option>
    </select>
  )}
</div>

{slLevel === "MANUAL" && !disableSL ? (
  <div>
    <label className="mb-1 block text-[13px] text-[#c4d0df]">
      Custom SL Level
    </label>
    <input
      type="number"
      value={slCustomLevel}
      onChange={(e) => setSlCustomLevel(e.target.value)}
      placeholder="ej. -200"
      className={inputClass}
    />
  </div>
) : null}

          <div>
            <label className="mb-1 block text-[13px] text-[#c4d0df]">Notas</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones..."
              className="min-h-[96px] w-full rounded-[12px] border border-[#243041] bg-[#111827] px-3 py-3 text-[14px] text-white outline-none placeholder:text-[#6f8198]"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="w-full rounded-[14px] bg-[#2563eb] px-4 py-3 text-[14px] font-medium text-white shadow-[0_8px_24px_rgba(37,99,235,0.35)] disabled:opacity-60"
            >
              {saving ? "Guardando..." : editingTrade ? "Guardar cambios" : "Guardar entrada"}
            </button>

            {editingTrade ? (
              <button
                onClick={onCancelEdit}
                type="button"
                className="w-full rounded-[14px] border border-[#243041] bg-[#111827] px-4 py-3 text-[14px] font-medium text-[#c4d0df]"
              >
                Cancelar
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-[16px] border border-[#243041] bg-[#111827] p-3 text-[12px] text-[#8fa0b7]">
            CSV columns supported: date, symbol, direction, pnl, notes.
          </div>

          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            className="min-h-[220px] w-full rounded-[12px] border border-[#243041] bg-[#111827] px-3 py-3 text-[13px] text-white outline-none placeholder:text-[#6f8198]"
          />

          {importMessage ? (
            <div className="text-[12px] text-[#93c5fd]">{importMessage}</div>
          ) : null}

          <input
            type="file"
            accept=".csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = (ev) => {
                const text = ev.target?.result;
                if (typeof text === "string") setCsvText(text);
              };
              reader.readAsText(file);
            }}
            className="mb-2 w-full text-[12px] text-[#8fa0b7]"
          />

          <button
            onClick={handleImport}
            className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-[#2563eb] px-4 py-3 text-[14px] font-medium text-white shadow-[0_8px_24px_rgba(37,99,235,0.35)]"
          >
            <Upload className="h-4 w-4" />
            Importar CSV
          </button>
        </div>
      )}
    </div>
  );
}

// ─── FilterBar ────────────────────────────────────────────────────────────────

function FilterBar({ range, setRange, symbol, setSymbol, customFrom, setCustomFrom, customTo, setCustomTo }) {
  const selectClass =
    "rounded-xl border border-[#243041] bg-[#111827] px-3 py-2 text-[12px] text-white outline-none";
  const inputClass =
    "rounded-xl border border-[#243041] bg-[#111827] px-3 py-2 text-[12px] text-white outline-none";

  return (
    <div className="mb-4 rounded-[20px] border border-[#243041] bg-[#111827] p-3 shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
      <div className="mb-3 flex items-center gap-2 text-[13px] text-[#e5edf7]">
        <Filter className="h-4 w-4 text-[#60a5fa]" />
        Filters
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select
          value={range}
          onChange={(e) => setRange(e.target.value)}
          className={selectClass}
        >
          <option value="ALL">All time</option>
          <option value="7D">Last 7 days</option>
          <option value="30D">Last 30 days</option>
          <option value="90D">Last 3 months</option>
          <option value="CUSTOM">Custom range</option>
        </select>

        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          className={selectClass}
        >
          <option value="ALL">All symbols</option>
          <option value="MYM">MYM</option>
          <option value="MNQ">MNQ</option>
        </select>
      </div>

      {range === "CUSTOM" ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[11px] text-[#8fa0b7]">From</label>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-[#8fa0b7]">To</label>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── BottomNav ────────────────────────────────────────────────────────────────

function BottomNav({ active, onChange, isAdmin }) {
  const items = [
    { key: "overview", label: "Overview", icon: BarChart3 },
    { key: "records", label: "Registro", icon: ClipboardList },
    ...(isAdmin ? [{ key: "new", label: "Nueva", icon: PlusCircle }] : []),
  ];

  return (
    <div
      className={`mt-auto grid ${isAdmin ? "grid-cols-3" : "grid-cols-2"} gap-0 rounded-[22px] border border-[#243041] bg-[#0f172a] p-1`}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const selected = active === item.key;
        return (
          <button
            key={item.key}
            onClick={() => onChange(item.key)}
            className={`flex flex-col items-center justify-center rounded-[16px] px-2 py-3 text-[12px] transition ${
              selected
                ? "bg-[#111827] text-white shadow-[0_8px_20px_rgba(0,0,0,0.28)]"
                : "text-[#8fa0b7]"
            }`}
          >
            <Icon className={`mb-1 h-4 w-4 ${selected ? "text-[#60a5fa]" : "text-[#8fa0b7]"}`} />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── App (root) ───────────────────────────────────────────────────────────────

export default function App() {
  const ADMIN_EMAIL = "habanojo@gmail.com";

  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [range, setRange] = useState("ALL");
  const [symbol, setSymbol] = useState("ALL");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [editingTrade, setEditingTrade] = useState(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  const fetchTrades = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("trades")
      .select("*")
      .order("date", { ascending: false });

    if (error) {
      console.error("Fetch error:", error);
      setTrades([]);
    } else {
      setTrades(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTrades();
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadSession = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) console.error("Auth session error:", error);
      if (!mounted) return;
      const email = session?.user?.email || "";
      setIsAdmin(email === ADMIN_EMAIL);
      setAuthLoading(false);
    };

    loadSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const email = session?.user?.email || "";
      setIsAdmin(email === ADMIN_EMAIL);
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleAdminLogin = async () => {
    if (!authEmail || !authPassword) {
      alert("Enter email and password.");
      return;
    }
    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: authPassword,
    });
    setAuthLoading(false);
    if (error) {
      console.error("Login error:", error);
      alert(error.message);
      return;
    }
    setShowLoginForm(false);
    setAuthPassword("");
  };

  const handleAdminLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Logout error:", error);
      alert(error.message);
      return;
    }
    setIsAdmin(false);
    setEditingTrade(null);
    setAuthPassword("");
    if (activeTab === "new") setActiveTab("overview");
  };

  const handleDeleteTrade = async (id) => {
    const confirmed = window.confirm(`Delete this trade? ID: ${id}`);
    if (!confirmed) return;
    const { error } = await supabase.from("trades").delete().eq("id", id);
    if (error) {
      console.error("Delete error:", error);
      alert(`Delete failed: ${error.message}`);
      return;
    }
    await fetchTrades();
  };

  const handleSaveTrade = async (trade) => {
    let error = null;

    if (trade.id) {
      const result = await supabase
        .from("trades")
        .update({
          date: trade.date,
          symbol: trade.symbol,
          direction: trade.direction,
          contracts: trade.contracts,
tp1Level: trade.tp1Level,
runnerLevel: trade.runnerLevel,
runnerCustomLevel: trade.runnerCustomLevel,
          tp1hit: trade.tp1hit,
          runnerhit: trade.runnerhit,
          tp1pnl: trade.tp1pnl,
          runnerpnl: trade.runnerpnl,
          pnl: trade.pnl,
          notes: trade.notes,

        })
        .eq("id", trade.id);
      error = result.error;
    } else {
      const result = await supabase.from("trades").insert([
        {
          date: trade.date,
          symbol: trade.symbol,
          direction: trade.direction,
          contracts: trade.contracts,
tp1Level: trade.tp1Level,
runnerLevel: trade.runnerLevel,
runnerCustomLevel: trade.runnerCustomLevel,
          tp1hit: trade.tp1hit,
          runnerhit: trade.runnerhit,
          tp1pnl: trade.tp1pnl,
          runnerpnl: trade.runnerpnl,
          pnl: trade.pnl,
          notes: trade.notes,
        },
      ]);
      error = result.error;
    }

    if (error) {
      console.error("Save error:", error);
      alert(`Save failed: ${error.message}`);
      return;
    }

    setEditingTrade(null);
    await fetchTrades();
    setActiveTab("records");
  };

  const handleImportTrades = async (importedTrades) => {
    const { error } = await supabase.from("trades").insert(importedTrades);
    if (error) {
      console.error("Bulk insert error:", error);
      alert(error.message);
      return;
    }
    await fetchTrades();
    setEditingTrade(null);
    setActiveTab("records");
  };

  const filteredTrades = useMemo(
    () => applyFilters(trades, range, symbol, customFrom, customTo),
    [trades, range, symbol, customFrom, customTo]
  );

  const content = useMemo(() => {
    if (loading) {
      return (
        <div className="rounded-[20px] border border-[#243041] bg-[#111827] p-6 text-center text-[13px] text-[#8fa0b7]">
          Loading...
        </div>
      );
    }

    if (activeTab === "overview") {
      return (
        <OverviewScreen
          trades={filteredTrades}
          range={range}
          symbol={symbol}
          customFrom={customFrom}
          customTo={customTo}
        />
      );
    }

    if (activeTab === "records") {
      return (
        <RecordsScreen
          trades={filteredTrades}
          onDelete={handleDeleteTrade}
          onEdit={(trade) => {
            if (!isAdmin) return;
            setEditingTrade(trade);
            setActiveTab("new");
          }}
          isAdmin={isAdmin}
        />
      );
    }

    if (activeTab === "new") {
      if (!isAdmin) {
        return (
          <div className="rounded-[20px] border border-[#243041] bg-[#111827] p-6 text-center text-[13px] text-[#8fa0b7]">
            Admin access required.
          </div>
        );
      }
      return (
        <NewTradeScreen
          onSave={handleSaveTrade}
          onImport={handleImportTrades}
          editingTrade={editingTrade}
          onCancelEdit={() => {
            setEditingTrade(null);
            setActiveTab("records");
          }}
        />
      );
    }

    return null;
  }, [loading, activeTab, filteredTrades, range, symbol, customFrom, customTo, editingTrade, isAdmin]);

  return (
    <div className="min-h-screen bg-[#020817] p-4 text-white">
      <div className="mx-auto max-w-[360px] rounded-[34px] border border-[#243041] bg-[#0b1220] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">

        <div className="mb-3">
          <div className="flex items-center justify-between text-[11px] text-[#8fa0b7]">
            {!isAdmin ? (
              <button
                onClick={() => setShowLoginForm((v) => !v)}
                className="text-[#60a5fa]"
              >
                {showLoginForm ? "Close Login" : "Admin Login"}
              </button>
            ) : (
              <button onClick={handleAdminLogout} className="text-[#f87171]">
                Logout
              </button>
            )}
            <span>{isAdmin ? "Admin mode" : "Viewer mode"}</span>
          </div>

          {!isAdmin && showLoginForm ? (
            <div className="mt-3 rounded-[16px] border border-[#243041] bg-[#111827] p-3 shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
              <div className="mb-2 text-[12px] text-[#c4d0df]">Admin access</div>
              <div className="space-y-2">
                <input
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="Email"
                  className="w-full rounded-[12px] border border-[#243041] bg-[#0b1220] px-3 py-2 text-[13px] text-white outline-none placeholder:text-[#6f8198]"
                />
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full rounded-[12px] border border-[#243041] bg-[#0b1220] px-3 py-2 text-[13px] text-white outline-none placeholder:text-[#6f8198]"
                />
                <button
                  onClick={handleAdminLogin}
                  disabled={authLoading}
                  className="w-full rounded-[12px] bg-[#2563eb] px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60"
                >
                  {authLoading ? "Signing in..." : "Sign in"}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mb-4 flex items-center justify-between pt-1">
          <div className="text-[12px] font-medium text-[#dbe5f3]">9:41</div>
          <div className="text-center text-[11px] text-[#8fa0b7]">JoTa_Metrics</div>
          <div className="flex items-center gap-1">
            <MoreHorizontal className="h-5 w-5 text-[#dbe5f3]" />
          </div>
        </div>

        <FilterBar
  range={range}
  setRange={setRange}
  symbol={symbol}
  setSymbol={setSymbol}
  customFrom={customFrom}
  setCustomFrom={setCustomFrom}
  customTo={customTo}
  setCustomTo={setCustomTo}
/>

<BottomNav active={activeTab} onChange={setActiveTab} isAdmin={isAdmin} />

<div className="mt-4 min-h-[560px] pb-4">{content}</div>
      </div>
    </div>
  );
}