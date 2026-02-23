import { useState, useMemo } from "react";
import { BarChart, Bar, Cell, ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const K7 = 0.57;
const ALPHA = 0.1092174534;
const C33_COEFF = 1.660263;
const CAPA = 4247;
const CAPB = 5580;
const SGA = 903.61;
const SGB = 1015.6794;
const SGM = 1153.1574;
const GT = 5053000;
const BM = 110.0465;
const BA = 237.3583;
const BU = 104.1689;
const FL = 424700;
const GCV = 37.325;
const VC_AMM_BASE = 160.5221;
const VC_METH_BASE = 165.0406;
const VC_UREA_BASE = 119.7945;
const VC_AMM_SLOPE = 39.8983;
const VC_METH_SLOPE = 42.8763;
const VC_UREA_SLOPE = 26.4605;
const VC_AMM_PENALTY_B = 15;
const VC_UREA_PENALTY_B = 8.55;
const FC = 8279075.116022099;
const O12 = 35542.641876;

function calcR13(days) {
  return (O12 * 24 / SGM) * days;
}

function calcVC(gasPrice) {
  return {
    ammA: VC_AMM_BASE + VC_AMM_SLOPE * gasPrice,
    meth: VC_METH_BASE + VC_METH_SLOPE * gasPrice,
    ureaA: VC_UREA_BASE + VC_UREA_SLOPE * gasPrice
  };
}

function calcGasConsumption(K10A, K10B, D5A, D5B, K9A, K9B, D5, days) {
  const c12A = SGA * K10A;
  const c12B = SGB * K10B;
  const d12 = SGM * D5;
  const c15A = BM * D5A + BA * K10A + BU * K9A;
  const c15B = BM * D5B + BA * K10B + BU * K9B;
  const totalNm3 = c12A + c12B + d12 + GT + c15A + c15B + FL;
  const mmscfd = (totalNm3 * GCV) / (1e6 * days);
  return { totalNm3, mmscfd };
}

function solveMILP(ammPrice, methPrice, ureaPrice, gasPrice, maxAmmDaily, maxMethDaily, maxUreaDaily, maxGas, days) {
  const mxA_mo = maxAmmDaily * days;
  const mxM_mo = maxMethDaily * days;
  const mxU_mo = maxUreaDaily * days;
  const r13 = calcR13(days);
  const vc = calcVC(gasPrice);
  let bestSolution = null;
  let bestProfit = -Infinity;
  
  for (let y1_val = 0; y1_val <= 1; y1_val++) {
    for (let y2_val = 0; y2_val <= 1; y2_val++) {
      if (y2_val > (1 - y1_val)) continue;
      let caseSolutions = [];
      
      if (y1_val === 1) {
        const d5AMin = r13;
        const d5AMax = Math.min(38750, mxM_mo);
        if (d5AMin > d5AMax) continue;
        
        for (let d5AIdx = 0; d5AIdx <= 20; d5AIdx++) {
          const d5A = d5AMin + (d5AMax - d5AMin) * d5AIdx / 20;
          for (let k4AIdx = 0; k4AIdx <= 15; k4AIdx++) {
            const k4A = mxA_mo * (1 - k4AIdx * 0.05);
            if (k4A < 1) break;
            const e5A = mxU_mo;
            const k9A = e5A;
            const k10A = k4A - CAPA + ALPHA * d5A;
            if (k10A < 1 || k10A - K7 * k9A < -0.01) continue;
            const gas = calcGasConsumption(k10A, 0, d5A, 0, k9A, 0, d5A, days);
            if (gas.mmscfd > maxGas + 0.01) continue;
            
            const k8 = K7 * k9A;
            const k11 = k10A - k8;
            const vcAmmA = vc.ammA;
            const vcUrea = vc.ureaA;
            const contributionAmmA = (ammPrice - vcAmmA) * k11;
            const contributionMeth = (methPrice - vc.meth) * d5A;
            const contributionUrea = (ureaPrice - vcUrea) * k9A;
            const profitA = contributionAmmA + contributionMeth + contributionUrea;
            const profit = profitA - FC;
            
            caseSolutions.push({
              y1: 1, y2: 0, d5A, e5A, k4A, d5B: 0, e5B: 0, k4B: 0, k9B: 0,
              k10A, k10B: 0, k9A, k11, d5: d5A, gas: gas.mmscfd, profit,
              vcAmm: vcAmmA, vcMeth: vc.meth, vcUrea
            });
          }
        }
      } else {
        const d5BMax = Math.min(Math.floor(r13 - 1), mxM_mo);
        if (d5BMax < 1) continue;
        const k4B = mxA_mo;
        const k10B = k4B - CAPB;
        if (k10B < 1) continue;
        const c33B = C33_COEFF * k10B;
        
        for (let d5BIdx = 0; d5BIdx <= 15; d5BIdx++) {
          const d5B = Math.max(1, 1 + (d5BMax - 1) * d5BIdx / 15);
          for (let e5BIdx = 0; e5BIdx <= 10; e5BIdx++) {
            const e5B = (mxU_mo * e5BIdx) / 10;
            const k9B = Math.min(e5B, c33B);
            if (k9B < 1) continue;
            const k8 = K7 * k9B;
            const k11 = k10B - k8;
            if (k11 < -0.01) continue;
            const gas = calcGasConsumption(0, k10B, 0, d5B, 0, k9B, d5B, days);
            if (gas.mmscfd > maxGas + 0.01) continue;
            
            const vcAmmB = vc.ammA + VC_AMM_PENALTY_B;
            const vcUreaB = vc.ureaA + VC_UREA_PENALTY_B;
            const contributionAmmB = (ammPrice - vcAmmB) * k11;
            const contributionMeth = (methPrice - vc.meth) * d5B;
            const contributionUrea = (ureaPrice - vcUreaB) * k9B;
            const profitB = contributionAmmB + contributionMeth + contributionUrea;
            const profit = profitB - FC;
            
            caseSolutions.push({
              y1: 0, y2: y2_val, d5A: 0, e5A: 0, k4A: 0, d5B, e5B, k4B, k9B,
              k10A: 0, k10B, k9A: 0, k11, d5: d5B, gas: gas.mmscfd, profit,
              vcAmm: vcAmmB, vcMeth: vc.meth, vcUrea: vcUreaB
            });
          }
        }
      }
      
      for (let sol of caseSolutions) {
        if (sol.profit > bestProfit) {
          bestProfit = sol.profit;
          bestSolution = { ...sol, caseId: sol.y1 === 1 ? 'A' : 'B' };
        }
      }
    }
  }
  
  return bestSolution || {
    caseId: 'X', d5A: 0, e5A: 0, k4A: 0, d5B: 0, e5B: 0, k4B: 0, k9B: 0,
    k10A: 0, k10B: 0, k9A: 0, k11: 0, d5: 0, gas: 0, profit: -1e9,
    vcAmm: 0, vcMeth: 0, vcUrea: 0, y1: -1
  };
}

const ff = (n, d = 0) => n == null ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fM = n => n == null ? '—' : `$${(n / 1e6).toFixed(2)}M`;
const mn = { fontFamily: "'JetBrains Mono',monospace" };
const tb = { background: 'rgba(10,15,30,0.96)', border: '1px solid rgba(100,120,150,0.25)', borderRadius: 10, padding: '12px 16px', fontFamily: "'DM Sans',sans-serif", fontSize: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.5)', minWidth: 200 };
const lb = { fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 700 };

function NI({ l, v, s, u, c, step = 1 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={lb}>{l}</label>
      <div style={{ position: 'relative' }}>
        <input type="number" value={v} step={step} onChange={e => s(+e.target.value)} style={{ width: '100%', background: 'rgba(8,12,20,0.8)', border: `1px solid ${c}25`, borderRadius: 8, color: '#e2e8f0', padding: '8px 58px 8px 10px', fontSize: 14, ...mn, fontWeight: 500, outline: 'none', boxSizing: 'border-box' }} onFocus={e => e.target.style.borderColor = c + '80'} onBlur={e => e.target.style.borderColor = c + '25'} />
        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#475569', ...mn, pointerEvents: 'none' }}>{u}</span>
      </div>
    </div>
  );
}

function KPI({ t, v, s, co, b }) {
  return (
    <div style={{ background: 'rgba(15,23,42,0.4)', borderRadius: 12, border: '1px solid rgba(100,120,150,0.06)', padding: b ? '16px 20px' : '12px 16px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: co, opacity: 0.6 }} />
      <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 700, marginBottom: 5 }}>{t}</div>
      <div style={{ fontSize: b ? 20 : 17, fontWeight: 800, color: co, ...mn, marginBottom: 2 }}>{v}</div>
      <div style={{ fontSize: 11, color: '#475569' }}>{s}</div>
    </div>
  );
}

function Cd({ t, children }) {
  return (
    <div style={{ background: 'rgba(15,23,42,0.35)', borderRadius: 14, border: '1px solid rgba(100,120,150,0.06)', padding: '16px 18px', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ width: 3, height: 14, background: '#3b82f6', borderRadius: 2 }} />
        <h3 style={{ fontSize: 13, fontWeight: 600, margin: 0, color: '#94a3b8' }}>{t}</h3>
      </div>
      {children}
    </div>
  );
}

export default function Dashboard() {
  const [aP, saP] = useState(325);
  const [mP, smP] = useState(80);
  const [uP, suP] = useState(400);
  const [gP, sgP] = useState(5);
  const [mxA, smxA] = useState(1320);
  const [mxM, smxM] = useState(1250);
  const [mxU, smxU] = useState(2150);
  const [mxG, smxG] = useState(128);
  const [mi, smi] = useState(4);
  const [tab, stab] = useState('optimizer');
  
  const days = DAYS_IN_MONTH[mi];
  
  const res = useMemo(() => {
    return solveMILP(aP, mP, uP, gP, mxA, mxM, mxU, mxG, days);
  }, [aP, mP, uP, gP, mxA, mxM, mxU, mxG, days]);
  
  const sd = useMemo(() => {
    const data = [];
    for (let mp = 0; mp <= 350; mp += 10) {
      const r = solveMILP(aP, mp, uP, gP, mxA, mxM, mxU, mxG, days);
      data.push({ mp, profit: r.profit / 1e6, caseId: r.caseId });
    }
    return { data };
  }, [aP, uP, gP, mxA, mxM, mxU, mxG, days]);

  const pc = res.profit >= 0 ? '#22c55e' : '#ef4444';
  const k11 = res.k11 || 0;
  const rA = k11 * aP;
  const rMt = res.d5 * mP;
  const rU = res.k9A || res.k9B || 0;
  const rUTotal = rU * uP;
  const vcA = k11 * res.vcAmm;
  const vcM = res.d5 * res.vcMeth;
  const vcU = rU * res.vcUrea;
  const vcT = vcA + vcM + vcU;

  return (
    <div style={{ minHeight: '100vh', background: '#080c14', color: '#e2e8f0', fontFamily: "'DM Sans',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <header style={{ background: 'linear-gradient(90deg,rgba(34,197,94,0.05),rgba(59,130,246,0.05),rgba(249,115,22,0.05))', borderBottom: '1px solid rgba(100,120,150,0.1)', padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg,#22c55e,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: '#080c14' }}>LP</div>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 4, color: '#475569', textTransform: 'uppercase', fontWeight: 600 }}>GPIC Complex</div>
            <h1 style={{ fontSize: 21, fontWeight: 700, margin: 0, color: '#f1f5f9' }}>LP Optimizer</h1>
            <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>Case: <span style={{ ...mn, color: res.caseId === 'A' ? '#22c55e' : res.caseId === 'B' ? '#f97316' : '#ef4444', fontWeight: 700 }}>{res.caseId === 'A' ? 'A' : res.caseId === 'B' ? 'B' : '?'}</span></div>
          </div>
        </div>
      </header>

      <div style={{ padding: '18px 28px', maxWidth: 1440, margin: '0 auto' }}>
        <div style={{ background: 'rgba(15,23,42,0.5)', borderRadius: 14, border: '1px solid rgba(100,120,150,0.08)', padding: '18px 22px', marginBottom: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 10 }}>
            <NI l="Ammonia $/MT" v={aP} s={saP} u="$" c="#f59e0b" /><NI l="Methanol $/MT" v={mP} s={smP} u="$" c="#a855f7" /><NI l="Urea $/MT" v={uP} s={suP} u="$" c="#22c55e" /><NI l="Gas $/MMBTU" v={gP} s={sgP} u="$" c="#ef4444" step={0.25} />
            <NI l="Max Amm MT/D" v={mxA} s={smxA} u="" c="#f59e0b" /><NI l="Max Meth MT/D" v={mxM} s={smxM} u="" c="#a855f7" /><NI l="Max Urea MT/D" v={mxU} s={smxU} u="" c="#22c55e" /><NI l="Max Gas MMSCFD" v={mxG} s={smxG} u="" c="#ef4444" />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12, marginBottom: 18 }}>
          <KPI t="Net Profit" v={fM(res.profit)} s={`${MONTH_NAMES[mi]}`} co={pc} b />
          <KPI t="Ammonia" v={`${ff(k11, 0)} MT`} s={`${ff(k11 / days, 1)} MT/D`} co="#f59e0b" />
          <KPI t="Methanol" v={`${ff(res.d5, 0)} MT`} s={`${ff(res.d5 / days, 1)} MT/D`} co="#a855f7" />
          <KPI t="Urea" v={`${ff(rU, 0)} MT`} s={`${ff(rU / days, 1)} MT/D`} co="#22c55e" />
          <KPI t="Gas" v={`${ff(res.gas, 2)} MMSCFD`} s={`${((res.gas / mxG) * 100).toFixed(0)}%`} co="#ef4444" />
        </div>

        <Cd t="Variable Costs & Revenues (All 3 Products)">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12 }}>
            <div style={{ background: 'rgba(245, 158, 11, 0.08)', borderRadius: 10, padding: 14, border: '1px solid rgba(245, 158, 11, 0.2)' }}>
              <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, marginBottom: 10 }}>AMMONIA</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12 }}>
                <div><span style={{ color: '#64748b' }}>VC/MT:</span><div style={{ ...mn, color: '#f59e0b', fontWeight: 700 }}>${ff(res.vcAmm, 1)}</div></div>
                <div><span style={{ color: '#64748b' }}>Total:</span><div style={{ ...mn, color: '#f59e0b', fontWeight: 700 }}>{fM(vcA)}</div></div>
                <div><span style={{ color: '#64748b' }}>Volume:</span><div style={{ ...mn, color: '#fbbf24', fontWeight: 700 }}>{ff(k11, 0)} MT</div></div>
                <div><span style={{ color: '#64748b' }}>CM/MT:</span><div style={{ ...mn, color: aP - res.vcAmm >= 0 ? '#22c55e' : '#ef4444' }}>${ff(aP - res.vcAmm, 1)}</div></div>
              </div>
            </div>
            <div style={{ background: 'rgba(168, 85, 247, 0.08)', borderRadius: 10, padding: 14, border: '1px solid rgba(168, 85, 247, 0.2)' }}>
              <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, marginBottom: 10 }}>METHANOL</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12 }}>
                <div><span style={{ color: '#64748b' }}>VC/MT:</span><div style={{ ...mn, color: '#a855f7', fontWeight: 700 }}>${ff(res.vcMeth, 1)}</div></div>
                <div><span style={{ color: '#64748b' }}>Total:</span><div style={{ ...mn, color: '#a855f7', fontWeight: 700 }}>{fM(vcM)}</div></div>
                <div><span style={{ color: '#64748b' }}>Volume:</span><div style={{ ...mn, color: '#c084fc', fontWeight: 700 }}>{ff(res.d5, 0)} MT</div></div>
                <div><span style={{ color: '#64748b' }}>CM/MT:</span><div style={{ ...mn, color: mP - res.vcMeth >= 0 ? '#22c55e' : '#ef4444' }}>${ff(mP - res.vcMeth, 1)}</div></div>
              </div>
            </div>
            <div style={{ background: 'rgba(34, 197, 94, 0.08)', borderRadius: 10, padding: 14, border: '1px solid rgba(34, 197, 94, 0.2)' }}>
              <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, marginBottom: 10 }}>UREA</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12 }}>
                <div><span style={{ color: '#64748b' }}>VC/MT:</span><div style={{ ...mn, color: '#22c55e', fontWeight: 700 }}>${ff(res.vcUrea, 1)}</div></div>
                <div><span style={{ color: '#64748b' }}>Total:</span><div style={{ ...mn, color: '#22c55e', fontWeight: 700 }}>{fM(vcU)}</div></div>
                <div><span style={{ color: '#64748b' }}>Volume:</span><div style={{ ...mn, color: '#4ade80', fontWeight: 700 }}>{ff(rU, 0)} MT</div></div>
                <div><span style={{ color: '#64748b' }}>CM/MT:</span><div style={{ ...mn, color: uP - res.vcUrea >= 0 ? '#22c55e' : '#ef4444' }}>${ff(uP - res.vcUrea, 1)}</div></div>
              </div>
            </div>
          </div>
        </Cd>

        <div style={{ marginTop: 24, paddingTop: 10, borderTop: '1px solid rgba(100,120,150,0.06)', textAlign: 'center', fontSize: 9, color: '#334155' }}>GPIC LP Optimizer • 26 Constraints • Case A/B Auto-Selection • Monthly Basis</div>
      </div>
    </div>
  );
}
