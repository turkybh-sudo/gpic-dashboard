import { TONE_STYLES, type Tone } from './config';
import { StatusChip } from './primitives';

const PRODUCT_TOP_COLORS: Record<string, string> = {
  Ammonia: '#f59e0b',
  Methanol: '#8b5cf6',
  Urea: '#10b981',
};

export function ExecutiveHero({
  profit,
  profitTone,
  scenarioTone,
  scenarioLabel,
  products,
  fmtM,
}: {
  profit: number;
  profitTone: Tone;
  scenarioTone: Tone;
  scenarioLabel: string;
  products: Array<{ label: string; daily: string; monthly: string; tone: Tone }>;
  fmtM: (value: number | null) => string;
}) {
  return (
    <section className="animate-in overflow-hidden rounded-[34px] border border-[var(--border-soft)] bg-[var(--surface-panel)] p-6 shadow-[var(--shadow-lg)] md:p-7 gpic-hero-card">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,1.52fr)] xl:items-stretch">
        {/* Left: net profit */}
        <div className="min-w-0 text-center xl:flex xl:flex-col xl:justify-center xl:border-r xl:border-[var(--border-soft)] xl:pr-7">
          <div className="flex justify-center">
            <StatusChip tone={scenarioTone}>{scenarioLabel}</StatusChip>
          </div>
          <p className="mt-6 text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-[var(--text-muted)]">
            Net monthly profit
          </p>
          <h3
            className={`mt-2 font-[var(--font-numeric)] text-[3.4rem] font-semibold leading-none tracking-tight md:text-[4.5rem] ${TONE_STYLES[profitTone].strongText}`}
          >
            {fmtM(profit)}
          </h3>
          {/* Thin accent line below the profit number */}
          <div className="mx-auto mt-4 h-0.5 w-16 rounded-full opacity-40" style={{
            background: profitTone === 'green'
              ? 'linear-gradient(90deg, transparent, #10b981, transparent)'
              : 'linear-gradient(90deg, transparent, #f43f5e, transparent)',
          }} />
        </div>

        {/* Right: product cards */}
        <div className="grid gap-3 md:grid-cols-3 xl:pl-2">
          {products.map((product) => (
            <div
              key={product.label}
              className="flex flex-col items-center justify-center rounded-[22px] bg-white/60 p-5 text-center shadow-sm dark:bg-white/5"
              style={{
                borderTop: `3px solid ${PRODUCT_TOP_COLORS[product.label] ?? '#94a3b8'}`,
                border: `1px solid rgba(255,255,255,0.5)`,
                borderTopWidth: '3px',
                borderTopColor: PRODUCT_TOP_COLORS[product.label] ?? '#94a3b8',
              }}
            >
              <p className="text-[0.7rem] font-bold uppercase tracking-[0.26em] text-[var(--text-muted)]">
                {product.label}
              </p>
              <p
                className={`mt-4 font-[var(--font-numeric)] text-[2.2rem] font-semibold leading-none tracking-tight md:text-[2.5rem] ${TONE_STYLES[product.tone].strongText}`}
              >
                {product.daily}
              </p>
              <p className="mt-3 text-sm leading-5 text-[var(--text-secondary)]">{product.monthly}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
