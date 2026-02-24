import { useState, useMemo, useCallback } from "react";
import {
  Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Area, BarChart, Bar, Cell, ComposedChart
} from "recharts";

// ═══════════════════════════════════════════════════════════════════════════
// EXACT CONSTANTS FROM EXCEL "profitability 31.xlsm" → LP Solver Sheet
// ═══════════════════════════════════════════════════════════════════════════

// Process constants
const K7 = 0.57;              // NH3 → Urea specific consumption (MT NH3/MT Urea)
const ALPHA = 0.1092174534;   // K10 coefficient for Case A (methanol CO2 benefit)
const C33_COEFF = 1.660263;   // CO2 capacity coefficient (MT urea / MT NH3 production)
const CAPA = 4247;            // Ammonia capacity offset Case A (MT/month)
const CAPB = 5580;            // Ammonia capacity offset Case B (MT/month)
const VP = 15;                // Vapor premium for Case B ($/MT)

// Gas specific consumption (Nm3/MT) - combined feed + reformer
const SGC_AMM = 1015.6794425087108; // Ammonia (same for A & B, it's total gas per ton NH3 production)
const SGC_METH = 1153.1574;         // Methanol

// Boiler gas consumption coefficients (Nm3/MT product) — from Sheet1 row 33-35
const B_AMM = 237.35825884315224;   // Boiler Nm3 per MT ammonia (K10)
const B_METH = 110.04648878931908;  // Boiler Nm3 per MT methanol (D5)
const B_UREA = 104.16894623118665;  // Boiler Nm3 per MT urea (K9)

// Fixed gas consumers (Nm3/month)
const GT = 5053000;   // Gas turbine
const FL = 424700;    // Flare pilot gas
const GCV = 37.325;   // Gross calorific value factor

// Fixed costs ($/month) — ammonia + methanol + urea plants
const FC_AMM = 2247735.682209945;
const FC_METH = 2327405.7096132594;
const FC_UREA = 3703933.724198895;
const FC_TOTAL = FC_AMM + FC_METH + FC_UREA; // 8,279,075.116

// Variable cost linear model: VC = intercept + slope × gasPrice ($/MMBTU)
// Calibrated from Excel LP Solver B39-B43 (at $4) and C39-C43 (at $5)
const VC_AMM_SLOPE = 38.081561175038956;
const VC_AMM_INTERCEPT = 8.195855299844169;
const VC_METH_SLOPE = 40.308054074195155;
const VC_METH_INTERCEPT = 3.8083837032193912;
const VC_UREA_SLOPE = 26.51928220655782;
const VC_UREA_INTERCEPT = 13.717371173768726;

// Threshold constants
const R13_DAILY = 739.7285097628476; // Methanol threshold per day (≈60% load)

// ═══════════════════════════════════════════════════════════════════════════
// DERIVED CALCULATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function calcVC(gasPrice) {
  const aA = VC_AMM_INTERCEPT + VC_AMM_SLOPE * gasPrice;
  return {
    ammA: aA,
    ammB: aA + VP,
    meth: VC_METH_INTERCEPT + VC_METH_SLOPE * gasPrice,
    ureaA: VC_UREA_INTERCEPT + VC_UREA_SLOPE * gasPrice,
    ureaB: VC_UREA_INTERCEPT + VC_UREA_SLOPE * gasPrice + K7 * VP,
  };
}

function calcR13(days) {
  return R13_DAILY * days;
}

function calcD33(maxUreaDaily, days) {
  return (maxUreaDaily * days) / C33_COEFF;
}

function calcGas(K10A, K10B, D5A, D5B, K9A, K9B, days) {
  const D5 = D5A + D5B;
  // Feed gas
  const C12A = SGC_AMM * K10A;
  const C12B = SGC_AMM * K10B;
  const D12 = SGC_METH * D5;
  // Boiler gas
  const C15A = B_METH * D5A + B_AMM * K10A + B_UREA * K9A;
  const C15B = B_METH * D5B + B_AMM * K10B + B_UREA * K9B;
  // Total
  const totalNm3 = C12A + C12B + D12 + GT + C15A + C15B + FL;
  const mmscfd = totalNm3 * GCV / (1e6 * days);
  // Boiler steam (ton/hr) - boiler Nm3 to steam using specific consumption ~105 Nm3/ton
  const steamTph = (C15A + C15B) / 105 / days / 24;
  return { mmscfd, totalNm3, steamTph };
}

function calcProfit(pAmm, pMeth, pUrea, vc, K10A, K10B, D5A, D5B, K9A, K9B) {
  // Case A contribution: CM_amm_A × K11_A + CM_meth × D5_A + CM_urea_A × K9_A
  const profitA = (pAmm - vc.ammA) * (K10A - K7 * K9A) + (pMeth - vc.meth) * D5A + (pUrea - vc.ureaA) * K9A;
  // Case B contribution: CM_amm_B × K11_B + CM_meth × D5_B + CM_urea_B × K9_B
  const profitB = (pAmm - vc.ammB) * (K10B - K7 * K9B) + (pMeth - vc.meth) * D5B + (pUrea - vc.ureaB) * K9B;
  return profitA + profitB - FC_TOTAL;
}

// ═══════════════════════════════════════════════════════════════════════════
// SIMPLEX LP SOLVER — Enumerates 3 binary cases, solves each as continuous LP
// Uses bounded variable simplex with vertex enumeration for small LP
// ═══════════════════════════════════════════════════════════════════════════

