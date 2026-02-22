import { useState, useMemo } from "react";
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  BarChart,
  Bar,
  Cell,
  ComposedChart,
} from "recharts";

/*
 ╔══════════════════════════════════════════════════════════════════════╗
 ║  GPIC COMPLEX PROFITABILITY — LP OPTIMIZER DASHBOARD                ║
 ║  Mirrors Excel LP Solver sheet exactly:                             ║
 ║  • Case A: D5 ≥ R13  (high methanol, SGC_amm = 903.61)             ║
 ║  • Case B: D5 < R13  (low methanol, SGC_amm = 1015.6794)           ║
 ║  • Boiler: 110.0465·D5 + 237.3583·K10 + 104.1689·K9                ║
 ║  • K10_A = K4_A − 4247·y1 + 0.1092174534·D5_A                      ║
 ║  • K10_B = K4_B − 5580·(1−y1)                                       ║
 ║  • Gas MMSCFD = totalNm3 × 37.325 / (1e6 × days)                   ║
 ╚══════════════════════════════════════════════════════════════════════╝
*/

// ═══ EXACT MODEL CONSTANTS (from LP Solver formulas) ═══
const M = {
  K7: 0.57,
  alpha: 0.1092174534,
  C33c: 1.660263,
  capA: 4247,
  capB: 5580,
  vcPen: 15,
  sgcAA: 903.61,
  sgcAB: 1015.6794,
  sgcM: 1153.1574,
  bM: 110.0465,
  bA: 237.3583,
  bU: 104.1689,
  GT: 5053000,
  FL: 424700,
  GC: 37.325,
  vaG: 184.293,
  vaF: 14.311,
  vmG: 198.047,
  vmF: 7.302,
  vuG: 124.72,
  vuF: 21.594,
  fcA: 2247735.682,
  fcM: 2327405.71,
  fcU: 3703933.724,
};
M.FC = M.fcA + M.fcM + M.fcU;

const O12 = 35542.641876;
const D42v = 369.7307280012251;
const C8v = 682.0557491289198;

function getR13(days) {
  return (O12 * 24 / M.sgcM) * days;
}
function getD33t(maxU, days) {
  return (maxU * days * D42v) / (C8v * 0.9);
}

function getVC(gp) {
  const r = gp / 5;
  return {
    aA: M.vaF + M.vaG * r,
    aB: M.vaF + M.vaG * r + M.vcPen,
    m: M.vmF + M.vmG * r,
    uA: M.vuF + M.vuG * r,
    uB: M.vuF + M.vuG * r + M.K7 * M.vcPen,
  };
}

function gas(K10A, K10B, D5A, D5B, K9A, K9B, D5t, days) {
  const d94 = M.sgcAA * K10A;
  const d95 = M.sgcAB * K10B;
  const d96 = M.sgcM * D5t;

  const d98 = M.bM * D5A + M.bA * K10A + M.bU * K9A;
  const d99 = M.bM * D5B + M.bA * K10B + M.bU * K9B;

  const tot = d94 + d95 + d96 + M.GT + d98 + d99 + M.FL;

  // mm = MMSCFD, st = steam T/h
  return {
    tot,
    mm: (tot * M.GC) / (1e6 * days),
    st: (d98 + d99) / 105 / days / 24,
  };
}

