"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Flame } from "lucide-react";

const links = [
  { href: "/", label: "Pending Departures" },
  { href: "/pyre", label: "The Pyre 🔥" },
  { href: "/criteria", label: "Criteria" },
];

export function SiteNav() {
  const pathname = usePathname();
  return (
    <header className="border-b border-zinc-900/80 bg-black/60 backdrop-blur sticky top-0 z-30">
      <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="relative">
            <Flame className="h-6 w-6 text-orange-500 transition group-hover:text-orange-400 drop-shadow-[0_0_10px_rgba(234,88,12,0.6)]" />
          </div>
          <div className="leading-tight">
            <div className="text-base font-bold tracking-tight text-zinc-100">
              OpenFire
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              The Claw
            </div>
          </div>
        </Link>

        <nav className="flex items-center gap-1">
          {links.map((l) => {
            const active = pathname === l.href || (l.href !== "/" && pathname.startsWith(l.href));
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm transition",
                  active
                    ? "bg-orange-950/40 text-orange-200 border border-orange-800/40"
                    : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
