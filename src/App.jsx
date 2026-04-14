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
  CalendarDays,
  Upload,
  Pencil,
  Trash2,
} from "lucide-react";

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

      const account = (row.account || row.accountname || "").toLowerCase();
      if (account && !account.includes("sim")) return null;

      const date =
        row.date ||
        row.trade_date ||
        row.entry_date ||
        new Date().toISOString().slice(0, 10);

      const symbol = (row.symbol || row.instrument || row.market || "MYM").toUpperCase();

      const directionRaw = (row.direction || row.side || row.position || "LONG").toUpperCase();
      const direction =
        directionRaw.includes("SHORT") || directionRaw === "SELL" ? "SHORT" : "LONG";

      const pnlRaw = row.pnl || row.profit || row.netprofit || "0";
      const pnl = Number(pnlRaw);

      if (Number.isNaN(pnl)) return null;

      const TP1_USD = 50;
      const tp1hit = pnl >= TP1_USD;
      const tp1pnl = tp1hit ? TP1_USD : 0;
      const runnerpnl = tp1hit ? pnl - TP1_USD : pnl;
      const runnerhit = tp1hit && runnerpnl > 0;

      const notes = row.notes || row.note || row.comment || "";

      return {
        date,
        symbol,
        direction,
        tp1hit,
        runnerhit,
        tp1pnl,
        runnerpnl,
        pnl,
        notes,
      };
    })
    .filter(Boolean);
}

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

function applyFilters(trades, range, symbol, customFrom, customTo) {
  let filtered = [...trades];

  if (symbol !== "ALL") {
    filtered = filtered.filter(
      (trade) => String(trade.symbol || "").toUpperCase() === symbol
    );
  }

  if (range === "CUSTOM") {
    filtered = filtered.filter((trade) => {
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

    return filtered;
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

  const left = first.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const right = last.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return `${left} — ${right}`;
}

function getOverviewMetrics(trades) {
  const totalPnL = trades.reduce((sum, t) => sum + Number(t.pnl || 0), 0);
  const totalTP1 = trades.reduce((sum, t) => sum + Number(t.tp1pnl || 0), 0);
  const totalRunner = trades.reduce(
    (sum, t) => sum + Number(t.runnerpnl || 0),
    0
  );

  const wins = trades.filter((t) => Number(t.pnl || 0) > 0).length;
  const tp1Hits = trades.filter((t) => t.tp1hit).length;
  const runnerHits = trades.filter((t) => t.runnerhit).length;

  const winRate = trades.length ? Math.round((wins / trades.length) * 100) : 0;
  const tp1Rate = trades.length ? Math.round((tp1Hits / trades.length) * 100) : 0;
  const runnerRate = trades.length
    ? Math.round((runnerHits / trades.length) * 100)
    : 0;

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

function StatCard({ icon: Icon, label, value, sub, tone = "blue" }) {
  const toneClasses = {
    blue: "from-[#10253f] to-[#0f172a] border-[#1e3a5f] text-[#93c5fd]",
    green: "from-[#0f2a1e] to-[#0f172a] border-[#1d4d34] text-[#86efac]",
    red: "from-[#311616] to-[#0f172a] border-[#5b2121] text-[#fca5a5]",
    gold: "from-[#352914] to-[#0f172a] border-[#5f4718] text-[#fcd34d]",
  };

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
            <button
              onClick={handleAdminLogout}
              className="text-[#f87171]"
            >
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
        <div className="text-center text-[11px] text-[#8fa0b7]">
          JoTa_Metrics
        </div>
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

      <div className="min-h-[560px] pb-4">{content}</div>

      <BottomNav
        active={activeTab}
        onChange={setActiveTab}
        isAdmin={isAdmin}
      />
    </div>
  </div>
);
}