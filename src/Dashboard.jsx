import { useState, useEffect, useCallback, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Area, AreaChart, BarChart, Bar, Cell, ComposedChart, ReferenceDot } from "recharts";

/*
 ╔══════════════════════════════════════════════════════════════════╗
 ║  GPIC COMPLEX PROFITABILITY — LP OPTIMIZER DASHBOARD            ║
 ║  Based on Simplex LP + Integer Constraints (Model v31)          ║
 ║                                                                  ║
 ║  KEY MODEL INSIGHT: Methanol shutdown affects ammonia & urea    ║
 ║  via CO2/CDR constraints. Shutdown price ≠ variable cost.       ║
 ╚══════════════════════════════════════════════════════════════════╝
*/

// ─── BASE MODEL CONSTANTS (from Excel at $5/MMBTU gas) ────────────────────
const BASE = {
  K7: 0.57,              // NH3→Urea specific consumption (MT/MT)
  alpha: 0.1092174534,   // K10 coefficient for Case A
  C33_coeff: 1.660263,   // CO2 capacity coefficient
  SGC_amm: 1015.6794,    // Specific gas consumption ammonia (Nm3/MT)
  SGC_meth: 1153.1574,   // Specific gas consumption methanol (Nm3/MT)
  GT_gas: 5053000,       // GT gas constant (Nm3/month)
  flare_gas: 424700,     // Flare gas constant (Nm3/month)
  H33: 291.9498,         // Boiler coeff for K10 (ammonia)
  H34: 682.0557,         // Boiler coeff for D5 (methanol)
  H35: 101.2184,         // Boiler coeff for K9 (urea)
  
  // Base variable costs at $5/MMBTU
  VC_amm_base: 198.60366,   // $/MT (Case A / high methanol)
  VC_meth_base: 205.34865,  // $/MT
  VC_urea_base: 146.31378,  // $/MT (Case A)
  
  // Gas cost components in VC (for scaling)
  gasVC_amm: 144.153,    // gas component of ammonia VC
  gasVC_meth: 183.963,   // gas component of methanol VC
  gasVC_urea: 80.5,      // approx gas component of urea VC
  
  // CDR shutdown penalty: when MeOH is below threshold,
  // ammonia loses 5580 MT/mo capacity and costs +$15/MT more
  ammPenalty_B: 15,      // $/MT extra ammonia VC in Case B
  ammCapLoss_B: 5580,    // MT/mo ammonia capacity loss
  ammCapLoss_A: 4247,    // MT/mo ammonia capacity loss Case A

  // Fixed costs
  FC_amm: 2247735.68,
  FC_meth: 2327405.71,
  FC_urea: 3703933.72,
  FC_total: 8279075.12,
};

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_DAYS = [31,28,31,30,31,30,31,31,30,31,30,31];

// ─── VARIABLE COST CALCULATOR (scales with gas price) ──────────────────────
function calcVC(gasPrice) {
  const ratio = gasPrice / 5.0;
  return {
    amm_A: BASE.VC_amm_base + BASE.gasVC_amm * (ratio - 1),
    amm_B: BASE.VC_amm_base + BASE.gasVC_amm * (ratio - 1) + BASE.ammPenalty_B,
    meth:  BASE.VC_meth_base + BASE.gasVC_meth * (ratio - 1),
    urea_A: BASE.VC_urea_base + BASE.gasVC_urea * (ratio - 1),
    urea_B: BASE.VC_urea_base + BASE.gasVC_urea * (ratio - 1) + BASE.K7 * BASE.ammPenalty_B,
  };
}

// ─── GAS CONSUMPTION CHECK ─────────────────────────────────────────────────
function calcGas(K10, D5, K9, days) {
  const C12 = BASE.SGC_amm * K10;
  const D12 = BASE.SGC_meth * D5;
  const C15 = BASE.H34 * D5 + BASE.H33 * K10 + BASE.H35 * K9;
  const total = C12 + D12 + BASE.GT_gas + C15 + BASE.flare_gas;
  return total * 37.325 / (1e6 * days);
}

