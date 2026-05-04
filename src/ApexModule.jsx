import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";
import {
  Target, BookOpen, Shield, KeyRound,
  CheckCircle2, XCircle, UserPlus, Save, RefreshCw,
} from "lucide-react";

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
  { color:"#ef4444", title:"SL = 200 pts — NUNCA cambiar", body:"El backtest con SL=120 colapsó el WR a 27%, generó 16 pérdidas seguidas y -$2,955." },
  { color:"#f97316", title:"ATR Trailing + Stepped Runner = AMBOS activados", body:"Sin ATR hay un hueco de 105 pts sin protección. Sin Stepped Runner perdiste +$607 en abril." },
  { color:"#3b82f6", title:"Después de 2 pérdidas = tradea OBLIGATORIO", body:"En abril ese día fue ganador el 100% de las veces. Es el día de mayor probabilidad del ciclo." },
  { color:"#22c55e", title:"No intervenir en el bot durante la sesión", body:"No mover SL, no cerrar manualmente, no agregar contratos. El bot ya sabe qué hacer." },
  { color:"#a855f7", title:"Tradea todos los días sin excepción", body:"Saltarte un día por miedo = perder el día de recuperación más predecible." },
];

function getCfg(cum, idx, cfg) {
  const day = idx + 1;
  const remaining = cfg.targetProfit - cum;
  if (day <= 8)  return { label:"7 Contratos", detail:"TP1×1 · Runner×6", win:320, loss:640,  tag:"FASE 1",   tc:"#3b82f6" };
  if (day >= 17) {
    if (cum >= cfg.targetProfit * 0.9)       return { label:"4 Contratos",  detail:"TP1×1 · Runner×3 — PROTEGER", win:185, loss:370,  tag:"PROTEGER", tc:"#22c55e" };
    if (remaining > cfg.targetProfit * 0.6)  return { label:"12 Contratos", detail:"TP1×2 · Runner×10 — ALL-IN",  win:540, loss:1080, tag:"ALL-IN",   tc:"#ef4444" };
  }
  if (cum >= cfg.targetProfit * 0.3) return { label:"9 Contratos", detail:"TP1×2 · Runner×7", win:430, loss:860, tag:"FASE 2", tc:"#22c55e" };
  return { label:"7 Contratos", detail:"TP1×1 · Runner×6", win:320, loss:640, tag:"FASE 1", tc:"#3b82f6" };
}

function fmtUSD(n) {
  if (n === null || n === undefined || n === "") return "—";
  const v = parseFloat(n);
  if (isNaN(v)) return "—";
  return (v >= 0 ? "+" : "") + "$" + Math.abs(Math.round(v)).toLocaleString();
}
function fmtBal(n) { return "$" + Math.round(n).toLocaleString(); }

function Field({ label, value, onChange, hint }) {
  return (
    <div>
      <label className="block text-[12px] text-[#c4d0df] mb-1">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8fa0b7] text-[13px]">$</span>
        <input type="number" value={value} onChange={e => onChange(Number(e.target.value))}
          className="w-full rounded-[12px] border border-[#243041] bg-[#0b1220] pl-6 pr-3 py-2.5 text-[14px] text-white outline-none" />
      </div>
      {hint && <div className="text-[11px] text-[#8fa0b7] mt-1">{hint}</div>}
    </div>
  );
}

