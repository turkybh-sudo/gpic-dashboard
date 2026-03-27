import { Fragment } from 'react';
import type { LPResult } from '../../hooks/useLPSolver';
import type { Tone } from './config';
import { HeroStat, InsightCard, StatusChip } from './primitives';

export function ExecutiveHero({
  result,
  month,
  days,
  scenarioTone,
  scenarioLabel,
  signals,
  fmt,
  fmtM,
}: {
  result: LPResult;
  month: string;
  days: number;
  scenarioTone: Tone;
  scenarioLabel: string;
  signals: Array<{ label: string; value: string; note: string; tone: Tone }>;
  fmt: (value: number | null, digits?: number) => string;
  fmtM: (value: number | null) => string;
}) {
  return (
    <section className="gpic-hero-card overflow-hidden rounded-[34px] border border-[var(--border-soft)] bg-[var(--hero-gradient)] p-6 shadow-[var(--shadow-lg)] md:p-7">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-[var(--text-muted)]">Executive overview</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <StatusChip tone={scenarioTone}>{scenarioLabel}</StatusChip>
              <StatusChip tone="slate">{month} planning month</StatusChip>
              <StatusChip tone="slate">{days} operating days</StatusChip>
            </div>
            <h3 className="mt-5 font-[var(--font-numeric)] text-5xl font-semibold tracking-tight text-[var(--text-primary)] md:text-6xl">
              {fmtM(result.profit)}
            </h3>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--text-secondary)] md:text-[0.95rem]">
              The redesigned hero removes the duplicate status banner and centers the story around one management question: what is the current monthly outcome, and what is driving it?
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <HeroStat label="Gas consumed" value={`${fmt(result.gas, 2)} MMSCFD`} />
            <HeroStat label="Ammonia saleable" value={`${fmt(result.K11, 0)} MT/mo`} />
            <HeroStat label="Methanol total" value={`${fmt(result.D5, 0)} MT/mo`} />
            <HeroStat label="Urea saleable" value={`${fmt(result.K9, 0)} MT/mo`} />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {signals.map((signal) => (
            <Fragment key={signal.label}>
              <InsightCard title={signal.label} value={signal.value} note={signal.note} tone={signal.tone} />
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}