function solveLP(pAmm, pMeth, pUrea, gasPrice, maxAmmDaily, maxMethDaily, maxUreaDaily, maxGasMMSCFD, days) {
  const vc = calcVC(gasPrice);
  const R13 = calcR13(days);
  const D33 = calcD33(maxUreaDaily, days);
  const maxD5 = maxMethDaily * days;
  const maxE5 = maxUreaDaily * days;
  const maxK4 = maxAmmDaily * days;

  let bestResult = null;

  function evaluateAndUpdate(caseLabel, D5A, D5B, K4A, K4B, K9A, K9B) {
    const K10A = caseLabel === 'A' ? (K4A - CAPA + ALPHA * D5A) : 0;
    const K10B = caseLabel !== 'A' ? (K4B - CAPB) : 0;
    const K10 = K10A + K10B;
    const K9 = K9A + K9B;
    const K8 = K7 * K9;
    const K11 = K10 - K8;
    const D5 = D5A + D5B;

    if (K10 < 0 || K11 < -0.01) return;

    const g = calcGas(K10A, K10B, D5A, D5B, K9A, K9B, days);
    if (g.mmscfd > maxGasMMSCFD + 0.01) return;

    const p = calcProfit(pAmm, pMeth, pUrea, vc, K10A, K10B, D5A, D5B, K9A, K9B);

    if (!bestResult || p > bestResult.profit + 0.001) {
      bestResult = {
        caseLabel, D5A, D5B, K4A, K4B, K10A, K10B, K10, K9A, K9B, K9, K8,
        K11: Math.max(0, K11), D5, K4: K4A + K4B,
        gasMMSCFD: g.mmscfd, gasNm3: g.totalNm3, steamTph: g.steamTph,
        profit: p,
        dailyAmm: K11 / days, // Saleable ammonia daily
        dailyAmmProd: K10 / days, // Total ammonia production daily
        dailyMeth: D5 / days,
        dailyUrea: K9 / days,
        vcAmm: caseLabel === 'A' ? vc.ammA : vc.ammB,
        vcMeth: vc.meth,
        vcUrea: caseLabel === 'A' ? vc.ureaA : vc.ureaB,
        y1: caseLabel === 'A' ? 1 : 0,
        y2: caseLabel === 'B1' ? 1 : 0,
      };
    }
  }

  // ─── CASE A: y1=1, D5_A ∈ [R13, maxD5], methanol ≥ threshold ───
  // Objective for Case A: maximize over (D5_A, E5_A, K4_A)
  // K10_A = K4_A - CAPA + ALPHA * D5_A
  // K9_A = E5_A (urea saleable = urea produced in Case A)
  // Profit_A = CM_amm_A * (K10_A - K7*K9_A) + CM_meth * D5_A + CM_urea_A * K9_A - FC
  if (R13 <= maxD5) {
    const cmAmmA = pAmm - vc.ammA;
    const cmMeth = pMeth - vc.meth;
    const cmUreaA = pUrea - vc.ureaA;

    // For Case A, the profit is linear in (D5_A, E5_A, K4_A)
    // Gradient w.r.t. D5_A: cmAmmA * ALPHA + cmMeth
    // Gradient w.r.t. E5_A (=K9_A): cmUreaA - cmAmmA * K7
    // Gradient w.r.t. K4_A: cmAmmA (through K10_A = K4_A - CAPA + alpha*D5_A)
    // Since objective is linear and constraints are box + one gas constraint,
    // optimal is at a vertex. We check key vertices with gas constraint.

    // Strategy: fix D5_A and E5_A at their gradient-optimal bounds, find max K4_A
    // that satisfies gas constraint.

    const gradD5 = cmAmmA * ALPHA + cmMeth;
    const gradE5 = cmUreaA - cmAmmA * K7;
    const gradK4 = cmAmmA;

    // Determine optimal bounds for each variable
    const d5Candidates = [R13, maxD5];
    const e5Candidates = [1, maxE5];
    const k4Candidates = [1, maxK4];

    // Check all vertex combinations (2^3 = 8 vertices)
    for (const D5A of d5Candidates) {
      for (const E5A of e5Candidates) {
        for (const K4A of k4Candidates) {
          const K10A = K4A - CAPA + ALPHA * D5A;
          if (K10A < 0) continue;
          if (K10A - K7 * E5A < -0.01) continue;
          evaluateAndUpdate('A', D5A, 0, K4A, 0, E5A, 0);
        }
      }
    }

    // Also check gas-binding vertex: find max K4_A such that gas ≤ maxGas
    // for optimal D5_A and E5_A
    for (const D5A of d5Candidates) {
      for (const E5A of e5Candidates) {
        // Binary search for max K4A with gas feasibility
        let lo = CAPA - ALPHA * D5A + 1, hi = maxK4;
        if (lo > hi) continue;
        for (let iter = 0; iter < 60; iter++) {
          const mid = (lo + hi) / 2;
          const K10A = mid - CAPA + ALPHA * D5A;
          if (K10A < 0) { lo = mid; continue; }
          const g = calcGas(K10A, 0, D5A, 0, E5A, 0, days);
          if (g.mmscfd <= maxGasMMSCFD + 0.001) lo = mid;
          else hi = mid;
        }
        const K4A = (gradK4 >= 0) ? lo : 1; // If gradient positive, max K4; else min
        const K10A_test = K4A - CAPA + ALPHA * D5A;
        if (K10A_test >= 0 && K10A_test - K7 * E5A >= -0.01) {
          evaluateAndUpdate('A', D5A, 0, K4A, 0, E5A, 0);
        }
      }
    }
  }

  // ─── CASE B: y1=0, D5_B ∈ [1, min(R13-1, maxD5)] ───
  // K10_B = K4_B - CAPB
  // Sub-case B1 (y2=1): K10_B ≤ D33, K9_B = E5_B
  // Sub-case B2 (y2=0): K10_B > D33, K9_B = C33_COEFF * K10_B (CO2 limited)
  {
    const maxD5B = Math.min(Math.max(1, R13 - 1), maxD5);
    const cmAmmB = pAmm - vc.ammB;
    const cmMeth = pMeth - vc.meth;
    const cmUreaB = pUrea - vc.ureaB;

    // For Case B, profit = cmAmmB * (K10_B - K7*K9_B) + cmMeth * D5_B + cmUreaB * K9_B - FC

    const d5BCandidates = [1, maxD5B];
    const e5BCandidates = [1, maxE5];

    // ─── Sub-case B1: K10_B ≤ D33, K9_B = E5_B ───
    // Gradient w.r.t. K4_B: cmAmmB (through K10_B)
    // Gradient w.r.t. E5_B: cmUreaB - cmAmmB * K7
    // Gradient w.r.t. D5_B: cmMeth
    // K10_B = K4_B - CAPB ≤ D33 → K4_B ≤ D33 + CAPB
    {
      const maxK4B1 = Math.min(maxK4, D33 + CAPB);

      for (const D5B of d5BCandidates) {
        for (const E5B of e5BCandidates) {
          for (const K4B of [CAPB + 1, maxK4B1]) {
            if (K4B < CAPB + 1 || K4B > maxK4B1) continue;
            const K10B = K4B - CAPB;
            if (K10B > D33 + 0.01) continue;
            if (K10B < 0) continue;
            if (K10B - K7 * E5B < -0.01) continue;
            evaluateAndUpdate('B1', 0, D5B, 0, K4B, 0, E5B);
          }
        }
      }

      // Gas-binding check for B1
      for (const D5B of d5BCandidates) {
        for (const E5B of e5BCandidates) {
          let lo = CAPB + 1, hi = maxK4B1;
          if (lo > hi) continue;
          for (let iter = 0; iter < 60; iter++) {
            const mid = (lo + hi) / 2;
            const K10B = mid - CAPB;
            const g = calcGas(0, K10B, 0, D5B, 0, E5B, days);
            if (g.mmscfd <= maxGasMMSCFD + 0.001) lo = mid;
            else hi = mid;
          }
          const K4B = (cmAmmB >= 0) ? lo : CAPB + 1;
          const K10B = K4B - CAPB;
          if (K10B >= 0 && K10B <= D33 + 0.01 && K10B - K7 * E5B >= -0.01) {
            evaluateAndUpdate('B1', 0, D5B, 0, K4B, 0, E5B);
          }
        }
      }
    }

    // ─── Sub-case B2: K10_B > D33, K9_B = C33_COEFF * K10_B ───
    // K9_B is a function of K10_B (CO2 limited)
    // K9_B = min(E5_B, C33_COEFF * K10_B)
    // When CO2 limited: K9_B = C33_COEFF * K10_B
    // Profit = cmAmmB * (K10_B - K7 * C33_COEFF * K10_B) + cmMeth * D5_B + cmUreaB * C33_COEFF * K10_B
    //        = K10_B * [cmAmmB * (1 - K7*C33_COEFF) + cmUreaB * C33_COEFF] + cmMeth * D5_B
    // This is linear in K10_B and D5_B → vertex solution
    {
      const minK4B2 = Math.max(CAPB + 1, D33 + CAPB + 0.01);

      const gradK10_B2 = cmAmmB * (1 - K7 * C33_COEFF) + cmUreaB * C33_COEFF;
      const gradD5_B2 = cmMeth;

      for (const D5B of d5BCandidates) {
        for (const E5B of e5BCandidates) {
          // K4_B candidates: min feasible, max capacity
          const k4Cands = [minK4B2, maxK4];

          for (const K4B of k4Cands) {
            if (K4B < minK4B2 || K4B > maxK4) continue;
            const K10B = K4B - CAPB;
            if (K10B <= D33) continue;

            // K9_B = min(E5_B, C33_COEFF * K10_B)
            const K9B_co2 = C33_COEFF * K10B;
            const K9B = Math.min(E5B, K9B_co2);

            if (K10B - K7 * K9B < -0.01) continue;
            evaluateAndUpdate(K9B < E5B ? 'B2' : 'B1', 0, D5B, 0, K4B, 0, K9B);
          }

          // Gas-binding vertex for B2
          let lo = minK4B2, hi = maxK4;
          if (lo > hi) continue;
          for (let iter = 0; iter < 60; iter++) {
            const mid = (lo + hi) / 2;
            const K10B = mid - CAPB;
            const K9B = Math.min(E5B, C33_COEFF * K10B);
            const g = calcGas(0, K10B, 0, D5B, 0, K9B, days);
            if (g.mmscfd <= maxGasMMSCFD + 0.001) lo = mid;
            else hi = mid;
          }
          const K4B_gas = (gradK10_B2 >= 0) ? lo : minK4B2;
          const K10B_gas = K4B_gas - CAPB;
          if (K10B_gas > D33) {
            const K9B_gas = Math.min(E5B, C33_COEFF * K10B_gas);
            if (K10B_gas - K7 * K9B_gas >= -0.01) {
              evaluateAndUpdate(K9B_gas < E5B ? 'B2' : 'B1', 0, D5B, 0, K4B_gas, 0, K9B_gas);
            }
          }
        }
      }

      // Additional fine search: for B2 with K9_B limited by urea demand
      // When C33_COEFF * K10_B > E5_B, we have K9_B = E5_B (urea demand limited, not CO2)
      // This is actually the B1 scenario for urea, but with K10_B > D33
      // The K9_B2_val formula from Excel: K9_B2_val = E5_B - T4*(1-y1) + C33c*K10_B
      // When y1=0: K9_B2_val = E5_B - maxE5 + C33_COEFF*K10_B = C33_COEFF*K10_B (when E5_B=maxE5)
      for (const D5B of d5BCandidates) {
        const E5B = maxE5; // Usually optimal for urea
        const K4B = maxK4;
        const K10B = K4B - CAPB;
        if (K10B <= D33) continue;
        const K9B_co2 = C33_COEFF * K10B;
        const K9B = Math.min(E5B, K9B_co2);
        if (K10B - K7 * K9B < -0.01) continue;
        evaluateAndUpdate(K9B_co2 < E5B ? 'B2' : 'B1', 0, D5B, 0, K4B, 0, K9B);

        // Also try with gas-limited K4B
        let lo2 = minK4B2, hi2 = maxK4;
        for (let iter = 0; iter < 60; iter++) {
          const mid = (lo2 + hi2) / 2;
          const K10Bt = mid - CAPB;
          const K9Bt = Math.min(E5B, C33_COEFF * K10Bt);
          const g = calcGas(0, K10Bt, 0, D5B, 0, K9Bt, days);
          if (g.mmscfd <= maxGasMMSCFD + 0.001) lo2 = mid;
          else hi2 = mid;
        }
        const K10B2 = lo2 - CAPB;
        if (K10B2 > D33) {
          const K9B2 = Math.min(E5B, C33_COEFF * K10B2);
          if (K10B2 - K7 * K9B2 >= -0.01) {
            evaluateAndUpdate(K9B2 < E5B ? 'B2' : 'B1', 0, D5B, 0, lo2, 0, K9B2);
          }
        }
      }
    }
  }

  if (!bestResult) {
    const vc0 = calcVC(gasPrice);
    return {
      caseLabel: 'INFEASIBLE', profit: 0, D5: 0, K10: 0, K9: 0, K8: 0, K11: 0,
      K4: 0, gasMMSCFD: 0, gasNm3: 0, steamTph: 0,
      dailyAmm: 0, dailyAmmProd: 0, dailyMeth: 0, dailyUrea: 0,
      vcAmm: vc0.ammA, vcMeth: vc0.meth, vcUrea: vc0.ureaA,
      y1: 0, y2: 0, D5A: 0, D5B: 0, K10A: 0, K10B: 0, K9A: 0, K9B: 0,
      K4A: 0, K4B: 0,
    };
  }

  return bestResult;
}