// ─── LP SOLVER (mirrors Excel Cases A & B) ─────────────────────────────────
function solveLP(ammP, methP, ureaP, gasP, maxAmm, maxMeth, maxUrea, maxGas, days) {
  const vc = calcVC(gasP);
  const K1 = days;
  const R4 = K1 * maxAmm;
  const S4 = K1 * maxMeth;
  const T4 = K1 * maxUrea;
  const R13 = maxMeth * 0.6 * K1; // methanol threshold (~60% load)

  let best = { profit: -Infinity };

  // ── CASE A: D5 ≥ R13 (methanol above threshold) ──
  // Methanol at various levels from R13 to S4
  for (let frac = 0.6; frac <= 1.0; frac += 0.005) {
    const D5 = Math.min(frac * S4, S4);
    if (D5 < R13) continue;

    const K4 = R4;
    const K10 = K4 - BASE.ammCapLoss_A + BASE.alpha * D5;
    const E5 = T4;
    const K9 = E5; // In Case A, full urea
    const K8 = BASE.K7 * K9;
    const K11 = K10 - K8;

    if (K11 < 0) continue;
    const gas = calcGas(K10, D5, K9, K1);
    if (gas > maxGas) continue;

    const profit = (ammP - vc.amm_A) * K11 + (methP - vc.meth) * D5 + (ureaP - vc.urea_A) * K9 - BASE.FC_total;
    if (profit > best.profit) {
      best = { caseType:'A', D5, K10, K9, K8, K11, K4, gas, profit, dailyAmm:K10/K1, dailyMeth:D5/K1, dailyUrea:K9/K1, vcAmm:vc.amm_A, vcMeth:vc.meth, vcUrea:vc.urea_A };
    }
  }

  // ── CASE B: D5 < R13 (methanol below threshold) ──
  for (let frac = 0; frac <= 0.6; frac += 0.005) {
    const D5 = Math.max(1, frac * S4);
    if (D5 >= R13) continue;

    const K4 = R4;
    const K10 = K4 - BASE.ammCapLoss_B; // 5580 penalty
    const C33 = BASE.C33_coeff * K10;   // CO2 limited urea
    const K9 = Math.min(T4, C33);       // urea limited by CO2 when MeOH down
    const K8 = BASE.K7 * K9;
    const K11 = K10 - K8;

    if (K11 < 0) continue;
    const gas = calcGas(K10, D5, K9, K1);
    if (gas > maxGas) continue;

    const profit = (ammP - vc.amm_B) * K11 + (methP - vc.meth) * D5 + (ureaP - vc.urea_B) * K9 - BASE.FC_total;
    if (profit > best.profit) {
      best = { caseType:'B', D5, K10, K9, K8, K11, K4, gas, profit, dailyAmm:K10/K1, dailyMeth:D5/K1, dailyUrea:K9/K1, vcAmm:vc.amm_B, vcMeth:vc.meth, vcUrea:vc.urea_B };
    }
  }

  // Also try D5=1 (effectively shutdown)
  {
    const D5 = 1;
    const K4 = R4;
    const K10 = K4 - BASE.ammCapLoss_B;
    const C33 = BASE.C33_coeff * K10;
    const K9 = Math.min(T4, C33);
    const K8 = BASE.K7 * K9;
    const K11 = K10 - K8;
    if (K11 >= 0) {
      const gas = calcGas(K10, D5, K9, K1);
      if (gas <= maxGas) {
        const profit = (ammP - vc.amm_B) * K11 + (methP - vc.meth) * D5 + (ureaP - vc.urea_B) * K9 - BASE.FC_total;
        if (profit > best.profit) {
          best = { caseType:'B-min', D5, K10, K9, K8, K11, K4, gas, profit, dailyAmm:K10/K1, dailyMeth:D5/K1, dailyUrea:K9/K1, vcAmm:vc.amm_B, vcMeth:vc.meth, vcUrea:vc.urea_B };
        }
      }
    }
  }

  if (best.profit === -Infinity) {
    return { caseType:'Infeasible', D5:0, K10:0, K9:0, K8:0, K11:0, K4:0, gas:0, profit:0, dailyAmm:0, dailyMeth:0, dailyUrea:0, vcAmm:vc.amm_A, vcMeth:vc.meth, vcUrea:vc.urea_A };
  }
  return best;
}

// ─── SHUTDOWN ANALYSIS ─────────────────────────────────────────────────────
// Computes: (1) profit with MeOH plant running at each price (optimizer finds best level)
//           (2) profit with MeOH plant fully shut down (D5=0, with CDR/ammonia penalties)
function generateShutdownData(ammP, ureaP, gasP, maxAmm, maxMeth, maxUrea, maxGas, days) {
  const vc = calcVC(gasP);
  const K1 = days;
  const R4 = K1 * maxAmm;
  const T4 = K1 * maxUrea;

  // ── SHUTDOWN PROFIT (constant, independent of methanol price) ──
  // When methanol is fully shut down: D5=0, ammonia loses 5580 capacity,
  // urea limited by CO2, and VC penalties apply
  const K10_shut = R4 - BASE.ammCapLoss_B;
  const C33_shut = BASE.C33_coeff * K10_shut;
  const K9_shut = Math.min(T4, C33_shut);
  const K8_shut = BASE.K7 * K9_shut;
  const K11_shut = K10_shut - K8_shut;
  const shutdownProfit = (ammP - vc.amm_B) * K11_shut + (ureaP - vc.urea_B) * K9_shut - BASE.FC_total;

  const data = [];
  let crossover = null;
  let prevDiff = null;

  for (let mp = 0; mp <= 350; mp += 5) {
    // Running profit: optimizer picks best production at this MeOH price
    const result = solveLP(ammP, mp, ureaP, gasP, maxAmm, maxMeth, maxUrea, maxGas, days);
    const runProfit = result.profit;

    const diff = runProfit - shutdownProfit;

    // Detect crossover
    if (prevDiff !== null && prevDiff <= 0 && diff > 0 && crossover === null) {
      // Interpolate
      const prevMp = mp - 5;
      crossover = prevMp + 5 * (-prevDiff) / (diff - prevDiff);
    }
    prevDiff = diff;

    data.push({
      methPrice: mp,
      runningProfit: runProfit / 1e6,
      shutdownProfit: shutdownProfit / 1e6,
    });
  }

  // If no crossover found but running always above shutdown, crossover is below 0
  return { data, crossover, vcMeth: vc.meth, shutdownProfitVal: shutdownProfit };
}

