import { useMemo } from 'react';
import { solve, type Model } from 'yalps';

// ═══════════════════════════════════════════════════════════════════════════════
// BASE MODEL CONSTANTS — sourced cell-by-cell from Excel v31
// ═══════════════════════════════════════════════════════════════════════════════

export const BASE_DEFAULTS = {
  K7: 0.57,                // NH3→Urea specific consumption (MT/MT) — Updated!K7
  alpha: 0.1092174534,     // Legacy — now derived dynamically from methMin_MTD, kept for reference only
  C33_coeff: 1.660263,     // CO2 capacity coefficient

  // ─── Specific Gas Consumption (Nm3/MT of product) ───
  SGC_amm_A: 903.61,      // Case A (MeOH running) — VC!C4 = 611.6602 + 291.9498
  SGC_amm_B: 1015.6794,   // Case B (MeOH shutdown) — Sheet2!K224
  SGC_meth: 1153.1574,    // Methanol SGC — VC!F4 = 786.7134 + 366.444

  // ─── Boiler NG Consumption (Nm3/MT) — Sheet1 H33:H35 ───
  boiler_amm: 237.358,    // Sheet1!H33
  boiler_meth: 110.047,   // Sheet1!H34
  boiler_urea: 104.169,   // Sheet1!H35

  // ─── Fixed Gas Loads (Nm3/day) ───
  GT_gas_per_day: 163000,  // Updated!C14 = 163000×K1
  flare_gas_per_day: 13700, // Updated!C16 = 13700×K1

  // ─── GT Additional Load ───
  GT_additional_max: 0.676, // MMSCFD — Updated!O22

  // ─── NM3 → MMSCFD Conversion ───
  NM3_to_MMSCFD: 37.325,  // Updated!C21 formula factor

  // ─── Gas Price Parameters ───
  base_gas_price_mmbtu: 4.5,       // GAS PRICE!C22
  gas_bhd_per_nm3_base: 0.02709,   // GAS PRICE!B21 — fixed BHD/NM3 at $2.25/MMBTU
  gas_base_mmbtu: 2.25,            // GAS PRICE!C21 — base MMBTU reference
  bhd_to_usd: 2.65,               // Conversion factor BHD→USD

  // ─── Utility Prices (Linear with Gas Price) ───
  SW_slope: 0.00142011,
  SW_intercept: 0.00097989,
  FCW_slope: 0.00252889,
  FCW_intercept: 0.00212711,
  Demin_slope: 0.03343089,
  Demin_intercept: -0.03075789,

  MEW_power_price: 0.0775195445499881,  // GPU!I16 — MEW Power $/kWh

  // ─── Ammonia Power Parameters ───
  amm_GT_gen: 293.5,            // VC!C9 — GT generated power (MWH)
  amm_Import_gen: 112.4,        // VC!C10 — Imported power (MWH)
  amm_total_power_annual: 20781000,
  amm_prod_annual: 459788,
  GT_nm3_per_kwh: 0.503,        // VC!C18 — GT gas consumption per kWh

  // ─── Ammonia Utility Specific Consumptions ───
  amm_HP_steam: 2.3963,
  amm_HP_nm3_per_ton: 105,
  amm_SW: 225.9414,
  amm_FCW: 136.1038,
  amm_Demin: 3.3026,

  // ─── Methanol Power Parameters ───
  meth_total_power_annual: 19745300,
  meth_prod_annual: 445757,
  meth_HP_steam: 0.840818552609506,
  meth_SW: 65.5065,
  meth_FCW: 48.5531,
  meth_Demin: 1.3181,

  // ─── Urea Parameters ───
  urea_amm_spec: 0.5696,
  urea_power: 83.5573,

  // CDR (CO2 recovery)
  CDR_co2: 36.1942,
  CDR_SW: 0.2032,
  CDR_FCW: 0.0042,
  CDR_power: 0.00762,
  CDR_LP_steam: 0.0019,
  CDR_LP_669: 669,
  CDR_LP_810: 810,

  // HP & MP Steam
  urea_HP_steam: 1.1811,
  urea_MP_steam: 0.0415,
  MP_752_9: 752.9,
  MP_809_4: 809.4,

  // SW / FCW / Demin for urea
  urea_SW: 18.9793,
  urea_FCW: 94.0777,
  urea_Demin: 0.0749,

  // UF85 (formaldehyde)
  UF85_cons: 0.0094572,
  UF85_meth_cons: 0.7126,
  UF85_FCW: 72.3776,
  UF85_power: 277.4354,

  // CDR shutdown penalties
  ammPenalty_B: 15,
  ammCapLoss_B: 5580,
  ammCapLoss_A: 4247,      // MT/mo ammonia capacity loss at minimum methanol load
  methMin_MTD: 740,        // Minimum methanol production when GT running (MT/D) — user settable

  // Fixed costs
  FC_total: 8279075.12,
};