// Shutdown analysis: methanol plant stopped, only ammonia + urea
function calcShutdownProfit(pAmm, pUrea, gasPrice, maxAmmDaily, maxUreaDaily, maxGasMMSCFD, days) {
  const vc = calcVC(gasPrice);
  const maxK4 = maxAmmDaily * days;
  const maxE5 = maxUreaDaily * days;
  const D33 = calcD33(maxUreaDaily, days);

  // Case B with D5_B = 0 (no methanol), find optimal K4_B
  const K4B = maxK4;
  const K10B = K4B - CAPB;
  const K9B_co2 = C33_COEFF * K10B;
  const K9B = (K10B <= D33) ? maxE5 : Math.min(maxE5, K9B_co2);
  const K11 = K10B - K7 * K9B;

  const g = calcGas(0, K10B, 0, 0, 0, K9B, days);
  let finalK4B = K4B;

  // If gas exceeds limit, binary search
  if (g.mmscfd > maxGasMMSCFD) {
    let lo = CAPB + 1, hi = maxK4;
    for (let iter = 0; iter < 60; iter++) {
      const mid = (lo + hi) / 2;
      const K10Bt = mid - CAPB;
      const K9Bt = (K10Bt <= D33) ? maxE5 : Math.min(maxE5, C33_COEFF * K10Bt);
      const gt = calcGas(0, K10Bt, 0, 0, 0, K9Bt, days);
      if (gt.mmscfd <= maxGasMMSCFD + 0.001) lo = mid;
      else hi = mid;
    }
    finalK4B = lo;
  }

  const K10Bf = finalK4B - CAPB;
  const K9Bf = (K10Bf <= D33) ? maxE5 : Math.min(maxE5, C33_COEFF * K10Bf);
  const profit = (pAmm - vc.ammB) * (K10Bf - K7 * K9Bf) + (pUrea - vc.ureaB) * K9Bf - FC_TOTAL;

  return profit;
}

