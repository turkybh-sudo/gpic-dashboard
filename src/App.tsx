import React, { useEffect, useMemo, useState } from 'react';
import {
  Gauge,
  Info,
  Menu,
  Printer,
  RotateCcw,
  Settings2,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { ExecutiveHero } from './components/dashboard/ExecutiveHero';
import {
  GAS_COLORS,
  MONTHS,
  MONTH_DAYS,
  SETTINGS_GROUPS,
  TAB_ITEMS,
  TONE_STYLES,
  type TabId,
  type Tone,
} from './components/dashboard/config';
import {
  ControlSlider,
  ContributionBar,
  CostBreakdownCard,
  LegendPill,
  MetricRailCard,
  MiniAsideStat,
  SettingsGroupCard,
  SettingsInput,
  SidebarSection,
  StatusChip,
  SurfaceCard,
  TabButton,
} from './components/dashboard/primitives';
import {
  BASE_DEFAULTS,
  calcVC,
  solveLP,
  useLPSolver,
  type LPResult,
  type Settings,
} from './hooks/useLPSolver';
import gpicLogo from './assets/gpic-logo.png';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const fmt = (value: number | null, digits = 0) =>
  value == null
    ? '--'
    : Number(value).toLocaleString('en-US', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });

const fmtM = (value: number | null) => (value == null ? '--' : `$${(value / 1e6).toFixed(2)}M`);
const fmtPercent = (value: number, digits = 1) => `${value.toFixed(digits)}%`;

