/**
 * GPIC Complex Optimizer — App.tsx
 * All changes applied: GT toggle, dynamic alpha, methMin_MTD,
 * GPIC branding, mobile responsive, status banner, print button.
 *
 * NOTE: Place your logo file at src/assets/gpic-logo.png before running.
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
  Moon,
  Menu,
  Printer,
  X,
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
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
} from 'recharts';
import {
  useLPSolver,
  solveLP,
  calcVC,
  BASE_DEFAULTS,
  type Settings,
  type LPResult,
} from './hooks/useLPSolver';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// ─── Uncomment after placing the logo file at src/assets/gpic-logo.png ───
// import gpicLogo from './assets/gpic-logo.png';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_DAYS = [31,28,31,30,31,30,31,31,30,31,30,31];

const fmt = (n: number | null, d = 0) =>
  n == null ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtM = (n: number | null) =>
  n == null ? '—' : `$${(n / 1e6).toFixed(2)}M`;

// ─── Brand Colors (GPIC Official) ───────────────────────────────────────────
const GPIC_GREEN = '#006341';
const GPIC_NAVY  = '#001A71';
const GPIC_RED   = '#E70033';

export default function App() {
  const [ammP, setAmmP]       = useState(325);
  const [methP, setMethP]     = useState(80);
  const [ureaP, setUreaP]     = useState(400);
  const [gasP, setGasP]       = useState(4.5);
  const [maxAmm, setMaxAmm]   = useState(1320);
  const [maxMeth, setMaxMeth] = useState(1250);
  const [maxUrea, setMaxUrea] = useState(2150);
  const [maxGas, setMaxGas]   = useState(128);
  const [monthIdx, setMonthIdx] = useState(4);
  const [tab, setTab]         = useState('optimizer');
  const [theme, setTheme]     = useState<'dark' | 'light'>('dark');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [gtRunning, setGtRunning]     = useState(true);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);

  const [settings, setSettings] = useState<Settings>({ ...BASE_DEFAULTS } as Settings);

  const resetSettings = useCallback(() => {
    setSettings({ ...BASE_DEFAULTS } as Settings);
  }, []);

  const updateSetting = useCallback((key: keyof Settings, value: number) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  const days = MONTH_DAYS[monthIdx];

  // ─── Core LP Result ───
  const result = useLPSolver(ammP, methP, ureaP, gasP, maxAmm, maxMeth, maxUrea, maxGas, days, settings, gtRunning);

  // ─── Shutdown Analysis ───
  const shutdownData = useMemo(() => {
    const vc = calcVC(gasP, settings, gtRunning);
    const K1 = days;
    const R4 = K1 * maxAmm;
    const T4 = K1 * maxUrea;

    const K10_shut = R4 - settings.ammCapLoss_B;
    const C33_shut = settings.C33_coeff * K10_shut;
    const K9_shut  = Math.min(T4, C33_shut);
    const K8_shut  = settings.K7 * K9_shut;
    const K11_shut = K10_shut - K8_shut;
    const shutdownProfit = (ammP - vc.amm_B) * K11_shut + (ureaP - vc.urea_B) * K9_shut - settings.FC_total;

    const data = [];
    let crossover = null as number | null;
    let prevDiff  = null as number | null;

    for (let mp = 0; mp <= 350; mp += 5) {
      const r = solveLP(ammP, mp, ureaP, gasP, maxAmm, maxMeth, maxUrea, maxGas, days, settings, 'A', gtRunning);
      const diff = r.profit - shutdownProfit;
      if (prevDiff !== null && prevDiff <= 0 && diff > 0 && crossover === null) {
        crossover = (mp - 5) + 5 * (-prevDiff) / (diff - prevDiff);
      }
      prevDiff = diff;
      data.push({ methPrice: mp, runningProfit: r.profit / 1e6, shutdownProfit: shutdownProfit / 1e6 });
    }
    return { data, crossover, vcMeth: vc.meth, shutdownProfitVal: shutdownProfit };
  }, [ammP, ureaP, gasP, maxAmm, maxMeth, maxUrea, maxGas, days, settings, gtRunning]);

  // ─── Gas Sensitivity ───
  const gasSens = useMemo(() => {
    const data = [];
    for (let g = 0.5; g <= 10; g += 0.5) {
      const r = solveLP(ammP, methP, ureaP, g, maxAmm, maxMeth, maxUrea, maxGas, days, settings, undefined, gtRunning);
      data.push({ gasPrice: g, profit: r.profit / 1e6 });
    }
    return data;
  }, [ammP, methP, ureaP, maxAmm, maxMeth, maxUrea, maxGas, days, settings, gtRunning]);

  const chartTheme = theme === 'dark' ? {
    grid: '#1e293b', text: '#94a3b8',
    tooltipBg: '#1e293b', tooltipBorder: '#334155', tooltipColor: '#f8fafc',
    barCap: '#475569',
  } : {
    grid: '#e2e8f0', text: '#64748b',
    tooltipBg: '#ffffff', tooltipBorder: '#cbd5e1', tooltipColor: '#0f172a',
    barCap: '#cbd5e1',
  };

  return (
    <div className={cn(
      "min-h-screen font-sans selection:bg-emerald-500/30 transition-colors duration-300",
      theme === 'dark' ? 'dark bg-slate-950 text-slate-200' : 'bg-slate-50 text-slate-900'
    )}>

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside className={cn(
        "fixed left-0 top-0 h-full w-80 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-6 overflow-y-auto z-30 shadow-2xl transition-all duration-300",
        sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>

        {/* GPIC brand stripe — red at ~25% width per brand guidelines */}
        <div className="flex -mx-6 -mt-6 mb-6">
          <div className="w-1/4 h-1" style={{ backgroundColor: GPIC_NAVY }} />
          <div className="w-1/4 h-1" style={{ backgroundColor: GPIC_RED }} />
        </div>

        {/* Logo / Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            {/* Logo image — replace Factory icon once gpic-logo.png is placed in src/assets/ */}
            {/* <img src={gpicLogo} alt="GPIC" className="w-28 object-contain p-1 dark:brightness-90" /> */}
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md" style={{ backgroundColor: `${GPIC_GREEN}18` }}>
                  <Factory className="w-5 h-5" style={{ color: GPIC_GREEN }} />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: GPIC_GREEN }}>GPIC</span>
              </div>
              <h1 className="text-sm font-bold tracking-tight pl-8" style={{ color: GPIC_NAVY }}>
                Complex Optimizer
              </h1>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-8">
          <section>
            <div className="flex items-center gap-2 mb-4 text-slate-500 dark:text-slate-400">
              <Settings2 className="w-4 h-4" />
              <h2 className="text-xs font-semibold uppercase tracking-wider">Market Controls</h2>
            </div>

            <div className="space-y-6">
              <ControlSlider label="Ammonia Price"  value={ammP}   onChange={setAmmP}   min={200} max={900} unit="$/MT" />
              <ControlSlider label="Methanol Price" value={methP}  onChange={setMethP}  min={0}   max={900} unit="$/MT" />
              <ControlSlider label="Urea Price"     value={ureaP}  onChange={setUreaP}  min={200} max={900} unit="$/MT" />
              <ControlSlider label="Natural Gas"    value={gasP}   onChange={setGasP}   min={0.5} max={10}  step={0.25} unit="$/MMBTU" />
              <ControlSlider label="Max Gas Limit"  value={maxGas} onChange={setMaxGas} min={80}  max={150} unit="MMSCFD" />

              {/* GT Toggle */}
              <div className="flex items-center justify-between pt-1">
                <div className="space-y-0.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Gas Turbine (GT)
                  </label>
                  <p className="text-[10px] text-slate-400 dark:text-slate-600">
                    {gtRunning ? 'GT on — power split + gas load active' : 'GT off — 100% MEW import power'}
                  </p>
                </div>
                <button
                  onClick={() => setGtRunning(prev => !prev)}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none",
                    gtRunning ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"
                  )}
                >
                  <span className={cn(
                    "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition-transform duration-200",
                    gtRunning ? "translate-x-5" : "translate-x-0"
                  )} />
                </button>
              </div>

              {/* Plant Capacities */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2 mb-4 text-slate-500 dark:text-slate-400">
                  <Gauge className="w-4 h-4" />
                  <h2 className="text-xs font-semibold uppercase tracking-wider">Plant Capacities</h2>
                </div>
                <div className="space-y-6">
                  <ControlSlider label="Max Ammonia" value={maxAmm}  onChange={setMaxAmm}  min={1000} max={1500} unit="MT/D" />
                  <ControlSlider label="Max Methanol" value={maxMeth} onChange={setMaxMeth} min={800}  max={1500} unit="MT/D" />
                  <ControlSlider label="Max Urea"     value={maxUrea} onChange={setMaxUrea} min={1500} max={2500} unit="MT/D" />
                </div>
              </div>

              {/* Month Selector */}
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
                Model v32: Component-level VC — Gas, Power (GT/Import), HP/MP/LP Steam, SW, FCW, Demin, CDR, UF85.
                Dynamic alpha scales ammonia capacity with methanol load.
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="md:pl-80 min-h-screen transition-all duration-300">

        {/* Header */}
        <header className="no-print h-14 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 md:px-6 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md sticky top-0 z-10 transition-colors duration-300">
          <div className="flex items-center gap-3 md:gap-4">
            {/* Hamburger — mobile only */}
            <button
              onClick={() => setSidebarOpen(prev => !prev)}
              className="md:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            {/* Tab nav — scrollable on mobile */}
            <nav className="flex gap-1 bg-slate-100 dark:bg-slate-900/50 p-1 rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto scrollbar-hide max-w-[60vw] md:max-w-none">
              <TabButton active={tab === 'optimizer'}   onClick={() => { setTab('optimizer');   setSidebarOpen(false); }} label="Optimizer"      icon={<Zap       className="w-3.5 h-3.5" />} />
              <TabButton active={tab === 'shutdown'}    onClick={() => { setTab('shutdown');    setSidebarOpen(false); }} label="MeOH Shutdown" icon={<Activity   className="w-3.5 h-3.5" />} />
              <TabButton active={tab === 'sensitivity'} onClick={() => { setTab('sensitivity'); setSidebarOpen(false); }} label="Gas Sensitivity" icon={<TrendingUp className="w-3.5 h-3.5" />} />
              <TabButton active={tab === 'settings'}    onClick={() => { setTab('settings');    setSidebarOpen(false); }} label="Settings"        icon={<Settings2  className="w-3.5 h-3.5" />} />
            </nav>
          </div>
          <div className="flex items-center gap-2">
            {/* Print / Export */}
            <button
              onClick={() => window.print()}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              Export
            </button>
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* ── Status Banner ── */}
        <StatusBanner result={result} />

        {/* ── Page Content ── */}
        <div className="p-4 md:p-8 space-y-6 md:space-y-8">

          {/* ════════════════ OPTIMIZER TAB ════════════════ */}
          {tab === 'optimizer' && (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 md:gap-4">
                <KPICard
                  title="Net Monthly Profit"
                  value={fmtM(result.profit)}
                  sub={`Case ${result.caseType} • ${MONTHS[monthIdx]}`}
                  color={result.profit >= 0 ? 'emerald' : 'rose'}
                  big
                />
                <KPICard title="Ammonia"  value={`${fmt(result.dailyAmm,  1)} MT/D`} sub={`${fmt(result.K11, 0)} MT saleable`} color="amber"  />
                <KPICard title="Methanol" value={`${fmt(result.dailyMeth, 1)} MT/D`} sub={`${fmt(result.D5,  0)} MT total`}    color="purple" />
                <KPICard title="Urea"     value={`${fmt(result.dailyUrea, 1)} MT/D`} sub={`${fmt(result.K9,  0)} MT saleable`} color="green"  />
                <KPICard title="Gas Consumption" value={`${fmt(result.gas, 2)} MMSCFD`} sub={`${fmt(result.gasBeforeGT, 2)} base + GT`} color="rose" />
              </div>

              {/* Production vs Capacity + Profit Contribution */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
                <Card title="Production vs Capacity">
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[
                          { name: 'Ammonia',  prod: result.dailyAmm,  cap: maxAmm  },
                          { name: 'Methanol', prod: result.dailyMeth, cap: maxMeth },
                          { name: 'Urea',     prod: result.dailyUrea, cap: maxUrea },
                        ]}
                        layout="vertical"
                        margin={{ left: 20, right: 30 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} horizontal={false} />
                        <XAxis type="number" stroke={chartTheme.text} fontSize={10} />
                        <YAxis dataKey="name" type="category" stroke={chartTheme.text} fontSize={10} width={70} />
                        <Tooltip
                          contentStyle={{ backgroundColor: chartTheme.tooltipBg, border: `1px solid ${chartTheme.tooltipBorder}`, borderRadius: '8px', color: chartTheme.tooltipColor }}
                          itemStyle={{ color: chartTheme.tooltipColor }}
                        />
                        <Legend wrapperStyle={{ fontSize: '10px', color: chartTheme.text }} />
                        <Bar dataKey="prod" fill={GPIC_GREEN}      name="Production" radius={[0,2,2,0]} />
                        <Bar dataKey="cap"  fill={chartTheme.barCap} name="Capacity"   radius={[0,2,2,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card title="Profit Contribution">
                  <div className="space-y-4">
                    {(() => {
                      const ammContrib  = (ammP  - result.vcAmm)  * result.K11;
                      const methContrib = (methP - result.vcMeth) * result.D5;
                      const ureaContrib = (ureaP - result.vcUrea) * result.K9;
                      const total = Math.abs(ammContrib) + Math.abs(methContrib) + Math.abs(ureaContrib);
                      return (
                        <>
                          <BreakdownItem label="Ammonia"  value={ammContrib}  color="bg-amber-500"  max={total} />
                          <BreakdownItem label="Methanol" value={methContrib} color="bg-purple-500" max={total} />
                          <BreakdownItem label="Urea"     value={ureaContrib} color="bg-emerald-500" max={total} />
                          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-between text-[11px]">
                            <span className="text-slate-500">Fixed Costs</span>
                            <span className="font-mono font-semibold text-rose-500">{fmtM(-settings.FC_total)}</span>
                          </div>
                          <div className="flex justify-between text-[11px]">
                            <span className="font-semibold text-slate-700 dark:text-slate-300">Net Profit</span>
                            <span className={cn(
                              "font-mono font-bold",
                              result.profit >= 0 ? 'text-emerald-600 dark:text-emerald-500' : 'text-rose-600 dark:text-rose-500'
                            )}>
                              {fmtM(result.profit)}
                            </span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </Card>
              </div>

              {/* Gas Consumption Breakdown */}
              <Card title="Gas Consumption Breakdown">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  <GasItem label="Ammonia"      value={result.gasBreakdown.ammonia_nm3}  total={result.gasTotal_nm3} color="bg-amber-500"  />
                  <GasItem label="Methanol"     value={result.gasBreakdown.methanol_nm3} total={result.gasTotal_nm3} color="bg-purple-500" />
                  <GasItem label="Boilers"      value={result.gasBreakdown.boiler_nm3}   total={result.gasTotal_nm3} color="bg-blue-500"   />
                  <GasItem label="Gas Turbine"  value={result.gasBreakdown.gt_nm3}       total={result.gasTotal_nm3} color="bg-orange-500" />
                  <GasItem label="Flare"        value={result.gasBreakdown.flare_nm3}    total={result.gasTotal_nm3} color="bg-slate-500"  />
                </div>
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-6 text-[11px]">
                  <div>
                    <span className="text-slate-500">Base (before GT topup)</span>
                    <span className="ml-2 font-mono font-semibold text-slate-700 dark:text-slate-300">{fmt(result.gasBeforeGT, 2)} MMSCFD</span>
                  </div>
                  <div>
                    <span className="text-slate-500">After GT topup</span>
                    <span className="ml-2 font-mono font-semibold text-slate-700 dark:text-slate-300">{fmt(result.gas, 2)} MMSCFD</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Limit</span>
                    <span className="ml-2 font-mono font-semibold text-slate-700 dark:text-slate-300">{fmt(maxGas, 2)} MMSCFD</span>
                  </div>
                  <div>
                    <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded-full", gtRunning ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-500" : "bg-slate-200 dark:bg-slate-700 text-slate-500")}>
                      GT {gtRunning ? 'ON' : 'OFF'}
                    </span>
                  </div>
                </div>
              </Card>

              {/* Contribution Margin Analysis Table */}
              <Card title="Contribution Margin Analysis">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[500px]">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800">
                        {['Product','VC ($/MT)','Price ($/MT)','Margin ($/MT)','Volume (MT)','Contribution'].map(h => (
                          <th key={h} className={cn("py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500", h === 'Product' ? 'text-left' : 'text-right')}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      <MarginRow name="Ammonia"  vc={result.vcAmm}  price={ammP}  vol={result.K11} color="text-amber-600 dark:text-amber-500"  />
                      <MarginRow name="Methanol" vc={result.vcMeth} price={methP} vol={result.D5}  color="text-purple-600 dark:text-purple-500" />
                      <MarginRow name="Urea"     vc={result.vcUrea} price={ureaP} vol={result.K9}  color="text-emerald-600 dark:text-emerald-500" />
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Variable Cost Breakdown (3 columns) */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
                <Card title="Ammonia Variable Cost">
                  <div className="space-y-2">
                    <VCRow label="Gas"       value={result.vcAmmBreakdown.gasVC}     total={result.vcAmmBreakdown.total} color="bg-orange-500" />
                    <VCRow label="Power"     value={result.vcAmmBreakdown.powerVC}   total={result.vcAmmBreakdown.total} color="bg-blue-500"   />
                    <VCRow label="HP Steam"  value={result.vcAmmBreakdown.hpSteamVC} total={result.vcAmmBreakdown.total} color="bg-cyan-500"   />
                    <VCRow label="Sea Water" value={result.vcAmmBreakdown.swVC}      total={result.vcAmmBreakdown.total} color="bg-teal-500"   />
                    <VCRow label="FCW"       value={result.vcAmmBreakdown.fcwVC}     total={result.vcAmmBreakdown.total} color="bg-green-500"  />
                    <VCRow label="Demin"     value={result.vcAmmBreakdown.deminVC}   total={result.vcAmmBreakdown.total} color="bg-emerald-500" />
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between text-[11px] font-semibold">
                      <span className="text-slate-600 dark:text-slate-300">Total</span>
                      <span className="font-mono text-amber-600 dark:text-amber-500">${fmt(result.vcAmmBreakdown.total, 2)}/MT</span>
                    </div>
                  </div>
                </Card>

                <Card title="Methanol Variable Cost">
                  <div className="space-y-2">
                    <VCRow label="Gas"       value={result.vcMethBreakdown.gasVC}     total={result.vcMethBreakdown.total} color="bg-orange-500" />
                    <VCRow label="Power"     value={result.vcMethBreakdown.powerVC}   total={result.vcMethBreakdown.total} color="bg-blue-500"   />
                    <VCRow label="HP Steam"  value={result.vcMethBreakdown.hpSteamVC} total={result.vcMethBreakdown.total} color="bg-cyan-500"   />
                    <VCRow label="Sea Water" value={result.vcMethBreakdown.swVC}      total={result.vcMethBreakdown.total} color="bg-teal-500"   />
                    <VCRow label="FCW"       value={result.vcMethBreakdown.fcwVC}     total={result.vcMethBreakdown.total} color="bg-green-500"  />
                    <VCRow label="Demin"     value={result.vcMethBreakdown.deminVC}   total={result.vcMethBreakdown.total} color="bg-emerald-500" />
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between text-[11px] font-semibold">
                      <span className="text-slate-600 dark:text-slate-300">Total</span>
                      <span className="font-mono text-purple-600 dark:text-purple-500">${fmt(result.vcMethBreakdown.total, 2)}/MT</span>
                    </div>
                  </div>
                </Card>

                <Card title="Urea Variable Cost">
                  <div className="space-y-2">
                    <VCRow label="NH₃ Cost"        value={result.vcUreaBreakdown.ammCostComponent}  total={result.vcUreaBreakdown.total} color="bg-amber-500"  />
                    <VCRow label="Power"            value={result.vcUreaBreakdown.powerVC}           total={result.vcUreaBreakdown.total} color="bg-blue-500"   />
                    <VCRow label="CDR (all)"        value={result.vcUreaBreakdown.cdrSW + result.vcUreaBreakdown.cdrFCW + result.vcUreaBreakdown.cdrPower + result.vcUreaBreakdown.cdrLPSteam} total={result.vcUreaBreakdown.total} color="bg-cyan-500" />
                    <VCRow label="HP Steam"         value={result.vcUreaBreakdown.hpSteamVC}         total={result.vcUreaBreakdown.total} color="bg-indigo-500" />
                    <VCRow label="MP Steam"         value={result.vcUreaBreakdown.mpSteamVC}         total={result.vcUreaBreakdown.total} color="bg-violet-500" />
                    <VCRow label="SW + FCW + Demin" value={result.vcUreaBreakdown.swVC + result.vcUreaBreakdown.fcwVC + result.vcUreaBreakdown.deminVC} total={result.vcUreaBreakdown.total} color="bg-teal-500" />
                    <VCRow label="UF85"             value={result.vcUreaBreakdown.uf85VC + result.vcUreaBreakdown.uf85FCW + result.vcUreaBreakdown.uf85Power} total={result.vcUreaBreakdown.total} color="bg-rose-500" />
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between text-[11px] font-semibold">
                      <span className="text-slate-600 dark:text-slate-300">Total</span>
                      <span className="font-mono text-emerald-600 dark:text-emerald-500">${fmt(result.vcUreaBreakdown.total, 2)}/MT</span>
                    </div>
                  </div>
                </Card>
              </div>
            </>
          )}

          {/* ════════════════ SHUTDOWN TAB ════════════════ */}
          {tab === 'shutdown' && (
            <div className="space-y-6 md:space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <KPICard title="Shutdown Profit"  value={fmtM(shutdownData.shutdownProfitVal)} sub="Case B — MeOH ≈ 0"           color="amber"  />
                <KPICard title="MeOH Crossover"   value={shutdownData.crossover != null ? `$${fmt(shutdownData.crossover, 1)}/MT` : 'N/A'} sub="Break-even methanol price" color="purple" />
                <KPICard title="MeOH Variable Cost" value={`$${fmt(shutdownData.vcMeth, 1)}/MT`} sub="At current gas price"       color="rose"   />
              </div>

              <Card title="Running vs Shutdown — Profit vs Methanol Price">
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={shutdownData.data} margin={{ left: 10, right: 20, bottom: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                      <XAxis dataKey="methPrice" stroke={chartTheme.text} fontSize={10}
                        label={{ value: 'Methanol Price ($/MT)', position: 'insideBottom', offset: -6, fontSize: 10, fill: chartTheme.text }} />
                      <YAxis stroke={chartTheme.text} fontSize={10} tickFormatter={(v) => `$${v.toFixed(1)}M`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: chartTheme.tooltipBg, border: `1px solid ${chartTheme.tooltipBorder}`, borderRadius: '8px', color: chartTheme.tooltipColor }}
                        formatter={(v: number) => [`$${v.toFixed(2)}M`]}
                      />
                      <Legend wrapperStyle={{ fontSize: '10px', color: chartTheme.text }} />
                      {shutdownData.crossover != null && (
                        <ReferenceLine
                          x={Math.round(shutdownData.crossover / 5) * 5}
                          stroke={GPIC_RED} strokeDasharray="4 4"
                          label={{ value: `Break-even $${shutdownData.crossover.toFixed(0)}`, fill: GPIC_RED, fontSize: 10 }}
                        />
                      )}
                      <ReferenceLine x={methP} stroke={GPIC_GREEN} strokeDasharray="4 4"
                        label={{ value: `Current $${methP}`, fill: GPIC_GREEN, fontSize: 10 }} />
                      <Line type="monotone" dataKey="runningProfit"  stroke={GPIC_GREEN} strokeWidth={2} dot={false} name="Running (Case A)"   />
                      <Line type="monotone" dataKey="shutdownProfit" stroke={GPIC_RED}   strokeWidth={2} dot={false} name="Shutdown (Case B)" strokeDasharray="5 5" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <div className="p-4 rounded-xl border" style={{ backgroundColor: `${GPIC_NAVY}08`, borderColor: `${GPIC_NAVY}30` }}>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  <span className="font-semibold" style={{ color: GPIC_NAVY }}>Shutdown Analysis: </span>
                  Shows monthly profit under Case A (methanol at minimum load) vs Case B (methanol shutdown)
                  as methanol market price varies. The crossover is where running becomes more profitable.
                  {shutdownData.crossover != null && ` At $${gasP}/MMBTU gas, break-even methanol = $${shutdownData.crossover.toFixed(1)}/MT.`}
                </p>
              </div>
            </div>
          )}

          {/* ════════════════ SENSITIVITY TAB ════════════════ */}
          {tab === 'sensitivity' && (
            <div className="space-y-6 md:space-y-8">
              <Card title="Monthly Profit vs Natural Gas Price">
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={gasSens} margin={{ left: 10, right: 20, bottom: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                      <XAxis dataKey="gasPrice" stroke={chartTheme.text} fontSize={10}
                        label={{ value: 'Gas Price ($/MMBTU)', position: 'insideBottom', offset: -6, fontSize: 10, fill: chartTheme.text }} />
                      <YAxis stroke={chartTheme.text} fontSize={10} tickFormatter={(v) => `$${v.toFixed(0)}M`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: chartTheme.tooltipBg, border: `1px solid ${chartTheme.tooltipBorder}`, borderRadius: '8px', color: chartTheme.tooltipColor }}
                        formatter={(v: number) => [`$${v.toFixed(2)}M`, 'Monthly Profit']}
                        labelFormatter={(l) => `Gas: $${l}/MMBTU`}
                      />
                      <ReferenceLine x={gasP}  stroke={GPIC_RED}  strokeDasharray="4 4" label={{ value: `Current $${gasP}`, fill: GPIC_RED, fontSize: 10 }} />
                      <ReferenceLine y={0}      stroke={chartTheme.text} strokeDasharray="3 3" />
                      <Line type="monotone" dataKey="profit" stroke={GPIC_GREEN} strokeWidth={2.5} dot={false} name="Monthly Profit ($M)" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <div className="p-4 rounded-xl border" style={{ backgroundColor: `${GPIC_GREEN}08`, borderColor: `${GPIC_GREEN}30` }}>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  <span className="font-semibold" style={{ color: GPIC_GREEN }}>Sensitivity Analysis: </span>
                  Net monthly profit response to gas price changes from $0.5 to $10/MMBTU with all other
                  inputs held constant. Red dashed line = current gas price. Crossing $0 = break-even gas price.
                </p>
              </div>
            </div>
          )}

          {/* ════════════════ SETTINGS TAB ════════════════ */}
          {tab === 'settings' && (
            <div className="space-y-6 md:space-y-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Plant Parameters</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Adjust model constants sourced from Excel reference — v32</p>
                </div>
                <button
                  onClick={resetSettings}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset to Defaults
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                <SettingsCard title="Gas Consumption" icon={<Flame className="w-4 h-4 text-orange-400" />}>
                  <SettingsInput label="SGC Ammonia Case A (Nm³/MT)" value={settings.SGC_amm_A}        onChange={(v) => updateSetting('SGC_amm_A', v)}        step={0.1} />
                  <SettingsInput label="SGC Ammonia Case B (Nm³/MT)" value={settings.SGC_amm_B}        onChange={(v) => updateSetting('SGC_amm_B', v)}        step={0.1} />
                  <SettingsInput label="SGC Methanol (Nm³/MT)"       value={settings.SGC_meth}         onChange={(v) => updateSetting('SGC_meth', v)}         step={0.1} />
                  <SettingsInput label="GT Gas (Nm³/day)"            value={settings.GT_gas_per_day}   onChange={(v) => updateSetting('GT_gas_per_day', v)}   step={1000} decimals={0} />
                  <SettingsInput label="Flare Gas (Nm³/day)"         value={settings.flare_gas_per_day} onChange={(v) => updateSetting('flare_gas_per_day', v)} step={100} decimals={0} />
                  <SettingsInput label="GT Additional Max (MMSCFD)"  value={settings.GT_additional_max} onChange={(v) => updateSetting('GT_additional_max', v)} step={0.01} />
                </SettingsCard>

                <SettingsCard title="Boiler Specific Consumption" icon={<Flame className="w-4 h-4 text-blue-400" />}>
                  <SettingsInput label="Boiler NH₃ (Nm³/MT)"  value={settings.boiler_amm}  onChange={(v) => updateSetting('boiler_amm', v)}  step={0.1} />
                  <SettingsInput label="Boiler MeOH (Nm³/MT)" value={settings.boiler_meth} onChange={(v) => updateSetting('boiler_meth', v)} step={0.1} />
                  <SettingsInput label="Boiler Urea (Nm³/MT)" value={settings.boiler_urea} onChange={(v) => updateSetting('boiler_urea', v)} step={0.1} />
                </SettingsCard>

                <SettingsCard title="Gas Price Conversion" icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}>
                  <SettingsInput label="Base BHD/Nm³ (GPU!B21)"  value={settings.gas_bhd_per_nm3_base} onChange={(v) => updateSetting('gas_bhd_per_nm3_base', v)} step={0.0001} decimals={5} />
                  <SettingsInput label="Base $/MMBTU (GPU!C21)"  value={settings.gas_base_mmbtu}        onChange={(v) => updateSetting('gas_base_mmbtu', v)}        step={0.25} />
                  <SettingsInput label="BHD→USD Factor"          value={settings.bhd_to_usd}            onChange={(v) => updateSetting('bhd_to_usd', v)}            step={0.01} />
                </SettingsCard>

                <SettingsCard title="Utility Prices (Linear with Gas)" icon={<Zap className="w-4 h-4 text-cyan-400" />}>
                  <SettingsInput label="MEW Power ($/kWh)" value={settings.MEW_power_price} onChange={(v) => updateSetting('MEW_power_price', v)} step={0.001} decimals={4} />
                  <div className="pt-2 pb-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Sea Water</div>
                  <SettingsInput label="Slope"     value={settings.SW_slope}     onChange={(v) => updateSetting('SW_slope', v)}     step={0.00001} decimals={7} />
                  <SettingsInput label="Intercept" value={settings.SW_intercept} onChange={(v) => updateSetting('SW_intercept', v)} step={0.00001} decimals={7} />
                  <div className="pt-2 pb-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fresh Cooling Water</div>
                  <SettingsInput label="Slope"     value={settings.FCW_slope}     onChange={(v) => updateSetting('FCW_slope', v)}     step={0.00001} decimals={7} />
                  <SettingsInput label="Intercept" value={settings.FCW_intercept} onChange={(v) => updateSetting('FCW_intercept', v)} step={0.00001} decimals={7} />
                  <div className="pt-2 pb-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Demin Water</div>
                  <SettingsInput label="Slope"     value={settings.Demin_slope}     onChange={(v) => updateSetting('Demin_slope', v)}     step={0.0001} decimals={7} />
                  <SettingsInput label="Intercept" value={settings.Demin_intercept} onChange={(v) => updateSetting('Demin_intercept', v)} step={0.0001} decimals={7} />
                </SettingsCard>

                <SettingsCard title="Ammonia Power & Utilities" icon={<Factory className="w-4 h-4 text-amber-400" />}>
                  <SettingsInput label="GT Generated (MWH)"        value={settings.amm_GT_gen}              onChange={(v) => updateSetting('amm_GT_gen', v)}              step={0.5}   decimals={1} />
                  <SettingsInput label="Import Power (MWH)"        value={settings.amm_Import_gen}          onChange={(v) => updateSetting('amm_Import_gen', v)}          step={0.5}   decimals={1} />
                  <SettingsInput label="GT Nm³/kWh"                value={settings.GT_nm3_per_kwh}          onChange={(v) => updateSetting('GT_nm3_per_kwh', v)}          step={0.001} decimals={3} />
                  <SettingsInput label="Total Power (kWh/yr)"      value={settings.amm_total_power_annual}  onChange={(v) => updateSetting('amm_total_power_annual', v)}  step={10000} decimals={0} />
                  <SettingsInput label="Production (MT/yr)"        value={settings.amm_prod_annual}         onChange={(v) => updateSetting('amm_prod_annual', v)}         step={100}   decimals={0} />
                  <SettingsInput label="HP Steam (T/MT)"           value={settings.amm_HP_steam}            onChange={(v) => updateSetting('amm_HP_steam', v)}            step={0.001} decimals={4} />
                  <SettingsInput label="HP Steam Nm³/T"            value={settings.amm_HP_nm3_per_ton}      onChange={(v) => updateSetting('amm_HP_nm3_per_ton', v)}      step={1}     decimals={0} />
                  <SettingsInput label="SW (m³/MT)"                value={settings.amm_SW}                  onChange={(v) => updateSetting('amm_SW', v)}                  step={0.1}   decimals={4} />
                  <SettingsInput label="FCW (m³/MT)"               value={settings.amm_FCW}                 onChange={(v) => updateSetting('amm_FCW', v)}                 step={0.1}   decimals={4} />
                  <SettingsInput label="Demin (m³/MT)"             value={settings.amm_Demin}               onChange={(v) => updateSetting('amm_Demin', v)}               step={0.01}  decimals={4} />
                </SettingsCard>

                <SettingsCard title="Methanol Power & Utilities" icon={<Factory className="w-4 h-4 text-purple-400" />}>
                  <SettingsInput label="Total Power (kWh/yr)" value={settings.meth_total_power_annual} onChange={(v) => updateSetting('meth_total_power_annual', v)} step={10000} decimals={0} />
                  <SettingsInput label="Production (MT/yr)"   value={settings.meth_prod_annual}        onChange={(v) => updateSetting('meth_prod_annual', v)}        step={100}   decimals={0} />
                  <SettingsInput label="HP Steam (T/MT)"      value={settings.meth_HP_steam}           onChange={(v) => updateSetting('meth_HP_steam', v)}           step={0.001} decimals={6} />
                  <SettingsInput label="SW (m³/MT)"           value={settings.meth_SW}                 onChange={(v) => updateSetting('meth_SW', v)}                 step={0.1}   decimals={4} />
                  <SettingsInput label="FCW (m³/MT)"          value={settings.meth_FCW}                onChange={(v) => updateSetting('meth_FCW', v)}                step={0.1}   decimals={4} />
                  <SettingsInput label="Demin (m³/MT)"        value={settings.meth_Demin}              onChange={(v) => updateSetting('meth_Demin', v)}              step={0.01}  decimals={4} />
                </SettingsCard>

                <SettingsCard title="Urea VC Parameters" icon={<Factory className="w-4 h-4 text-green-400" />}>
                  <SettingsInput label="NH₃ Spec Cons (MT/MT)"   value={settings.urea_amm_spec}  onChange={(v) => updateSetting('urea_amm_spec', v)}  step={0.001} decimals={4} />
                  <SettingsInput label="Power (kWh/MT)"           value={settings.urea_power}     onChange={(v) => updateSetting('urea_power', v)}     step={0.1}   decimals={4} />
                  <SettingsInput label="CDR CO₂ (Nm³/MT)"         value={settings.CDR_co2}        onChange={(v) => updateSetting('CDR_co2', v)}        step={0.1}   decimals={4} />
                  <SettingsInput label="CDR SW (m³/Nm³)"          value={settings.CDR_SW}         onChange={(v) => updateSetting('CDR_SW', v)}         step={0.001} decimals={4} />
                  <SettingsInput label="CDR FCW (m³/Nm³)"         value={settings.CDR_FCW}        onChange={(v) => updateSetting('CDR_FCW', v)}        step={0.0001} decimals={4} />
                  <SettingsInput label="CDR Power (kWh/Nm³)"      value={settings.CDR_power}      onChange={(v) => updateSetting('CDR_power', v)}      step={0.0001} decimals={5} />
                  <SettingsInput label="CDR LP Steam (T/Nm³)"     value={settings.CDR_LP_steam}   onChange={(v) => updateSetting('CDR_LP_steam', v)}   step={0.0001} decimals={4} />
                  <SettingsInput label="HP Steam (T/MT)"          value={settings.urea_HP_steam}  onChange={(v) => updateSetting('urea_HP_steam', v)}  step={0.001} decimals={4} />
                  <SettingsInput label="MP Steam (T/MT)"          value={settings.urea_MP_steam}  onChange={(v) => updateSetting('urea_MP_steam', v)}  step={0.001} decimals={4} />
                  <SettingsInput label="SW (m³/MT)"               value={settings.urea_SW}        onChange={(v) => updateSetting('urea_SW', v)}        step={0.1}   decimals={4} />
                  <SettingsInput label="FCW (m³/MT)"              value={settings.urea_FCW}       onChange={(v) => updateSetting('urea_FCW', v)}       step={0.1}   decimals={4} />
                  <SettingsInput label="Demin (m³/MT)"            value={settings.urea_Demin}     onChange={(v) => updateSetting('urea_Demin', v)}     step={0.001} decimals={4} />
                  <SettingsInput label="UF85 (MT/MT)"             value={settings.UF85_cons}      onChange={(v) => updateSetting('UF85_cons', v)}      step={0.0001} decimals={7} />
                  <SettingsInput label="UF85 MeOH Cons"           value={settings.UF85_meth_cons} onChange={(v) => updateSetting('UF85_meth_cons', v)} step={0.001} decimals={4} />
                </SettingsCard>

                <SettingsCard title="Process Coefficients" icon={<Activity className="w-4 h-4 text-purple-400" />}>
                  <SettingsInput label="NH₃ → Urea (K7)"                  value={settings.K7}           onChange={(v) => updateSetting('K7', v)}           step={0.01}  decimals={4} />
                  <SettingsInput label="Min MeOH Load — Running (MT/D)"   value={settings.methMin_MTD}  onChange={(v) => updateSetting('methMin_MTD', v)}  step={1}     decimals={0} />
                  <SettingsInput label="CO₂ Capacity Coefficient"          value={settings.C33_coeff}    onChange={(v) => updateSetting('C33_coeff', v)}    step={0.001} decimals={4} />
                  <SettingsInput label="Ammonia Cap Loss @ Min MeOH (MT/mo)" value={settings.ammCapLoss_A} onChange={(v) => updateSetting('ammCapLoss_A', v)} step={10} decimals={0} />
                  <SettingsInput label="Ammonia Cap Loss — Shutdown (MT/mo)" value={settings.ammCapLoss_B} onChange={(v) => updateSetting('ammCapLoss_B', v)} step={10} decimals={0} />
                  <SettingsInput label="Ammonia Penalty Case B ($/MT)"    value={settings.ammPenalty_B} onChange={(v) => updateSetting('ammPenalty_B', v)} step={1}     decimals={0} />
                </SettingsCard>

                <SettingsCard title="Fixed Costs & Conversion" icon={<TrendingUp className="w-4 h-4 text-rose-400" />}>
                  <SettingsInput label="Total Fixed Cost ($/mo)" value={settings.FC_total}       onChange={(v) => updateSetting('FC_total', v)}       step={1000} decimals={2} />
                  <SettingsInput label="NM³ → MMSCFD Factor"    value={settings.NM3_to_MMSCFD}  onChange={(v) => updateSetting('NM3_to_MMSCFD', v)}  step={0.001} decimals={3} />
                </SettingsCard>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function StatusBanner({ result }: { result: LPResult }) {
  const isLoss    = result.profit < 0;
  const isOptimal = result.caseType.startsWith('A');

  const config = isLoss
    ? {
        bg: 'bg-rose-500/10 border-rose-500/30',
        dot: 'bg-rose-500',
        text: 'text-rose-600 dark:text-rose-400',
        label: 'OPERATING AT A LOSS',
        sub: 'Revenue below variable cost — review prices or gas contract',
      }
    : isOptimal
    ? {
        bg: '',
        dot: '',
        text: '',
        label: 'RUNNING OPTIMAL',
        sub: 'Case A active — methanol at or above minimum load',
        bgStyle: { backgroundColor: `${GPIC_GREEN}10`, borderColor: `${GPIC_GREEN}40` },
        dotStyle: { backgroundColor: GPIC_GREEN },
        textStyle: { color: GPIC_GREEN },
      }
    : {
        bg: 'bg-amber-500/10 border-amber-500/30',
        dot: 'bg-amber-500',
        text: 'text-amber-600 dark:text-amber-400',
        label: 'METHANOL LOW LOAD',
        sub: 'Case B active — methanol below minimum running threshold',
      };

  const bgClass   = isOptimal ? '' : config.bg;
  const bgStyle   = isOptimal ? (config as any).bgStyle : {};
  const dotStyle  = isOptimal ? (config as any).dotStyle : {};
  const textStyle = isOptimal ? (config as any).textStyle : {};

  return (
    <div
      className={cn('status-banner flex flex-wrap items-center justify-between gap-3 px-4 md:px-8 py-2.5 border-b', bgClass)}
      style={bgStyle}
    >
      {/* Left: status */}
      <div className="flex items-center gap-2.5">
        <span
          className={cn('w-2 h-2 rounded-full animate-pulse flex-shrink-0', config.dot)}
          style={dotStyle}
        />
        <span className={cn('text-[11px] font-bold uppercase tracking-widest', config.text)} style={textStyle}>
          {config.label}
        </span>
        <span className="text-[10px] text-slate-500 dark:text-slate-400 hidden sm:inline">
          — {config.sub}
        </span>
      </div>

      {/* Right: key metrics */}
      <div className="flex items-center gap-4 md:gap-6">
        <div className="text-center">
          <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Net Profit</div>
          <div className={cn('text-xs font-bold font-mono', result.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
            {result.profit >= 0 ? '+' : ''}{(result.profit / 1e6).toFixed(2)}M USD
          </div>
        </div>
        <div className="text-center hidden sm:block">
          <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Gas Used</div>
          <div className="text-xs font-bold font-mono text-slate-700 dark:text-slate-200">{result.gas.toFixed(2)} MMSCFD</div>
        </div>
        <div className="text-center hidden md:block">
          <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Case</div>
          <div className={cn('text-xs font-bold font-mono', config.text)} style={textStyle}>{result.caseType}</div>
        </div>
        <div className="text-center hidden md:block">
          <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Ammonia</div>
          <div className="text-xs font-bold font-mono text-slate-700 dark:text-slate-200">{result.dailyAmm.toFixed(0)} MT/D</div>
        </div>
      </div>
    </div>
  );
}

function ControlSlider({ label, value, onChange, min, max, step = 1, unit }: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step?: number; unit: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</label>
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 rounded-md px-2 py-1 border border-slate-300 dark:border-slate-700 focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/50 transition-all">
          <input
            type="number"
            value={value}
            onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(v); }}
            step={step}
            className="w-16 bg-transparent text-xs font-mono font-bold text-slate-900 dark:text-white text-right focus:outline-none appearance-none"
          />
          <span className="text-[10px] text-slate-500 font-normal select-none">{unit}</span>
        </div>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 transition-all"
      />
    </div>
  );
}

function TabButton({ active, onClick, label, icon }: {
  active: boolean; onClick: () => void; label: string; icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-1.5 rounded-md text-[11px] font-semibold transition-all uppercase tracking-wider whitespace-nowrap",
        active
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 shadow-sm"
          : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function KPICard({ title, value, sub, color, big }: {
  title: string; value: string; sub?: string; color: string; big?: boolean;
}) {
  const colors: Record<string, string> = {
    emerald: 'text-emerald-600 dark:text-emerald-500',
    amber:   'text-amber-600 dark:text-amber-500',
    purple:  'text-purple-600 dark:text-purple-500',
    green:   'text-green-600 dark:text-green-500',
    rose:    'text-rose-600 dark:text-rose-500',
  };
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-lg transition-colors duration-300">
      <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">{title}</h3>
      <div className={cn("font-bold font-mono tracking-tight", big ? "text-3xl" : "text-xl", colors[color])}>{value}</div>
      {sub && <p className="text-[10px] text-slate-500 dark:text-slate-600 mt-1 font-medium">{sub}</p>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl transition-colors duration-300">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-1 h-4 rounded-full" style={{ backgroundColor: GPIC_GREEN }} />
        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function BreakdownItem({ label, value, color, max }: { label: string; value: number; color: string; max: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[11px]">
        <span className="text-slate-500 dark:text-slate-400">{label}</span>
        <span className="text-slate-900 dark:text-slate-200 font-mono font-semibold">{fmtM(value)}</span>
      </div>
      <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${max > 0 ? (Math.abs(value) / max) * 100 : 0}%` }} />
      </div>
    </div>
  );
}

function GasItem({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
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

function MarginRow({ name, vc, price, vol, color }: { name: string; vc: number; price: number; vol: number; color: string }) {
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

function SettingsCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl transition-colors duration-300">
      <div className="flex items-center gap-2 mb-5">
        {icon}
        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">{title}</h3>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function VCRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px]">
        <span className="text-slate-500 dark:text-slate-400">{label}</span>
        <span className="text-slate-700 dark:text-slate-300 font-mono">
          ${value.toFixed(2)} <span className="text-slate-400 dark:text-slate-600">({pct.toFixed(1)}%)</span>
        </span>
      </div>
      <div className="h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SettingsInput({ label, value, onChange, step = 1, decimals = 2 }: {
  label: string; value: number; onChange: (v: number) => void; step?: number; decimals?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">{label}</label>
      <input
        type="number"
        value={Number(value.toFixed(decimals))}
        onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(v); }}
        step={step}
        className="w-36 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-right text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-colors"
      />
    </div>
  );
}
