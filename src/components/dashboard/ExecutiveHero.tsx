import { Fragment } from 'react';
import { TONE_STYLES, type Tone } from './config';
import { HeroStat, StatusChip } from './primitives';

export function ExecutiveHero({
  profit,
  profitTone,
  scenarioTone,
  scenarioLabel,
  metrics,
  fmtM,
}: {
  profit: number;
  profitTone: Tone;
  scenarioTone: Tone;
  scenarioLabel: string;
  metrics: Array<{ label: string; value: string }>;
  fmtM: (value: number | null) => string;
}) {
  return (
    <section className="gpic-hero-card overflow-hidden rounded-[34px] border border-[var(--border-soft)] bg-[var(--hero-gradient)] p-6 shadow-[var(--shadow-lg)] md:p-7">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <StatusChip tone={scenarioTone}>{scenarioLabel}</StatusChip>
          <p className="mt-5 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-[var(--text-muted)]">Net profit</p>
          <h3
            className={`mt-3 font-[var(--font-numeric)] text-5xl font-semibold tracking-tight md:text-6xl ${TONE_STYLES[profitTone].strongText}`}
          >
            {fmtM(profit)}
          </h3>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {metrics.map((metric) => (
            <Fragment key={metric.label}>
              <HeroStat label={metric.label} value={metric.value} />
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}