function SetupScreen({ userId, existingCfg, onSaved, onCancel }) {
  const [bal,    setBal]    = useState(existingCfg?.initialBalance ?? 50000);
  const [floor,  setFloor]  = useState(existingCfg?.floorBalance   ?? 48000);
  const [target, setTarget] = useState(existingCfg?.targetProfit   ?? 3000);
  const [loss,   setLoss]   = useState(existingCfg ? Math.abs(existingCfg.initialLoss) : 0);
  const [saving, setSaving] = useState(false);
  const [msg,    setMsg]    = useState(null);

  const handleSave = async () => {
    if (floor >= bal) { setMsg({ type:"err", text:"El floor debe ser menor al saldo inicial." }); return; }
    setSaving(true);
    const { error } = await supabase.from("apex_settings").upsert({
      user_id: userId, initial_balance: bal, floor_balance: floor,
      target_profit: target, initial_loss: -Math.abs(loss),
    }, { onConflict:"user_id" });
    setSaving(false);
    if (error) { setMsg({ type:"err", text: error.message }); return; }
    setMsg({ type:"ok", text:"Guardado." });
    setTimeout(() => onSaved({ initialBalance:bal, floorBalance:floor, targetProfit:target, initialLoss:-Math.abs(loss) }), 600);
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[18px] font-bold text-white mb-1">{existingCfg ? "Editar configuración" : "Configura tu cuenta"}</div>
        <div className="text-[12px] text-[#8fa0b7]">Estos valores son solo tuyos — cada usuario tiene su propio registro.</div>
      </div>
      <div className="rounded-[14px] border border-[#243041] bg-[#111827] p-4 space-y-4">
        <Field label="Saldo inicial de la cuenta" value={bal} onChange={setBal} hint="El balance con el que empezaste el challenge" />
        <Field label="Pérdida del primer día (si aplica)" value={loss} onChange={setLoss} hint={`Si perdiste $100 el día 1, escribe 100. Balance actual: ${fmtBal(bal - loss)}`} />
        <Field label="Floor de Drawdown (saldo mínimo permitido)" value={floor} onChange={setFloor} hint={`DD disponible: $${(bal - floor).toLocaleString()}`} />
        <Field label="Profit target del challenge" value={target} onChange={setTarget} hint={`Necesitas llegar a: ${fmtBal(bal + target)}`} />
      </div>
      <div className="rounded-[14px] border border-[#1e3a5f] bg-[#10253f] p-3 text-[12px] text-[#93c5fd] space-y-1">
        <div className="font-bold mb-2">Resumen:</div>
        <div className="flex justify-between"><span>Saldo inicial:</span><span className="font-bold">{fmtBal(bal)}</span></div>
        <div className="flex justify-between"><span>Balance actual:</span><span className="font-bold text-[#22c55e]">{fmtBal(bal - loss)}</span></div>
        <div className="flex justify-between"><span>Floor DD:</span><span className="font-bold text-[#f97316]">{fmtBal(floor)}</span></div>
        <div className="flex justify-between"><span>DD disponible:</span><span className="font-bold">${(bal - floor).toLocaleString()}</span></div>
        <div className="flex justify-between"><span>Meta final:</span><span className="font-bold text-[#22c55e]">{fmtBal(bal + target)}</span></div>
      </div>
      {msg && (
        <div className={`rounded-[12px] border px-3 py-2.5 text-[12px] flex items-center gap-2 ${msg.type==="ok" ? "border-[#1d4d34] bg-[#0f2a1e] text-[#86efac]" : "border-[#5b2121] bg-[#311616] text-[#f87171]"}`}>
          {msg.type==="ok" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}{msg.text}
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving}
          className="flex-1 rounded-[12px] bg-[#2563eb] px-4 py-3 text-[13px] font-medium text-white disabled:opacity-60 flex items-center justify-center gap-2">
          <Save className="h-4 w-4" />{saving ? "Guardando..." : "Guardar"}
        </button>
        {onCancel && (
          <button onClick={onCancel} className="flex-1 rounded-[12px] border border-[#243041] bg-[#111827] px-4 py-3 text-[13px] text-[#c4d0df]">
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, color }) {
  return (
    <div className="rounded-[18px] border border-[#243041] bg-[#111827] p-3">
      <div className="text-[10px] uppercase tracking-[0.1em] text-[#8fa0b7] mb-1">{label}</div>
      <div className="text-[20px] font-bold" style={{ color }}>{value}</div>
      {sub && <div className="text-[11px] text-[#6b7a90] mt-1">{sub}</div>}
    </div>
  );
}

function TrackerScreen({ apexDays, setApexDays, cfg, saving, onSave, onEditSettings }) {
  const { initialBalance, floorBalance, targetProfit, initialLoss } = cfg;
  let cum = initialLoss;
  const dayCalcs = apexDays.map((d, i) => {
    const prev = cum;
    const v = d.pnl !== "" && !isNaN(parseFloat(d.pnl)) ? parseFloat(d.pnl) : null;
    const dayCfg = getCfg(prev, i, cfg);
    if (v !== null) cum += v;
    return { cum, bal: initialBalance + cum, dayCfg, v, prev };
  });
  const finalCum  = cum;
  const wins      = apexDays.filter(d => d.result === "W").length;
  const lossCount = apexDays.filter(d => d.result === "L").length + (initialLoss < 0 ? 1 : 0);
  const total     = wins + lossCount;
  const wr        = total > 0 ? Math.round(wins / total * 100) : 0;
  const buf       = initialBalance + finalCum - floorBalance;
  const pct       = Math.min(100, Math.max(0, finalCum / targetProfit * 100));
  const nextIdx   = apexDays.findIndex(d => d.result === "");
  const nextCfg   = getCfg(finalCum, nextIdx >= 0 ? nextIdx : 22, cfg);
  const barColor  = pct >= 100 ? "#22c55e" : "#3b82f6";

  const handleUpdate = useCallback((idx, result, pnlVal) => {
    const nd = apexDays.map((d, i) => i === idx ? { result, pnl: pnlVal } : d);
    setApexDays(nd);
    onSave(nd);
  }, [apexDays, setApexDays, onSave]);

  return (
    <div className="space-y-3">
      <div className="rounded-[14px] border border-[#243041] bg-[#111827] px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-[10px] text-[#8fa0b7] uppercase tracking-wider mb-1">Tu cuenta</div>
          <div className="text-[12px] text-white font-bold">
            Inicio: {fmtBal(initialBalance)} · Floor: {fmtBal(floorBalance)} · Meta: +${targetProfit.toLocaleString()}
          </div>
        </div>
        <button onClick={onEditSettings}
          className="flex items-center gap-1 rounded-[10px] border border-[#243041] bg-[#0b1220] px-3 py-1.5 text-[11px] text-[#8fa0b7]">
          <RefreshCw className="h-3 w-3" /> Editar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <KpiCard label="Balance actual" value={fmtBal(initialBalance + finalCum)} sub={fmtUSD(finalCum) + " desde inicio"} color={finalCum >= 0 ? "#22c55e" : "#ef4444"} />
        <KpiCard label="Falta para meta" value={finalCum >= targetProfit ? "✓ LOGRADO" : "$" + Math.round(Math.max(0, targetProfit - finalCum)).toLocaleString()} sub={"Meta: " + fmtBal(initialBalance + targetProfit)} color={finalCum >= targetProfit ? "#22c55e" : "#ef4444"} />
        <KpiCard label="Buffer DD" value={"$" + Math.round(buf).toLocaleString()} sub={"Floor: " + fmtBal(floorBalance)} color={buf > 1200 ? "#22c55e" : buf > 500 ? "#f97316" : "#ef4444"} />
        <KpiCard label="Win Rate" value={wr + "%"} sub={`${wins}W · ${lossCount}L`} color={wr >= 70 ? "#22c55e" : wr >= 60 ? "#f97316" : "#ef4444"} />
      </div>

      <div className="rounded-[18px] border border-[#243041] bg-[#111827] p-4">
        <div className="flex justify-between text-[12px] mb-2">
          <span className="text-[#8fa0b7]">Progreso hacia ${targetProfit.toLocaleString()}</span>
          <span className="font-bold" style={{ color: barColor }}>{fmtUSD(finalCum)} ({Math.round(pct)}%)</span>
        </div>
        <div className="h-[10px] rounded-full bg-[#0b1220] overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width:`${Math.min(100,pct)}%`, background: pct>=100 ? "linear-gradient(90deg,#22c55e,#16a34a)" : "linear-gradient(90deg,#3b82f6,#6366f1)" }} />
        </div>
      </div>

      {buf < 500 && (
        <div className="rounded-[14px] border border-[#5b2121] bg-[#311616] px-4 py-3 text-[12px] text-[#f87171]">
          ⚠️ <strong>ALERTA DD:</strong> Buffer en ${Math.round(buf)}. Reduce a 1x inmediatamente.
        </div>
      )}

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

      <div className="rounded-[18px] border border-[#243041] bg-[#111827] overflow-hidden">
        <div style={{ display:"grid", gridTemplateColumns:"50px 62px 100px 82px 96px 96px 62px", background:"#0b1220", borderBottom:"1px solid #243041" }}>
          {["Día","Fecha","Resultado","P&L Real","Balance","Acum.","Config"].map(h => (
            <div key={h} style={{ padding:"7px 6px", fontSize:"10px", fontWeight:700, color:"#8fa0b7", textTransform:"uppercase", letterSpacing:"0.06em" }}>{h}</div>
          ))}
        </div>
        {initialLoss < 0 && (
          <div style={{ display:"grid", gridTemplateColumns:"50px 62px 100px 82px 96px 96px 62px", background:"rgba(239,68,68,0.05)", borderBottom:"1px solid #1a2535", alignItems:"center" }}>
            <div style={{ padding:"6px", fontSize:"11px", color:"#8fa0b7" }}>Día 0</div>
            <div style={{ padding:"6px", fontSize:"11px", color:"#6b7a90" }}>Inicio</div>
            <div style={{ padding:"6px" }}><span style={{ background:"rgba(239,68,68,0.15)", color:"#ef4444", padding:"2px 7px", borderRadius:5, fontSize:10, fontWeight:700 }}>LOSS</span></div>
            <div style={{ padding:"6px", fontSize:"11px", fontWeight:700, color:"#ef4444" }}>{fmtUSD(initialLoss)}</div>
            <div style={{ padding:"6px", fontSize:"11px", fontWeight:700, color:"#ef4444" }}>{fmtBal(initialBalance + initialLoss)}</div>
            <div style={{ padding:"6px", fontSize:"11px", fontWeight:700, color:"#ef4444" }}>{fmtUSD(initialLoss)}</div>
            <div style={{ padding:"6px" }}><span style={{ background:"#3b82f622", color:"#3b82f6", padding:"2px 6px", borderRadius:4, fontSize:10, fontWeight:700 }}>F1</span></div>
          </div>
        )}
        {dayCalcs.map((calc, i) => {
          const d = apexDays[i];
          const filled = d.pnl !== "" && !isNaN(parseFloat(d.pnl));
          const pnlVal = parseFloat(d.pnl);
          const rowBg = !filled ? "transparent" : pnlVal > 0 ? "rgba(34,197,94,0.05)" : "rgba(239,68,68,0.05)";
          return (
            <div key={i} style={{ display:"grid", gridTemplateColumns:"50px 62px 100px 82px 96px 96px 62px", background:rowBg, borderBottom:"1px solid #1a2535", alignItems:"center" }}>
              <div style={{ padding:"6px", fontSize:"11px", color:"#8fa0b7" }}>{TRADING_DAYS[i][2]} {TRADING_DAYS[i][0]}</div>
              <div style={{ padding:"6px", fontSize:"11px", color:"#6b7a90" }}>{TRADING_DAYS[i][1]}</div>
              <div style={{ padding:"4px 6px" }}>
                <select value={d.result}
                  onChange={e => { const res=e.target.value; const dc=getCfg(calc.prev,i,cfg); handleUpdate(i,res,res==="W"?String(dc.win):res==="L"?String(-dc.loss):""); }}
                  style={{ background:"#0b1220", border:"1px solid #243041", borderRadius:6, color:d.result==="W"?"#22c55e":d.result==="L"?"#ef4444":"#8fa0b7", fontSize:11, padding:"3px 4px", width:"100%", cursor:"pointer" }}>
                  <option value="">— Pendiente</option>
                  <option value="W">✓ WIN</option>
                  <option value="L">✗ LOSS</option>
                </select>
              </div>
              <div style={{ padding:"4px 6px" }}>
                <input type="number" value={d.pnl} placeholder="P&L"
                  onChange={e => handleUpdate(i, d.result, e.target.value)}
                  style={{ background:"#0b1220", border:"1px solid #243041", borderRadius:6, color:"white", fontSize:11, padding:"3px 5px", width:"100%" }} />
              </div>
              <div style={{ padding:"6px", fontSize:"11px", fontWeight:700, color:filled?(calc.bal>=initialBalance?"#22c55e":"#ef4444"):"#4a4a6a" }}>
                {filled ? fmtBal(calc.bal) : "—"}
              </div>
              <div style={{ padding:"6px", fontSize:"11px", fontWeight:700, color:filled?(calc.cum>=0?"#22c55e":"#ef4444"):"#4a4a6a" }}>
                {filled ? fmtUSD(calc.cum) : "—"}
              </div>
              <div style={{ padding:"6px" }}>
                <span style={{ background:calc.dayCfg.tc+"22", color:calc.dayCfg.tc, padding:"2px 5px", borderRadius:4, fontSize:10, fontWeight:700 }}>{calc.dayCfg.tag}</span>
              </div>
            </div>
          );
        })}
      </div>
      {saving && <div className="text-center text-[11px] text-[#8fa0b7]">Guardando...</div>}
    </div>
  );
}

function RulesScreen() {
  const tree = [
    { e:"✅", t:"Día GANADOR",         c:"#22c55e", b:"No hagas nada. Cierra NinjaTrader. El bot hizo su trabajo." },
    { e:"⚠️", t:"1 PÉRDIDA",           c:"#f97316", b:"En abril el día siguiente fue ganador el 100% de las veces. Opera mañana igual o mayor." },
    { e:"🚨", t:"2 PÉRDIDAS SEGUIDAS", c:"#ef4444", b:"En abril ocurrió 2 veces, ambas el siguiente fue WIN. Opera mañana obligatorio." },
    { e:"🚫", t:"NUNCA hacer",         c:"#a855f7", b:"Trades manuales · Cerrar bot a mitad · Cambiar tamaño durante el trade · Saltarte un día." },
  ];
  return (
    <div className="space-y-3">
      <div className="text-[16px] font-bold text-white">Las 5 Reglas del Challenge</div>
      {RULES.map((r, i) => (
        <div key={i} style={{ background:r.color+"10", borderLeft:`4px solid ${r.color}`, borderRadius:"0 12px 12px 0", padding:"12px 16px" }}>
          <div style={{ fontSize:12, fontWeight:700, color:r.color, marginBottom:4 }}>{i+1}. {r.title}</div>
          <div style={{ fontSize:12, color:"#c4d0df", lineHeight:1.65 }}>{r.body}</div>
        </div>
      ))}
      <div className="text-[15px] font-bold text-white pt-2">Árbol de decisión</div>
      {tree.map((item, i) => (
        <div key={i} className="rounded-[14px] p-3 border" style={{ background:item.c+"10", borderColor:item.c+"33" }}>
          <div style={{ fontSize:12, fontWeight:700, color:item.c, marginBottom:4 }}>{item.e} {item.t}</div>
          <div style={{ fontSize:12, color:"#c4d0df", lineHeight:1.65 }}>{item.b}</div>
        </div>
      ))}
    </div>
  );
}

function UserManagementScreen() {
  const [tab,setTab]=useState("create");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [resetEmail,setResetEmail]=useState("");
  const [msg,setMsg]=useState(null);
  const [loading,setLoading]=useState(false);
  const inputCls="w-full rounded-[12px] border border-[#243041] bg-[#0b1220] px-3 py-2.5 text-[13px] text-white outline-none placeholder:text-[#6f8198]";
  const handleCreate=async()=>{
    if(!email||!password){setMsg({type:"err",text:"Email y contraseña requeridos."});return;}
    if(password.length<6){setMsg({type:"err",text:"Contraseña mínimo 6 caracteres."});return;}
    setLoading(true);setMsg(null);
    const{error}=await supabase.auth.signUp({email:email.trim().toLowerCase(),password});
    setLoading(false);
    if(error)setMsg({type:"err",text:error.message});
    else{setMsg({type:"ok",text:`Usuario ${email} creado.`});setEmail("");setPassword("");}
  };
  const handleReset=async()=>{
    if(!resetEmail){setMsg({type:"err",text:"Ingresa el email."});return;}
    setLoading(true);setMsg(null);
    const{error}=await supabase.auth.resetPasswordForEmail(resetEmail.trim().toLowerCase(),{redirectTo:window.location.origin});
    setLoading(false);
    if(error)setMsg({type:"err",text:error.message});
    else{setMsg({type:"ok",text:`Email enviado a ${resetEmail}.`});setResetEmail("");}
  };
  return(
    <div className="space-y-4">
      <div className="text-[16px] font-bold text-white">Gestión de usuarios</div>
      <div className="flex gap-2">
        {["create","reset"].map(t=>(
          <button key={t} onClick={()=>{setTab(t);setMsg(null);}} className="flex-1 rounded-[12px] px-3 py-2.5 text-[12px] border transition-colors"
            style={{background:tab===t?"#10253f":"#111827",color:tab===t?"#93c5fd":"#8fa0b7",borderColor:tab===t?"#1e3a5f":"#243041"}}>
            {t==="create"?"Crear usuario":"Recuperar contraseña"}
          </button>
        ))}
      </div>
      {tab==="create"&&(<div className="space-y-3">
        <div><label className="block text-[12px] text-[#c4d0df] mb-1">Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="usuario@email.com" className={inputCls}/></div>
        <div><label className="block text-[12px] text-[#c4d0df] mb-1">Contraseña inicial</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" className={inputCls}/></div>
        <button onClick={handleCreate} disabled={loading} className="w-full rounded-[12px] bg-[#2563eb] px-4 py-3 text-[13px] font-medium text-white disabled:opacity-60 flex items-center justify-center gap-2">
          <UserPlus className="h-4 w-4"/>{loading?"Creando...":"Crear usuario"}
        </button>
      </div>)}
      {tab==="reset"&&(<div className="space-y-3">
        <div><label className="block text-[12px] text-[#c4d0df] mb-1">Email del usuario</label><input type="email" value={resetEmail} onChange={e=>setResetEmail(e.target.value)} placeholder="usuario@email.com" className={inputCls}/></div>
        <button onClick={handleReset} disabled={loading} className="w-full rounded-[12px] bg-[#2563eb] px-4 py-3 text-[13px] font-medium text-white disabled:opacity-60 flex items-center justify-center gap-2">
          <KeyRound className="h-4 w-4"/>{loading?"Enviando...":"Enviar email de recuperación"}
        </button>
      </div>)}
      {msg&&(<div className={`rounded-[12px] border px-3 py-2.5 text-[12px] flex items-start gap-2 ${msg.type==="ok"?"border-[#1d4d34] bg-[#0f2a1e] text-[#86efac]":"border-[#5b2121] bg-[#311616] text-[#f87171]"}`}>
        {msg.type==="ok"?<CheckCircle2 className="h-4 w-4 mt-0.5"/>:<XCircle className="h-4 w-4 mt-0.5"/>}{msg.text}
      </div>)}
    </div>
  );
}

function ChangePasswordScreen() {
  const [newPass,setNewPass]=useState("");
  const [confirm,setConfirm]=useState("");
  const [msg,setMsg]=useState(null);
  const [loading,setLoading]=useState(false);
  const inputCls="w-full rounded-[12px] border border-[#243041] bg-[#0b1220] px-3 py-2.5 text-[13px] text-white outline-none placeholder:text-[#6f8198]";
  const handle=async()=>{
    if(!newPass||newPass.length<6){setMsg({type:"err",text:"Mínimo 6 caracteres."});return;}
    if(newPass!==confirm){setMsg({type:"err",text:"Las contraseñas no coinciden."});return;}
    setLoading(true);setMsg(null);
    const{error}=await supabase.auth.updateUser({password:newPass});
    setLoading(false);
    if(error)setMsg({type:"err",text:error.message});
    else{setMsg({type:"ok",text:"Contraseña actualizada."});setNewPass("");setConfirm("");}
  };
  return(
    <div className="space-y-3">
      <div className="text-[16px] font-bold text-white">Cambiar contraseña</div>
      <div><label className="block text-[12px] text-[#c4d0df] mb-1">Nueva contraseña</label><input type="password" value={newPass} onChange={e=>setNewPass(e.target.value)} placeholder="Mínimo 6 caracteres" className={inputCls}/></div>
      <div><label className="block text-[12px] text-[#c4d0df] mb-1">Confirmar</label><input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Repite la contraseña" className={inputCls}/></div>
      <button onClick={handle} disabled={loading} className="w-full rounded-[12px] bg-[#2563eb] px-4 py-3 text-[13px] font-medium text-white disabled:opacity-60">
        {loading?"Guardando...":"Actualizar contraseña"}
      </button>
      {msg&&(<div className={`rounded-[12px] border px-3 py-2.5 text-[12px] flex items-start gap-2 ${msg.type==="ok"?"border-[#1d4d34] bg-[#0f2a1e] text-[#86efac]":"border-[#5b2121] bg-[#311616] text-[#f87171]"}`}>
        {msg.type==="ok"?<CheckCircle2 className="h-4 w-4 mt-0.5"/>:<XCircle className="h-4 w-4 mt-0.5"/>}{msg.text}
      </div>)}
    </div>
  );
}

export function ApexScreen({ isAdmin }) {
  const [innerTab, setInnerTab] = useState("tracker");
  const [apexDays, setApexDays] = useState(TRADING_DAYS.map(() => ({ result:"", pnl:"" })));
  const [cfg,      setCfg]      = useState(null);
  const [showSetup,setShowSetup]= useState(false);
  const [saving,   setSaving]   = useState(false);
  const [lastSaved,setLastSaved]= useState("");
  const [userId,   setUserId]   = useState(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const uid = session?.user?.id;
      setUserId(uid);
      if (!uid) { setLoading(false); return; }
      const { data: s } = await supabase.from("apex_settings").select("*").eq("user_id", uid).single();
      if (s) {
        setCfg({ initialBalance:s.initial_balance, floorBalance:s.floor_balance, targetProfit:s.target_profit, initialLoss:s.initial_loss });
      } else {
        setShowSetup(true);
      }
      const { data: daysData } = await supabase.from("apex_days").select("*").eq("user_id", uid).order("day_num", { ascending:true });
      if (daysData && daysData.length > 0) {
        const loaded = TRADING_DAYS.map((_,i) => {
          const row = daysData.find(r => r.day_num === i);
          return row ? { result:row.result||"", pnl:row.pnl!==null?String(row.pnl):"" } : { result:"", pnl:"" };
        });
        setApexDays(loaded);
      }
      setLoading(false);
    });
  }, []);

  const handleSave = useCallback(async (days) => {
    if (!userId) return;
    setSaving(true);
    const upserts = days.map((d,i) => ({ user_id:userId, day_num:i, result:d.result||null, pnl:d.pnl!==""&&!isNaN(parseFloat(d.pnl))?parseFloat(d.pnl):null }));
    await supabase.from("apex_days").upsert(upserts, { onConflict:"user_id,day_num" });
    const now = new Date();
    setLastSaved(`${now.getHours()}:${String(now.getMinutes()).padStart(2,"0")}`);
    setSaving(false);
  }, [userId]);

  const handleSettingsSaved = useCallback((newCfg) => {
    setCfg(newCfg);
    setShowSetup(false);
    setInnerTab("tracker");
  }, []);

  const tabs = [
    { key:"tracker",  label:"Tracker",    icon:Target   },
    { key:"rules",    label:"Reglas",     icon:BookOpen },
    ...(isAdmin ? [{ key:"users", label:"Usuarios", icon:Shield }] : []),
    { key:"password", label:"Contraseña", icon:KeyRound },
  ];

  if (loading) return <div className="text-center py-8 text-[13px] text-[#8fa0b7]">Cargando tu cuenta...</div>;
  if (!userId) return <div className="rounded-[14px] border border-[#243041] bg-[#111827] p-6 text-center text-[13px] text-[#8fa0b7]">Inicia sesión para acceder a tu tracker.</div>;

  if (showSetup || !cfg) return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[20px] font-bold text-white">Apex Challenge</div>
        {cfg && <button onClick={() => setShowSetup(false)} className="text-[11px] text-[#8fa0b7] border border-[#243041] rounded-[8px] px-3 py-1.5">Cancelar</button>}
      </div>
      <SetupScreen userId={userId} existingCfg={cfg} onSaved={handleSettingsSaved} onCancel={cfg ? () => setShowSetup(false) : null} />
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[20px] font-bold text-white tracking-tight">Apex Challenge</div>
          <div className="text-[11px] text-[#8fa0b7]">Registro personal · {TRADING_DAYS.length} días</div>
        </div>
        <div className="text-right">
          {lastSaved && <div className="text-[10px] text-[#4a4a6a]">Guardado {lastSaved}</div>}
          {saving     && <div className="text-[10px] text-[#3b82f6]">Guardando...</div>}
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {tabs.map(t => { const Icon = t.icon; return (
          <button key={t.key} onClick={() => setInnerTab(t.key)}
            className="flex items-center gap-1 rounded-[10px] px-3 py-2 text-[11px] whitespace-nowrap border transition-colors shrink-0"
            style={{ background:innerTab===t.key?"#10253f":"#111827", color:innerTab===t.key?"#93c5fd":"#8fa0b7", borderColor:innerTab===t.key?"#1e3a5f":"#243041" }}>
            <Icon className="h-3.5 w-3.5" />{t.label}
          </button>
        );})}
      </div>

      {innerTab==="tracker"  && <TrackerScreen apexDays={apexDays} setApexDays={setApexDays} cfg={cfg} saving={saving} onSave={handleSave} onEditSettings={() => setShowSetup(true)} />}
      {innerTab==="rules"    && <RulesScreen />}
      {innerTab==="users"    && isAdmin && <UserManagementScreen />}
      {innerTab==="password" && <ChangePasswordScreen />}
    </div>
  );
}
