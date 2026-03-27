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
    <section className="overflow-hidden rounded-[34px] border border-[var(--border-soft)] bg-[var(--surface-panel)] p-6 shadow-[var(--shadow-lg)] md:p-7">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,1.52fr)] xl:items-stretch">
        <div className="min-w-0 text-center xl:flex xl:flex-col xl:justify-center">
          <div className="flex justify-center">
            <StatusChip tone={scenarioTone}>{scenarioLabel}</StatusChip>
          </div>
          <p className="mt-5 text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-[var(--text-muted)]">Net profit</p>
          <h3
            className={`mt-3 font-[var(--font-numeric)] text-[3.4rem] font-semibold tracking-tight md:text-[4.25rem] ${TONE_STYLES[profitTone].strongText}`}
          >
            {fmtM(profit)}
          </h3>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {products.map((product) => (
            <div
              key={product.label}
              className="flex min-h-[150px] flex-col items-center justify-center rounded-[22px] border border-white/40 bg-white/55 p-5 text-center shadow-sm dark:border-white/8 dark:bg-white/5"
            >
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">
                {product.label}
              </p>
              <p
                className={`mt-4 font-[var(--font-numeric)] text-[2.35rem] font-semibold tracking-tight md:text-[2.65rem] ${TONE_STYLES[product.tone].strongText}`}
              >
                {product.daily}
              </p>
              <p className="mt-3 text-base leading-6 text-[var(--text-secondary)]">{product.monthly}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