// ─── Settings Interface ──────────────────────────────────────────────────────
export type Settings = typeof BASE_DEFAULTS;

// ─── Result Interfaces ───────────────────────────────────────────────────────
export interface VCBreakdown {
  gasVC: number;
  powerVC: number;
  hpSteamVC: number;
  swVC: number;
  fcwVC: number;
  deminVC: number;
  total: number;
}

export interface UreaVCBreakdown {
  ammCostComponent: number;
  powerVC: number;
  cdrSW: number;
  cdrFCW: number;
  cdrPower: number;
  cdrLPSteam: number;
  hpSteamVC: number;
  mpSteamVC: number;
  swVC: number;
  fcwVC: number;
  deminVC: number;
  uf85VC: number;
  uf85FCW: number;
  uf85Power: number;
  total: number;
}

export interface LPResult {
  caseType: string;
  D5: number;
  K10: number;
  K9: number;
  K8: number;
  K11: number;
  K4: number;
  gas: number;
  gasBeforeGT: number;
  gasTotal_nm3: number;
  gasBreakdown: {
    ammonia_nm3: number;
    methanol_nm3: number;
    boiler_nm3: number;
    gt_nm3: number;
    flare_nm3: number;
  };
  profit: number;
  dailyAmm: number;
  dailyMeth: number;
  dailyUrea: number;
  vcAmm: number;
  vcMeth: number;
  vcUrea: number;
  vcAmmBreakdown: VCBreakdown;
  vcMethBreakdown: VCBreakdown;
  vcUreaBreakdown: UreaVCBreakdown;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GAS COST CALCULATION
// ═══════════════════════════════════════════════════════════════════════════════
function gasUsdPerNm3(gasPrice: number, s: Settings): number {
  return gasPrice * (s.gas_bhd_per_nm3_base / s.gas_base_mmbtu) * s.bhd_to_usd;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AMMONIA VARIABLE COST — Exact VC sheet Column C formulas
// C36 = C7 + C21 + C25 + C28 + C31 + C34
// ═══════════════════════════════════════════════════════════════════════════════
function calcAmmVC(
  gasCost: number,
  swPrice: number,
  fcwPrice: number,
  deminPrice: number,
  s: Settings,
  gtRunning: boolean = true
): VCBreakdown {
  // ── Gas VC (C7) ──
  // C4 = SGC, C6 = gasCost, C7 = C4 × C6
  const gasVC = s.SGC_amm_A * gasCost;

  // ── Power VC (C21) ──
  const totalPowerMonth = s.amm_total_power_annual / 12;  // C13
  const prodMonth = s.amm_prod_annual / 12;               // C2
  let powerVC: number;
  if (gtRunning) {
    // Power ratio C11 = C9/C10
    const powerRatio = s.amm_GT_gen / s.amm_Import_gen;
    const importPower = totalPowerMonth / powerRatio;        // C14
    const importCost = importPower * s.MEW_power_price;      // C16
    const gtPower = totalPowerMonth - importPower;           // C17
    const gtCostPerKwh = s.GT_nm3_per_kwh * gasCost;        // C19
    const gtCost = gtCostPerKwh * gtPower;                   // C20
    powerVC = (gtCost + importCost) / prodMonth;             // C21
  } else {
    // GT off — all power from MEW import at full rate
    powerVC = (totalPowerMonth * s.MEW_power_price) / prodMonth;
  }

  // ── HP Steam VC (C25) ──
  // C25 = C23 × C24 × C6
  const hpSteamVC = s.amm_HP_steam * s.amm_HP_nm3_per_ton * gasCost;

  // ── Sea Water VC (C28) ──
  // C28 = C26 × C27
  const swVC = s.amm_SW * swPrice;

  // ── FCW VC (C31) ──
  // C31 = C29 × C30
  const fcwVC = s.amm_FCW * fcwPrice;

  // ── Demin Water VC (C34) ──
  // C34 = C32 × C33
  const deminVC = s.amm_Demin * deminPrice;

  return {
    gasVC,
    powerVC,
    hpSteamVC,
    swVC,
    fcwVC,
    deminVC,
    total: gasVC + powerVC + hpSteamVC + swVC + fcwVC + deminVC,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// METHANOL VARIABLE COST — Exact VC sheet Column F formulas
// F36 = F7 + F21 + F25 + F28 + F31 + F34
// ═══════════════════════════════════════════════════════════════════════════════
function calcMethVC(
  gasCost: number,
  swPrice: number,
  fcwPrice: number,
  deminPrice: number,
  s: Settings,
  gtRunning: boolean = true
): VCBreakdown {
  // ── Gas VC (F7) ──
  const gasVC = s.SGC_meth * gasCost;

  // ── Power VC (F21) ──
  // Same GT/Import ratio as ammonia (same GT and import capacity)
  const totalPowerMonth = s.meth_total_power_annual / 12;  // F13
  const prodMonth = s.meth_prod_annual / 12;               // F2
  let powerVC: number;
  if (gtRunning) {
    const powerRatio = s.amm_GT_gen / s.amm_Import_gen;
    const importPower = totalPowerMonth / powerRatio;         // F14
    const importCost = importPower * s.MEW_power_price;       // F16
    const gtPower = totalPowerMonth - importPower;            // F17
    const gtCostPerKwh = s.GT_nm3_per_kwh * gasCost;         // uses C19 formula
    const gtCost = gtCostPerKwh * gtPower;                    // F20
    powerVC = (gtCost + importCost) / prodMonth;              // F21
  } else {
    // GT off — all power from MEW import at full rate
    powerVC = (totalPowerMonth * s.MEW_power_price) / prodMonth;
  }

  // ── HP Steam VC (F25) ──
  // F25 = C24 × F23 × F6 (note: F6 = same gas cost)
  const hpSteamVC = s.meth_HP_steam * s.amm_HP_nm3_per_ton * gasCost;

  // ── Utilities ──
  const swVC = s.meth_SW * swPrice;
  const fcwVC = s.meth_FCW * fcwPrice;
  const deminVC = s.meth_Demin * deminPrice;

  return {
    gasVC,
    powerVC,
    hpSteamVC,
    swVC,
    fcwVC,
    deminVC,
    total: gasVC + powerVC + hpSteamVC + swVC + fcwVC + deminVC,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// UREA VARIABLE COST — Exact VC sheet Column K formulas
// K58 = K6+K10+K16+K20+K24+K29+K33+K37+K40+K43+K46+K50+K53+K56
// ═══════════════════════════════════════════════════════════════════════════════
function calcUreaVC(
  gasCost: number,
  ammVC: number,
  methVC: number,
  swPrice: number,
  fcwPrice: number,
  deminPrice: number,
  s: Settings
): UreaVCBreakdown {
  // ── Ammonia cost component (K6) ──
  // K5 = AMM total VC (= C36), K6 = K3 × K5
  const ammCostComponent = s.urea_amm_spec * ammVC;

  // ── Power VC (K10) ──
  // K10 = K8 × K9 (K8 = 83.5573 kWh/MT, K9 = MEW price)
  const powerVC = s.urea_power * s.MEW_power_price;

  // ── CDR components (K16, K20, K24, K29) ──
  const K12 = s.CDR_co2;

  // CDR SW: K15 = K14 × K13, K16 = K15 × K12
  const cdrSW = K12 * s.CDR_SW * swPrice;

  // CDR FCW: K19 = K18 × K17, K20 = K19 × K12
  const cdrFCW = K12 * s.CDR_FCW * fcwPrice;

  // CDR Power: K23 = K22 × K21, K24 = K23 × K12
  // K22 = GPU!I16 (MEW_price), K21 = 0.00762
  const cdrPower = K12 * s.CDR_power * s.MEW_power_price;

  // CDR LP Steam: K25→K26→K27→K28→K29
  // K26 = K25 × 669/810
  const eqHH = s.CDR_LP_steam * s.CDR_LP_669 / s.CDR_LP_810;
  // K27 = K26 × 105 (Nm3/Nm3)
  const cdrLPnm3 = eqHH * s.amm_HP_nm3_per_ton;
  // K28 = K27 × gasCost ($/Nm3)
  const cdrLPcostPerNm3 = cdrLPnm3 * gasCost;
  // K29 = K28 × K12
  const cdrLPSteam = cdrLPcostPerNm3 * K12;

  // ── HP Steam (K33) ──
  // K32 = K31 × gasCost = 105 × gasCost ($/Ton)
  // K33 = K32 × K30 = K32 × 1.1811
  const hpSteamVC = s.urea_HP_steam * s.amm_HP_nm3_per_ton * gasCost;

  // ── MP Steam (K37) ──
  // K35 = K34 × 752.9/809.4 (equivalent tons)
  // K36 = K35 × 105 (Nm3/MT)
  // K37 = K36 × gasCost
  const mpEquiv = s.urea_MP_steam * s.MP_752_9 / s.MP_809_4;
  const mpNm3 = mpEquiv * s.amm_HP_nm3_per_ton;
  const mpSteamVC = mpNm3 * gasCost;

  // ── Utilities ──
  const swVC    = s.urea_SW    * swPrice;     // K40
  const fcwVC   = s.urea_FCW   * fcwPrice;    // K43
  const deminVC = s.urea_Demin * deminPrice;  // K46

  // ── UF85 (K50, K53, K56) ──
  // K50 = K47 × K48 × K49 (K49 = METH total VC = F36)
  const uf85VC = s.UF85_cons * s.UF85_meth_cons * methVC;
  // K53 = K51 × K52 × K47 (K52 = FCW_price)
  const uf85FCW = s.UF85_FCW * fcwPrice * s.UF85_cons;
  // K56 = K54 × K55 × K47 (K55 = MEW_price)
  const uf85Power = s.UF85_power * s.MEW_power_price * s.UF85_cons;

  return {
    ammCostComponent,
    powerVC,
    cdrSW,
    cdrFCW,
    cdrPower,
    cdrLPSteam,
    hpSteamVC,
    mpSteamVC,
    swVC,
    fcwVC,
    deminVC,
    uf85VC,
    uf85FCW,
    uf85Power,
    total: ammCostComponent + powerVC + cdrSW + cdrFCW + cdrPower + cdrLPSteam +
           hpSteamVC + mpSteamVC + swVC + fcwVC + deminVC + uf85VC + uf85FCW + uf85Power,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC VC CALCULATION
// Computes all three product VCs with full component breakdowns
// ═══════════════════════════════════════════════════════════════════════════════
export function calcVC(gasPrice: number, s: Settings, gtRunning: boolean = true) {
  const gasCost = gasUsdPerNm3(gasPrice, s);

  // Calculate dynamic utility prices
  const swPrice    = s.SW_slope    * gasPrice + s.SW_intercept;
  const fcwPrice   = s.FCW_slope   * gasPrice + s.FCW_intercept;
  const deminPrice = s.Demin_slope * gasPrice + s.Demin_intercept;

  const ammBreakdown  = calcAmmVC(gasCost, swPrice, fcwPrice, deminPrice, s, gtRunning);
  const methBreakdown = calcMethVC(gasCost, swPrice, fcwPrice, deminPrice, s, gtRunning);
  const ureaBreakdown = calcUreaVC(gasCost, ammBreakdown.total, methBreakdown.total, swPrice, fcwPrice, deminPrice, s);

  return {
    amm_A: ammBreakdown.total,
    amm_B: ammBreakdown.total + s.ammPenalty_B,
    meth:  methBreakdown.total,
    urea_A: ureaBreakdown.total,
    urea_B: ureaBreakdown.total + s.K7 * s.ammPenalty_B,
    ammBreakdown,
    methBreakdown,
    ureaBreakdown,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// GAS CONSUMPTION CALCULATION — Exact Updated sheet formulas
// ═══════════════════════════════════════════════════════════════════════════════
export function calcGas(
  K10: number, D5: number, K9: number, days: number,
  isShutdown: boolean, s: Settings, gtRunning: boolean = true
) {
  const sgc_amm = isShutdown ? s.SGC_amm_B : s.SGC_amm_A;
  const amm_gas    = sgc_amm * K10;          // C12 = C11 × K10
  const meth_gas   = s.SGC_meth * D5;        // D12 = D11 × D5
  const boiler_gas = s.boiler_meth * D5 + s.boiler_amm * K10 + s.boiler_urea * K9; // C15
  const gt_gas     = gtRunning ? s.GT_gas_per_day * days : 0;  // C14 — zero if GT off
  const flare_gas  = s.flare_gas_per_day * days;               // C16

  const total_nm3  = amm_gas + meth_gas + gt_gas + boiler_gas + flare_gas; // C18
  const mmscfd_base = total_nm3 * s.NM3_to_MMSCFD / (1e6 * days);          // C21

  return {
    mmscfd_base,
    total_nm3,
    breakdown: {
      ammonia_nm3:  amm_gas,
      methanol_nm3: meth_gas,
      boiler_nm3:   boiler_gas,
      gt_nm3:       gt_gas,
      flare_nm3:    flare_gas,
    },
  };
}

function applyGTAdditional(mmscfd_base: number, maxGas: number, s: Settings, gtRunning: boolean = true): number {
  if (!gtRunning) return mmscfd_base;  // No GT topup when GT is shutdown
  const headroom = maxGas - mmscfd_base;
  if (headroom > 0) {
    return mmscfd_base + Math.min(headroom, s.GT_additional_max);
  }
  return mmscfd_base;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LP SOLVER — Simplex (YALPS)
// ═══════════════════════════════════════════════════════════════════════════════
export function solveLP(
  ammP: number,
  methP: number,
  ureaP: number,
  gasP: number,
  maxAmm: number,
  maxMeth: number,
  maxUrea: number,
  maxGas: number,
  days: number,
  s: Settings = BASE_DEFAULTS,
  forceCase?: 'A' | 'B',
  gtRunning: boolean = true
): LPResult {
  const vc = calcVC(gasP, s, gtRunning);
  const K1 = days;

  // Constraints constants
  // maxGas is in MMSCFD. Convert to Total Nm3 for the period to match consumption calc.
  // Formula: mmscfd = total_nm3 * factor / (1e6 * days)
  // Inverse: total_nm3 = mmscfd * 1e6 * days / factor
  const maxGasTotal = maxGas * 1e6 * days / s.NM3_to_MMSCFD;

  // Fixed gas loads: GT is zero when shutdown, flare always present
  const fixedGas = (gtRunning ? s.GT_gas_per_day * days : 0) + s.flare_gas_per_day * days;
  const availGasForProd = maxGasTotal - fixedGas;

  // Helper to construct and solve the model for a specific case
  const solveCase = (caseType: 'A' | 'B', isShutdown: boolean): LPResult | null => {
    const sgc_amm = isShutdown ? s.SGC_amm_B : s.SGC_amm_A;
    const capLoss = isShutdown ? s.ammCapLoss_B : s.ammCapLoss_A;
    const vcAmm = isShutdown ? vc.amm_B : vc.amm_A;
    const vcUrea = isShutdown ? vc.urea_B : vc.urea_A;

    // ─── Gas Coefficients ───
    // Gas Constraint:
    // Total Gas = amm_sale*(SGC+Boiler) + meth*(SGC+Boiler) + urea*(K7*SGC+K7*Boiler+Boiler_Urea) + Fixed
    // We constrain: Variable_Gas <= availGasForProd
    const coeffAmmGas  = sgc_amm + s.boiler_amm;
    const coeffMethGas = s.SGC_meth + s.boiler_meth;
    const coeffUreaGas = s.K7 * sgc_amm + s.K7 * s.boiler_amm + s.boiler_urea;

   // ─── Alpha — fixed PSA synergy slope (calibrated from plant data) ───
    // alpha represents MT of extra ammonia capacity per MT of methanol.
    // This is a physical relationship that does NOT change when methMin_MTD changes.
    // methMin_MTD only sets the hard floor constraint below — it does not affect alpha.
    const alphaTerm = caseType === 'A' ? s.alpha : 0;

    // ─── Ammonia Capacity Constraint ───
    // K10 + K7*urea - alpha*meth <= maxAmm*days - capLoss
    // At methanol = methMin_MTD: ammonia loss = capLoss - alpha*methMin_MTD*days
    // At methanol = maxMeth:     ammonia loss approaches zero (full recovery)
    const ammCapLimit = (maxAmm * days) - capLoss;

    // ─── Urea Capacity Constraint (Case B) ───
    const ureaCapB_UreaCoeff = caseType === 'B' ? (1 - s.C33_coeff * s.K7) : 0;
    const ureaCapB_AmmCoeff = caseType === 'B' ? -s.C33_coeff : 0;

    // ─── Constraints Setup ───
    const constraints: Record<string, { min?: number, max?: number, equal?: number }> = {
      gas: { max: availGasForProd },
      ammCap: { max: ammCapLimit },
      methCap: { max: maxMeth * days },
      ureaCap: { max: maxUrea * days },
      methMin: { min: 0 },
      ...(caseType === 'B' ? { ureaCapB: { max: 0 } } : {})
    };

    // ─── Case Specific Methanol Bounds ───
    if (caseType === 'A') {
      // Methanol >= user-defined minimum load
      constraints.methMin = { min: s.methMin_MTD * days };
    } else {
      // Methanol <= user-defined minimum load (Case B = below running threshold)
      constraints.methCap = { max: s.methMin_MTD * days };
    }

    // ─── Model Definition ───
    const model: Model = {
      direction: 'maximize',
      objective: 'profit',
      variables: {
        amm_sale: {
          profit: ammP - vcAmm,
          gas: coeffAmmGas,
          ammCap: 1,
          ureaCapB: ureaCapB_AmmCoeff
        },
        meth: {
          profit: methP - vc.meth,
          gas: coeffMethGas,
          ammCap: -dynamicAlpha,
          methCap: 1,
          methMin: 1
        },
        urea: {
          profit: ureaP - vcUrea,
          gas: coeffUreaGas,
          ammCap: s.K7,
          ureaCap: 1,
          ureaCapB: ureaCapB_UreaCoeff
        }
      },
      constraints: constraints
    };

    const result = solve(model);
    if (result.status !== 'optimal') return null;

    const vars: Record<string, number> = {};
    result.variables.forEach(([key, val]) => { vars[key] = val; });

    const amm_sale = vars.amm_sale || 0;
    const meth = vars.meth || 0;
    const urea = vars.urea || 0;

    const K10 = amm_sale + s.K7 * urea;
    const K9 = urea;
    const D5 = meth;
    const K4 = maxAmm * days;
    const K11 = amm_sale;

    if (K11 < -1e-9) return null;

    return makeResult(caseType, D5, K10, K9, K4, isShutdown, vcAmm, vcUrea);
  };

  // Helper to construct the result object
  const makeResult = (
    caseType: string, D5: number, K10: number, K9: number,
    K4: number, isShutdown: boolean,
    vcAmm: number, vcUrea: number
  ): LPResult | null => {
    const K8 = s.K7 * K9;
    const K11 = K10 - K8;

    const gasCalc = calcGas(K10, D5, K9, K1, isShutdown, s, gtRunning);
    const gasAfterGT = applyGTAdditional(gasCalc.mmscfd_base, maxGas, s, gtRunning);

    // Hard limit check (solver should handle this, but applyGTAdditional might add more)
    if (gasAfterGT > maxGas * 1.001) return null;

    const profit = (ammP - vcAmm) * K11 + (methP - vc.meth) * D5 + (ureaP - vcUrea) * K9 - s.FC_total;

    return {
      caseType, D5, K10, K9, K8, K11, K4,
      gas: gasAfterGT,
      gasBeforeGT: gasCalc.mmscfd_base,
      gasTotal_nm3: gasCalc.total_nm3,
      gasBreakdown: gasCalc.breakdown,
      profit,
      dailyAmm: K10 / K1,
      dailyMeth: D5 / K1,
      dailyUrea: K9 / K1,
      vcAmm, vcMeth: vc.meth, vcUrea,
      vcAmmBreakdown: vc.ammBreakdown,
      vcMethBreakdown: vc.methBreakdown,
      vcUreaBreakdown: vc.ureaBreakdown,
    };
  };

  // ─── Execute Cases ───
  if (forceCase === 'A') {
    const resA = solveCase('A', false);
    return resA || {
      caseType: 'Infeasible-A', D5: 0, K10: 0, K9: 0, K8: 0, K11: 0, K4: 0,
      gas: 0, gasBeforeGT: 0, gasTotal_nm3: 0,
      gasBreakdown: { ammonia_nm3: 0, methanol_nm3: 0, boiler_nm3: 0, gt_nm3: 0, flare_nm3: 0 },
      profit: -Infinity, dailyAmm: 0, dailyMeth: 0, dailyUrea: 0,
      vcAmm: vc.amm_A, vcMeth: vc.meth, vcUrea: vc.urea_A,
      vcAmmBreakdown: vc.ammBreakdown,
      vcMethBreakdown: vc.methBreakdown,
      vcUreaBreakdown: vc.ureaBreakdown,
    };
  }

  if (forceCase === 'B') {
    const resB = solveCase('B', true);
    return resB || {
      caseType: 'Infeasible-B', D5: 0, K10: 0, K9: 0, K8: 0, K11: 0, K4: 0,
      gas: 0, gasBeforeGT: 0, gasTotal_nm3: 0,
      gasBreakdown: { ammonia_nm3: 0, methanol_nm3: 0, boiler_nm3: 0, gt_nm3: 0, flare_nm3: 0 },
      profit: -Infinity, dailyAmm: 0, dailyMeth: 0, dailyUrea: 0,
      vcAmm: vc.amm_B, vcMeth: vc.meth, vcUrea: vc.urea_B,
      vcAmmBreakdown: vc.ammBreakdown,
      vcMethBreakdown: vc.methBreakdown,
      vcUreaBreakdown: vc.ureaBreakdown,
    };
  }

  const resA = solveCase('A', false);
  const resB = solveCase('B', true);

  // Also check "B-min" (Methanol Shutdown, D5 approx 0)
  // The solver for Case B allows D5 down to 0.
  // So resB should ALREADY cover the optimal point between 0 and 60%.
  // We can just take the best of A and B.

  let best = resA;
  if (resB) {
    if (!best || resB.profit > best.profit) {
      best = resB;
    }
  }

  // Fallback if both fail (shouldn't happen with valid inputs)
  if (!best) {
    return {
      caseType: 'Infeasible', D5: 0, K10: 0, K9: 0, K8: 0, K11: 0, K4: 0,
      gas: 0, gasBeforeGT: 0, gasTotal_nm3: 0,
      gasBreakdown: { ammonia_nm3: 0, methanol_nm3: 0, boiler_nm3: 0, gt_nm3: 0, flare_nm3: 0 },
      profit: 0, dailyAmm: 0, dailyMeth: 0, dailyUrea: 0,
      vcAmm: vc.amm_A, vcMeth: vc.meth, vcUrea: vc.urea_A,
      vcAmmBreakdown: vc.ammBreakdown,
      vcMethBreakdown: vc.methBreakdown,
      vcUreaBreakdown: vc.ureaBreakdown,
    };
  }

  return best;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REACT HOOK
// ═══════════════════════════════════════════════════════════════════════════════
export function useLPSolver(
  ammP: number,
  methP: number,
  ureaP: number,
  gasP: number,
  maxAmm: number,
  maxMeth: number,
  maxUrea: number,
  maxGas: number,
  days: number,
  settings: Settings,
  gtRunning: boolean = true
) {
  return useMemo(
    () => solveLP(ammP, methP, ureaP, gasP, maxAmm, maxMeth, maxUrea, maxGas, days, settings, undefined, gtRunning),
    [ammP, methP, ureaP, gasP, maxAmm, maxMeth, maxUrea, maxGas, days, settings, gtRunning]
  );
}