function solve(aP, mP, uP, gP, mxA, mxM, mxU, mxG, days) {
  const v = getVC(gP);
  const K1 = days;
  const R13 = getR13(K1);
  const D33t = getD33t(mxU, K1);

  const mD5 = mxM * K1;
  const mE5 = mxU * K1;
  const mK4 = mxA * K1;

  let best = null;

  function tryIt(ct, y1, D5A, D5B, K4A, K4B, K10A, K10B, K9A, K9B) {
    const K10 = K10A + K10B;
    const K9 = K9A + K9B;
    const K8 = M.K7 * K9;
    const K11 = K10 - K8;
    if (K11 < 0) return;

    const D5 = D5A + D5B;

    const g = gas(K10A, K10B, D5A, D5B, K9A, K9B, D5, K1);
    if (g.mm > mxG + 0.001) return;

    // Exact Excel-style objective (kept explicit like code #1):
    // Profit_A = (P_amm - VC_amm_A)*(K10_A - K7*K9_A) + (P_meth - VC_meth)*D5_A + (P_urea - VC_urea_A)*K9_A
    // Profit_B = (P_amm - VC_amm_B)*(K10_B - K7*K9_B) + (P_meth - VC_meth)*D5_B + (P_urea - VC_urea_B)*K9_B
    const profA =
      (aP - v.aA) * (K10A - M.K7 * K9A) + (mP - v.m) * D5A + (uP - v.uA) * K9A;
    const profB =
      (aP - v.aB) * (K10B - M.K7 * K9B) + (mP - v.m) * D5B + (uP - v.uB) * K9B;

    const profit = profA + profB - M.FC;

    if (!best || profit > best.profit) {
      best = {
        ct,
        y1,

        // decisions (monthly totals)
        D5A,
        D5B,
        K4A,
        K4B,
        K10A,
        K10B,
        K9A,
        K9B,

        // totals
        K10,
        K9,
        K8,
        K11,
        D5,
        K4: K4A + K4B,

        // utilities
        gas: g.mm,
        gTot: g.tot,
        st: g.st,

        // aliases for code #1 compatibility
        gasTot: g.tot,
        steam: g.st,

        // economics
        profit,

        // daily rates
        dA: K10 / K1,
        dM: D5 / K1,
        dU: K9 / K1,

        // VCs (respecting case)
        va: y1 ? v.aA : v.aB,
        vm: v.m,
        vu: y1 ? v.uA : v.uB,
      };
    }
  }

  // Case A: y1=1, D5 >= R13
  {
    const K4A = mK4;
    const E5A = mE5;
    const K9A = E5A;

    for (let i = 0; i <= 300; i++) {
      const D5A = R13 + ((mD5 - R13) * i) / 300;
      const K10A = K4A - M.capA + M.alpha * D5A;
      tryIt("A", 1, D5A, 0, K4A, 0, K10A, 0, K9A, 0);
    }
  }

  // Case B: y1=0, D5 < R13
  {
    const K4B = mK4;
    const E5B = mE5;
    const K10B = K4B - M.capB;

    if (K10B >= 1) {
      const C33B = M.C33c * K10B;
      const K9B = K10B <= D33t ? E5B : Math.min(E5B, C33B);

      const mxDB = Math.min(Math.floor(R13 - 1), mD5);
      for (let i = 0; i <= 300; i++) {
        const D5B = Math.max(1, 1 + ((mxDB - 1) * i) / 300);
        tryIt(K10B <= D33t ? "B1" : "B2", 0, 0, D5B, 0, K4B, 0, K10B, 0, K9B);
      }
    }
  }

  if (!best) {
    return {
      ct: "X",
      y1: 0,
      profit: 0,
      D5: 0,
      K10: 0,
      K9: 0,
      K8: 0,
      K11: 0,
      K4: 0,
      gas: 0,
      gTot: 0,
      gasTot: 0,
      st: 0,
      steam: 0,
      dA: 0,
      dM: 0,
      dU: 0,
      va: v.aA,
      vm: v.m,
      vu: v.uA,
      D5A: 0,
      D5B: 0,
      K4A: 0,
      K4B: 0,
      K10A: 0,
      K10B: 0,
      K9A: 0,
      K9B: 0,
    };
  }

  return best;
}

function shutdownAnalysis(aP, uP, gP, mxA, mxM, mxU, mxG, days) {
  const v = getVC(gP);
  const K1 = days;
  const mK4 = mxA * K1;
  const mE5 = mxU * K1;
  const D33t = getD33t(mxU, K1);

  const K10s = mK4 - M.capB;
  const C33s = M.C33c * K10s;
  const K9s = K10s <= D33t ? mE5 : Math.min(mE5, C33s);
  const K11s = K10s - M.K7 * K9s;

  const sp = (aP - v.aB) * K11s + (uP - v.uB) * K9s - M.FC;

  const data = [];
  let cross = null;
  let pd = null;

  for (let mp = 0; mp <= 350; mp += 5) {
    const r = solve(aP, mp, uP, gP, mxA, mxM, mxU, mxG, days);
    const d = r.profit - sp;

    // Match code #1's crossing logic (threshold = 500)
    if (pd !== null && pd <= 500 && d > 500 && cross === null) {
      cross = mp - 5 + (5 * (500 - pd)) / (d - pd);
    }
    pd = d;

    data.push({ mp, run: r.profit / 1e6, shut: sp / 1e6 });
  }

  return { data, cross, vcM: v.m, sp };
}

