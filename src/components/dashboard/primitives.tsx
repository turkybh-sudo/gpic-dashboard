import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { TONE_STYLES, type Tone } from './config';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type SurfaceCardProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
};

export function SurfaceCard({
  eyebrow,
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
}: SurfaceCardProps) {
  return (
    <section
      className={cn(
        'rounded-[30px] border border-[var(--border-soft)] bg-[var(--surface-strong)] p-5 shadow-[var(--shadow-md)] md:p-6',
        className,
      )}
    >
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          {eyebrow && <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">{eyebrow}</p>}
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-[var(--text-primary)]">{title}</h3>
          {subtitle && <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">{subtitle}</p>}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function SidebarSection({
  eyebrow,
  title,
  tone,
  icon,
  children,
}: {
  eyebrow: string;
  title: string;
  tone: Tone;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-[var(--border-soft)] bg-[var(--surface-panel)] p-4">
      <div className="flex items-start gap-3">
        <span className={cn('rounded-2xl border px-2.5 py-2', TONE_STYLES[tone].badge)}>{icon}</span>
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">{eyebrow}</p>
          <h3 className="mt-1 text-base font-semibold text-[var(--text-primary)]">{title}</h3>
        </div>
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function ControlSlider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  decimals = 0,
  unit,
  fmt,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  decimals?: number;
  unit: string;
  fmt: (value: number, digits?: number) => string;
}) {
  return (
    <div className="rounded-[22px] border border-[var(--border-soft)] bg-[var(--surface-strong)] p-3">
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-semibold text-[var(--text-primary)]">{label}</label>
        <div className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)] px-2.5 py-1.5">
          <input
            type="number"
            value={Number(value.toFixed(decimals))}
            step={step}
            onChange={(event) => {
              const nextValue = Number(event.target.value);
              if (!Number.isNaN(nextValue)) onChange(nextValue);
            }}
            className="w-16 border-none bg-transparent text-right font-[var(--font-numeric)] text-sm font-semibold text-[var(--text-primary)] outline-none"
            aria-label={`${label} value`}
          />
          <span className="text-[0.72rem] text-[var(--text-muted)]">{unit}</span>
        </div>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="executive-range mt-4 w-full" aria-label={label} />
      <div className="mt-2 flex items-center justify-between text-[0.68rem] text-[var(--text-muted)]">
        <span>{fmt(min, decimals)} {unit}</span>
        <span>{fmt(max, decimals)} {unit}</span>
      </div>
    </div>
  );
}

export function TabButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 whitespace-nowrap rounded-2xl px-4 py-2 text-[0.76rem] font-semibold uppercase tracking-[0.18em] transition',
        active
          ? 'border border-emerald-500/20 bg-emerald-500/12 text-emerald-700 shadow-sm dark:text-emerald-300'
          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export function StatusChip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em]', TONE_STYLES[tone].badge)}>
      {children}
    </span>
  );
}

export function LegendPill({ tone, label }: { tone: Tone; label: string }) {
  return <StatusChip tone={tone}>{label}</StatusChip>;
}

export function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-white/40 bg-white/55 p-4 shadow-sm dark:border-white/8 dark:bg-white/5">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-2 font-[var(--font-numeric)] text-xl font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

export function InsightCard({
  title,
  value,
  note,
  tone,
}: {
  title: string;
  value: string;
  note: string;
  tone: Tone;
}) {
  return (
    <div className="rounded-[24px] border border-[var(--border-soft)] bg-[var(--surface-panel)] p-4">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">{title}</p>
      <p className={cn('mt-3 text-[1rem] font-semibold leading-6', TONE_STYLES[tone].strongText)}>{value}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{note}</p>
    </div>
  );
}