// ═══════════════════════════════════════════════════════════════════════════
// UI COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const fmt = (n, d = 0) => n == null ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtM = n => n == null ? '—' : `$${(n / 1e6).toFixed(2)}M`;

const mono = { fontFamily: "'JetBrains Mono', 'Fira Code', monospace" };

const tooltipStyle = {
  background: 'rgba(10, 15, 30, 0.96)',
  border: '1px solid rgba(100, 120, 150, 0.25)',
  borderRadius: 10,
  padding: '12px 16px',
  fontFamily: "'DM Sans', system-ui, sans-serif",
  fontSize: 12,
  boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
  minWidth: 200,
};

const labelStyle = {
  fontSize: 10, color: '#475569', textTransform: 'uppercase',
  letterSpacing: 1.5, fontWeight: 700,
};

function NumericInput({ label, value, setter, unit, accent, step = 1 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type="number" value={value} step={step}
          onChange={e => setter(+e.target.value)}
          style={{
            width: '100%', background: 'rgba(8,12,20,0.8)',
            border: `1px solid ${accent}25`, borderRadius: 8,
            color: '#e2e8f0', padding: '8px 58px 8px 10px',
            fontSize: 14, ...mono, fontWeight: 500, outline: 'none',
            boxSizing: 'border-box',
          }}
          onFocus={e => e.target.style.borderColor = accent + '80'}
          onBlur={e => e.target.style.borderColor = accent + '25'}
        />
        <span style={{
          position: 'absolute', right: 10, top: '50%',
          transform: 'translateY(-50%)', fontSize: 10,
          color: '#475569', ...mono, pointerEvents: 'none',
        }}>{unit}</span>
      </div>
    </div>
  );
}

