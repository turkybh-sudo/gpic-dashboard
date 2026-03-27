import type { ComponentType } from 'react';
import {
  Activity,
  Factory,
  Flame,
  LayoutDashboard,
  Settings2,
  TrendingUp,
  Zap,
} from 'lucide-react';

import type { Settings } from '../../hooks/useLPSolver';

export type TabId = 'optimizer' | 'shutdown' | 'sensitivity' | 'settings';
export type Tone = 'green' | 'amber' | 'purple' | 'rose' | 'blue' | 'slate';

export type SettingFieldConfig = {
  key: keyof Settings;
  label: string;
  step?: number;
  decimals?: number;
};

export type SettingGroupConfig = {
  title: string;
  description: string;
  tone: Tone;
  icon: ComponentType<{ className?: string }>;
  fields: SettingFieldConfig[];
};

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const TAB_ITEMS: Array<{
  id: TabId;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  {
    id: 'optimizer',
    label: 'Product Mix Tool',
    description: 'Production and profit optimizer.',
    icon: LayoutDashboard,
  },
  {
    id: 'shutdown',
    label: 'MeOH Shutdown',
    description: 'Compare MeOH running and shutdown at current prices.',
    icon: Activity,
  },
  {
    id: 'sensitivity',
    label: 'Gas Sensitivity',
    description: 'Natural gas price sensitivity.',
    icon: TrendingUp,
  },
  {
    id: 'settings',
    label: 'Settings',
    description: 'Grouped model settings.',
    icon: Settings2,
  },
];

export const TONE_STYLES: Record<
  Tone,
  {
    badge: string;
    strongText: string;
    bar: string;
  }
> = {
  green: {
    badge: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    strongText: 'text-emerald-700 dark:text-emerald-300',
    bar: 'bg-emerald-500',
  },
  amber: {
    badge: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    strongText: 'text-amber-700 dark:text-amber-300',
    bar: 'bg-amber-500',
  },
  purple: {
    badge: 'border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300',
    strongText: 'text-violet-700 dark:text-violet-300',
    bar: 'bg-violet-500',
  },
  rose: {
    badge: 'border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    strongText: 'text-rose-700 dark:text-rose-300',
    bar: 'bg-rose-500',
  },
  blue: {
    badge: 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    strongText: 'text-sky-700 dark:text-sky-300',
    bar: 'bg-sky-500',
  },
  slate: {
    badge: 'border-slate-500/20 bg-slate-500/10 text-slate-700 dark:text-slate-300',
    strongText: 'text-slate-700 dark:text-slate-300',
    bar: 'bg-slate-500',
  },
};

export const GAS_COLORS: Record<string, string> = {
  Ammonia: '#f59e0b',
  Methanol: '#8b5cf6',
  Boilers: '#3b82f6',
  'Gas Turbine': '#f97316',
  Flare: '#64748b',
};

