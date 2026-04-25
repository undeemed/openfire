"use client";

import Link from "next/link";

export function SiteNav() {
  return (
    <header className="sticky top-0 z-30 bg-[var(--bg)]/95 backdrop-blur-md border-b border-[var(--border)]">
      <div className="h-[2px] bg-gradient-to-r from-[var(--accent-dim)] via-[var(--accent)] to-[var(--accent-dim)]" />
      <div className="mx-auto max-w-6xl px-6 flex items-stretch h-12">
        <Link href="/" className="group flex items-baseline gap-3 py-3 pr-6 border-r border-[var(--border)] mr-2">
          <span className="font-display text-lg font-semibold text-[var(--text)] group-hover:text-[var(--accent-bright)] transition-colors leading-none">
            OpenFire
          </span>
          <span className="text-[8px] font-mono tracking-[0.3em] text-[var(--text-dim)] uppercase">
            Command
          </span>
        </Link>

        <div className="flex items-center gap-3 text-[8px] font-mono tracking-[0.22em] text-[var(--text-dim)] uppercase">
          <span className="hidden sm:inline">Clearance: Executive</span>
          <span className="hidden sm:inline text-[var(--text-dim)]">·</span>
          <span>Channel: <span className="text-[var(--accent)]">SECURE</span></span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
          <div className="text-[8px] font-mono tracking-[0.22em] text-[var(--text-muted)] uppercase">
            The Claw · Active
          </div>
        </div>
      </div>
    </header>
  );
}
