"use client";

import { cn } from "@/lib/utils";

interface StatsBarProps {
  total: number;
  active: number;
  pending: number;
  fired: number;
  spared: number;
}

export function StatsBar({ total, active, pending, fired, spared }: StatsBarProps) {
  return (
    <div className="border border-[var(--border)] bg-[var(--surface)] grid grid-cols-2 sm:grid-cols-5 divide-x divide-[var(--border)]">
      <Stat label="Subjects" value={total} accent="text" />
      <Stat label="Active" value={active} accent="accent" />
      <Stat label="Pending" value={pending} accent="amber" pulse={pending > 0} />
      <Stat label="Terminated" value={fired} accent="dim" />
      <Stat label="Spared" value={spared} accent="blue" />
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  pulse,
}: {
  label: string;
  value: number;
  accent: "text" | "accent" | "amber" | "dim" | "blue";
  pulse?: boolean;
}) {
  const colorClass = {
    text: "text-[var(--text)]",
    accent: "text-[var(--accent-bright)]",
    amber: "text-[var(--amber)]",
    dim: "text-[var(--text-dim)]",
    blue: "text-[var(--blue-text)]",
  }[accent];

  return (
    <div className="px-4 py-3 flex flex-col gap-0.5 relative">
      {pulse ? (
        <span className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full bg-[var(--amber)] animate-pulse" />
      ) : null}
      <span className="text-[7px] font-mono tracking-[0.25em] text-[var(--text-dim)] uppercase">
        {label}
      </span>
      <span className={cn("font-display text-2xl font-bold leading-none tabular-nums", colorClass)}>
        {value.toString().padStart(2, "0")}
      </span>
    </div>
  );
}