// Alias for code #1 naming
const shutData = shutdownAnalysis;

// ═══ HELPERS ═══
const MO = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MD = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const ff = (n, d = 0) =>
  n == null
    ? "—"
    : Number(n).toLocaleString("en-US", {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      });
const fM = (n) => (n == null ? "—" : `$${(n / 1e6).toFixed(2)}M`);

const mn = { fontFamily: "'JetBrains Mono',monospace" };
const tb = {
  background: "rgba(10,15,30,0.96)",
  border: "1px solid rgba(100,120,150,0.25)",
  borderRadius: 10,
  padding: "12px 16px",
  fontFamily: "'DM Sans',sans-serif",
  fontSize: 12,
  boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
  minWidth: 200,
};
const lb = {
  fontSize: 10,
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: 1.5,
  fontWeight: 700,
};

// ═══ SUB COMPONENTS ═══
function NI({ l, v, s, u, c, step = 1 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={lb}>{l}</label>
      <div style={{ position: "relative" }}>
        <input
          type="number"
          value={v}
          step={step}
          onChange={(e) => s(+e.target.value)}
          style={{
            width: "100%",
            background: "rgba(8,12,20,0.8)",
            border: `1px solid ${c}25`,
            borderRadius: 8,
            color: "#e2e8f0",
            padding: "8px 58px 8px 10px",
            fontSize: 14,
            ...mn,
            fontWeight: 500,
            outline: "none",
            boxSizing: "border-box",
          }}
          onFocus={(e) => (e.target.style.borderColor = c + "80")}
          onBlur={(e) => (e.target.style.borderColor = c + "25")}
        />
        <span
          style={{
            position: "absolute",
            right: 10,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: 10,
            color: "#475569",
            ...mn,
            pointerEvents: "none",
          }}
        >
          {u}
        </span>
      </div>
    </div>
  );
}

function KPI({ t, v, s, co, b }) {
  return (
    <div
      style={{
        background: "rgba(15,23,42,0.4)",
        borderRadius: 12,
        border: "1px solid rgba(100,120,150,0.06)",
        padding: b ? "16px 20px" : "12px 16px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: co,
          opacity: 0.6,
        }}
      />
      <div
        style={{
          fontSize: 10,
          color: "#475569",
          textTransform: "uppercase",
          letterSpacing: 1.5,
          fontWeight: 700,
          marginBottom: 5,
        }}
      >
        {t}
      </div>
      <div
        style={{
          fontSize: b ? 20 : 17,
          fontWeight: 800,
          color: co,
          ...mn,
          marginBottom: 2,
        }}
      >
        {v}
      </div>
      <div style={{ fontSize: 11, color: "#475569" }}>{s}</div>
    </div>
  );
}

function Cd({ t, children }) {
  return (
    <div
      style={{
        background: "rgba(15,23,42,0.35)",
        borderRadius: 14,
        border: "1px solid rgba(100,120,150,0.06)",
        padding: "16px 18px",
        marginBottom: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ width: 3, height: 14, background: "#3b82f6", borderRadius: 2 }} />
        <h3 style={{ fontSize: 13, fontWeight: 600, margin: 0, color: "#94a3b8" }}>{t}</h3>
      </div>
      {children}
    </div>
  );
}

function Leg({ c, l, solid, dash, dot }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {solid && <div style={{ width: 20, height: 3, background: c, borderRadius: 2 }} />}
      {dash && <div style={{ width: 20, height: 0, borderTop: `2px dashed ${c}` }} />}
      {dot && <div style={{ width: 7, height: 7, background: c, borderRadius: "50%" }} />}
      <span style={{ fontSize: 11, color: "#94a3b8" }}>{l}</span>
    </div>
  );
}

