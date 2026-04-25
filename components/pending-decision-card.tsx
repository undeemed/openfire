"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Flame, Loader2, ShieldCheck, ExternalLink, User } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PendingDecisionCardData {
  decisionId: string;
  employeeId: string;
  name: string;
  role: string;
  email: string;
  decision: "fire" | "spare";
  reasoning: string;
  emailSubjectPreview?: string;
  decisionStatus: "pending" | "approved" | "rejected" | "sent";
  createdAt: number;
}

export function PendingDecisionCard({ data }: { data: PendingDecisionCardData }) {
  const [busy, setBusy] = useState<"none" | "spare" | "send">("none");
  const [error, setError] = useState<string | null>(null);

  const fileNum = data.employeeId.slice(-6).toUpperCase();
  const isFire = data.decision === "fire";
  const decisionLocked = data.decisionStatus !== "pending";

  const act = async (action: "approve" | "reject", which: "spare" | "send") => {
    if (decisionLocked) return;
    setBusy(which);
    setError(null);
    try {
      const res = await fetch(`/api/decisions/${data.decisionId}/${action}`, { method: "POST" });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `${action} failed`);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("none");
    }
  };

  const created = new Date(data.createdAt);
  const dateStr = created.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={cn(
      "group relative card-enter overflow-hidden",
      "border border-[var(--amber)]/40 bg-[var(--surface)]",
      "transition-[border-color,background-color] duration-200",
      "hover:border-[var(--amber)]/70",
    )}>
      <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-[var(--amber)]" />

      <div className="pl-[20px] pr-4 py-4">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[8px] font-mono tracking-[0.22em] text-[var(--amber)] uppercase">
              File #{fileNum}
            </span>
            <span className="text-[var(--text-dim)]">·</span>
            <span className="text-[8px] font-mono tracking-[0.22em] text-[var(--text-dim)] uppercase">
              {dateStr}
            </span>
          </div>
          <div className={cn(
            "inline-flex items-center gap-1.5 px-2 py-0.5 text-[9px] font-mono font-bold tracking-[0.25em] uppercase border",
            isFire
              ? "border-[var(--accent)] bg-[var(--accent-dim)]/60 text-[var(--accent-bright)]"
              : "border-[var(--blue)] bg-[var(--blue-dim)]/60 text-[var(--blue-text)]"
          )}>
            {isFire ? <Flame className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
            {isFire ? "Recommend: Terminate" : "Recommend: Spare"}
          </div>
        </div>

        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 shrink-0 border border-[var(--border)] bg-[var(--surface-raised)] flex items-center justify-center">
            <User className="w-4 h-4 text-[var(--text-dim)]" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-lg font-semibold text-[var(--text)] leading-tight">
              {data.name}
            </h3>
            <p className="text-[10px] font-mono text-[var(--text-muted)] mt-0.5 truncate">
              {data.role} · {data.email}
            </p>
          </div>
          <Link
            href={`/employees/${data.employeeId}`}
            className="text-[var(--text-dim)] hover:text-[var(--amber)] transition-colors shrink-0"
            aria-label="Open dossier"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="border-t border-[var(--border-dim)] pt-3 mb-3">
          <div className="text-[7px] font-mono tracking-[0.25em] text-[var(--text-dim)] uppercase mb-1.5">
            Claw Reasoning
          </div>
          <p className="text-[11px] font-mono text-[var(--text-muted)] leading-relaxed line-clamp-3">
            {data.reasoning}
          </p>
        </div>

        {data.emailSubjectPreview ? (
          <div className="border-t border-[var(--border-dim)] pt-3 mb-4">
            <div className="text-[7px] font-mono tracking-[0.25em] text-[var(--text-dim)] uppercase mb-1.5">
              Draft Subject
            </div>
            <p className="text-[11px] font-mono text-[var(--text)] leading-snug truncate">
              {data.emailSubjectPreview}
            </p>
          </div>
        ) : null}

        {error ? (
          <div className="mb-3 border border-[var(--accent)]/60 bg-[var(--accent-dim)]/20 px-3 py-2">
            <p className="text-[10px] font-mono text-[var(--accent)]">{error}</p>
          </div>
        ) : null}

        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/employees/${data.employeeId}`}>
            <Button variant="outline" size="sm">
              Full Dossier →
            </Button>
          </Link>
          <div className="flex-1" />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => act("reject", "spare")}
            disabled={busy !== "none" || decisionLocked}
          >
            {busy === "spare" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
            Spare
          </Button>
          <Button
            variant="fire"
            size="sm"
            onClick={() => act("approve", "send")}
            disabled={busy !== "none" || decisionLocked || !isFire}
          >
            {busy === "send" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Flame className="h-3 w-3" />}
            Send It
          </Button>
        </div>
      </div>
    </div>
  );
}