export function MetricRailCard({
  title,
  value,
  subtitle,
  helper,
  tone,
}: {
  title: string;
  value: string;
  subtitle?: string;
  helper?: string;
  tone: Tone;
}) {
  return (
    <div className="rounded-[26px] border border-[var(--border-soft)] bg-[var(--surface-strong)] p-4 shadow-[var(--shadow-sm)]">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">{title}</p>
      <p className={cn('mt-3 font-[var(--font-numeric)] text-3xl font-semibold tracking-tight', TONE_STYLES[tone].strongText)}>{value}</p>
      {subtitle && <p className="mt-2 text-sm text-[var(--text-secondary)]">{subtitle}</p>}
      {helper && <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">{helper}</p>}
    </div>
  );
}

export function ContributionBar({
  label,
  value,
  tone,
  max,
  fmtM,
}: {
  label: string;
  value: number;
  tone: Tone;
  max: number;
  fmtM: (value: number | null) => string;
}) {
  const width = max > 0 ? Math.min((Math.abs(value) / max) * 100, 100) : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-[var(--text-primary)]">{label}</span>
        <span className={cn('font-[var(--font-numeric)] font-semibold', value >= 0 ? TONE_STYLES.green.strongText : TONE_STYLES.rose.strongText)}>
          {fmtM(value)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-subtle)]">
        <div className={cn('h-full rounded-full', TONE_STYLES[tone].bar)} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function MetricSnapshot({
  label,
  value,
  note,
  tone = 'slate',
}: {
  label: string;
  value: string;
  note?: string;
  tone?: Tone;
}) {
  return (
    <div className="rounded-[24px] border border-[var(--border-soft)] bg-[var(--surface-panel)] p-4">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">{label}</p>
      <p className={cn('mt-2 font-[var(--font-numeric)] text-xl font-semibold', TONE_STYLES[tone].strongText)}>{value}</p>
      {note && <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{note}</p>}
    </div>
  );
}

function CostRow({
  label,
  value,
  total,
  tone,
  fmt,
  fmtPercent,
}: {
  label: string;
  value: number;
  total: number;
  tone: Tone;
  fmt: (value: number | null, digits?: number) => string;
  fmtPercent: (value: number, digits?: number) => string;
}) {
  const width = total > 0 ? Math.min((value / total) * 100, 100) : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-[var(--text-secondary)]">{label}</span>
        <span className="font-[var(--font-numeric)] text-sm font-semibold text-[var(--text-primary)]">
          ${fmt(value, 2)} <span className="text-[var(--text-muted)]">({fmtPercent(width, 1)})</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-subtle)]">
        <div className={cn('h-full rounded-full', TONE_STYLES[tone].bar)} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function CostBreakdownCard({
  title,
  total,
  tone,
  rows,
  fmt,
}: {
  title: string;
  total: number;
  tone: Tone;
  rows: Array<{ label: string; value: number }>;
  fmt: (value: number | null, digits?: number) => string;
}) {
  return (
    <section className="flex h-full flex-col overflow-hidden rounded-[30px] border border-[var(--border-soft)] bg-[var(--surface-strong)] shadow-[var(--shadow-md)]">
      <div className="flex flex-1 flex-col p-5 md:p-6">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">Cost architecture</p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight text-[var(--text-primary)]">{title}</h3>
        <div className="mt-5 flex flex-1 flex-col gap-3">
          {rows.map((row) => (
            <React.Fragment key={row.label}>
              <CostRow label={row.label} value={row.value} total={total} tone={tone} fmt={fmt} fmtPercent={(value, digits = 1) => `${value.toFixed(digits)}%`} />
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className="border-t border-[var(--border-soft)] bg-[var(--surface-subtle)] px-5 py-4 md:px-6 md:py-5">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">Total variable cost</p>
        <p className={cn('mt-2 font-[var(--font-numeric)] text-2xl font-semibold', TONE_STYLES[tone].strongText)}>
          ${fmt(total, 2)}/MT
        </p>
      </div>
    </section>
  );
}

export function SettingsGroupCard({
  title,
  description,
  tone,
  icon,
  children,
}: {
  title: string;
  description: string;
  tone: Tone;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-[var(--border-soft)] bg-[var(--surface-panel)] p-5">
      <div className="flex items-start gap-3">
        <span className={cn('rounded-2xl border px-2.5 py-2', TONE_STYLES[tone].badge)}>{icon}</span>
        <div>
          <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
        </div>
      </div>
      <div className="mt-5 space-y-3">{children}</div>
    </section>
  );
}

export function SettingsInput({
  label,
  value,
  onChange,
  step = 1,
  decimals = 2,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  decimals?: number;
}) {
  return (
    <label className="flex flex-col gap-2 rounded-[22px] border border-[var(--border-soft)] bg-[var(--surface-strong)] p-3">
      <span className="text-sm leading-6 text-[var(--text-secondary)]">{label}</span>
      <input
        type="number"
        value={Number(value.toFixed(decimals))}
        step={step}
        onChange={(event) => {
          const nextValue = Number(event.target.value);
          if (!Number.isNaN(nextValue)) onChange(nextValue);
        }}
        className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 py-2 text-right font-[var(--font-numeric)] text-sm font-semibold text-[var(--text-primary)] outline-none transition focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/20"
      />
    </label>
  );
}

export function MiniAsideStat({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="rounded-[20px] border border-[var(--border-soft)] bg-[var(--surface-panel)] p-3">
      <p className="text-[0.64rem] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">{label}</p>
      <p className={cn('mt-2 font-[var(--font-numeric)] text-sm font-semibold', TONE_STYLES[tone].strongText)}>{value}</p>
    </div>
  );
}