// ─── FORMAT HELPERS ────────────────────────────────────────────────────────
const fmt = (n, d=0) => n==null?'—':Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const fmtM = (n) => n==null?'—':`$${(n/1e6).toFixed(2)}M`;

// ─── SHUTDOWN CHART TOOLTIP ────────────────────────────────────────────────
const ShutdownTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const running = payload.find(p => p.dataKey === 'runningProfit');
  const shutdown = payload.find(p => p.dataKey === 'shutdownProfit');
  const diff = running && shutdown ? (running.value - shutdown.value) : 0;
  return (
    <div style={{ background:'rgba(10,15,30,0.96)', border:'1px solid rgba(100,120,150,0.25)', borderRadius:10, padding:'14px 18px', fontFamily:"'DM Sans',sans-serif", fontSize:13, boxShadow:'0 12px 40px rgba(0,0,0,0.5)', minWidth:220 }}>
      <div style={{ color:'#94a3b8', marginBottom:10, fontWeight:600, borderBottom:'1px solid rgba(100,120,150,0.15)', paddingBottom:8 }}>
        Methanol Price: ${label}/MT
      </div>
      {running && (
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
          <span style={{ color:'#22c55e' }}>● MeOH Running</span>
          <span style={{ color:'#22c55e', fontWeight:700, fontFamily:"'JetBrains Mono',monospace" }}>${running.value.toFixed(2)}M</span>
        </div>
      )}
      {shutdown && (
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
          <span style={{ color:'#f97316' }}>● MeOH Shutdown</span>
          <span style={{ color:'#f97316', fontWeight:700, fontFamily:"'JetBrains Mono',monospace" }}>${shutdown.value.toFixed(2)}M</span>
        </div>
      )}
      <div style={{ borderTop:'1px solid rgba(100,120,150,0.15)', paddingTop:8, display:'flex', justifyContent:'space-between' }}>
        <span style={{ color:'#cbd5e1', fontWeight:600 }}>Advantage</span>
        <span style={{ color: diff > 0 ? '#22c55e' : diff < -0.01 ? '#ef4444' : '#fbbf24', fontWeight:700, fontFamily:"'JetBrains Mono',monospace" }}>
          {diff > 0 ? '+' : ''}{diff.toFixed(3)}M
        </span>
      </div>
    </div>
  );
};