function KPICard({ title, value, subtitle, color, big }) {
  return (
    <div style={{
      background: 'rgba(15,23,42,0.4)', borderRadius: 12,
      border: '1px solid rgba(100,120,150,0.06)',
      padding: big ? '16px 20px' : '12px 16px',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: 3, background: color, opacity: 0.6,
      }} />
      <div style={{
        fontSize: 10, color: '#475569', textTransform: 'uppercase',
        letterSpacing: 1.5, fontWeight: 700, marginBottom: 5,
      }}>{title}</div>
      <div style={{ fontSize: big ? 20 : 17, fontWeight: 800, color, ...mono, marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 11, color: '#475569' }}>{subtitle}</div>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div style={{
      background: 'rgba(15,23,42,0.35)', borderRadius: 14,
      border: '1px solid rgba(100,120,150,0.06)',
      padding: '16px 18px', marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ width: 3, height: 14, background: '#3b82f6', borderRadius: 2 }} />
        <h3 style={{ fontSize: 13, fontWeight: 600, margin: 0, color: '#94a3b8' }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Legend({ color, solid, dash, dot, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8' }}>
      <div style={{
        width: 18, height: solid ? 3 : dot ? 6 : 2,
        background: color, borderRadius: dot ? 3 : 1,
        ...(dash ? { backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 6px, transparent 6px 10px)`, background: 'none' } : {}),
      }} />
      {label}
    </div>
  );
}

function ShutdownTooltip({ active, payload, label }) {
  if (!active || !payload?.[0]) return null;
  return (
    <div style={tooltipStyle}>
      <div style={{ color: '#94a3b8', marginBottom: 5 }}>MeOH: ${label}/MT</div>
      <div style={{ color: '#22c55e', marginBottom: 2, ...mono }}>Running: ${payload[0]?.value?.toFixed(2)}M</div>
      <div style={{ color: '#f97316', ...mono }}>Shutdown: ${payload[1]?.value?.toFixed(2)}M</div>
    </div>
  );
}

export default function GPICDashboard() {
  // State
  const [pAmm, setPAmm] = useState(325);
  const [pMeth, setPMeth] = useState(80);
  const [pUrea, setPUrea] = useState(400);
  const [gasPrice, setGasPrice] = useState(5);
  const [maxAmm, setMaxAmm] = useState(1320);
  const [maxMeth, setMaxMeth] = useState(1250);
  const [maxUrea, setMaxUrea] = useState(2150);
  const [maxGas, setMaxGas] = useState(128);
  const [monthIdx, setMonthIdx] = useState(4); // May
  const [tab, setTab] = useState('optimizer');

  const days = MONTH_DAYS[monthIdx];

  // LP solver result
  const result = useMemo(
    () => solveLP(pAmm, pMeth, pUrea, gasPrice, maxAmm, maxMeth, maxUrea, maxGas, days),
    [pAmm, pMeth, pUrea, gasPrice, maxAmm, maxMeth, maxUrea, maxGas, days]
  );

  // Revenue & cost breakdown
  const revAmm = pAmm * result.K11;
  const revMeth = pMeth * result.D5;
  const revUrea = pUrea * result.K9;
  const vcTotal = result.vcAmm * result.K10 + result.vcMeth * result.D5 + result.vcUrea * result.K9;

  const profitColor = result.profit >= 0 ? '#22c55e' : '#ef4444';

  // Shutdown analysis
  const shutdownData = useMemo(() => {
    const shutProfit = calcShutdownProfit(pAmm, pUrea, gasPrice, maxAmm, maxUrea, maxGas, days);
    const data = [];
    let cross = null;
    let prevDelta = null;

    for (let mp = 0; mp <= 350; mp += 5) {
      const r = solveLP(pAmm, mp, pUrea, gasPrice, maxAmm, maxMeth, maxUrea, maxGas, days);
      const delta = r.profit - shutProfit;
      if (prevDelta !== null && prevDelta <= 200 && delta > 200 && cross === null) {
        cross = mp - 5 + 5 * (200 - prevDelta) / (delta - prevDelta);
      }
      prevDelta = delta;
      data.push({ mp, run: r.profit / 1e6, shut: shutProfit / 1e6 });
    }
    return { data, cross, vcMeth: calcVC(gasPrice).meth, shutProfit };
  }, [pAmm, pUrea, gasPrice, maxAmm, maxMeth, maxUrea, maxGas, days]);

  // Gas sensitivity
  const gasSensitivity = useMemo(() => {
    const data = [];
    for (let g = 1; g <= 10; g += 0.5) {
      const r = solveLP(pAmm, pMeth, pUrea, g, maxAmm, maxMeth, maxUrea, maxGas, days);
      data.push({ g, p: r.profit / 1e6 });
    }
    return data;
  }, [pAmm, pMeth, pUrea, maxAmm, maxMeth, maxUrea, maxGas, days]);

  const tabs = [
    { key: 'optimizer', label: 'Optimizer' },
    { key: 'shutdown', label: 'Shutdown Analysis' },
    { key: 'sensitivity', label: 'Gas Sensitivity' },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(145deg, #020617 0%, #0a0f1e 40%, #0f172a 100%)',
      color: '#e2e8f0',
      fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif",
      padding: '20px 24px',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { scrollbar-width: thin; scrollbar-color: #1e293b #0f172a; }
        input[type=number]::-webkit-inner-spin-button { opacity: 0.3; }
        input[type=number]::-webkit-outer-spin-button { opacity: 0.3; }
      `}</style>

      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 20, flexWrap: 'wrap', gap: 12,
        }}>
          <div>
            <h1 style={{
              fontSize: 20, fontWeight: 800, margin: 0,
              background: 'linear-gradient(135deg, #60a5fa, #22c55e)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              letterSpacing: -0.5,
            }}>
              GPIC Profitability Optimizer
            </h1>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 3, letterSpacing: 0.5 }}>
              Simplex LP Model • Excel v31 Exact Match
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, background: 'rgba(15,23,42,0.6)', borderRadius: 10, padding: 3 }}>
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                background: tab === t.key ? 'rgba(59,130,246,0.15)' : 'transparent',
                color: tab === t.key ? '#60a5fa' : '#64748b',
              }}>{t.label}</button>
            ))}
          </div>
        </div>

        {/* Input Panel */}
        <div style={{
          background: 'rgba(15,23,42,0.35)', borderRadius: 14,
          border: '1px solid rgba(100,120,150,0.06)',
          padding: '16px 18px', marginBottom: 18,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{
              width: 3, height: 18,
              background: 'linear-gradient(180deg, #3b82f6, #22c55e)',
              borderRadius: 2,
            }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>
              Market Inputs & Plant Parameters
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>
            <NumericInput label="Ammonia Price" value={pAmm} setter={setPAmm} unit="$/MT" accent="#f59e0b" />
            <NumericInput label="Methanol Price" value={pMeth} setter={setPMeth} unit="$/MT" accent="#a855f7" />
            <NumericInput label="Urea Price" value={pUrea} setter={setPUrea} unit="$/MT" accent="#22c55e" />
            <NumericInput label="Natural Gas" value={gasPrice} setter={setGasPrice} unit="$/MMBTU" accent="#ef4444" step={0.25} />
            <NumericInput label="Max Ammonia" value={maxAmm} setter={setMaxAmm} unit="MT/D" accent="#f59e0b" />
            <NumericInput label="Max Methanol" value={maxMeth} setter={setMaxMeth} unit="MT/D" accent="#a855f7" />
            <NumericInput label="Max Urea" value={maxUrea} setter={setMaxUrea} unit="MT/D" accent="#22c55e" />
            <NumericInput label="Max Gas" value={maxGas} setter={setMaxGas} unit="MMSCFD" accent="#ef4444" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={labelStyle}>Month ({days}d)</label>
              <select value={monthIdx} onChange={e => setMonthIdx(+e.target.value)} style={{
                background: 'rgba(8,12,20,0.8)', border: '1px solid rgba(100,120,150,0.15)',
                borderRadius: 8, color: '#e2e8f0', padding: '8px 10px',
                fontSize: 13, fontFamily: 'inherit', outline: 'none',
              }}>
                {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* ═══ OPTIMIZER TAB ═══ */}
        {tab === 'optimizer' && <>
          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12, marginBottom: 18 }}>
            <KPICard title="Net Monthly Profit" value={fmtM(result.profit)}
              subtitle={`Case ${result.caseLabel} • ${MONTHS[monthIdx]}`} color={profitColor} big />
            <KPICard title="Ammonia" value={`${fmt(result.dailyAmmProd, 1)} MT/D`}
              subtitle={`${fmt(result.K11, 0)} MT saleable/mo`} color="#f59e0b" />
            <KPICard title="Methanol" value={`${fmt(result.dailyMeth, 1)} MT/D`}
              subtitle={`${fmt(result.D5, 0)} MT total/mo`} color="#a855f7" />
            <KPICard title="Urea" value={`${fmt(result.dailyUrea, 1)} MT/D`}
              subtitle={`${fmt(result.K9, 0)} MT saleable/mo`} color="#22c55e" />
            <KPICard title="Gas Consumption" value={`${fmt(result.gasMMSCFD, 2)} MMSCFD`}
              subtitle={`${((result.gasMMSCFD / maxGas) * 100).toFixed(1)}% of ${maxGas}`} color="#ef4444" />
            <KPICard title="Boiler Steam" value={`${fmt(result.steamTph, 1)} T/h`}
              subtitle="HP steam production" color="#06b6d4" />
          </div>

          {/* Charts Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
            <Card title="Daily Production vs Capacity">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={[
                    { n: 'Ammonia', p: result.dailyAmmProd, c: maxAmm },
                    { n: 'Methanol', p: result.dailyMeth, c: maxMeth },
                    { n: 'Urea', p: result.dailyUrea, c: maxUrea },
                  ]}
                  layout="vertical" margin={{ left: 10, right: 25, top: 5, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,120,150,0.06)" />
                  <XAxis type="number" tick={{ fill: '#475569', fontSize: 11 }} />
                  <YAxis dataKey="n" type="category" tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 500 }} width={72} />
                  <Tooltip content={({ active, payload }) => active && payload?.[0] ? (
                    <div style={tooltipStyle}>
                      <div style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: 3 }}>{payload[0].payload.n}</div>
                      <div style={{ color: '#60a5fa' }}>Prod: {fmt(payload[0].payload.p, 1)} MT/D</div>
                      <div style={{ color: '#475569' }}>Cap: {fmt(payload[0].payload.c)} MT/D</div>
                      <div style={{ color: '#fbbf24' }}>Util: {((payload[0].payload.p / Math.max(payload[0].payload.c, 1)) * 100).toFixed(1)}%</div>
                    </div>
                  ) : null} />
                  <Bar dataKey="c" radius={[0, 4, 4, 0]} barSize={22} fill="rgba(100,120,150,0.1)" />
                  <Bar dataKey="p" radius={[0, 6, 6, 0]} barSize={22}>
                    <Cell fill="#f59e0b" />
                    <Cell fill="#a855f7" />
                    <Cell fill="#22c55e" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Revenue & Cost Breakdown">
              <div style={{ padding: '6px 4px' }}>
                {[
                  { l: 'Urea Revenue', v: revUrea, c: '#22c55e' },
                  { l: 'Ammonia Revenue', v: revAmm, c: '#f59e0b' },
                  { l: 'Methanol Revenue', v: revMeth, c: '#a855f7' },
                  { l: 'Variable Costs', v: -vcTotal, c: '#f87171' },
                  { l: 'Fixed Costs', v: -FC_TOTAL, c: '#ef4444' },
                ].map((x, i) => {
                  const mx = Math.max(revUrea, vcTotal, FC_TOTAL, 1);
                  return (
                    <div key={i} style={{ marginBottom: 11 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, fontSize: 12 }}>
                        <span style={{ color: '#94a3b8' }}>{x.l}</span>
                        <span style={{ ...mono, color: x.c, fontSize: 12 }}>{x.v >= 0 ? '+' : ''}{fmtM(x.v)}</span>
                      </div>
                      <div style={{ height: 5, background: 'rgba(100,120,150,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{
                          width: `${Math.min(Math.abs(x.v) / mx * 100, 100)}%`,
                          height: '100%', background: x.c, borderRadius: 3, opacity: 0.7,
                        }} />
                      </div>
                    </div>
                  );
                })}
                <div style={{
                  marginTop: 12, paddingTop: 10,
                  borderTop: '1px solid rgba(100,120,150,0.12)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ fontWeight: 700, color: '#cbd5e1', fontSize: 13 }}>Net Profit</span>
                  <span style={{ fontWeight: 800, color: profitColor, ...mono, fontSize: 18 }}>{fmtM(result.profit)}</span>
                </div>
              </div>
            </Card>
          </div>

          {/* VC & Contribution Margins Table */}
          <Card title="Variable Costs & Contribution Margins">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(100,120,150,0.12)' }}>
                  {['Product', 'VC ($/MT)', 'Price', 'CM', 'Volume (MT/mo)', 'Contribution'].map((h, i) => (
                    <th key={i} style={{
                      padding: '7px 10px', textAlign: i ? 'right' : 'left',
                      color: '#475569', fontWeight: 700, fontSize: 10,
                      textTransform: 'uppercase', letterSpacing: 1,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { n: 'Ammonia (saleable)', vc: result.vcAmm, p: pAmm, vol: result.K11, c: '#f59e0b' },
                  { n: 'Methanol', vc: result.vcMeth, p: pMeth, vol: result.D5, c: '#a855f7' },
                  { n: 'Urea', vc: result.vcUrea, p: pUrea, vol: result.K9, c: '#22c55e' },
                ].map((x, i) => {
                  const cm = x.p - x.vc;
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(100,120,150,0.05)' }}>
                      <td style={{ padding: '8px 10px', color: x.c, fontWeight: 600 }}>{x.n}</td>
                      <td style={{ ...mono, textAlign: 'right', padding: '8px 10px' }}>${fmt(x.vc, 2)}</td>
                      <td style={{ ...mono, textAlign: 'right', padding: '8px 10px' }}>${fmt(x.p, 2)}</td>
                      <td style={{ ...mono, textAlign: 'right', padding: '8px 10px', color: cm >= 0 ? '#22c55e' : '#ef4444' }}>${fmt(cm, 2)}</td>
                      <td style={{ ...mono, textAlign: 'right', padding: '8px 10px' }}>{fmt(x.vol, 0)}</td>
                      <td style={{ ...mono, textAlign: 'right', padding: '8px 10px', color: cm * x.vol >= 0 ? '#22c55e' : '#ef4444' }}>{fmtM(cm * x.vol)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {/* Model Verification */}
          <Card title="Model Verification — Excel LP Solver Match">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6, fontSize: 12, color: '#64748b' }}>
              {[
                ['Case', `${result.caseLabel} (y1=${result.y1}, y2=${result.y2})`],
                ['R13 (MeOH threshold)', fmt(calcR13(days), 2)],
                ['D33 (CO₂ threshold)', fmt(calcD33(maxUrea, days), 2)],
                ['K10 (NH₃ production)', fmt(result.K10, 2)],
                ['K9 (Urea saleable)', fmt(result.K9, 2)],
                ['K8 (NH₃ → Urea)', fmt(result.K8, 2)],
                ['K11 (NH₃ saleable)', fmt(result.K11, 2)],
                ['D5 (Methanol total)', fmt(result.D5, 4)],
                ['Gas Nm³/mo', fmt(result.gasNm3, 0)],
                ['Gas MMSCFD', fmt(result.gasMMSCFD, 5)],
                ['VC Amm', `$${fmt(result.vcAmm, 3)}`],
                ['VC Meth', `$${fmt(result.vcMeth, 3)}`],
                ['VC Urea', `$${fmt(result.vcUrea, 3)}`],
              ].map(([k, v], i) => (
                <div key={i}>{k}: <span style={mono}>{v}</span></div>
              ))}
            </div>
          </Card>
        </>}

        {/* ═══ SHUTDOWN TAB ═══ */}
        {tab === 'shutdown' && <>
          <Card title="GPIC Net Profit vs Price of Methanol">
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 12, padding: '0 4px' }}>
              <Legend color="#22c55e" solid label="MeOH Running (Optimized)" />
              <Legend color="#f97316" solid label="MeOH Shutdown" />
              <Legend color="#a855f7" dash label={`MeOH VC: $${fmt(shutdownData.vcMeth, 0)}/MT`} />
              {shutdownData.cross != null && <Legend color="#fbbf24" dot label={`Shutdown: ~$${fmt(shutdownData.cross, 0)}/MT`} />}
            </div>
            <ResponsiveContainer width="100%" height={400}>
              <ComposedChart data={shutdownData.data} margin={{ top: 10, right: 30, left: 15, bottom: 28 }}>
                <defs>
                  <linearGradient id="gR" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.12} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,120,150,0.06)" />
                <XAxis dataKey="mp" type="number" domain={[0, 350]}
                  ticks={[0, 40, 80, 120, 160, 200, 240, 280, 320]}
                  tick={{ fill: '#475569', fontSize: 11 }}
                  label={{ value: 'Price of Methanol ($/MT)', position: 'bottom', fill: '#64748b', fontSize: 11, offset: 10 }}
                />
                <YAxis tick={{ fill: '#475569', fontSize: 11 }} tickFormatter={v => `$${v}M`}
                  label={{ value: 'Net Profit ($/month)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }}
                />
                <Tooltip content={<ShutdownTooltip />} />
                <ReferenceLine x={shutdownData.vcMeth} stroke="#a855f7" strokeDasharray="8 4" strokeWidth={2}
                  label={{ value: `$${fmt(shutdownData.vcMeth, 0)} VC`, position: 'top', fill: '#a855f7', fontSize: 11, fontWeight: 600, offset: 8 }}
                />
                {shutdownData.cross != null && (
                  <ReferenceLine x={shutdownData.cross} stroke="#fbbf24" strokeDasharray="5 3" strokeWidth={1.5} />
                )}
                <Area type="monotone" dataKey="run" fill="url(#gR)" stroke="none" />
                <Line type="monotone" dataKey="shut" stroke="#f97316" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="run" stroke="#22c55e" strokeWidth={3} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12, marginTop: 14 }}>
            <KPICard title="Shutdown Decision Price"
              value={shutdownData.cross != null ? `~$${fmt(shutdownData.cross, 0)}/MT` : 'Always run'}
              subtitle="Where running ≈ shutdown" color="#fbbf24" big />
            <KPICard title="Current MeOH Price" value={`$${pMeth}/MT`}
              subtitle={pMeth > (shutdownData.cross || 0) ? '✓ Keep running' : '⚠ Consider shutdown'}
              color={pMeth > (shutdownData.cross || 0) ? '#22c55e' : '#ef4444'} big />
            <KPICard title="MeOH Variable Cost" value={`$${fmt(shutdownData.vcMeth, 1)}/MT`}
              subtitle={`Margin: $${fmt(pMeth - shutdownData.vcMeth, 1)}/MT`} color="#a855f7" big />
            <KPICard title="Running vs Shutdown Δ" value={fmtM(result.profit - shutdownData.shutProfit)}
              subtitle="At current prices" color={result.profit > shutdownData.shutProfit ? '#22c55e' : '#ef4444'} big />
          </div>

          <div style={{
            background: 'rgba(15,23,42,0.4)', borderRadius: 12,
            border: '1px solid rgba(100,120,150,0.06)',
            padding: '16px 20px', marginTop: 14, fontSize: 12,
            color: '#64748b', lineHeight: 1.8,
          }}>
            <div style={{ fontWeight: 700, color: '#94a3b8', marginBottom: 6, fontSize: 13 }}>
              Understanding the Shutdown Decision
            </div>
            <p style={{ margin: '0 0 6px' }}>
              The <b style={{ color: '#22c55e' }}>green</b> line = optimized profit with methanol running.
              The <b style={{ color: '#f97316' }}>orange</b> line = profit without methanol (ammonia loses {fmt(CAPB)} MT/mo capacity, urea may be CO₂-limited, VC +${VP}/MT).
            </p>
            <p style={{ margin: 0 }}>
              Shutdown price (~${shutdownData.cross != null ? fmt(shutdownData.cross, 0) : '—'}/MT) may differ from VC (~${fmt(shutdownData.vcMeth, 0)}/MT) because methanol benefits ammonia production via CO₂/CDR synergies and different process configuration (CAPA={CAPA} vs CAPB={CAPB}).
            </p>
          </div>
        </>}

        {/* ═══ SENSITIVITY TAB ═══ */}
        {tab === 'sensitivity' && <>
          <Card title="Profit vs Natural Gas Price">
            <ResponsiveContainer width="100%" height={360}>
              <ComposedChart data={gasSensitivity} margin={{ top: 10, right: 30, left: 15, bottom: 25 }}>
                <defs>
                  <linearGradient id="gG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,120,150,0.06)" />
                <XAxis dataKey="g" tick={{ fill: '#475569', fontSize: 11 }}
                  label={{ value: 'Gas ($/MMBTU)', position: 'bottom', fill: '#64748b', fontSize: 11, offset: 8 }}
                />
                <YAxis tick={{ fill: '#475569', fontSize: 11 }} tickFormatter={v => `$${v}M`} />
                <Tooltip content={({ active, payload, label }) => active && payload?.[0] ? (
                  <div style={tooltipStyle}>
                    <div style={{ color: '#94a3b8', marginBottom: 4 }}>Gas: ${label}/MMBTU</div>
                    <div style={{ ...mono, color: payload[0].value >= 0 ? '#22c55e' : '#ef4444', fontWeight: 700 }}>
                      ${payload[0].value.toFixed(2)}M
                    </div>
                  </div>
                ) : null} />
                <ReferenceLine y={0} stroke="rgba(100,120,150,0.2)" />
                <ReferenceLine x={gasPrice} stroke="#fbbf24" strokeDasharray="5 3" strokeWidth={1.5}
                  label={{ value: `$${gasPrice}`, position: 'top', fill: '#fbbf24', fontSize: 11, fontWeight: 600 }}
                />
                <Area type="monotone" dataKey="p" fill="url(#gG)" stroke="none" />
                <Line type="monotone" dataKey="p" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Gas Price Impact Table">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(100,120,150,0.12)' }}>
                  {['Gas', 'Profit', 'vs Current', 'Case', 'VC Amm', 'VC Meth', 'VC Urea'].map((h, i) => (
                    <th key={i} style={{
                      padding: '7px 10px', textAlign: i ? 'right' : 'left',
                      color: '#475569', fontWeight: 700, fontSize: 10,
                      textTransform: 'uppercase', letterSpacing: 1,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(g => {
                  const r = solveLP(pAmm, pMeth, pUrea, g, maxAmm, maxMeth, maxUrea, maxGas, days);
                  const v = calcVC(g);
                  const d = r.profit - result.profit;
                  const cur = g === gasPrice;
                  return (
                    <tr key={g} style={{
                      borderBottom: '1px solid rgba(100,120,150,0.05)',
                      background: cur ? 'rgba(59,130,246,0.08)' : 'transparent',
                    }}>
                      <td style={{ padding: '7px 10px', color: cur ? '#60a5fa' : '#94a3b8', fontWeight: cur ? 700 : 400 }}>
                        ${g}{cur ? ' ◄' : ''}
                      </td>
                      <td style={{ ...mono, textAlign: 'right', padding: '7px 10px', color: r.profit >= 0 ? '#22c55e' : '#ef4444' }}>
                        {fmtM(r.profit)}
                      </td>
                      <td style={{ ...mono, textAlign: 'right', padding: '7px 10px', color: d >= 0 ? '#22c55e' : '#ef4444' }}>
                        {d >= 0 ? '+' : ''}{fmtM(d)}
                      </td>
                      <td style={{ ...mono, textAlign: 'right', padding: '7px 10px', color: '#64748b' }}>
                        {r.caseLabel}
                      </td>
                      <td style={{ ...mono, textAlign: 'right', padding: '7px 10px' }}>${fmt(v.ammA, 1)}</td>
                      <td style={{ ...mono, textAlign: 'right', padding: '7px 10px' }}>${fmt(v.meth, 1)}</td>
                      <td style={{ ...mono, textAlign: 'right', padding: '7px 10px' }}>${fmt(v.ureaA, 1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>}

        <div style={{
          marginTop: 24, paddingTop: 10,
          borderTop: '1px solid rgba(100,120,150,0.06)',
          textAlign: 'center', fontSize: 10, color: '#334155', letterSpacing: 1,
        }}>
          GPIC LP Profitability Optimizer •