export const SETTINGS_GROUPS: SettingGroupConfig[] = [
  {
    title: 'Gas Consumption',
    description: 'Primary gas consumption assumptions and turbine overhead.',
    tone: 'amber',
    icon: Flame,
    fields: [
      { key: 'SGC_amm_A', label: 'SGC Ammonia Case A (Nm3/MT)', step: 0.1, decimals: 1 },
      { key: 'SGC_amm_B', label: 'SGC Ammonia Case B (Nm3/MT)', step: 0.1, decimals: 1 },
      { key: 'SGC_meth', label: 'SGC Methanol (Nm3/MT)', step: 0.1, decimals: 1 },
      { key: 'GT_gas_per_day', label: 'GT Gas (Nm3/day)', step: 1000, decimals: 0 },
      { key: 'flare_gas_per_day', label: 'Flare Gas (Nm3/day)', step: 100, decimals: 0 },
      { key: 'GT_additional_max', label: 'GT Additional Max (MMSCFD)', step: 0.01, decimals: 2 },
    ],
  },
  {
    title: 'Boiler Consumption',
    description: 'Boiler demand by product family.',
    tone: 'blue',
    icon: Flame,
    fields: [
      { key: 'boiler_amm', label: 'Boiler NH3 (Nm3/MT)', step: 0.1, decimals: 1 },
      { key: 'boiler_meth', label: 'Boiler MeOH (Nm3/MT)', step: 0.1, decimals: 1 },
      { key: 'boiler_urea', label: 'Boiler Urea (Nm3/MT)', step: 0.1, decimals: 1 },
    ],
  },
  {
    title: 'Gas Conversion',
    description: 'Commercial gas price conversion assumptions.',
    tone: 'green',
    icon: TrendingUp,
    fields: [
      { key: 'gas_bhd_per_nm3_base', label: 'Base BHD/Nm3', step: 0.0001, decimals: 5 },
      { key: 'gas_base_mmbtu', label: 'Base $/MMBTU', step: 0.25, decimals: 2 },
      { key: 'bhd_to_usd', label: 'BHD to USD', step: 0.01, decimals: 2 },
    ],
  },
  {
    title: 'Utility Pricing',
    description: 'Utility curves that move with gas price and imported power.',
    tone: 'blue',
    icon: Zap,
    fields: [
      { key: 'MEW_power_price', label: 'MEW Power ($/kWh)', step: 0.001, decimals: 4 },
      { key: 'SW_slope', label: 'Sea Water Slope', step: 0.00001, decimals: 7 },
      { key: 'SW_intercept', label: 'Sea Water Intercept', step: 0.00001, decimals: 7 },
      { key: 'FCW_slope', label: 'FCW Slope', step: 0.00001, decimals: 7 },
      { key: 'FCW_intercept', label: 'FCW Intercept', step: 0.00001, decimals: 7 },
      { key: 'Demin_slope', label: 'Demin Slope', step: 0.0001, decimals: 7 },
      { key: 'Demin_intercept', label: 'Demin Intercept', step: 0.0001, decimals: 7 },
    ],
  },
  {
    title: 'Ammonia Utilities',
    description: 'Power, steam, and water assumptions for ammonia.',
    tone: 'amber',
    icon: Factory,
    fields: [
      { key: 'amm_GT_gen', label: 'GT Generated (MWh)', step: 0.5, decimals: 1 },
      { key: 'amm_Import_gen', label: 'Import Power (MWh)', step: 0.5, decimals: 1 },
      { key: 'GT_nm3_per_kwh', label: 'GT Nm3/kWh', step: 0.001, decimals: 3 },
      { key: 'amm_total_power_annual', label: 'Total Power (kWh/yr)', step: 10000, decimals: 0 },
      { key: 'amm_prod_annual', label: 'Production (MT/yr)', step: 100, decimals: 0 },
      { key: 'amm_HP_steam', label: 'HP Steam (T/MT)', step: 0.001, decimals: 4 },
      { key: 'amm_HP_nm3_per_ton', label: 'HP Steam Nm3/T', step: 1, decimals: 0 },
      { key: 'amm_SW', label: 'Sea Water (m3/MT)', step: 0.1, decimals: 4 },
      { key: 'amm_FCW', label: 'FCW (m3/MT)', step: 0.1, decimals: 4 },
      { key: 'amm_Demin', label: 'Demin (m3/MT)', step: 0.01, decimals: 4 },
    ],
  },
  {
    title: 'Methanol Utilities',
    description: 'Power, steam, and water assumptions for methanol.',
    tone: 'purple',
    icon: Factory,
    fields: [
      { key: 'meth_total_power_annual', label: 'Total Power (kWh/yr)', step: 10000, decimals: 0 },
      { key: 'meth_prod_annual', label: 'Production (MT/yr)', step: 100, decimals: 0 },
      { key: 'meth_HP_steam', label: 'HP Steam (T/MT)', step: 0.001, decimals: 6 },
      { key: 'meth_SW', label: 'Sea Water (m3/MT)', step: 0.1, decimals: 4 },
      { key: 'meth_FCW', label: 'FCW (m3/MT)', step: 0.1, decimals: 4 },
      { key: 'meth_Demin', label: 'Demin (m3/MT)', step: 0.01, decimals: 4 },
    ],
  },
  {
    title: 'Urea Cost Stack',
    description: 'Urea variable cost inputs, including CDR and UF85.',
    tone: 'green',
    icon: Factory,
    fields: [
      { key: 'urea_amm_spec', label: 'NH3 Spec (MT/MT)', step: 0.001, decimals: 4 },
      { key: 'urea_power', label: 'Power (kWh/MT)', step: 0.1, decimals: 4 },
      { key: 'CDR_co2', label: 'CDR CO2 (Nm3/MT)', step: 0.1, decimals: 4 },
      { key: 'CDR_SW', label: 'CDR SW (m3/Nm3)', step: 0.001, decimals: 4 },
      { key: 'CDR_FCW', label: 'CDR FCW (m3/Nm3)', step: 0.0001, decimals: 4 },
      { key: 'CDR_power', label: 'CDR Power (kWh/Nm3)', step: 0.0001, decimals: 5 },
      { key: 'CDR_LP_steam', label: 'CDR LP Steam (T/Nm3)', step: 0.0001, decimals: 4 },
      { key: 'urea_HP_steam', label: 'HP Steam (T/MT)', step: 0.001, decimals: 4 },
      { key: 'urea_MP_steam', label: 'MP Steam (T/MT)', step: 0.001, decimals: 4 },
      { key: 'urea_SW', label: 'Sea Water (m3/MT)', step: 0.1, decimals: 4 },
      { key: 'urea_FCW', label: 'FCW (m3/MT)', step: 0.1, decimals: 4 },
      { key: 'urea_Demin', label: 'Demin (m3/MT)', step: 0.001, decimals: 4 },
      { key: 'UF85_cons', label: 'UF85 (MT/MT)', step: 0.0001, decimals: 7 },
      { key: 'UF85_meth_cons', label: 'UF85 MeOH Consumption', step: 0.001, decimals: 4 },
    ],
  },
  {
    title: 'Process Coefficients',
    description: 'Conversion coefficients and shutdown penalties.',
    tone: 'purple',
    icon: Activity,
    fields: [
      { key: 'K7', label: 'NH3 to Urea (K7)', step: 0.01, decimals: 4 },
      { key: 'methMin_MTD', label: 'Min MeOH Running Load (MT/D)', step: 1, decimals: 0 },
      { key: 'C33_coeff', label: 'CO2 Capacity Coefficient', step: 0.001, decimals: 4 },
      { key: 'ammCapLoss_A', label: 'Ammonia Cap Loss at Min MeOH (MT/mo)', step: 10, decimals: 0 },
      { key: 'ammCapLoss_B', label: 'Ammonia Cap Loss Shutdown (MT/mo)', step: 10, decimals: 0 },
      { key: 'ammPenalty_B', label: 'Ammonia Penalty Case B ($/MT)', step: 1, decimals: 0 },
    ],
  },
  {
    title: 'Fixed Cost and Conversion',
    description: 'Fixed monthly cost and gas conversion factor.',
    tone: 'rose',
    icon: TrendingUp,
    fields: [
      { key: 'FC_total', label: 'Total Fixed Cost ($/mo)', step: 1000, decimals: 2 },
      { key: 'NM3_to_MMSCFD', label: 'Nm3 to MMSCFD Factor', step: 0.001, decimals: 3 },
    ],
  },
];
