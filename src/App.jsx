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

// 🔴 GLOBAL FULL LOSS
const FULL_LOSS_TICKS = -200;

// ─── CSV helpers ─────────────────────────────────────────

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
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

// ─── CORE LOGIC SCREEN ───────────────────────────────────

function NewTradeScreen({
  onSave,
  editingTrade,
  noTradeDay,
  setNoTradeDay,
  trades,
}) {

  const [date, setDate] = useState(editingTrade?.date || "");
  const [symbol, setSymbol] = useState("MYM");
  const [direction, setDirection] = useState("LONG");

  const [tp1Contracts, setTp1Contracts] = useState(1);
  const [runnerContracts, setRunnerContracts] = useState(3);

  const [tp1Level, setTp1Level] = useState(100);
  const [runnerLevel, setRunnerLevel] = useState(90);

  const [tp1CustomLevel, setTp1CustomLevel] = useState("");
  const [runnerCustomLevel, setRunnerCustomLevel] = useState("");

  const [slLevel, setSlLevel] = useState(-150);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const tickValue = 0.5;

  // 🔥 CALCULO TP1 REAL
  const effectiveTp1Ticks =
    tp1Level === "OTHER"
      ? Number(tp1CustomLevel || 0)
      : tp1Level === "BE"
      ? 0
      : Number(tp1Level);

  // 🔥 SL AUTO
  const autoSL = effectiveTp1Ticks >= 0 ? 0 : FULL_LOSS_TICKS;

  // 🔥 SINCRONIZACION FULL LOSS
  useEffect(() => {
    if (effectiveTp1Ticks < 0) {
      setSlLevel(FULL_LOSS_TICKS);
      setRunnerLevel(FULL_LOSS_TICKS);
    }
  }, [effectiveTp1Ticks]);

  // ─── SUBMIT ─────────────────────────────────────────

  const handleSubmit = async () => {

    const dateAlreadyExists = (trades || []).some(
      (t) => t.date === date && t.id !== editingTrade?.id
    );

    if (dateAlreadyExists) {
      alert("Only one trade per day allowed.");
      return;
    }

    // 🚫 NO TRADE DAY
    if (noTradeDay) {
      await onSave({
        date,
        symbol,
        direction: "NONE",
        contracts: 0,
        tp1Level: 0,
        runnerLevel: 0,
        tp1hit: false,
        runnerhit: false,
        tp1pnl: 0,
        runnerpnl: 0,
        pnl: 0,
        notes: "No trade today",
      });
      return;
    }

    const totalContracts = tp1Contracts + runnerContracts;

    let pnl = 0;
    let tp1pnl = 0;
    let runnerpnl = 0;
    let tp1hit = false;
    let runnerhit = false;

    // 🔴 FULL LOSS GLOBAL
    if (effectiveTp1Ticks < 0) {

      pnl = FULL_LOSS_TICKS * tickValue * totalContracts;
      tp1pnl = FULL_LOSS_TICKS * tickValue * tp1Contracts;
      runnerpnl = FULL_LOSS_TICKS * tickValue * runnerContracts;

    }

    // 🟡 BE
    else if (effectiveTp1Ticks === 0) {

      pnl = 0;

    }

    // 🟢 TP + RUNNER
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

      if (tp1Ticks <= 50) {
        runnerpnl = FULL_LOSS_TICKS * tickValue * runnerContracts;
      } else {
        runnerpnl = runnerTicks * tickValue * runnerContracts;
        runnerhit = runnerTicks > 0;
      }

      pnl = tp1pnl + runnerpnl;
    }

    await onSave({
      date,
      symbol,
      direction,
      contracts: totalContracts,
      tp1Level: effectiveTp1Ticks,
      runnerLevel,
      tp1hit,
      runnerhit,
      tp1pnl,
      runnerpnl,
      pnl,
      notes,
    });
  };

  return null;
}
// ─── RECORD CARD ─────────────────────────────────────────

function RecordCard({ trade }) {

  const isNoTradeDay =
    String(trade.notes || "").toLowerCase() === "no trade today";

  // 🔥 FULL LOSS DETECCION
  const isFullLoss = Number(trade.tp1Level) <= FULL_LOSS_TICKS;

  const positive = Number(trade.pnl || 0) >= 0;

  return (
    <div style={{ marginBottom: 10 }}>

      <div>{trade.date}</div>

      {isNoTradeDay ? (
        <div>No Trade</div>
      ) : isFullLoss ? (
        <div style={{ color: "red", fontWeight: "bold" }}>
          FULL LOSS (-200 ticks)
        </div>
      ) : (
        <div style={{ color: positive ? "green" : "red" }}>
          ${trade.pnl}
        </div>
      )}

    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────

export default function App() {

  const [trades, setTrades] = useState([]);

  const handleSave = async (trade) => {
    setTrades((prev) => [...prev, trade]);
  };

  return (
    <div style={{ padding: 20 }}>

      <h2>JoTa Metrics</h2>

      <NewTradeScreen
        onSave={handleSave}
        trades={trades}
        noTradeDay={false}
        setNoTradeDay={() => {}}
      />

      <hr />

      {trades.map((t, i) => (
        <RecordCard key={i} trade={t} />
      ))}

    </div>
  );
}