// ─── GENERIC TOOLTIP ───────────────────────────────────────────────────────
const GenericTooltip = ({ active, payload, label, xLabel, yLabel }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'rgba(10,15,30,0.96)', border:'1px solid rgba(100,120,150,0.25)', borderRadius:10, padding:'12px 16px', fontFamily:"'DM Sans',sans-serif", fontSize:13, boxShadow:'0 12px 40px rgba(0,0,0,0.5)' }}>
      <div style={{ color:'#94a3b8', marginBottom:6, fontWeight:600 }}>{xLabel || ''}: {label}</div>
      {payload.map((p,i) => (
        <div key={i} style={{ display:'flex', justifyContent:'space-between', gap:16, marginBottom:3 }}>
          <span style={{ color:p.color }}>{p.name}</span>
          <span style={{ color:p.color, fontWeight:700, fontFamily:"'JetBrains Mono',monospace" }}>{typeof p.value==='number'?p.value.toFixed(2):p.value}</span>
        </div>
      ))}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function Dashboard() {
  const [ammP, setAmmP] = useState(325);
  const [methP, setMethP] = useState(80);
  const [ureaP, setUreaP] = useState(400);
  const [gasP, setGasP] = useState(5);
  const [maxAmm, setMaxAmm] = useState(1320);
  const [maxMeth, setMaxMeth] = useState(1250);
  const [maxUrea, setMaxUrea] = useState(2150);
  const [maxGas, setMaxGas] = useState(128);
  const [monthIdx, setMonthIdx] = useState(4);
  const [tab, setTab] = useState('optimizer');

  const days = MONTH_DAYS[monthIdx];

  // Core results
  const result = useMemo(() => solveLP(ammP, methP, ureaP, gasP, maxAmm, maxMeth, maxUrea, maxGas, days), [ammP, methP, ureaP, gasP, maxAmm, maxMeth, maxUrea, maxGas, days]);

  // Shutdown analysis
  const shutdown = useMemo(() => generateShutdownData(ammP, ureaP, gasP, maxAmm, maxMeth, maxUrea, maxGas, days), [ammP, ureaP, gasP, maxAmm, maxMeth, maxUrea, maxGas, days]);

  // Gas sensitivity
  const gasSens = useMemo(() => {
    const d = [];
    for (let g = 0.5; g <= 10; g += 0.25) {
      const r = solveLP(ammP, methP, ureaP, g, maxAmm, maxMeth, maxUrea, maxGas, days);
      d.push({ gasPrice: g, profit: r.profit / 1e6 });
    }
    return d;
  }, [ammP, methP, ureaP, maxAmm, maxMeth, maxUrea, maxGas, days]);

  const profitColor = result.profit >= 0 ? '#22c55e' : '#ef4444';
  const crossPrice = shutdown.crossover;

  // Revenue / cost breakdown
  const revAmm = result.K11 * ammP;
  const revMeth = result.D5 * methP;
  const revUrea = result.K9 * ureaP;
  const totalRev = revAmm + revMeth + revUrea;
  const vcTotal = result.K11 * result.vcAmm + result.D5 * result.vcMeth + result.K9 * result.vcUrea;

  return (
    <div style={{ minHeight:'100vh', background:'#080c14', color:'#e2e8f0', fontFamily:"'DM Sans',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet"/>
      
      {/* ═══ HEADER ═══ */}
      <header style={{ background:'linear-gradient(90deg, rgba(34,197,94,0.06) 0%, rgba(59,130,246,0.06) 50%, rgba(249,115,22,0.06) 100%)', borderBottom:'1px solid rgba(100,120,150,0.1)', padding:'18px 28px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          <div style={{ width:40, height:40, borderRadius:10, background:'linear-gradient(135deg,#22c55e,#3b82f6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:800, color:'#080c14' }}>LP</div>
          <div>
            <div style={{ fontSize:10, letterSpacing:4, color:'#475569', textTransform:'uppercase', fontWeight:600 }}>GPIC Complex Profitability</div>
            <h1 style={{ fontSize:22, fontWeight:700, margin:0, color:'#f1f5f9' }}>LP Optimizer Dashboard</h1>
          </div>
        </div>
        <div style={{ display:'flex', gap:6, background:'rgba(15,23,42,0.6)', borderRadius:10, padding:4, border:'1px solid rgba(100,120,150,0.1)' }}>
          {[
            {id:'optimizer', icon:'⚡', label:'Optimizer'},
            {id:'shutdown', icon:'🏭', label:'MeOH Shutdown'},
            {id:'sensitivity', icon:'📊', label:'Gas Sensitivity'},
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding:'8px 16px', borderRadius:8, border:'none',
              background: tab===t.id ? 'rgba(59,130,246,0.2)' : 'transparent',
              color: tab===t.id ? '#60a5fa' : '#64748b',
              fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit',
              transition:'all 0.2s',
            }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </header>

      <div style={{ padding:'20px 28px', maxWidth:1440, margin:'0 auto' }}>

        {/* ═══ INPUTS PANEL ═══ */}
        <div style={{ background:'rgba(15,23,42,0.5)', borderRadius:14, border:'1px solid rgba(100,120,150,0.08)', padding:'20px 24px', marginBottom:20 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
            <div style={{ width:4, height:20, background:'linear-gradient(180deg,#3b82f6,#22c55e)', borderRadius:2 }}/>
            <span style={{ fontSize:13, fontWeight:600, color:'#94a3b8', letterSpacing:0.5 }}>Market Inputs & Plant Parameters</span>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap:12 }}>
            <NumInput label="Ammonia Price" v={ammP} set={setAmmP} unit="$/MT" accent="#f59e0b"/>
            <NumInput label="Methanol Price" v={methP} set={setMethP} unit="$/MT" accent="#a855f7"/>
            <NumInput label="Urea Price" v={ureaP} set={setUreaP} unit="$/MT" accent="#22c55e"/>
            <NumInput label="Natural Gas" v={gasP} set={setGasP} unit="$/MMBTU" accent="#ef4444" step={0.25}/>
            <NumInput label="Max Ammonia" v={maxAmm} set={setMaxAmm} unit="MT/D" accent="#f59e0b"/>
            <NumInput label="Max Methanol" v={maxMeth} set={setMaxMeth} unit="MT/D" accent="#a855f7"/>
            <NumInput label="Max Urea" v={maxUrea} set={setMaxUrea} unit="MT/D" accent="#22c55e"/>
            <NumInput label="Max Gas" v={maxGas} set={setMaxGas} unit="MMSCFD" accent="#ef4444"/>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              <label style={{ fontSize:10, color:'#475569', textTransform:'uppercase', letterSpacing:1.5, fontWeight:700 }}>Month ({days}d)</label>
              <select value={monthIdx} onChange={e=>setMonthIdx(+e.target.value)} style={{ background:'rgba(8,12,20,0.8)', border:'1px solid rgba(100,120,150,0.15)', borderRadius:8, color:'#e2e8f0', padding:'9px 10px', fontSize:14, fontFamily:'inherit', outline:'none' }}>
                {MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* ═══ OPTIMIZER TAB ═══ */}
        {tab==='optimizer' && <>
          {/* KPIs */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:14, marginBottom:20 }}>
            <KPI title="Net Monthly Profit" value={fmtM(result.profit)} sub={`Case ${result.caseType} • ${MONTHS[monthIdx]}`} color={profitColor} big/>
            <KPI title="Ammonia" value={`${fmt(result.dailyAmm,1)} MT/D`} sub={`${fmt(result.K11,0)} MT saleable`} color="#f59e0b"/>
            <KPI title="Methanol" value={`${fmt(result.dailyMeth,1)} MT/D`} sub={`${fmt(result.D5,0)} MT total`} color="#a855f7"/>
            <KPI title="Urea" value={`${fmt(result.dailyUrea,1)} MT/D`} sub={`${fmt(result.K9,0)} MT saleable`} color="#22c55e"/>
            <KPI title="Gas Consumption" value={`${fmt(result.gas,2)} MMSCFD`} sub={`${((result.gas/maxGas)*100).toFixed(1)}% of ${maxGas} limit`} color="#ef4444"/>
          </div>

          {/* Charts row */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
            {/* Production utilization */}
            <Card title="Daily Production vs Capacity">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={[
                  {name:'Ammonia', prod:result.dailyAmm, cap:maxAmm},
                  {name:'Methanol', prod:result.dailyMeth, cap:maxMeth},
                  {name:'Urea', prod:result.dailyUrea, cap:maxUrea},
                ]} layout="vertical" margin={{left:10,right:25,top:5,bottom:5}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,120,150,0.08)"/>
                  <XAxis type="number" tick={{fill:'#475569',fontSize:11}} tickFormatter={v=>`${v}`}/>
                  <YAxis dataKey="name" type="category" tick={{fill:'#94a3b8',fontSize:13,fontWeight:500}} width={75}/>
                  <Tooltip content={({active,payload})=>active&&payload?.[0]?(
                    <div style={{background:'rgba(10,15,30,0.96)',border:'1px solid rgba(100,120,150,0.25)',borderRadius:8,padding:'10px 14px',fontSize:12}}>
                      <div style={{color:'#e2e8f0',fontWeight:600,marginBottom:4}}>{payload[0].payload.name}</div>
                      <div style={{color:'#60a5fa'}}>Production: {fmt(payload[0].payload.prod,1)} MT/D</div>
                      <div style={{color:'#475569'}}>Capacity: {fmt(payload[0].payload.cap)} MT/D</div>
                      <div style={{color:'#fbbf24'}}>Utilization: {((payload[0].payload.prod/payload[0].payload.cap)*100).toFixed(1)}%</div>
                    </div>
                  ):null}/>
                  <Bar dataKey="cap" radius={[0,4,4,0]} barSize={24} fill="rgba(100,120,150,0.12)"/>
                  <Bar dataKey="prod" radius={[0,6,6,0]} barSize={24}>
                    <Cell fill="#f59e0b"/>
                    <Cell fill="#a855f7"/>
                    <Cell fill="#22c55e"/>
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* Revenue / cost waterfall */}
            <Card title="Revenue & Cost Breakdown">
              <div style={{ padding:'8px 4px' }}>
                {[
                  {label:'Urea Revenue', val:revUrea, color:'#22c55e'},
                  {label:'Ammonia Revenue', val:revAmm, color:'#f59e0b'},
                  {label:'Methanol Revenue', val:revMeth, color:'#a855f7'},
                  {label:'Variable Costs', val:-vcTotal, color:'#f87171'},
                  {label:'Fixed Costs', val:-BASE.FC_total, color:'#ef4444'},
                ].map((item,i)=>{
                  const maxBar = Math.max(revUrea, vcTotal, BASE.FC_total);
                  const pct = Math.abs(item.val)/maxBar*100;
                  return (
                    <div key={i} style={{marginBottom:12}}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:3,fontSize:12}}>
                        <span style={{color:'#94a3b8'}}>{item.label}</span>
                        <span style={{color:item.color,fontWeight:600,fontFamily:"'JetBrains Mono',monospace",fontSize:12}}>
                          {item.val>=0?'+':''}{fmtM(item.val)}
                        </span>
                      </div>
                      <div style={{height:5,background:'rgba(100,120,150,0.08)',borderRadius:3,overflow:'hidden'}}>
                        <div style={{width:`${Math.min(pct,100)}%`,height:'100%',background:item.color,borderRadius:3,opacity:0.75,transition:'width 0.4s ease'}}/>
                      </div>
                    </div>
                  );
                })}
                <div style={{marginTop:14,paddingTop:10,borderTop:'1px solid rgba(100,120,150,0.12)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontWeight:700,color:'#cbd5e1',fontSize:14}}>Net Profit</span>
                  <span style={{fontWeight:800,color:profitColor,fontFamily:"'JetBrains Mono',monospace",fontSize:20}}>{fmtM(result.profit)}</span>
                </div>
              </div>
            </Card>
          </div>

          {/* VC Table */}
          <Card title="Variable Costs & Contribution Margins">
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead>
                <tr style={{borderBottom:'1px solid rgba(100,120,150,0.12)'}}>
                  {['Product','VC ($/MT)','Price ($/MT)','CM ($/MT)','Volume (MT/mo)','Contribution ($)'].map((h,i)=>(
                    <th key={i} style={{padding:'8px 12px',textAlign:i===0?'left':'right',color:'#475569',fontWeight:700,fontSize:10,textTransform:'uppercase',letterSpacing:1.2}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  {name:'Ammonia',vc:result.vcAmm,price:ammP,vol:result.K11,color:'#f59e0b'},
                  {name:'Methanol',vc:result.vcMeth,price:methP,vol:result.D5,color:'#a855f7'},
                  {name:'Urea',vc:result.vcUrea,price:ureaP,vol:result.K9,color:'#22c55e'},
                ].map((p,i)=>{
                  const cm = p.price - p.vc;
                  return (
                    <tr key={i} style={{borderBottom:'1px solid rgba(100,120,150,0.06)'}}>
                      <td style={{padding:'10px 12px',color:p.color,fontWeight:600}}>{p.name}</td>
                      <td style={{...mono,textAlign:'right'}}>${fmt(p.vc,2)}</td>
                      <td style={{...mono,textAlign:'right'}}>${fmt(p.price,2)}</td>
                      <td style={{...mono,textAlign:'right',color:cm>=0?'#22c55e':'#ef4444'}}>${fmt(cm,2)}</td>
                      <td style={{...mono,textAlign:'right'}}>{fmt(p.vol,0)}</td>
                      <td style={{...mono,textAlign:'right',color:cm*p.vol>=0?'#22c55e':'#ef4444'}}>{fmtM(cm*p.vol)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>}

        {/* ═══ SHUTDOWN TAB ═══ */}
        {tab==='shutdown' && <>
          <Card title="GPIC Net Profit vs Price of Methanol">
            {/* Legend */}
            <div style={{ display:'flex', gap:24, flexWrap:'wrap', marginBottom:14, padding:'0 4px' }}>
              <LegendItem color="#22c55e" label="MeOH Plant Running (Optimized)" solid/>
              <LegendItem color="#f97316" label="MeOH Plant Shutdown" solid/>
              <LegendItem color="#a855f7" dashed label={`MeOH Variable Cost: $${fmt(shutdown.vcMeth,0)}/MT`}/>
              {crossPrice !== null && <LegendItem color="#fbbf24" dot label={`Shutdown Price: ~$${fmt(crossPrice,0)}/MT`}/>}
            </div>

            <ResponsiveContainer width="100%" height={420}>
              <ComposedChart data={shutdown.data} margin={{top:10,right:30,left:15,bottom:30}}>
                <defs>
                  <linearGradient id="gRun" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.15}/>
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,120,150,0.06)"/>
                <XAxis
                  dataKey="methPrice" type="number"
                  domain={[0,350]}
                  ticks={[0,20,40,60,80,100,120,140,160,180,200,220,240,260,280,300,320,340]}
                  tick={{fill:'#475569',fontSize:11}}
                  label={{value:'Price of Methanol ($/MT)',position:'bottom',fill:'#64748b',fontSize:12,offset:10}}
                />
                <YAxis
                  tick={{fill:'#475569',fontSize:11}}
                  tickFormatter={v=>`$${v}M`}
                  label={{value:'Net Profit ($/month)',angle:-90,position:'insideLeft',fill:'#64748b',fontSize:12,offset:0}}
                  domain={['auto','auto']}
                />
                <Tooltip content={<ShutdownTooltip/>}/>

                {/* MeOH VC reference line */}
                <ReferenceLine x={shutdown.vcMeth} stroke="#a855f7" strokeDasharray="8 4" strokeWidth={2} label={{value:`$${fmt(shutdown.vcMeth,0)} MeOH VC`,position:'top',fill:'#a855f7',fontSize:11,fontWeight:600,offset:10}}/>

                {/* Crossover point */}
                {crossPrice !== null && (
                  <ReferenceLine x={crossPrice} stroke="#fbbf24" strokeDasharray="5 3" strokeWidth={1.5}/>
                )}

                {/* Area fill under running line */}
                <Area type="monotone" dataKey="runningProfit" fill="url(#gRun)" stroke="none"/>

                {/* Shutdown line (constant horizontal — like the orange in Excel) */}
                <Line type="monotone" dataKey="shutdownProfit" stroke="#f97316" strokeWidth={3} dot={false} name="MeOH Shutdown"/>

                {/* Running line (increases with MeOH price — like the green in Excel) */}
                <Line type="monotone" dataKey="runningProfit" stroke="#22c55e" strokeWidth={3} dot={false} name="MeOH Running"/>
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          {/* Shutdown KPIs */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:14, marginTop:16 }}>
            <KPI
              title="Methanol Shutdown Price"
              value={crossPrice !== null ? `~$${fmt(crossPrice,0)}/MT` : 'Always profitable'}
              sub="Price where running = shutdown profit"
              color="#fbbf24" big
            />
            <KPI
              title="Current Methanol Price"
              value={`$${methP}/MT`}
              sub={methP > (crossPrice||0) ? '✓ Above shutdown — keep running' : '⚠ Below shutdown — consider stopping'}
              color={methP > (crossPrice||0) ? '#22c55e' : '#ef4444'} big
            />
            <KPI
              title="MeOH Variable Cost"
              value={`$${fmt(shutdown.vcMeth,1)}/MT`}
              sub={`Price - VC = $${fmt(methP - shutdown.vcMeth,1)}/MT`}
              color="#a855f7" big
            />
            <KPI
              title="Running vs Shutdown Δ"
              value={fmtM(result.profit - shutdown.shutdownProfitVal)}
              sub="At current methanol price"
              color={result.profit > shutdown.shutdownProfitVal ? '#22c55e' : '#ef4444'} big
            />
          </div>

          {/* Explanation card */}
          <div style={{ background:'rgba(15,23,42,0.4)', borderRadius:12, border:'1px solid rgba(100,120,150,0.06)', padding:'18px 22px', marginTop:16, fontSize:13, color:'#64748b', lineHeight:1.8 }}>
            <div style={{ fontWeight:700, color:'#94a3b8', marginBottom:8, fontSize:14 }}>📌 Understanding the Shutdown Decision</div>
            <p style={{margin:'0 0 8px'}}>
              The <span style={{color:'#22c55e',fontWeight:600}}>green line</span> shows total complex net profit with the methanol plant running — the LP optimizer finds the best production level at each methanol market price.
            </p>
            <p style={{margin:'0 0 8px'}}>
              The <span style={{color:'#f97316',fontWeight:600}}>orange line</span> shows the profit when the methanol plant is fully shut down. This is <strong>not</strong> just "zero methanol revenue" — shutting down methanol impacts the entire complex: ammonia loses ~5,580 MT/month capacity, urea production becomes CO₂-limited (via CDR), and ammonia VC increases by $15/MT.
            </p>
            <p style={{margin:'0 0 8px'}}>
              The <span style={{color:'#a855f7',fontWeight:600}}>purple dashed line</span> shows methanol variable cost. Notice the shutdown decision point is well <strong>below</strong> the VC — because even when methanol has a negative contribution margin, keeping it running benefits ammonia & urea through the CO₂/CDR linkage.
            </p>
            <p style={{margin:0}}>
              <span style={{color:'#fbbf24',fontWeight:600}}>Shutdown decision:</span> Only shut down methanol when its market price falls below ~${crossPrice !== null ? fmt(crossPrice,0) : '—'}/MT, not at the variable cost of ${fmt(shutdown.vcMeth,0)}/MT.
            </p>
          </div>
        </>}

        {/* ═══ SENSITIVITY TAB ═══ */}
        {tab==='sensitivity' && <>
          <Card title="Profit Sensitivity to Natural Gas Price">
            <ResponsiveContainer width="100%" height={380}>
              <ComposedChart data={gasSens} margin={{top:10,right:30,left:15,bottom:25}}>
                <defs>
                  <linearGradient id="gGas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.2}/>
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0.05}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,120,150,0.06)"/>
                <XAxis dataKey="gasPrice" tick={{fill:'#475569',fontSize:11}} label={{value:'Natural Gas Price ($/MMBTU)',position:'bottom',fill:'#64748b',fontSize:12,offset:8}}/>
                <YAxis tick={{fill:'#475569',fontSize:11}} tickFormatter={v=>`$${v}M`} label={{value:'Net Profit ($M/month)',angle:-90,position:'insideLeft',fill:'#64748b',fontSize:12}}/>
                <Tooltip content={({active,payload,label})=>active&&payload?.[0]?(
                  <div style={{background:'rgba(10,15,30,0.96)',border:'1px solid rgba(100,120,150,0.25)',borderRadius:10,padding:'12px 16px',fontSize:13}}>
                    <div style={{color:'#94a3b8',marginBottom:6}}>Gas: ${label}/MMBTU</div>
                    <div style={{color:payload[0].value>=0?'#22c55e':'#ef4444',fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>${payload[0].value.toFixed(2)}M/month</div>
                  </div>
                ):null}/>
                <ReferenceLine y={0} stroke="rgba(100,120,150,0.2)"/>
                <ReferenceLine x={gasP} stroke="#fbbf24" strokeDasharray="5 3" strokeWidth={1.5} label={{value:`Current $${gasP}`,position:'top',fill:'#fbbf24',fontSize:11,fontWeight:600}}/>
                <Area type="monotone" dataKey="profit" fill="url(#gGas)" stroke="none"/>
                <Line type="monotone" dataKey="profit" stroke="#3b82f6" strokeWidth={2.5} dot={false} name="Net Profit ($M)"/>
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Gas Price Impact Reference">
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead>
                <tr style={{borderBottom:'1px solid rgba(100,120,150,0.12)'}}>
                  {['Gas $/MMBTU','Monthly Profit','vs Current','Amm VC','MeOH VC','Urea VC'].map((h,i)=>(
                    <th key={i} style={{padding:'8px 12px',textAlign:i===0?'left':'right',color:'#475569',fontWeight:700,fontSize:10,textTransform:'uppercase',letterSpacing:1}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[1,2,3,4,5,6,7,8,9,10].map(g=>{
                  const r = solveLP(ammP,methP,ureaP,g,maxAmm,maxMeth,maxUrea,maxGas,days);
                  const vc = calcVC(g);
                  const diff = r.profit - result.profit;
                  const curr = g===gasP;
                  return (
                    <tr key={g} style={{borderBottom:'1px solid rgba(100,120,150,0.05)',background:curr?'rgba(59,130,246,0.08)':'transparent'}}>
                      <td style={{padding:'8px 12px',color:curr?'#60a5fa':'#94a3b8',fontWeight:curr?700:400}}>${g}{curr?' ◄':''}</td>
                      <td style={{...mono,textAlign:'right',color:r.profit>=0?'#22c55e':'#ef4444'}}>{fmtM(r.profit)}</td>
                      <td style={{...mono,textAlign:'right',color:diff>=0?'#22c55e':'#ef4444'}}>{diff>=0?'+':''}{fmtM(diff)}</td>
                      <td style={{...mono,textAlign:'right'}}>${fmt(vc.amm_A,1)}</td>
                      <td style={{...mono,textAlign:'right'}}>${fmt(vc.meth,1)}</td>
                      <td style={{...mono,textAlign:'right'}}>${fmt(vc.urea_A,1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>}

        <div style={{ marginTop:28, paddingTop:12, borderTop:'1px solid rgba(100,120,150,0.06)', textAlign:'center', fontSize:10, color:'#334155', letterSpacing:1 }}>
          GPIC LP Profitability Optimizer • Simplex LP + Integer Constraints • Model v31
        </div>
      </div>
    </div>
  );
}

// ─── REUSABLE COMPONENTS ───────────────────────────────────────────────────
function NumInput({label,v,set,unit,accent,step=1}) {
  return (
    <div style={{display:'flex',flexDirection:'column',gap:5}}>
      <label style={{fontSize:10,color:'#475569',textTransform:'uppercase',letterSpacing:1.5,fontWeight:700}}>{label}</label>
      <div style={{position:'relative'}}>
        <input type="number" value={v} step={step} onChange={e=>set(+e.target.value)} style={{
          width:'100%',background:'rgba(8,12,20,0.8)',border:`1px solid ${accent}25`,borderRadius:8,
          color:'#e2e8f0',padding:'9px 60px 9px 10px',fontSize:14,fontFamily:"'JetBrains Mono',monospace",fontWeight:500,outline:'none',boxSizing:'border-box',transition:'border-color 0.2s',
        }} onFocus={e=>e.target.style.borderColor=accent+'80'} onBlur={e=>e.target.style.borderColor=accent+'25'}/>
        <span style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',fontSize:10,color:'#475569',fontFamily:"'JetBrains Mono',monospace",pointerEvents:'none'}}>{unit}</span>
      </div>
    </div>
  );
}

function KPI({title,value,sub,color,big}) {
  return (
    <div style={{background:'rgba(15,23,42,0.4)',borderRadius:12,border:'1px solid rgba(100,120,150,0.06)',padding:big?'18px 22px':'14px 18px',position:'relative',overflow:'hidden'}}>
      <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:color,opacity:0.6}}/>
      <div style={{fontSize:10,color:'#475569',textTransform:'uppercase',letterSpacing:1.5,fontWeight:700,marginBottom:6}}>{title}</div>
      <div style={{fontSize:big?22:18,fontWeight:800,color,fontFamily:"'JetBrains Mono',monospace",marginBottom:3}}>{value}</div>
      <div style={{fontSize:11,color:'#475569'}}>{sub}</div>
    </div>
  );
}

function Card({title,children}) {
  return (
    <div style={{background:'rgba(15,23,42,0.35)',borderRadius:14,border:'1px solid rgba(100,120,150,0.06)',padding:'18px 20px',marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
        <div style={{width:3,height:16,background:'#3b82f6',borderRadius:2}}/>
        <h3 style={{fontSize:14,fontWeight:600,margin:0,color:'#94a3b8'}}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function LegendItem({color,label,solid,dashed,dot}) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:7}}>
      {solid && <div style={{width:22,height:3,background:color,borderRadius:2}}/>}
      {dashed && <div style={{width:22,height:0,borderTop:`2px dashed ${color}`}}/>}
      {dot && <div style={{width:8,height:8,background:color,borderRadius:'50%'}}/>}
      <span style={{fontSize:12,color:'#94a3b8'}}>{label}</span>
    </div>
  );
}

const mono = {padding:'8px 12px',color:'#e2e8f0',fontFamily:"'JetBrains Mono',monospace",fontWeight:500,fontSize:13};
