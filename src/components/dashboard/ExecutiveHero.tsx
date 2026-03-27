import { TONE_STYLES, type Tone } from './config';
import { StatusChip } from './primitives';

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
    <section className="gpic-hero-card overflow-hidden rounded-[34px] border border-[var(--border-soft)] bg-[var(--hero-gradient)] p-6 shadow-[var(--shadow-lg)] md:p-7">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] xl:items-stretch">
        <div className="min-w-0 xl:flex xl:flex-col xl:justify-between">
          <StatusChip tone={scenarioTone}>{scenarioLabel}</StatusChip>
          <p className="mt-5 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-[var(--text-muted)]">Net profit</p>
          <h3
            className={`mt-3 font-[var(--font-numeric)] text-5xl font-semibold tracking-tight md:text-6xl ${TONE_STYLES[profitTone].strongText}`}
          >
            {fmtM(profit)}
          </h3>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {products.map((product) => (
            <div
              key={product.label}
              className="rounded-[22px] border border-white/40 bg-white/55 p-4 shadow-sm dark:border-white/8 dark:bg-white/5"
            >
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">
                {product.label}
              </p>
              <p
                className={`mt-3 font-[var(--font-numeric)] text-2xl font-semibold tracking-tight md:text-[1.9rem] ${TONE_STYLES[product.tone].strongText}`}
              >
                {product.daily}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{product.monthly}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