const STip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const ru = payload.find((p) => p.dataKey === "run");
  const sh = payload.find((p) => p.dataKey === "shut");
  const d = ru && sh ? ru.value - sh.value : 0;

  return (
    <div style={tb}>
      <div
        style={{
          color: "#94a3b8",
          marginBottom: 8,
          fontWeight: 600,
          borderBottom: "1px solid rgba(100,120,150,0.15)",
          paddingBottom: 6,
        }}
      >
        Methanol: ${label}/MT
      </div>
      {ru && (
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ color: "#22c55e" }}>● Running</span>
          <span style={{ ...mn, color: "#22c55e" }}>${ru.value.toFixed(2)}M</span>
        </div>
      )}
      {sh && (
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ color: "#f97316" }}>● Shutdown</span>
          <span style={{ ...mn, color: "#f97316" }}>${sh.value.toFixed(2)}M</span>
        </div>
      )}
      <div
        style={{
          borderTop: "1px solid rgba(100,120,150,0.15)",
          paddingTop: 6,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span style={{ color: "#cbd5e1", fontWeight: 600 }}>Δ</span>
        <span style={{ ...mn, color: d > 0.01 ? "#22c55e" : d < -0.01 ? "#ef4444" : "#fbbf24" }}>
          {d > 0 ? "+" : ""}
          {d.toFixed(3)}M
        </span>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════
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
  const [tab, stab] = useState("optimizer");
  const days = MD[mi];

  const res = useMemo(
    () => solve(aP, mP, uP, gP, mxA, mxM, mxU, mxG, days),
    [aP, mP, uP, gP, mxA, mxM, mxU, mxG, days]
  );

  const sd = useMemo(
    () => shutdownAnalysis(aP, uP, gP, mxA, mxM, mxU, mxG, days),
    [aP, uP, gP, mxA, mxM, mxU, mxG, days]
  );

  const gs = useMemo(() => {
    const d = [];
    for (let g = 0.5; g <= 10; g += 0.25) {
      d.push({ g, p: solve(aP, mP, uP, g, mxA, mxM, mxU, mxG, days).profit / 1e6 });
    }
    return d;
  }, [aP, mP, uP, mxA, mxM, mxU, mxG, days]);

  const pc = res.profit >= 0 ? "#22c55e" : "#ef4444";
  const rA = res.K11 * aP;
  const rMet = res.D5 * mP;
  const rU = res.K9 * uP;
  const vcT = res.K11 * res.va + res.D5 * res.vm + res.K9 * res.vu;

  return (
    <div style={{ minHeight: "100vh", background: "#080c14", color: "#e2e8f0", fontFamily: "'DM Sans',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* HEADER */}
      <header
        style={{
          background: "linear-gradient(90deg,rgba(34,197,94,0.05),rgba(59,130,246,0.05),rgba(249,115,22,0.05))",
          borderBottom: "1px solid rgba(100,120,150,0.1)",
          padding: "16px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: "linear-gradient(135deg,#22c55e,#3b82f6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              fontWeight: 800,
              color: "#080c14",
            }}
          >
            LP
          </div>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 4, color: "#475569", textTransform: "uppercase", fontWeight: 600 }}>
              GPIC Complex Profitability
            </div>
            <h1 style={{ fontSize: 21, fontWeight: 700, margin: 0, color: "#f1f5f9" }}>LP Optimizer Dashboard</h1>
          </div>
        </div>

        <div style={{ display: "flex", gap: 4, background: "rgba(15,23,42,0.6)", borderRadius: 10, padding: 3, border: "1px solid rgba(100,120,150,0.1)" }}>
          {[{ id: "optimizer", l: "⚡ Optimizer" }, { id: "shutdown", l: "🏭 MeOH Shutdown" }, { id: "sensitivity", l: "📊 Gas Sensitivity" }].map((t) => (
            <button
              key={t.id}
              onClick={() => stab(t.id)}
              style={{
                padding: "7px 14px",
                borderRadius: 7,
                border: "none",
                background: tab === t.id ? "rgba(59,130,246,0.2)" : "transparent",
                color: tab === t.id ? "#60a5fa" : "#64748b",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {t.l}
            </button>
          ))}
        </div>
      </header>

      <div style={{ padding: "18px 28px", maxWidth: 1440, margin: "0 auto" }}>
        {/* INPUTS */}
        <div style={{ background: "rgba(15,23,42,0.5)", borderRadius: 14, border: "1px solid rgba(100,120,150,0.08)", padding: "18px 22px", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ width: 3, height: 18, background: "linear-gradient(180deg,#3b82f6,#22c55e)", borderRadius: 2 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>Market Inputs & Plant Parameters</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: 10 }}>
            <NI l="Ammonia Price" v={aP} s={saP} u="$/MT" c="#f59e0b" />
            <NI l="Methanol Price" v={mP} s={smP} u="$/MT" c="#a855f7" />
            <NI l="Urea Price" v={uP} s={suP} u="$/MT" c="#22c55e" />
            <NI l="Natural Gas" v={gP} s={sgP} u="$/MMBTU" c="#ef4444" step={0.25} />
            <NI l="Max Ammonia" v={mxA} s={smxA} u="MT/D" c="#f59e0b" />
            <NI l="Max Methanol" v={mxM} s={smxM} u="MT/D" c="#a855f7" />
            <NI l="Max Urea" v={mxU} s={smxU} u="MT/D" c="#22c55e" />
            <NI l="Max Gas" v={mxG} s={smxG} u="MMSCFD" c="#ef4444" />

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={lb}>Month ({days}d)</label>
              <select
                value={mi}
                onChange={(e) => smi(+e.target.value)}
                style={{
                  background: "rgba(8,12,20,0.8)",
                  border: "1px solid rgba(100,120,150,0.15)",
                  borderRadius: 8,
                  color: "#e2e8f0",
                  padding: "8px 10px",
                  fontSize: 13,
                  fontFamily: "inherit",
                  outline: "none",
                }}
              >
                {MO.map((m, i) => (
                  <option key={i} value={i}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ═══ OPTIMIZER TAB ═══ */}
        {tab === "optimizer" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 12, marginBottom: 18 }}>
              <KPI t="Net Monthly Profit" v={fM(res.profit)} s={`Case ${res.ct} • ${MO[mi]}`} co={pc} b />
              <KPI t="Ammonia" v={`${ff(res.dA, 1)} MT/D`} s={`${ff(res.K11, 0)} MT saleable`} co="#f59e0b" />
              <KPI t="Methanol" v={`${ff(res.dM, 1)} MT/D`} s={`${ff(res.D5, 0)} MT total`} co="#a855f7" />
              <KPI t="Urea" v={`${ff(res.dU, 1)} MT/D`} s={`${ff(res.K9, 0)} MT saleable`} co="#22c55e" />
              <KPI t="Gas Consumption" v={`${ff(res.gas, 2)} MMSCFD`} s={`${((res.gas / mxG) * 100).toFixed(1)}% of ${mxG}`} co="#ef4444" />
              <KPI t="Boiler Steam" v={`${ff(res.st, 1)} T/h`} s="HP steam production" co="#06b6d4" />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
              <Cd t="Daily Production vs Capacity">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={[
                      { n: "Ammonia", p: res.dA, c: mxA },
                      { n: "Methanol", p: res.dM, c: mxM },
                      { n: "Urea", p: res.dU, c: mxU },
                    ]}
                    layout="vertical"
                    margin={{ left: 10, right: 25, top: 5, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,120,150,0.06)" />
                    <XAxis type="number" tick={{ fill: "#475569", fontSize: 11 }} />
                    <YAxis dataKey="n" type="category" tick={{ fill: "#94a3b8", fontSize: 12, fontWeight: 500 }} width={72} />
                    <Tooltip
                      content={({ active, payload }) =>
                        active && payload?.[0] ? (
                          <div style={tb}>
                            <div style={{ color: "#e2e8f0", fontWeight: 600, marginBottom: 3 }}>{payload[0].payload.n}</div>
                            <div style={{ color: "#60a5fa" }}>Prod: {ff(payload[0].payload.p, 1)} MT/D</div>
                            <div style={{ color: "#475569" }}>Cap: {ff(payload[0].payload.c)} MT/D</div>
                            <div style={{ color: "#fbbf24" }}>Util: {((payload[0].payload.p / payload[0].payload.c) * 100).toFixed(1)}%</div>
                          </div>
                        ) : null
                      }
                    />
                    <Bar dataKey="c" radius={[0, 4, 4, 0]} barSize={22} fill="rgba(100,120,150,0.1)" />
                    <Bar dataKey="p" radius={[0, 6, 6, 0]} barSize={22}>
                      <Cell fill="#f59e0b" />
                      <Cell fill="#a855f7" />
                      <Cell fill="#22c55e" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Cd>

              <Cd t="Revenue & Cost Breakdown">
                <div style={{ padding: "6px 4px" }}>
                  {[
                    { l: "Urea Revenue", v: rU, c: "#22c55e" },
                    { l: "Ammonia Revenue", v: rA, c: "#f59e0b" },
                    { l: "Methanol Revenue", v: rMet, c: "#a855f7" },
                    { l: "Variable Costs", v: -vcT, c: "#f87171" },
                    { l: "Fixed Costs", v: -M.FC, c: "#ef4444" },
                  ].map((x, i) => {
                    const mx = Math.max(rU, vcT, M.FC);
                    return (
                      <div key={i} style={{ marginBottom: 11 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2, fontSize: 12 }}>
                          <span style={{ color: "#94a3b8" }}>{x.l}</span>
                          <span style={{ ...mn, color: x.c, fontSize: 12 }}>
                            {x.v >= 0 ? "+" : ""}
                            {fM(x.v)}
                          </span>
                        </div>
                        <div style={{ height: 5, background: "rgba(100,120,150,0.08)", borderRadius: 3, overflow: "hidden" }}>
                          <div
                            style={{
                              width: `${Math.min((Math.abs(x.v) / mx) * 100, 100)}%`,
                              height: "100%",
                              background: x.c,
                              borderRadius: 3,
                              opacity: 0.7,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}

                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(100,120,150,0.12)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 700, color: "#cbd5e1", fontSize: 13 }}>Net Profit</span>
                    <span style={{ fontWeight: 800, color: pc, ...mn, fontSize: 18 }}>{fM(res.profit)}</span>
                  </div>
                </div>
              </Cd>
            </div>

            <Cd t="Variable Costs & Contribution Margins">
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(100,120,150,0.12)" }}>
                    {["Product", "VC ($/MT)", "Price", "CM", "Volume", "Contribution"].map((h, i) => (
                      <th
                        key={i}
                        style={{
                          padding: "7px 10px",
                          textAlign: i ? "right" : "left",
                          color: "#475569",
                          fontWeight: 700,
                          fontSize: 10,
                          textTransform: "uppercase",
                          letterSpacing: 1,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { n: "Ammonia (saleable)", vc: res.va, p: aP, vol: res.K11, c: "#f59e0b" },
                    { n: "Methanol", vc: res.vm, p: mP, vol: res.D5, c: "#a855f7" },
                    { n: "Urea", vc: res.vu, p: uP, vol: res.K9, c: "#22c55e" },
                  ].map((x, i) => {
                    const cm = x.p - x.vc;
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid rgba(100,120,150,0.05)" }}>
                        <td style={{ padding: "8px 10px", color: x.c, fontWeight: 600 }}>{x.n}</td>
                        <td style={{ ...mn, textAlign: "right", padding: "8px 10px" }}>${ff(x.vc, 2)}</td>
                        <td style={{ ...mn, textAlign: "right", padding: "8px 10px" }}>${ff(x.p, 2)}</td>
                        <td style={{ ...mn, textAlign: "right", padding: "8px 10px", color: cm >= 0 ? "#22c55e" : "#ef4444" }}>${ff(cm, 2)}</td>
                        <td style={{ ...mn, textAlign: "right", padding: "8px 10px" }}>{ff(x.vol, 0)}</td>
                        <td style={{ ...mn, textAlign: "right", padding: "8px 10px", color: cm * x.vol >= 0 ? "#22c55e" : "#ef4444" }}>{fM(cm * x.vol)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Cd>

            <Cd t="Model Verification (compare with Excel LP Solver)">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 6, fontSize: 12, color: "#64748b" }}>
                <div>R13 (MeOH threshold): <span style={mn}>{ff(getR13(days), 2)}</span></div>
                <div>K10 (NH₃ production): <span style={mn}>{ff(res.K10, 2)}</span></div>
                <div>K9 (Urea saleable): <span style={mn}>{ff(res.K9, 2)}</span></div>
                <div>K8 (NH₃→Urea): <span style={mn}>{ff(res.K8, 2)}</span></div>
                <div>K11 (NH₃ saleable): <span style={mn}>{ff(res.K11, 2)}</span></div>
                <div>Total gas Nm³: <span style={mn}>{ff(res.gTot, 0)}</span></div>
                <div>Case: <span style={mn}>{res.ct} (y1={res.y1})</span></div>
                <div>VC Amm: <span style={mn}>${ff(res.va, 2)}</span></div>
                <div>VC Meth: <span style={mn}>${ff(res.vm, 2)}</span></div>
                <div>VC Urea: <span style={mn}>${ff(res.vu, 2)}</span></div>
              </div>
            </Cd>
          </>
        )}

        {/* ═══ SHUTDOWN TAB ═══ */}
        {tab === "shutdown" && (
          <>
            <Cd t="GPIC Net Profit vs Price of Methanol">
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 12, padding: "0 4px" }}>
                <Leg c="#22c55e" solid l="MeOH Plant Running (Optimized)" />
                <Leg c="#f97316" solid l="MeOH Plant Shutdown" />
                <Leg c="#a855f7" dash l={`MeOH Variable Cost: $${ff(sd.vcM, 0)}/MT`} />
                {sd.cross != null && <Leg c="#fbbf24" dot l={`Shutdown Price: ~$${ff(sd.cross, 0)}/MT`} />}
              </div>

              <ResponsiveContainer width="100%" height={400}>
                <ComposedChart data={sd.data} margin={{ top: 10, right: 30, left: 15, bottom: 28 }}>
                  <defs>
                    <linearGradient id="gR" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity={0.12} />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,120,150,0.06)" />
                  <XAxis
                    dataKey="mp"
                    type="number"
                    domain={[0, 350]}
                    ticks={[0, 40, 80, 120, 160, 200, 240, 280, 320]}
                    tick={{ fill: "#475569", fontSize: 11 }}
                    label={{ value: "Price of Methanol ($/MT)", position: "bottom", fill: "#64748b", fontSize: 11, offset: 10 }}
                  />
                  <YAxis
                    tick={{ fill: "#475569", fontSize: 11 }}
                    tickFormatter={(v) => `$${v}M`}
                    label={{ value: "Net Profit ($/month)", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 11, offset: 0 }}
                  />
                  <Tooltip content={<STip />} />
                  <ReferenceLine
                    x={sd.vcM}
                    stroke="#a855f7"
                    strokeDasharray="8 4"
                    strokeWidth={2}
                    label={{ value: `$${ff(sd.vcM, 0)} VC`, position: "top", fill: "#a855f7", fontSize: 11, fontWeight: 600, offset: 8 }}
                  />
                  {sd.cross != null && <ReferenceLine x={sd.cross} stroke="#fbbf24" strokeDasharray="5 3" strokeWidth={1.5} />}
                  <Area type="monotone" dataKey="run" fill="url(#gR)" stroke="none" />
                  <Line type="monotone" dataKey="shut" stroke="#f97316" strokeWidth={3} dot={false} name="Shutdown" />
                  <Line type="monotone" dataKey="run" stroke="#22c55e" strokeWidth={3} dot={false} name="Running" />
                </ComposedChart>
              </ResponsiveContainer>
            </Cd>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 12, marginTop: 14 }}>
              <KPI t="Shutdown Decision Price" v={sd.cross != null ? `~$${ff(sd.cross, 0)}/MT` : "Always profitable"} s="Where running ≈ shutdown profit" co="#fbbf24" b />
              <KPI t="Current MeOH Price" v={`$${mP}/MT`} s={mP > (sd.cross || 0) ? "✓ Keep running" : "⚠ Consider shutdown"} co={mP > (sd.cross || 0) ? "#22c55e" : "#ef4444"} b />
              <KPI t="MeOH Variable Cost" v={`$${ff(sd.vcM, 1)}/MT`} s={`Margin: $${ff(mP - sd.vcM, 1)}/MT`} co="#a855f7" b />
              <KPI t="Running vs Shutdown Δ" v={fM(res.profit - sd.sp)} s="At current MeOH price" co={res.profit > sd.sp ? "#22c55e" : "#ef4444"} b />
            </div>

            <div style={{ background: "rgba(15,23,42,0.4)", borderRadius: 12, border: "1px solid rgba(100,120,150,0.06)", padding: "16px 20px", marginTop: 14, fontSize: 12, color: "#64748b", lineHeight: 1.8 }}>
              <div style={{ fontWeight: 700, color: "#94a3b8", marginBottom: 6, fontSize: 13 }}>Understanding the Shutdown Decision</div>
              <p style={{ margin: "0 0 6px" }}>
                The <b style={{ color: "#22c55e" }}>green line</b> shows total complex profit with methanol running (LP-optimized). The <b style={{ color: "#f97316" }}>orange line</b> shows profit with methanol shut down — including full CDR/CO₂ impact: ammonia loses {ff(M.capB, 0)} MT/mo capacity, urea becomes CO₂-limited, ammonia VC increases by ${M.vcPen}/MT.
              </p>
              <p style={{ margin: 0 }}>
                The <b style={{ color: "#a855f7" }}>purple dashed</b> marks methanol variable cost (~${ff(sd.vcM, 0)}/MT). The actual shutdown decision occurs well <b>below</b> this — at ~${sd.cross != null ? ff(sd.cross, 0) : "—"}/MT — because running methanol benefits ammonia and urea via CO₂/CDR linkage and lower specific gas consumption (903.61 vs 1015.68 Nm³/MT).
              </p>
            </div>
          </>
        )}

        {/* ═══ SENSITIVITY TAB ═══ */}
        {tab === "sensitivity" && (
          <>
            <Cd t="Profit Sensitivity to Natural Gas Price">
              <ResponsiveContainer width="100%" height={360}>
                <ComposedChart data={gs} margin={{ top: 10, right: 30, left: 15, bottom: 25 }}>
                  <defs>
                    <linearGradient id="gG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,120,150,0.06)" />
                  <XAxis dataKey="g" tick={{ fill: "#475569", fontSize: 11 }} label={{ value: "Gas Price ($/MMBTU)", position: "bottom", fill: "#64748b", fontSize: 11, offset: 8 }} />
                  <YAxis tick={{ fill: "#475569", fontSize: 11 }} tickFormatter={(v) => `$${v}M`} />
                  <Tooltip
                    content={({ active, payload, label }) =>
                      active && payload?.[0] ? (
                        <div style={tb}>
                          <div style={{ color: "#94a3b8", marginBottom: 4 }}>Gas: ${label}/MMBTU</div>
                          <div style={{ ...mn, color: payload[0].value >= 0 ? "#22c55e" : "#ef4444", fontWeight: 700 }}>
                            ${payload[0].value.toFixed(2)}M/month
                          </div>
                        </div>
                      ) : null
                    }
                  />
                  <ReferenceLine y={0} stroke="rgba(100,120,150,0.2)" />
                  <ReferenceLine x={gP} stroke="#fbbf24" strokeDasharray="5 3" strokeWidth={1.5} label={{ value: `Current $${gP}`, position: "top", fill: "#fbbf24", fontSize: 11, fontWeight: 600 }} />
                  <Area type="monotone" dataKey="p" fill="url(#gG)" stroke="none" />
                  <Line type="monotone" dataKey="p" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </Cd>

            <Cd t="Gas Price Impact Table">
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(100,120,150,0.12)" }}>
                    {["Gas $/MMBTU", "Monthly Profit", "vs Current", "VC Amm", "VC Meth", "VC Urea"].map((h, i) => (
                      <th
                        key={i}
                        style={{
                          padding: "7px 10px",
                          textAlign: i ? "right" : "left",
                          color: "#475569",
                          fontWeight: 700,
                          fontSize: 10,
                          textTransform: "uppercase",
                          letterSpacing: 1,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((g) => {
                    const r = solve(aP, mP, uP, g, mxA, mxM, mxU, mxG, days);
                    const v = getVC(g);
                    const d = r.profit - res.profit;
                    const cur = g === gP;
                    return (
                      <tr key={g} style={{ borderBottom: "1px solid rgba(100,120,150,0.05)", background: cur ? "rgba(59,130,246,0.08)" : "transparent" }}>
                        <td style={{ padding: "7px 10px", color: cur ? "#60a5fa" : "#94a3b8", fontWeight: cur ? 700 : 400 }}>
                          ${g}
                          {cur ? " ◄" : ""}
                        </td>
                        <td style={{ ...mn, textAlign: "right", padding: "7px 10px", color: r.profit >= 0 ? "#22c55e" : "#ef4444" }}>{fM(r.profit)}</td>
                        <td style={{ ...mn, textAlign: "right", padding: "7px 10px", color: d >= 0 ? "#22c55e" : "#ef4444" }}>
                          {d >= 0 ? "+" : ""}
                          {fM(d)}
                        </td>
                        <td style={{ ...mn, textAlign: "right", padding: "7px 10px" }}>${ff(v.aA, 1)}</td>
                        <td style={{ ...mn, textAlign: "right", padding: "7px 10px" }}>${ff(v.m, 1)}</td>
                        <td style={{ ...mn, textAlign: "right", padding: "7px 10px" }}>${ff(v.uA, 1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Cd>
          </>
        )}

        <div style={{ marginTop: 24, paddingTop: 10, borderTop: "1px solid rgba(100,120,150,0.06)", textAlign: "center", fontSize: 10, color: "#334155", letterSpacing: 1 }}>
          GPIC LP Profitability Optimizer • Simplex LP + Integer Constraints • Model v31
        </div>
      </div>
    </div>
  );
}