function useSystemTheme() {
  const [isDark, setIsDark] = useState(
    () =>
      typeof window !== 'undefined'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : false,
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => setIsDark(event.matches);
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  return isDark;
}

function findZeroCrossing(points: Array<{ x: number; y: number }>) {
  let previous: { x: number; y: number } | null = null;

  for (const point of points) {
    if (previous && ((previous.y >= 0 && point.y <= 0) || (previous.y <= 0 && point.y >= 0))) {
      const delta = point.y - previous.y;
      if (delta === 0) {
        return point.x;
      }
      return previous.x + ((0 - previous.y) * (point.x - previous.x)) / delta;
    }
    previous = point;
  }

  return null;
}

function getScenarioTone(result: LPResult): Tone {
  if (result.profit < 0) return 'rose';
  if (result.caseType.startsWith('A')) return 'green';
  return 'amber';
}

function getScenarioLabel(result: LPResult) {
  if (result.profit < 0) return 'Operating below contribution breakeven';
  if (result.caseType.startsWith('A')) return 'Methanol running at or above minimum load';
  return 'Methanol shutdown selected';
}

export default function App() {
  const [ammP, setAmmP] = useState(325);
  const [methP, setMethP] = useState(80);
  const [ureaP, setUreaP] = useState(400);
  const [gasP, setGasP] = useState(4.5);
  const [maxAmm, setMaxAmm] = useState(1320);
  const [maxMeth, setMaxMeth] = useState(1250);
  const [maxUrea, setMaxUrea] = useState(2150);
  const [maxGas, setMaxGas] = useState(128);
  const [monthIdx, setMonthIdx] = useState(4);
  const [tab, setTab] = useState<TabId>('optimizer');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [gtRunning, setGtRunning] = useState(true);
  const [settings, setSettings] = useState<Settings>({ ...BASE_DEFAULTS });

  const isDark = useSystemTheme();
  const days = MONTH_DAYS[monthIdx];

  const result = useLPSolver(
    ammP,
    methP,
    ureaP,
    gasP,
    maxAmm,
    maxMeth,
    maxUrea,
    maxGas,
    days,
    settings,
    gtRunning,
  );

  const shutdownData = useMemo(() => {
    const vc = calcVC(gasP, settings, gtRunning);
    const ammoniaCap = days * maxAmm;
    const ureaCap = days * maxUrea;
    const ammoniaTotal = ammoniaCap - settings.ammCapLoss_B;
    const ureaPotential = Math.min(ureaCap, settings.C33_coeff * ammoniaTotal);
    const ammoniaSaleable = ammoniaTotal - settings.K7 * ureaPotential;
    const shutdownProfit =
      (ammP - vc.amm_B) * ammoniaSaleable + (ureaP - vc.urea_B) * ureaPotential - settings.FC_total;

    const runningScenario = solveLP(
      ammP,
      methP,
      ureaP,
      gasP,
      maxAmm,
      maxMeth,
      maxUrea,
      maxGas,
      days,
      settings,
      'A',
      gtRunning,
    );

    let crossover: number | null = null;
    let previousDiff: number | null = null;
    const data: Array<{ methPrice: number; runningProfit: number; shutdownProfit: number }> = [];

    for (let methPrice = 0; methPrice <= 350; methPrice += 5) {
      const running = solveLP(
        ammP,
        methPrice,
        ureaP,
        gasP,
        maxAmm,
        maxMeth,
        maxUrea,
        maxGas,
        days,
        settings,
        'A',
        gtRunning,
      );

      const diff = running.profit - shutdownProfit;
      if (previousDiff !== null && previousDiff <= 0 && diff > 0 && crossover === null) {
        crossover = methPrice - 5 + (5 * -previousDiff) / (diff - previousDiff);
      }
      previousDiff = diff;

      data.push({
        methPrice,
        runningProfit: running.profit / 1e6,
        shutdownProfit: shutdownProfit / 1e6,
      });
    }

    return {
      crossover,
      currentGap: runningScenario.profit - shutdownProfit,
      shutdownProfit,
      vcMeth: vc.meth,
      data,
    };
  }, [
    ammP,
    days,
    gasP,
    gtRunning,
    maxAmm,
    maxGas,
    maxMeth,
    maxUrea,
    methP,
    settings,
    ureaP,
  ]);

  const gasSensitivity = useMemo(
    () =>
      Array.from({ length: 20 }, (_, index) => 0.5 + index * 0.5).map((price) => ({
        gasPrice: price,
        profit:
          solveLP(
            ammP,
            methP,
            ureaP,
            price,
            maxAmm,
            maxMeth,
            maxUrea,
            maxGas,
            days,
            settings,
            undefined,
            gtRunning,
          ).profit / 1e6,
      })),
    [
      ammP,
      days,
      gtRunning,
      maxAmm,
      maxGas,
      maxMeth,
      maxUrea,
      methP,
      settings,
      ureaP,
    ],
  );

  const chartTheme = isDark
    ? {
        grid: 'rgba(139, 161, 190, 0.18)',
        axis: '#9bb0c9',
        tooltipBg: 'rgba(10, 17, 30, 0.98)',
        tooltipBorder: 'rgba(100, 128, 161, 0.32)',
        tooltipText: '#f5f9ff',
        mutedBar: '#425069',
      }
    : {
        grid: 'rgba(120, 144, 169, 0.22)',
        axis: '#6a7d95',
        tooltipBg: 'rgba(255, 255, 255, 0.98)',
        tooltipBorder: 'rgba(111, 136, 163, 0.28)',
        tooltipText: '#13233f',
        mutedBar: '#bdcad8',
      };

  const scenarioTone = getScenarioTone(result);
  const scenarioLabel = getScenarioLabel(result);
  const activeTab = TAB_ITEMS.find((item) => item.id === tab) ?? TAB_ITEMS[0];
  const breakEvenGas = findZeroCrossing(gasSensitivity.map((item) => ({ x: item.gasPrice, y: item.profit })));
  const currentMethanolGap = shutdownData.crossover == null ? null : methP - shutdownData.crossover;
  const profitTone: Tone = result.profit >= 0 ? 'green' : 'rose';

  const productRows = [
    {
      key: 'ammonia',
      label: 'Ammonia',
      tone: 'amber' as Tone,
      daily: result.dailyAmm,
      monthly: result.K11,
      monthlyLabel: 'saleable this month',
      capacity: maxAmm,
      price: ammP,
      variableCost: result.vcAmm,
    },
    {
      key: 'methanol',
      label: 'Methanol',
      tone: 'purple' as Tone,
      daily: result.dailyMeth,
      monthly: result.D5,
      monthlyLabel: 'total this month',
      capacity: maxMeth,
      price: methP,
      variableCost: result.vcMeth,
    },
    {
      key: 'urea',
      label: 'Urea',
      tone: 'green' as Tone,
      daily: result.dailyUrea,
      monthly: result.K9,
      monthlyLabel: 'saleable this month',
      capacity: maxUrea,
      price: ureaP,
      variableCost: result.vcUrea,
    },
  ];
  const heroMetrics = [
    { label: 'Ammonia', value: `${fmt(result.K11, 0)} MT/mo` },
    { label: 'Methanol', value: `${fmt(result.D5, 0)} MT/mo` },
    { label: 'Urea', value: `${fmt(result.K9, 0)} MT/mo` },
  ];

  const capacityData = productRows.map((row) => ({
    ...row,
    utilization: row.capacity > 0 ? (row.daily / row.capacity) * 100 : 0,
  }));

  const contributionRows = [
    { label: 'Ammonia', tone: 'amber' as Tone, value: (ammP - result.vcAmm) * result.K11 },
    { label: 'Methanol', tone: 'purple' as Tone, value: (methP - result.vcMeth) * result.D5 },
    { label: 'Urea', tone: 'green' as Tone, value: (ureaP - result.vcUrea) * result.K9 },
  ];
  const largestContribution = Math.max(
    ...contributionRows.map((row) => Math.abs(row.value)),
    Math.abs(settings.FC_total),
    1,
  );

  const gasMix = [
    { name: 'Ammonia', value: result.gasBreakdown.ammonia_nm3 },
    { name: 'Methanol', value: result.gasBreakdown.methanol_nm3 },
    { name: 'Boilers', value: result.gasBreakdown.boiler_nm3 },
    { name: 'Gas Turbine', value: result.gasBreakdown.gt_nm3 },
    { name: 'Flare', value: result.gasBreakdown.flare_nm3 },
  ]
    .filter((item) => item.value > 0)
    .map((item) => ({
      ...item,
      pct: result.gasTotal_nm3 > 0 ? (item.value / result.gasTotal_nm3) * 100 : 0,
    }))
    .sort((left, right) => right.value - left.value);

  const costCards = [
    {
      title: 'Ammonia variable cost',
      tone: 'amber' as Tone,
      total: result.vcAmmBreakdown.total,
      rows: [
        { label: 'Gas', value: result.vcAmmBreakdown.gasVC },
        { label: 'Power', value: result.vcAmmBreakdown.powerVC },
        { label: 'HP Steam', value: result.vcAmmBreakdown.hpSteamVC },
        { label: 'Sea Water', value: result.vcAmmBreakdown.swVC },
        { label: 'FCW', value: result.vcAmmBreakdown.fcwVC },
        { label: 'Demin', value: result.vcAmmBreakdown.deminVC },
      ],
    },
    {
      title: 'Methanol variable cost',
      tone: 'purple' as Tone,
      total: result.vcMethBreakdown.total,
      rows: [
        { label: 'Gas', value: result.vcMethBreakdown.gasVC },
        { label: 'Power', value: result.vcMethBreakdown.powerVC },
        { label: 'HP Steam', value: result.vcMethBreakdown.hpSteamVC },
        { label: 'Sea Water', value: result.vcMethBreakdown.swVC },
        { label: 'FCW', value: result.vcMethBreakdown.fcwVC },
        { label: 'Demin', value: result.vcMethBreakdown.deminVC },
      ],
    },
    {
      title: 'Urea variable cost',
      tone: 'green' as Tone,
      total: result.vcUreaBreakdown.total,
      rows: [
        { label: 'NH3 cost', value: result.vcUreaBreakdown.ammCostComponent },
        { label: 'Power', value: result.vcUreaBreakdown.powerVC },
        {
          label: 'CDR total',
          value:
            result.vcUreaBreakdown.cdrSW +
            result.vcUreaBreakdown.cdrFCW +
            result.vcUreaBreakdown.cdrPower +
            result.vcUreaBreakdown.cdrLPSteam,
        },
        { label: 'HP Steam', value: result.vcUreaBreakdown.hpSteamVC },
        { label: 'MP Steam', value: result.vcUreaBreakdown.mpSteamVC },
        {
          label: 'Water and Demin',
          value:
            result.vcUreaBreakdown.swVC +
            result.vcUreaBreakdown.fcwVC +
            result.vcUreaBreakdown.deminVC,
        },
        {
          label: 'UF85 total',
          value:
            result.vcUreaBreakdown.uf85VC +
            result.vcUreaBreakdown.uf85FCW +
            result.vcUreaBreakdown.uf85Power,
        },
      ],
    },
  ];

  const resetSettings = () => setSettings({ ...BASE_DEFAULTS });
  const updateSetting = (key: keyof Settings, value: number) =>
    setSettings((previous) => ({ ...previous, [key]: value }));

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--text-primary)] selection:bg-emerald-500/20">
      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-slate-950/45 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close control panel backdrop"
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[21rem] max-w-[calc(100vw-1.5rem)] flex-col border-r border-[var(--border-soft)] bg-[var(--surface-strong)] px-5 py-5 shadow-[var(--shadow-xl)] backdrop-blur-xl transition-transform duration-300',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <img src={gpicLogo} alt="GPIC" className="w-24 object-contain" />
            <p className="mt-4 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-[var(--text-muted)]">
              Management Optimizer
            </p>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-[var(--text-primary)]">GPIC Dashboard</h1>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="rounded-2xl border border-[var(--border-soft)] bg-white/60 p-2 text-[var(--text-muted)] transition hover:text-[var(--text-primary)] md:hidden dark:bg-slate-900/50"
            aria-label="Close controls"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 md:grid-cols-1">
          <div className="rounded-[24px] border border-[var(--border-soft)] bg-[var(--surface-subtle)] p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">
              Month
            </p>
            <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{MONTHS[monthIdx]}</p>
          </div>
          <div className="rounded-[24px] border border-[var(--border-soft)] bg-[var(--surface-subtle)] p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">
              Operating state
            </p>
            <div className="mt-3">
              <StatusChip tone={scenarioTone}>{scenarioLabel}</StatusChip>
            </div>
          </div>
        </div>
        <div className="mt-6 flex-1 space-y-4 overflow-y-auto pr-1">
          <SidebarSection eyebrow="Pricing" title="Market controls" tone="green" icon={<Settings2 className="h-4 w-4" />}>
            <ControlSlider label="Ammonia price" value={ammP} onChange={setAmmP} min={200} max={900} unit="$/MT" fmt={fmt} />
            <ControlSlider label="Methanol price" value={methP} onChange={setMethP} min={0} max={900} unit="$/MT" fmt={fmt} />
            <ControlSlider label="Urea price" value={ureaP} onChange={setUreaP} min={200} max={900} unit="$/MT" fmt={fmt} />
            <ControlSlider label="Natural gas" value={gasP} onChange={setGasP} min={0.5} max={10} step={0.25} decimals={2} unit="$/MMBTU" fmt={fmt} />
            <ControlSlider label="Gas limit" value={maxGas} onChange={setMaxGas} min={80} max={150} decimals={1} unit="MMSCFD" fmt={fmt} />
            <div className="rounded-[22px] border border-[var(--border-soft)] bg-[var(--surface-panel)] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Gas turbine</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{gtRunning ? 'Online' : 'Offline'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setGtRunning((previous) => !previous)}
                  className={cn(
                    'relative inline-flex h-7 w-12 shrink-0 rounded-full border border-transparent transition',
                    gtRunning ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700',
                  )}
                  aria-label="Toggle gas turbine"
                >
                  <span className={cn('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition', gtRunning ? 'left-[1.45rem]' : 'left-0.5')} />
                </button>
              </div>
            </div>
          </SidebarSection>
          <SidebarSection eyebrow="Capacity" title="Capacity and month" tone="blue" icon={<Gauge className="h-4 w-4" />}>
            <ControlSlider label="Max ammonia" value={maxAmm} onChange={setMaxAmm} min={1000} max={1500} unit="MT/D" fmt={fmt} />
            <ControlSlider label="Max methanol" value={maxMeth} onChange={setMaxMeth} min={800} max={1500} unit="MT/D" fmt={fmt} />
            <ControlSlider label="Max urea" value={maxUrea} onChange={setMaxUrea} min={1500} max={2500} unit="MT/D" fmt={fmt} />
            <div className="rounded-[22px] border border-[var(--border-soft)] bg-[var(--surface-panel)] p-3">
              <label className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">Operating month</label>
              <select
                value={monthIdx}
                onChange={(event) => setMonthIdx(Number(event.target.value))}
                className="mt-3 w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-strong)] px-3 py-2.5 text-sm font-medium text-[var(--text-primary)] outline-none transition focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/20"
                aria-label="Operating month"
              >
                {MONTHS.map((month, index) => (
                  <option key={month} value={index}>
                    {month}
                  </option>
                ))}
              </select>
              <div className="mt-3 flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span>Operating days</span>
                <span>{days}</span>
              </div>
            </div>
          </SidebarSection>
        </div>
      </aside>
      <main className="min-h-screen md:pl-[21rem]">
        <div className="app-shell mx-auto max-w-[1680px] px-4 pb-12 md:px-6 xl:px-8">
          <header className="no-print mb-6 rounded-[30px] border border-[var(--border-soft)] bg-[var(--surface-strong)]/92 shadow-[var(--shadow-lg)] backdrop-blur-xl">
            <div className="flex flex-col gap-4 p-4 md:p-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-2 text-[var(--text-muted)] transition hover:text-[var(--text-primary)] md:hidden"
                  aria-label="Open controls"
                >
                  <Menu className="h-5 w-5" />
                </button>
                <div className="min-w-0">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.26em] text-[var(--text-muted)]">GPIC Dashboard</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">{activeTab.label}</h2>
                </div>
              </div>
              <div className="flex flex-col gap-3 xl:items-end">
                <nav className="flex max-w-full gap-2 overflow-x-auto rounded-[22px] border border-[var(--border-soft)] bg-[var(--surface-subtle)] p-1.5 scrollbar-hide">
                  {TAB_ITEMS.map((item) => (
                    <React.Fragment key={item.id}>
                      <TabButton
                        active={tab === item.id}
                        label={item.label}
                        onClick={() => {
                          setTab(item.id);
                          setSidebarOpen(false);
                        }}
                        icon={<item.icon className="h-3.5 w-3.5" />}
                      />
                    </React.Fragment>
                  ))}
                </nav>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3.5 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                >
                  <Printer className="h-4 w-4" />
                  Export
                </button>
              </div>
            </div>
          </header>
          {tab === 'optimizer' && (
            <div className="space-y-5 md:space-y-6">
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.32fr)_minmax(0,0.68fr)]">
                <ExecutiveHero
                  profit={result.profit}
                  profitTone={profitTone}
                  scenarioTone={scenarioTone}
                  scenarioLabel={scenarioLabel}
                  metrics={heroMetrics}
                  fmtM={fmtM}
                />
                <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
                  {productRows.map((row) => (
                    <React.Fragment key={row.key}>
                      <MetricRailCard
                        title={row.label}
                        tone={row.tone}
                        value={`${fmt(row.daily, 1)} MT/D`}
                        subtitle={`${fmt(row.monthly, 0)} ${row.monthlyLabel}`}
                        helper={`${fmtPercent((row.daily / row.capacity) * 100, 1)} utilization`}
                      />
                    </React.Fragment>
                  ))}
                </div>
              </div>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.18fr)_minmax(0,0.82fr)]">
                <SurfaceCard eyebrow="Daily production" title="Production profile">
                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_240px]">
                    <div className="min-w-0">
                      <div className="mb-4 flex flex-wrap gap-2">
                        <LegendPill tone="green" label="Production" />
                        <LegendPill tone="slate" label="Capacity" />
                      </div>
                      <div className="h-[320px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={capacityData.map((row) => ({ name: row.label, production: row.daily, capacity: row.capacity }))}
                            layout="vertical"
                            margin={{ top: 8, right: 14, left: 6, bottom: 8 }}
                            barCategoryGap={16}
                          >
                            <CartesianGrid stroke={chartTheme.grid} horizontal={false} strokeDasharray="4 4" />
                            <XAxis type="number" stroke={chartTheme.axis} tick={{ fontSize: 11, fill: chartTheme.axis }} tickLine={false} axisLine={false} tickMargin={10} />
                            <YAxis dataKey="name" type="category" stroke={chartTheme.axis} tick={{ fontSize: 12, fill: chartTheme.axis }} tickLine={false} axisLine={false} width={90} />
                            <Tooltip
                              cursor={{ fill: 'transparent' }}
                              contentStyle={{
                                backgroundColor: chartTheme.tooltipBg,
                                border: `1px solid ${chartTheme.tooltipBorder}`,
                                borderRadius: 18,
                                color: chartTheme.tooltipText,
                              }}
                            />
                            <Bar dataKey="capacity" fill={chartTheme.mutedBar} radius={[0, 8, 8, 0]} />
                            <Bar dataKey="production" fill="#006341" radius={[0, 8, 8, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {capacityData.map((row) => (
                        <div key={row.key} className="rounded-[24px] border border-[var(--border-soft)] bg-[var(--surface-panel)] p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-[var(--text-primary)]">{row.label}</p>
                              <p className="mt-1 text-xs text-[var(--text-muted)]">
                                {fmt(row.daily, 1)} MT/D of {fmt(row.capacity, 0)} MT/D
                              </p>
                            </div>
                            <StatusChip tone={row.tone}>{fmtPercent(row.utilization, 1)}</StatusChip>
                          </div>
                          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--surface-subtle)]">
                            <div className={cn('h-full rounded-full', TONE_STYLES[row.tone].bar)} style={{ width: `${Math.min(row.utilization, 100)}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </SurfaceCard>

                <SurfaceCard eyebrow="Net contribution" title="Contribution structure">
                  <div className="space-y-4">
                    {contributionRows.map((row) => (
                      <React.Fragment key={row.label}>
                        <ContributionBar
                          label={row.label}
                          value={row.value}
                          tone={row.tone}
                          max={largestContribution}
                          fmtM={fmtM}
                        />
                      </React.Fragment>
                    ))}
                    <ContributionBar
                      label="Fixed costs"
                      value={-settings.FC_total}
                      tone="rose"
                      max={largestContribution}
                      fmtM={fmtM}
                    />
                    <div className="grid gap-3 rounded-[26px] border border-[var(--border-soft)] bg-[var(--surface-subtle)] p-4 sm:grid-cols-2">
                      <div>
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">Gross contribution</p>
                        <p className="mt-2 font-[var(--font-numeric)] text-2xl font-semibold text-[var(--text-primary)]">
                          {fmtM(contributionRows.reduce((sum, row) => sum + row.value, 0))}
                        </p>
                      </div>
                      <div>
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">Net monthly profit</p>
                        <p className={cn('mt-2 font-[var(--font-numeric)] text-2xl font-semibold', TONE_STYLES[profitTone].strongText)}>
                          {fmtM(result.profit)}
                        </p>
                      </div>
                    </div>
                  </div>
                </SurfaceCard>
              </div>

              <SurfaceCard eyebrow="Feed and utilities" title="Gas consumption">
                <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
                  <div className="relative mx-auto h-64 w-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={gasMix} dataKey="value" innerRadius={68} outerRadius={102} paddingAngle={2} startAngle={90} endAngle={-270}>
                          {gasMix.map((item) => (
                            <Cell key={item.name} fill={GAS_COLORS[item.name]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: chartTheme.tooltipBg,
                            border: `1px solid ${chartTheme.tooltipBorder}`,
                            borderRadius: 18,
                            color: chartTheme.tooltipText,
                          }}
                          formatter={(value: number, name: string) => [`${fmt(value / 1e6, 2)}M Nm3`, name]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">Total gas</p>
                      <p className="mt-2 font-[var(--font-numeric)] text-3xl font-semibold text-[var(--text-primary)]">{fmt(result.gas, 2)}</p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">MMSCFD</p>
                    </div>
                  </div>
                  <div className="min-w-0 space-y-4">
                    <div className="space-y-3">
                      {gasMix.map((item) => (
                        <div key={item.name} className="rounded-[24px] border border-[var(--border-soft)] bg-[var(--surface-panel)] p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: GAS_COLORS[item.name] }} />
                              <div>
                                <p className="text-sm font-semibold text-[var(--text-primary)]">{item.name}</p>
                                <p className="mt-1 text-xs text-[var(--text-muted)]">{fmt(item.value / 1e6, 2)}M Nm3</p>
                              </div>
                            </div>
                            <StatusChip tone="slate">{fmtPercent(item.pct, 1)}</StatusChip>
                          </div>
                          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--surface-subtle)]">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(item.pct, 100)}%`, backgroundColor: GAS_COLORS[item.name] }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </SurfaceCard>

              <SurfaceCard eyebrow="Commercial margin" title="Contribution margin table">
                <div className="overflow-x-auto">
                  <table className="min-w-[780px] w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border-soft)]">
                        {['Product', 'VC ($/MT)', 'Price ($/MT)', 'Margin ($/MT)', 'Volume (MT)', 'Contribution'].map((header) => (
                          <th key={header} className={cn('py-3 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]', header === 'Product' ? 'text-left' : 'text-right')}>
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-soft)]">
                      {productRows.map((row) => {
                        const margin = row.price - row.variableCost;
                        const contribution = margin * row.monthly;
                        return (
                          <tr key={row.key} className="transition hover:bg-white/40 dark:hover:bg-white/5">
                            <td className={cn('py-4 text-left text-[0.95rem] font-semibold', TONE_STYLES[row.tone].strongText)}>{row.label}</td>
                            <td className="py-4 text-right font-[var(--font-numeric)] text-[var(--text-secondary)]">${fmt(row.variableCost, 1)}</td>
                            <td className="py-4 text-right font-[var(--font-numeric)] text-[var(--text-secondary)]">${fmt(row.price, 1)}</td>
                            <td className={cn('py-4 text-right font-[var(--font-numeric)] font-semibold', margin >= 0 ? TONE_STYLES.green.strongText : TONE_STYLES.rose.strongText)}>
                              ${fmt(margin, 1)}
                            </td>
                            <td className="py-4 text-right font-[var(--font-numeric)] text-[var(--text-secondary)]">{fmt(row.monthly, 0)}</td>
                            <td className="py-4 text-right font-[var(--font-numeric)] font-semibold text-[var(--text-primary)]">{fmtM(contribution)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </SurfaceCard>

              <div className="grid gap-5 xl:grid-cols-3 xl:auto-rows-fr">
                {costCards.map((card) => (
                  <React.Fragment key={card.title}>
                    <CostBreakdownCard title={card.title} tone={card.tone} total={card.total} rows={card.rows} fmt={fmt} />
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          {tab === 'shutdown' && (
            <div className="space-y-5 md:space-y-6">
              <SurfaceCard eyebrow="Methanol shutdown" title="MeOH Running vs Shutdown">
                <div className="mb-4 flex flex-wrap gap-2">
                  <LegendPill tone="green" label="MeOH running" />
                  <LegendPill tone="rose" label="MeOH shutdown" />
                </div>
                <div className="h-[380px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={shutdownData.data} margin={{ top: 12, right: 18, left: 6, bottom: 10 }}>
                      <CartesianGrid stroke={chartTheme.grid} strokeDasharray="4 4" />
                      <XAxis
                        type="number"
                        dataKey="methPrice"
                        domain={[0, 350]}
                        tickCount={8}
                        tick={{ fontSize: 11, fill: chartTheme.axis }}
                        tickLine={false}
                        axisLine={false}
                        tickMargin={10}
                        stroke={chartTheme.axis}
                      />
                      <YAxis
                        tickFormatter={(value) => `$${value.toFixed(0)}M`}
                        tick={{ fontSize: 11, fill: chartTheme.axis }}
                        tickLine={false}
                        axisLine={false}
                        tickMargin={12}
                        stroke={chartTheme.axis}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: chartTheme.tooltipBg,
                          border: `1px solid ${chartTheme.tooltipBorder}`,
                          borderRadius: 18,
                          color: chartTheme.tooltipText,
                        }}
                        labelFormatter={(value) => `Methanol price: $${fmt(Number(value), 1)}/MT`}
                        formatter={(value: number, name: string) => [
                          `$${value.toFixed(2)}M`,
                          name === 'runningProfit' ? 'MeOH running' : 'MeOH shutdown',
                        ]}
                      />
                      <ReferenceLine y={0} stroke={chartTheme.axis} strokeDasharray="4 4" />
                      <Line type="monotone" dataKey="runningProfit" stroke="#006341" strokeWidth={3} dot={false} />
                      <Line type="monotone" dataKey="shutdownProfit" stroke="#f43f5e" strokeWidth={3} dot={false} strokeDasharray="8 6" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <MiniAsideStat label="Current MeOH price" value={`$${fmt(methP, 1)}/MT`} tone="slate" />
                  <MiniAsideStat
                    label="Methanol shutdown price"
                    value={shutdownData.crossover == null ? 'Not in scan' : `$${fmt(shutdownData.crossover, 1)}/MT`}
                    tone={shutdownData.crossover == null ? 'slate' : 'amber'}
                  />
                  <MiniAsideStat
                    label="Current gap"
                    value={currentMethanolGap == null ? 'Not available' : `${currentMethanolGap >= 0 ? '+' : ''}$${fmt(currentMethanolGap, 1)}/MT`}
                    tone={currentMethanolGap == null ? 'slate' : currentMethanolGap >= 0 ? 'green' : 'rose'}
                  />
                </div>
              </SurfaceCard>
            </div>
          )}

          {tab === 'sensitivity' && (
            <div className="space-y-5 md:space-y-6">
              <SurfaceCard eyebrow="Natural gas" title="Gas Price Sensitivity">
                <div className="mb-4 flex flex-wrap gap-2">
                  <LegendPill tone="green" label="Monthly profit" />
                </div>
                <div className="h-[380px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={gasSensitivity} margin={{ top: 12, right: 18, left: 6, bottom: 10 }}>
                      <CartesianGrid stroke={chartTheme.grid} strokeDasharray="4 4" />
                      <XAxis
                        type="number"
                        dataKey="gasPrice"
                        domain={[0.5, 10]}
                        ticks={gasSensitivity.map((item) => item.gasPrice)}
                        minTickGap={18}
                        tickFormatter={(value) => Number(value).toFixed(1)}
                        tick={{ fontSize: 11, fill: chartTheme.axis }}
                        tickLine={false}
                        axisLine={false}
                        tickMargin={10}
                        stroke={chartTheme.axis}
                      />
                      <YAxis
                        tickFormatter={(value) => `$${value.toFixed(0)}M`}
                        tick={{ fontSize: 11, fill: chartTheme.axis }}
                        tickLine={false}
                        axisLine={false}
                        tickMargin={12}
                        stroke={chartTheme.axis}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: chartTheme.tooltipBg,
                          border: `1px solid ${chartTheme.tooltipBorder}`,
                          borderRadius: 18,
                          color: chartTheme.tooltipText,
                        }}
                        formatter={(value: number) => [`$${value.toFixed(2)}M`, 'Monthly profit']}
                        labelFormatter={(value) => `Gas price: $${fmt(Number(value), 2)}/MMBTU`}
                      />
                      <ReferenceLine y={0} stroke={chartTheme.axis} strokeDasharray="4 4" />
                      <Line type="monotone" dataKey="profit" stroke="#006341" strokeWidth={3} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <MiniAsideStat label="Current gas" value={`$${fmt(gasP, 2)}/MMBTU`} tone="blue" />
                  <MiniAsideStat label="Current profit" value={fmtM(result.profit)} tone={profitTone} />
                  <MiniAsideStat
                    label="Break-even gas"
                    value={breakEvenGas == null ? 'Not in scan' : `$${fmt(breakEvenGas, 2)}/MMBTU`}
                    tone={breakEvenGas == null ? 'slate' : 'amber'}
                  />
                </div>
              </SurfaceCard>
            </div>
          )}

          {tab === 'settings' && (
            <div className="space-y-5 md:space-y-6">
              <SurfaceCard
                eyebrow="Model constants"
                title="Plant parameters and solver inputs"
                subtitle="Grouped by engineering topic."
                actions={
                  <button
                    type="button"
                    onClick={resetSettings}
                    className="inline-flex items-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3.5 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-500/15 dark:text-rose-300"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reset to defaults
                  </button>
                }
              >
                <div className="grid gap-5 xl:grid-cols-3">
                  {SETTINGS_GROUPS.map((group) => (
                    <React.Fragment key={group.title}>
                      <SettingsGroupCard
                        title={group.title}
                        description={group.description}
                        tone={group.tone}
                        icon={<group.icon className="h-4 w-4" />}
                      >
                        {group.fields.map((field) => (
                          <React.Fragment key={field.key}>
                            <SettingsInput
                              label={field.label}
                              value={settings[field.key]}
                              onChange={(value) => updateSetting(field.key, value)}
                              step={field.step}
                              decimals={field.decimals}
                            />
                          </React.Fragment>
                        ))}
                      </SettingsGroupCard>
                    </React.Fragment>
                  ))}
                </div>
              </SurfaceCard>
              <div className="rounded-[28px] border border-[var(--border-soft)] bg-[var(--surface-panel)] p-4">
                <div className="flex items-start gap-3">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Model note</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                      Model v32. Business logic, solver behavior, and calculations are preserved. This pass changes presentation, spacing, and chart framing only.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
