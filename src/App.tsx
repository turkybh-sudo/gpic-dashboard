/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useCallback } from 'react';
import { 
  LayoutDashboard, 
  TrendingUp, 
  Factory, 
  Settings2, 
  Info,
  Activity,
  Zap,
  RotateCcw,
  Flame,
  Gauge,
  Sun,
  Moon
} from 'lucide-react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend,
  BarChart,
  Bar,
  Cell,
  ComposedChart,
  Area,
  Line,
  LineChart,
  ReferenceLine,
  PieChart,
  Pie
} from 'recharts';
import { useLPSolver, solveLP, calcVC, BASE_DEFAULTS, type Settings } from './hooks/useLPSolver';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_DAYS = [31,28,31,30,31,30,31,31,30,31,30,31];

const fmt = (n: number | null, d = 0) => n == null ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtM = (n: number | null) => n == null ? '—' : `$${(n / 1e6).toFixed(2)}M`;

export default function App() {
  const [ammP, setAmmP] = useState(325);
  const [methP, setMethP] = useState(80);
  const [ureaP, setUreaP] = useState(400);
  const [gasP, setGasP] = useState(4.5);
  const [maxAmm, setMaxAmm] = useState(1320);
  const [maxMeth, setMaxMeth] = useState(1250);
  const [maxUrea, setMaxUrea] = useState(2150);
  const [maxGas, setMaxGas] = useState(128);
  const [monthIdx, setMonthIdx] = useState(4); // May
  const [tab, setTab] = useState('optimizer');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);

  // Settings state (editable plant parameters)
  const [settings, setSettings] = useState<Settings>({ ...BASE_DEFAULTS } as Settings);

  const resetSettings = useCallback(() => {
    setSettings({ ...BASE_DEFAULTS } as Settings);
  }, []);

  const updateSetting = useCallback((key: keyof Settings, value: number) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  const days = MONTH_DAYS[monthIdx];

  // Core results
  const result = useLPSolver(ammP, methP, ureaP, gasP, maxAmm, maxMeth, maxUrea, maxGas, days, settings);

  // Shutdown analysis
  const shutdownData = useMemo(() => {
    const vc = calcVC(gasP, settings);
    const K1 = days;
    const R4 = K1 * maxAmm;
    const T4 = K1 * maxUrea;

    // Shutdown profit calculation (Case B with D5=1)
    const K10_shut = R4 - settings.ammCapLoss_B;
    const C33_shut = settings.C33_coeff * K10_shut;
    const K9_shut = Math.min(T4, C33_shut);
    const K8_shut = settings.K7 * K9_shut;
    const K11_shut = K10_shut - K8_shut;
    const shutdownProfit = (ammP - vc.amm_B) * K11_shut + (ureaP - vc.urea_B) * K9_shut - settings.FC_total;

    const data = [];
    let crossover = null as number | null;
    let prevDiff = null as number | null;

    for (let mp = 0; mp <= 350; mp += 5) {
      // Force Case A (Running) for the "Running" line
      const r = solveLP(ammP, mp, ureaP, gasP, maxAmm, maxMeth, maxUrea, maxGas, days, settings, 'A');
      const diff = r.profit - shutdownProfit;
      if (prevDiff !== null && prevDiff <= 0 && diff > 0 && crossover === null) {
        crossover = (mp - 5) + 5 * (-prevDiff) / (diff - prevDiff);
      }
      prevDiff = diff;
      data.push({ methPrice: mp, runningProfit: r.profit / 1e6, shutdownProfit: shutdownProfit / 1e6 });
    }
    return { data, crossover, vcMeth: vc.meth, shutdownProfitVal: shutdownProfit };
  }, [ammP, ureaP, gasP, maxAmm, maxMeth, maxUrea, maxGas, days, settings]);

  // Gas sensitivity
  const gasSens = useMemo(() => {
    const data = [];
    for (let g = 0.5; g <= 10; g += 0.5) {
      const r = solveLP(ammP, methP, ureaP, g, maxAmm, maxMeth, maxUrea, maxGas, days, settings);
      data.push({ gasPrice: g, profit: r.profit / 1e6 });
    }
    return data;
  }, [ammP, methP, ureaP, maxAmm, maxMeth, maxUrea, maxGas, days, settings]);

  const profitColor = result.profit >= 0 ? 'text-emerald-500' : 'text-rose-500';

  const chartTheme = theme === 'dark' ? {
    grid: '#1e293b',
    text: '#94a3b8',
    tooltipBg: '#1e293b',
    tooltipBorder: '#334155',
    tooltipColor: '#f8fafc',
    barCap: '#475569'
  } : {
    grid: '#e2e8f0',
    text: '#64748b',
    tooltipBg: '#ffffff',
    tooltipBorder: '#cbd5e1',
    tooltipColor: '#0f172a',
    barCap: '#cbd5e1'
  };

  return (
    <div className={cn("min-h-screen font-sans selection:bg-emerald-500/30 transition-colors duration-300", theme === 'dark' ? 'dark bg-slate-950 text-slate-200' : 'bg-slate-50 text-slate-900')}>
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-80 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-6 overflow-y-auto z-20 shadow-2xl transition-colors duration-300">
        <div className="flex items-center gap-3 mb-10">
          <div className="p-2 bg-emerald-500/10 rounded-lg">
            <Factory className="w-6 h-6 text-emerald-500" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Product mix</h1>
        </div>

        <div className="space-y-8">
          <section>
            <div className="flex items-center gap-2 mb-4 text-slate-500 dark:text-slate-400">
              <Settings2 className="w-4 h-4" />
              <h2 className="text-xs font-semibold uppercase tracking-wider">Market Controls</h2>
            </div>
            
            <div className="space-y-6">
              <ControlSlider label="Ammonia Price" value={ammP} onChange={setAmmP} min={200} max={900} unit="$/MT" />
              <ControlSlider label="Methanol Price" value={methP} onChange={setMethP} min={0} max={900} unit="$/MT" />
              <ControlSlider label="Urea Price" value={ureaP} onChange={setUreaP} min={200} max={900} unit="$/MT" />
              <ControlSlider label="Natural Gas" value={gasP} onChange={setGasP} min={0.5} max={10} step={0.25} unit="$/MMBTU" />
              <ControlSlider label="Max Gas Limit" value={maxGas} onChange={setMaxGas} min={80} max={150} unit="MMSCFD" />
              
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2 mb-4 text-slate-500 dark:text-slate-400">
                  <Gauge className="w-4 h-4" />
                  <h2 className="text-xs font-semibold uppercase tracking-wider">Plant Capacities</h2>
                </div>
                <div className="space-y-6">
                  <ControlSlider label="Max Ammonia" value={maxAmm} onChange={setMaxAmm} min={1000} max={1500} unit="MT/D" />
                  <ControlSlider label="Max Methanol" value={maxMeth} onChange={setMaxMeth} min={800} max={1500} unit="MT/D" />
                  <ControlSlider label="Max Urea" value={maxUrea} onChange={setMaxUrea} min={1500} max={2500} unit="MT/D" />
                </div>
              </div>

              <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-slate-800">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Operating Month</label>
                <select 
                  value={monthIdx} 
                  onChange={(e) => setMonthIdx(parseInt(e.target.value))}
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-colors"
                >
                  {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
              </div>
            </div>
          </section>

          <div className="p-4 bg-slate-100 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/50">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                Model v31 (Full VC): Component-level VC from Excel — Gas, Power (GT+Import), HP/MP/LP Steam, SW, FCW, Demin, CDR, UF85 all computed per-product. All scale correctly with gas price.
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="pl-80 min-h-screen transition-all duration-300">
        <header className="h-16 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-8 bg-white/50 dark:bg-slate-950/50 backdrop-blur-md sticky top-0 z-10 transition-colors duration-300">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <LayoutDashboard className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest">Complex Optimizer</span>
            </div>
            <nav className="flex gap-1 bg-slate-100 dark:bg-slate-900/50 p-1 rounded-lg border border-slate-200 dark:border-slate-800">
              <TabButton active={tab === 'optimizer'} onClick={() => setTab('optimizer')} label="Optimizer" icon={<Zap className="w-3.5 h-3.5" />} />
              <TabButton active={tab === 'shutdown'} onClick={() => setTab('shutdown')} label="MeOH Shutdown" icon={<Activity className="w-3.5 h-3.5" />} />
              <TabButton active={tab === 'sensitivity'} onClick={() => setTab('sensitivity')} label="Gas Sensitivity" icon={<TrendingUp className="w-3.5 h-3.5" />} />
              <TabButton active={tab === 'settings'} onClick={() => setTab('settings')} label="Settings" icon={<Settings2 className="w-3.5 h-3.5" />} />
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={toggleTheme}
              className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <div className={cn("px-3 py-1 border rounded-full transition-colors", 
              result.caseType.startsWith('A') ? "bg-emerald-500/10 border-emerald-500/20" : "bg-amber-500/10 border-amber-500/20"
            )}>
              <span className={cn("text-[10px] font-bold uppercase tracking-widest",
                result.caseType.startsWith('A') ? "text-emerald-600 dark:text-emerald-500" : "text-amber-600 dark:text-amber-500"
              )}>Case {result.caseType} • Simplex Active</span>
            </div>
          </div>
        </header>

        <div className="p-8 space-y-8">
          {tab === 'optimizer' && (
            <>
              {/* KPI Summary */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <KPICard title="Net Monthly Profit" value={fmtM(result.profit)} sub={`Case ${result.caseType} • ${MONTHS[monthIdx]}`} color="emerald" big />
                <KPICard title="Ammonia" value={`${fmt(result.dailyAmm, 1)} MT/D`} sub={`${fmt(result.K11, 0)} MT saleable`} color="amber" />
                <KPICard title="Methanol" value={`${fmt(result.dailyMeth, 1)} MT/D`} sub={`${fmt(result.D5, 0)} MT total`} color="purple" />
                <KPICard title="Urea" value={`${fmt(result.dailyUrea, 1)} MT/D`} sub={`${fmt(result.K9, 0)} MT saleable`} color="green" />
                <KPICard title="Gas Consumption" value={`${fmt(result.gas, 2)} MMSCFD`} sub={`${fmt(result.gasBeforeGT, 2)} base + GT add`} color="rose" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card title="Production vs Capacity">
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[
                        { name: 'Ammonia', prod: result.dailyAmm, cap: maxAmm },
                        { name: 'Methanol', prod: result.dailyMeth, cap: maxMeth },
                        { name: 'Urea', prod: result.dailyUrea, cap: maxUrea },
                      ]} layout="vertical" margin={{ left: 20, right: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                        <XAxis type="number" stroke="#64748b" fontSize={10} />
                        <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={10} width={70} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f8fafc' }}
                          itemStyle={{ color: '#f8fafc' }}
                          cursor={{ fill: 'transparent' }}
                        />
                        <Bar dataKey="cap" fill="#475569" radius={[0, 4, 4, 0]} barSize={20} name="Capacity" />
                        <Bar dataKey="prod" radius={[0, 4, 4, 0]} barSize={20} name="Production">
                          <Cell fill="#f59e0b" />
                          <Cell fill="#a855f7" />
                          <Cell fill="#10b981" />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card title="Revenue Breakdown">
                  <div className="space-y-4 py-2">
                    <BreakdownItem label="Urea Revenue" value={result.K9 * ureaP} color="bg-emerald-500" max={result.K9 * ureaP + result.K11 * ammP + result.D5 * methP} />
                    <BreakdownItem label="Ammonia Revenue" value={result.K11 * ammP} color="bg-amber-500" max={result.K9 * ureaP + result.K11 * ammP + result.D5 * methP} />
                    <BreakdownItem label="Methanol Revenue" value={result.D5 * methP} color="bg-purple-500" max={result.K9 * ureaP + result.K11 * ammP + result.D5 * methP} />
                  </div>
                </Card>
              </div>

              {/* Gas Breakdown Card */}
              <Card title="Gas Consumption Breakdown">
                <div className="flex flex-col lg:flex-row gap-8 items-center">
                  <div className="w-full lg:w-1/3 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Ammonia', value: result.gasBreakdown.ammonia_nm3, color: '#f59e0b' },
                            { name: 'Methanol', value: result.gasBreakdown.methanol_nm3, color: '#a855f7' },
                            { name: 'Boilers', value: result.gasBreakdown.boiler_nm3, color: '#3b82f6' },
                            { name: 'Gas Turbine', value: result.gasBreakdown.gt_nm3, color: '#06b6d4' },
                            { name: 'Flares', value: result.gasBreakdown.flare_nm3, color: '#ef4444' },
                          ]}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {[
                            { name: 'Ammonia', value: result.gasBreakdown.ammonia_nm3, color: '#f59e0b' },
                            { name: 'Methanol', value: result.gasBreakdown.methanol_nm3, color: '#a855f7' },
                            { name: 'Boilers', value: result.gasBreakdown.boiler_nm3, color: '#3b82f6' },
                            { name: 'Gas Turbine', value: result.gasBreakdown.gt_nm3, color: '#06b6d4' },
                            { name: 'Flares', value: result.gasBreakdown.flare_nm3, color: '#ef4444' },
                          ].map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} stroke={chartTheme.tooltipBg} strokeWidth={2} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ backgroundColor: chartTheme.tooltipBg, border: `1px solid ${chartTheme.tooltipBorder}`, borderRadius: '8px', color: chartTheme.tooltipColor }}
                          itemStyle={{ color: chartTheme.tooltipColor }}
                          formatter={(value: number) => [`${fmt(value / 1e6, 2)}M Nm³`, 'Volume']}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="w-full lg:w-2/3">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                      <GasItem label="Ammonia Feed" value={result.gasBreakdown.ammonia_nm3} total={result.gasTotal_nm3} color="bg-amber-500" />
                      <GasItem label="Methanol Feed" value={result.gasBreakdown.methanol_nm3} total={result.gasTotal_nm3} color="bg-purple-500" />
                      <GasItem label="Boilers" value={result.gasBreakdown.boiler_nm3} total={result.gasTotal_nm3} color="bg-blue-500" />
                      <GasItem label="Gas Turbine" value={result.gasBreakdown.gt_nm3} total={result.gasTotal_nm3} color="bg-cyan-500" />
                      <GasItem label="Flares" value={result.gasBreakdown.flare_nm3} total={result.gasTotal_nm3} color="bg-red-500" />
                    </div>
                    <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center">
                      <span className="text-xs text-slate-500 dark:text-slate-400">Total Gas: {fmt(result.gasTotal_nm3 / 1e6, 2)}M Nm³/month</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        SGC Ammonia: {result.caseType.startsWith('A') ? fmt(settings.SGC_amm_A, 1) : fmt(settings.SGC_amm_B, 1)} Nm³/MT ({result.caseType.startsWith('A') ? 'Case A' : 'Case B'})
                      </span>
                    </div>
                  </div>
                </div>
              </Card>

              <Card title="Variable Costs & Margins">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                        <th className="pb-3 font-semibold">Product</th>
                        <th className="pb-3 font-semibold text-right">VC ($/MT)</th>
                        <th className="pb-3 font-semibold text-right">Price ($/MT)</th>
                        <th className="pb-3 font-semibold text-right">Margin ($/MT)</th>
                        <th className="pb-3 font-semibold text-right">Volume (MT)</th>
                        <th className="pb-3 font-semibold text-right">Contribution</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      <MarginRow name="Ammonia" vc={result.vcAmm} price={ammP} vol={result.K11} color="text-amber-600 dark:text-amber-500" />
                      <MarginRow name="Methanol" vc={result.vcMeth} price={methP} vol={result.D5} color="text-purple-600 dark:text-purple-500" />
                      <MarginRow name="Urea" vc={result.vcUrea} price={ureaP} vol={result.K9} color="text-emerald-600 dark:text-emerald-500" />
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* VC Component Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <Card title="Ammonia VC Breakdown">
                  <div className="space-y-3">
                    <VCRow label="Gas (SGC × $/Nm³)" value={result.vcAmmBreakdown.gasVC} total={result.vcAmmBreakdown.total} color="bg-orange-500" />
                    <VCRow label="HP Steam" value={result.vcAmmBreakdown.hpSteamVC} total={result.vcAmmBreakdown.total} color="bg-red-500" />
                    <VCRow label="Power (GT + Import)" value={result.vcAmmBreakdown.powerVC} total={result.vcAmmBreakdown.total} color="bg-yellow-500" />
                    <VCRow label="Fresh Cooling Water" value={result.vcAmmBreakdown.fcwVC} total={result.vcAmmBreakdown.total} color="bg-cyan-500" />
                    <VCRow label="Demin Water" value={result.vcAmmBreakdown.deminVC} total={result.vcAmmBreakdown.total} color="bg-blue-500" />
                    <VCRow label="Sea Water" value={result.vcAmmBreakdown.swVC} total={result.vcAmmBreakdown.total} color="bg-teal-500" />
                    <div className="pt-3 border-t border-slate-800 flex justify-between">
                      <span className="text-xs font-bold text-amber-500 uppercase">Total</span>
                      <span className="text-xs font-mono font-bold text-amber">${fmt(result.vcAmmBreakdown.total, 2)}/MT</span>
                    </div>
                  </div>
                </Card>

                <Card title="Methanol VC Breakdown">
                  <div className="space-y-3">
                    <VCRow label="Gas (SGC × $/Nm³)" value={result.vcMethBreakdown.gasVC} total={result.vcMethBreakdown.total} color="bg-orange-500" />
                    <VCRow label="HP Steam" value={result.vcMethBreakdown.hpSteamVC} total={result.vcMethBreakdown.total} color="bg-red-500" />
                    <VCRow label="Power (GT + Import)" value={result.vcMethBreakdown.powerVC} total={result.vcMethBreakdown.total} color="bg-yellow-500" />
                    <VCRow label="Fresh Cooling Water" value={result.vcMethBreakdown.fcwVC} total={result.vcMethBreakdown.total} color="bg-cyan-500" />
                    <VCRow label="Demin Water" value={result.vcMethBreakdown.deminVC} total={result.vcMethBreakdown.total} color="bg-blue-500" />
                    <VCRow label="Sea Water" value={result.vcMethBreakdown.swVC} total={result.vcMethBreakdown.total} color="bg-teal-500" />
                    <div className="pt-3 border-t border-slate-800 flex justify-between">
                      <span className="text-xs font-bold text-purple-500 uppercase">Total</span>
                      <span className="text-xs font-mono font-bold text-amber">${fmt(result.vcMethBreakdown.total, 2)}/MT</span>
                    </div>
                  </div>
                </Card>

                <Card title="Urea VC Breakdown">
                  <div className="space-y-3">
                    <VCRow label="Ammonia Cost" value={result.vcUreaBreakdown.ammCostComponent} total={result.vcUreaBreakdown.total} color="bg-amber-500" />
                    <VCRow label="HP Steam" value={result.vcUreaBreakdown.hpSteamVC} total={result.vcUreaBreakdown.total} color="bg-red-500" />
                    <VCRow label="Power (imported)" value={result.vcUreaBreakdown.powerVC} total={result.vcUreaBreakdown.total} color="bg-yellow-500" />
                    <VCRow label="FCW" value={result.vcUreaBreakdown.fcwVC} total={result.vcUreaBreakdown.total} color="bg-cyan-500" />
                    <VCRow label="UF85 (MeOH-based)" value={result.vcUreaBreakdown.uf85VC + result.vcUreaBreakdown.uf85FCW + result.vcUreaBreakdown.uf85Power} total={result.vcUreaBreakdown.total} color="bg-purple-500" />
                    <VCRow label="CDR (all)" value={result.vcUreaBreakdown.cdrSW + result.vcUreaBreakdown.cdrFCW + result.vcUreaBreakdown.cdrPower + result.vcUreaBreakdown.cdrLPSteam} total={result.vcUreaBreakdown.total} color="bg-emerald-500" />
                    <VCRow label="MP Steam" value={result.vcUreaBreakdown.mpSteamVC} total={result.vcUreaBreakdown.total} color="bg-pink-500" />
                    <VCRow label="SW + Demin" value={result.vcUreaBreakdown.swVC + result.vcUreaBreakdown.deminVC} total={result.vcUreaBreakdown.total} color="bg-teal-500" />
                    <div className="pt-3 border-t border-slate-800 flex justify-between">
                      <span className="text-xs font-bold text-emerald-500 uppercase">Total</span>
                      <span className="text-xs font-mono font-bold text-amber">${fmt(result.vcUreaBreakdown.total, 2)}/MT</span>
                    </div>
                  </div>
                </Card>
              </div>
            </>
          )}

          {tab === 'shutdown' && (
            <div className="space-y-8">
              <Card title="Methanol Shutdown Analysis">
                <div className="h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={shutdownData.data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                      <XAxis dataKey="methPrice" stroke={chartTheme.text} fontSize={10} label={{ value: 'MeOH Price ($/MT)', position: 'insideBottom', offset: -10, fill: chartTheme.text, fontSize: 10 }} />
                      <YAxis stroke={chartTheme.text} fontSize={10} tickFormatter={(v: number) => `$${v}M`} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: chartTheme.tooltipBg, border: `1px solid ${chartTheme.tooltipBorder}`, borderRadius: '8px', color: chartTheme.tooltipColor }}
                        formatter={(value: number, name: string) => [`$MM ${value.toFixed(2)}`, name]}
                      />
                      <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', paddingBottom: '20px' }} />
                      <Area type="monotone" dataKey="runningProfit" fill="#10b981" fillOpacity={0.1} stroke="none" legendType="none" tooltipType="none" />
                      <Line type="monotone" dataKey="runningProfit" stroke="#10b981" strokeWidth={3} dot={false} name="MeOH Running" />
                      <Line type="monotone" dataKey="shutdownProfit" stroke="#f97316" strokeWidth={3} strokeDasharray="5 5" dot={false} name="MeOH Shutdown" />
                      {shutdownData.crossover && (
                        <ReferenceLine x={shutdownData.crossover} stroke="#fbbf24" strokeDasharray="3 3" label={{ value: `Shutdown: $${Math.round(shutdownData.crossover)}`, position: 'top', fill: '#fbbf24', fontSize: 10 }} />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <KPICard title="Shutdown Price" value={`$${Math.round(shutdownData.crossover || 0)}/MT`} sub="Economic Crossover" color="amber" />
                <KPICard title="MeOH Variable Cost" value={`$${Math.round(shutdownData.vcMeth)}/MT`} sub="Direct Production Cost" color="purple" />
                <KPICard title="Running Advantage" value={fmtM(result.profit - shutdownData.shutdownProfitVal)} sub="Current Market Delta" color="emerald" />
              </div>
            </div>
          )}

          {tab === 'sensitivity' && (
            <Card title="Profit vs Natural Gas Price">
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={gasSens} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                    <XAxis dataKey="gasPrice" stroke={chartTheme.text} fontSize={10} label={{ value: 'Gas Price ($/MMBTU)', position: 'insideBottom', offset: -10, fill: chartTheme.text, fontSize: 10 }} />
                    <YAxis stroke={chartTheme.text} fontSize={10} tickFormatter={(v: number) => `$${v}M`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: chartTheme.tooltipBg, border: `1px solid ${chartTheme.tooltipBorder}`, borderRadius: '8px', color: chartTheme.tooltipColor }}
                      formatter={(value: number, name: string) => [`$MM ${value.toFixed(2)}`, name]}
                    />
                    <Line type="monotone" dataKey="profit" stroke="#3b82f6" strokeWidth={3} dot={{ r: 3, fill: '#3b82f6' }} name="Monthly Profit" />
                    <ReferenceLine x={gasP} stroke="#fbbf24" strokeDasharray="3 3" label={{ value: `Current: $${gasP}`, position: 'top', fill: '#fbbf24', fontSize: 10 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {tab === 'settings' && (
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Plant Parameters</h2>
                  <p className="text-xs text-slate-500 mt-1">Adjust fixed model constants. Changes apply to all calculations in real-time.</p>
                </div>
                <button 
                  onClick={resetSettings}
                  className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset to Defaults
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                <SettingsCard title="Fixed Costs" icon={<Gauge className="w-4 h-4 text-rose-400" />}>
                  <SettingsInput label="Total Fixed Cost ($/month)" value={settings.FC_total} onChange={(v) => updateSetting('FC_total', v)} step={1000} />
                  <SettingsInput label="Ammonia Penalty Case B ($/MT)" value={settings.ammPenalty_B} onChange={(v) => updateSetting('ammPenalty_B', v)} step={1} />
                  <SettingsInput label="Ammonia Cap Loss Case B (MT/mo)" value={settings.ammCapLoss_B} onChange={(v) => updateSetting('ammCapLoss_B', v)} step={10} />
                  <SettingsInput label="Ammonia Cap Loss Case A (MT/mo)" value={settings.ammCapLoss_A} onChange={(v) => updateSetting('ammCapLoss_A', v)} step={10} />
                </SettingsCard>

                <SettingsCard title="Gas Consumption" icon={<Flame className="w-4 h-4 text-orange-400" />}>
                  <SettingsInput label="SGC Ammonia Case A (Nm³/MT)" value={settings.SGC_amm_A} onChange={(v) => updateSetting('SGC_amm_A', v)} step={0.1} />
                  <SettingsInput label="SGC Ammonia Case B (Nm³/MT)" value={settings.SGC_amm_B} onChange={(v) => updateSetting('SGC_amm_B', v)} step={0.1} />
                  <SettingsInput label="SGC Methanol (Nm³/MT)" value={settings.SGC_meth} onChange={(v) => updateSetting('SGC_meth', v)} step={0.1} />
                  <SettingsInput label="GT Gas (Nm³/day)" value={settings.GT_gas_per_day} onChange={(v) => updateSetting('GT_gas_per_day', v)} step={1000} />
                  <SettingsInput label="Flare Gas (Nm³/day)" value={settings.flare_gas_per_day} onChange={(v) => updateSetting('flare_gas_per_day', v)} step={100} />
                  <SettingsInput label="GT Additional Max (MMSCFD)" value={settings.GT_additional_max} onChange={(v) => updateSetting('GT_additional_max', v)} step={0.01} />
                </SettingsCard>

                <SettingsCard title="Boiler Specific Consumption" icon={<Flame className="w-4 h-4 text-blue-400" />}>
                  <SettingsInput label="Boiler NH₃ (Nm³/MT)" value={settings.boiler_amm} onChange={(v) => updateSetting('boiler_amm', v)} step={0.1} />
                  <SettingsInput label="Boiler MeOH (Nm³/MT)" value={settings.boiler_meth} onChange={(v) => updateSetting('boiler_meth', v)} step={0.1} />
                  <SettingsInput label="Boiler Urea (Nm³/MT)" value={settings.boiler_urea} onChange={(v) => updateSetting('boiler_urea', v)} step={0.1} />
                </SettingsCard>

                <SettingsCard title="Gas Price Conversion" icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}>
                  <SettingsInput label="Base BHD/Nm³ (GPU!B21)" value={settings.gas_bhd_per_nm3_base} onChange={(v) => updateSetting('gas_bhd_per_nm3_base', v)} step={0.0001} decimals={5} />
                  <SettingsInput label="Base $/MMBTU (GPU!C21)" value={settings.gas_base_mmbtu} onChange={(v) => updateSetting('gas_base_mmbtu', v)} step={0.25} />
                  <SettingsInput label="BHD→USD Factor" value={settings.bhd_to_usd} onChange={(v) => updateSetting('bhd_to_usd', v)} step={0.01} decimals={2} />
                </SettingsCard>

                <SettingsCard title="Utility Prices (Linear with Gas)" icon={<Zap className="w-4 h-4 text-cyan-400" />}>
                  <SettingsInput label="MEW Power ($/kWh)" value={settings.MEW_power_price} onChange={(v) => updateSetting('MEW_power_price', v)} step={0.001} decimals={4} />
                  
                  <div className="pt-2 pb-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Sea Water</div>
                  <SettingsInput label="Slope" value={settings.SW_slope} onChange={(v) => updateSetting('SW_slope', v)} step={0.00001} decimals={7} />
                  <SettingsInput label="Intercept" value={settings.SW_intercept} onChange={(v) => updateSetting('SW_intercept', v)} step={0.00001} decimals={7} />

                  <div className="pt-2 pb-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fresh Cooling Water</div>
                  <SettingsInput label="Slope" value={settings.FCW_slope} onChange={(v) => updateSetting('FCW_slope', v)} step={0.00001} decimals={7} />
                  <SettingsInput label="Intercept" value={settings.FCW_intercept} onChange={(v) => updateSetting('FCW_intercept', v)} step={0.00001} decimals={7} />

                  <div className="pt-2 pb-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Demin Water</div>
                  <SettingsInput label="Slope" value={settings.Demin_slope} onChange={(v) => updateSetting('Demin_slope', v)} step={0.0001} decimals={7} />
                  <SettingsInput label="Intercept" value={settings.Demin_intercept} onChange={(v) => updateSetting('Demin_intercept', v)} step={0.0001} decimals={7} />
                </SettingsCard>

                <SettingsCard title="Ammonia Power & Utilities" icon={<Factory className="w-4 h-4 text-amber-400" />}>
                  <SettingsInput label="GT Generated (MWH)" value={settings.amm_GT_gen} onChange={(v) => updateSetting('amm_GT_gen', v)} step={0.5} decimals={1} />
                  <SettingsInput label="Import Power (MWH)" value={settings.amm_Import_gen} onChange={(v) => updateSetting('amm_Import_gen', v)} step={0.5} decimals={1} />
                  <SettingsInput label="GT Nm³/kWh" value={settings.GT_nm3_per_kwh} onChange={(v) => updateSetting('GT_nm3_per_kwh', v)} step={0.001} decimals={3} />
                  <SettingsInput label="Total Power (kWh/yr)" value={settings.amm_total_power_annual} onChange={(v) => updateSetting('amm_total_power_annual', v)} step={10000} decimals={0} />
                  <SettingsInput label="Production (MT/yr)" value={settings.amm_prod_annual} onChange={(v) => updateSetting('amm_prod_annual', v)} step={100} decimals={0} />
                  <SettingsInput label="HP Steam (T/MT)" value={settings.amm_HP_steam} onChange={(v) => updateSetting('amm_HP_steam', v)} step={0.001} decimals={4} />
                  <SettingsInput label="HP Steam Nm³/T" value={settings.amm_HP_nm3_per_ton} onChange={(v) => updateSetting('amm_HP_nm3_per_ton', v)} step={1} decimals={0} />
                  <SettingsInput label="SW (m³/MT)" value={settings.amm_SW} onChange={(v) => updateSetting('amm_SW', v)} step={0.1} decimals={4} />
                  <SettingsInput label="FCW (m³/MT)" value={settings.amm_FCW} onChange={(v) => updateSetting('amm_FCW', v)} step={0.1} decimals={4} />
                  <SettingsInput label="Demin (m³/MT)" value={settings.amm_Demin} onChange={(v) => updateSetting('amm_Demin', v)} step={0.01} decimals={4} />
                </SettingsCard>

                <SettingsCard title="Methanol Power & Utilities" icon={<Factory className="w-4 h-4 text-purple-400" />}>
                  <SettingsInput label="Total Power (kWh/yr)" value={settings.meth_total_power_annual} onChange={(v) => updateSetting('meth_total_power_annual', v)} step={10000} decimals={0} />
                  <SettingsInput label="Production (MT/yr)" value={settings.meth_prod_annual} onChange={(v) => updateSetting('meth_prod_annual', v)} step={100} decimals={0} />
                  <SettingsInput label="HP Steam (T/MT)" value={settings.meth_HP_steam} onChange={(v) => updateSetting('meth_HP_steam', v)} step={0.001} decimals={6} />
                  <SettingsInput label="SW (m³/MT)" value={settings.meth_SW} onChange={(v) => updateSetting('meth_SW', v)} step={0.1} decimals={4} />
                  <SettingsInput label="FCW (m³/MT)" value={settings.meth_FCW} onChange={(v) => updateSetting('meth_FCW', v)} step={0.1} decimals={4} />
                  <SettingsInput label="Demin (m³/MT)" value={settings.meth_Demin} onChange={(v) => updateSetting('meth_Demin', v)} step={0.01} decimals={4} />
                </SettingsCard>

                <SettingsCard title="Urea VC Parameters" icon={<Factory className="w-4 h-4 text-green-400" />}>
                  <SettingsInput label="NH₃ Spec Cons (MT/MT)" value={settings.urea_amm_spec} onChange={(v) => updateSetting('urea_amm_spec', v)} step={0.001} decimals={4} />
                  <SettingsInput label="Power (kWh/MT)" value={settings.urea_power} onChange={(v) => updateSetting('urea_power', v)} step={0.1} decimals={4} />
                  <SettingsInput label="CDR CO₂ (Nm³/MT)" value={settings.CDR_co2} onChange={(v) => updateSetting('CDR_co2', v)} step={0.1} decimals={4} />
                  <SettingsInput label="CDR SW (m³/Nm³)" value={settings.CDR_SW} onChange={(v) => updateSetting('CDR_SW', v)} step={0.001} decimals={4} />
                  <SettingsInput label="CDR FCW (m³/Nm³)" value={settings.CDR_FCW} onChange={(v) => updateSetting('CDR_FCW', v)} step={0.0001} decimals={4} />
                  <SettingsInput label="CDR Power (kWh/Nm³)" value={settings.CDR_power} onChange={(v) => updateSetting('CDR_power', v)} step={0.0001} decimals={5} />
                  <SettingsInput label="CDR LP Steam (T/Nm³)" value={settings.CDR_LP_steam} onChange={(v) => updateSetting('CDR_LP_steam', v)} step={0.0001} decimals={4} />
                  <SettingsInput label="HP Steam (T/MT)" value={settings.urea_HP_steam} onChange={(v) => updateSetting('urea_HP_steam', v)} step={0.001} decimals={4} />
                  <SettingsInput label="MP Steam (T/MT)" value={settings.urea_MP_steam} onChange={(v) => updateSetting('urea_MP_steam', v)} step={0.001} decimals={4} />
                  <SettingsInput label="SW (m³/MT)" value={settings.urea_SW} onChange={(v) => updateSetting('urea_SW', v)} step={0.1} decimals={4} />
                  <SettingsInput label="FCW (m³/MT)" value={settings.urea_FCW} onChange={(v) => updateSetting('urea_FCW', v)} step={0.1} decimals={4} />
                  <SettingsInput label="Demin (m³/MT)" value={settings.urea_Demin} onChange={(v) => updateSetting('urea_Demin', v)} step={0.001} decimals={4} />
                  <SettingsInput label="UF85 (MT/MT)" value={settings.UF85_cons} onChange={(v) => updateSetting('UF85_cons', v)} step={0.0001} decimals={7} />
                  <SettingsInput label="UF85 MeOH Cons" value={settings.UF85_meth_cons} onChange={(v) => updateSetting('UF85_meth_cons', v)} step={0.001} decimals={4} />
                </SettingsCard>

                <SettingsCard title="Process Coefficients" icon={<Activity className="w-4 h-4 text-purple-400" />}>
                  <SettingsInput label="NH₃ → Urea (K7)" value={settings.K7} onChange={(v) => updateSetting('K7', v)} step={0.01} decimals={4} />
                  <SettingsInput label="Alpha (PSA coefficient)" value={settings.alpha} onChange={(v) => updateSetting('alpha', v)} step={0.001} decimals={6} />
                  <SettingsInput label="CO₂ Capacity Coefficient" value={settings.C33_coeff} onChange={(v) => updateSetting('C33_coeff', v)} step={0.001} decimals={4} />
                  <SettingsInput label="NM³ → MMSCFD Factor" value={settings.NM3_to_MMSCFD} onChange={(v) => updateSetting('NM3_to_MMSCFD', v)} step={0.001} decimals={3} />
                </SettingsCard>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ─── Components ──────────────────────────────────────────

function ControlSlider({ label, value, onChange, min, max, step = 1, unit }: { 
  label: string, value: number, onChange: (v: number) => void, min: number, max: number, step?: number, unit: string 
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</label>
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 rounded-md px-2 py-1 border border-slate-300 dark:border-slate-700 focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/50 transition-all">
          <input
            type="number"
            value={value}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v)) onChange(v);
            }}
            step={step}
            className="w-16 bg-transparent text-xs font-mono font-bold text-slate-900 dark:text-white text-right focus:outline-none appearance-none"
          />
          <span className="text-[10px] text-slate-500 font-normal select-none">{unit}</span>
        </div>
      </div>
      <input 
        type="range" 
        min={min} 
        max={max} 
        step={step} 
        value={value} 
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400 transition-all"
      />
    </div>
  );
}

function TabButton({ active, onClick, label, icon }: { active: boolean, onClick: () => void, label: string, icon: React.ReactNode }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-1.5 rounded-md text-[11px] font-semibold transition-all uppercase tracking-wider",
        active ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function KPICard({ title, value, sub, color, big }: { title: string, value: string, sub?: string, color: string, big?: boolean }) {
  const colors: Record<string, string> = {
    emerald: 'border-emerald-500/20 text-emerald-600 dark:text-emerald-500',
    amber: 'border-amber-500/20 text-amber-600 dark:text-amber-500',
    purple: 'border-purple-500/20 text-purple-600 dark:text-purple-500',
    green: 'border-green-500/20 text-green-600 dark:text-green-500',
    rose: 'border-rose-500/20 text-rose-600 dark:text-rose-500',
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-lg transition-colors duration-300">
      <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">{title}</h3>
      <div className={cn("font-bold font-mono tracking-tight", big ? "text-3xl" : "text-xl", colors[color])}>{value}</div>
      {sub && <p className="text-[10px] text-slate-500 dark:text-slate-600 mt-1 font-medium">{sub}</p>}
    </div>
  );
}

function Card({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl transition-colors duration-300">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-1 h-4 bg-emerald-500 rounded-full" />
        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function BreakdownItem({ label, value, color, max }: { label: string, value: number, color: string, max: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[11px]">
        <span className="text-slate-500 dark:text-slate-400">{label}</span>
        <span className="text-slate-900 dark:text-slate-200 font-mono font-semibold">{fmtM(value)}</span>
      </div>
      <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
      </div>
    </div>
  );
}

function GasItem({ label, value, total, color }: { label: string, value: number, total: number, color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="text-center space-y-2">
      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{label}</div>
      <div className="text-sm font-mono font-bold text-slate-900 dark:text-slate-200">{fmt(value / 1e6, 2)}M</div>
      <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mx-2">
        <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[10px] text-slate-500 dark:text-slate-600 font-mono">{fmt(pct, 1)}%</div>
    </div>
  );
}

function MarginRow({ name, vc, price, vol, color }: { name: string, vc: number, price: number, vol: number, color: string }) {
  const margin = price - vc;
  return (
    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
      <td className={cn("py-4 font-semibold", color)}>{name}</td>
      <td className="py-4 text-right font-mono text-slate-500 dark:text-slate-400">${fmt(vc, 1)}</td>
      <td className="py-4 text-right font-mono text-slate-500 dark:text-slate-400">${fmt(price, 1)}</td>
      <td className={cn("py-4 text-right font-mono font-bold", margin >= 0 ? 'text-emerald-600 dark:text-emerald-500' : 'text-rose-600 dark:text-rose-500')}>${fmt(margin, 1)}</td>
      <td className="py-4 text-right font-mono text-slate-500 dark:text-slate-400">{fmt(vol, 0)}</td>
      <td className="py-4 text-right font-mono text-slate-900 dark:text-slate-200 font-semibold">{fmtM(margin * vol)}</td>
    </tr>
  );
}

function SettingsCard({ title, icon, children }: { title: string, icon: React.ReactNode, children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl transition-colors duration-300">
      <div className="flex items-center gap-2 mb-5">
        {icon}
        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">{title}</h3>
      </div>
      <div className="space-y-4">
        {children}
      </div>
    </div>
  );
}

function VCRow({ label, value, total, color }: { label: string, value: number, total: number, color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px]">
        <span className="text-slate-500 dark:text-slate-400">{label}</span>
        <span className="text-slate-700 dark:text-slate-300 font-mono">${value.toFixed(2)} <span className="text-slate-400 dark:text-slate-600">({pct.toFixed(1)}%)</span></span>
      </div>
      <div className="h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SettingsInput({ label, value, onChange, step = 1, decimals = 2 }: { 
  label: string, value: number, onChange: (v: number) => void, step?: number, decimals?: number 
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">{label}</label>
      <input 
        type="number"
        value={Number(value.toFixed(decimals))}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onChange(v);
        }}
        step={step}
        className="w-36 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-right text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-colors"
      />
    </div>
  );
}
