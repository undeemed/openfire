"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Flame, Loader2, ExternalLink, User } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "active" | "pending" | "fired" | "spared";

export interface EmployeeCardData {
  _id: string;
  name: string;
  email: string;
  role: string;
  nozomio_entity_id: string;
  status: Status;
}

const stripeColor: Record<Status, string> = {
  active: "bg-[var(--accent)]",
  pending: "bg-[var(--amber)]",
  fired: "bg-[var(--text-dim)]",
  spared: "bg-[var(--blue)]",
};

const statusVariant: Record<Status, "active" | "pending" | "fired" | "spared"> = {
  active: "active",
  pending: "pending",
  fired: "fired",
  spared: "spared",
};

const statusLabel: Record<Status, string> = {
  active: "Active",
  pending: "Under Review",
  fired: "Terminated",
  spared: "Spared",
};

export function EmployeeCard({
  employee,
  onLightFuse,
}: {
  employee: EmployeeCardData;
  onLightFuse?: (id: string) => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);

  const handleFuse = async () => {
    if (!onLightFuse) return;
    setBusy(true);
    try { await onLightFuse(employee._id); }
    finally { setBusy(false); }
  };

  const fileNum = employee._id.slice(-6).toUpperCase();

  return (
    <div className={cn(
      "group relative overflow-hidden card-enter",
      "border border-[var(--border)] bg-[var(--surface)]",
      "transition-[border-color,background-color] duration-200",
      "hover:border-[var(--border-raised)] hover:bg-[var(--surface-raised)]",
    )}>
      {/* Status stripe — absolute, widens on hover without shifting content */}
      <div className={cn(
        "absolute left-0 top-0 bottom-0 w-[3px] group-hover:w-[5px] transition-[width] duration-200",
        stripeColor[employee.status]
      )} />

      <div className="p-4 pl-[18px] min-w-0">
        {/* File number row */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-[8px] font-mono tracking-[0.2em] text-[var(--text-dim)] uppercase">
            File #{fileNum}
          </span>
          <Link
            href={`/employees/${employee._id}`}
            className="text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors"
            aria-label="Open dossier"
          >
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>

        {/* Photo + identity */}
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 shrink-0 border border-[var(--border)] bg-[var(--surface-raised)] flex items-center justify-center">
            <User className="w-4 h-4 text-[var(--text-dim)]" />
          </div>
          <div className="min-w-0">
            <h3 className="font-display text-base font-semibold text-[var(--text)] leading-tight">
              {employee.name}
            </h3>
            <p className="text-[10px] font-mono text-[var(--text-muted)] mt-0.5 truncate">
              {employee.role}
            </p>
          </div>
        </div>

        {/* Data fields */}
        <div className="space-y-1.5 border-t border-[var(--border-dim)] pt-3 mb-4">
          <DataRow label="Email" value={employee.email} />
          <DataRow label="NZM" value={employee.nozomio_entity_id} />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2">
          <Badge variant={statusVariant[employee.status]}>
            {statusLabel[employee.status]}
          </Badge>

          {employee.status === "active" && onLightFuse ? (
            <Button variant="fire" size="sm" onClick={handleFuse} disabled={busy}>
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Flame className="h-3 w-3" />}
              {busy ? "Processing" : "Terminate"}
            </Button>
          ) : null}

          {employee.status === "pending" ? (
            <Link href={`/employees/${employee._id}`}>
              <Button variant="outline" size="sm">Review →</Button>
            </Link>
          ) : null}
        </div>
      </div>

      {/* TERMINATED stamp */}
      {employee.status === "fired" ? (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="stamp-appear select-none border-2 border-[var(--accent)]/45 px-3 py-1.5 rotate-[-12deg]">
            <span className="font-mono text-[10px] font-bold tracking-[0.45em] text-[var(--accent)]/45 uppercase">
              Terminated
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[7px] font-mono tracking-[0.18em] text-[var(--text-dim)] uppercase w-12 shrink-0">
        {label}
      </span>
      <span className="text-[10px] font-mono text-[var(--text-muted)] truncate">{value}</span>
    </div>
  );
}

/** Compact archive row — dense single-line layout for fired/spared */
export function ArchiveRow({ employee }: { employee: EmployeeCardData }) {
  const fileNum = employee._id.slice(-6).toUpperCase();
  const statusColor =
    employee.status === "fired" ? "var(--text-dim)" : "var(--blue)";

  return (
    <Link
      href={`/employees/${employee._id}`}
      className="group relative flex items-center overflow-hidden border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-raised)] hover:border-[var(--border-raised)] transition-colors card-enter"
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-[2px] group-hover:w-[3px] transition-[width] duration-200"
        style={{ background: statusColor }}
      />
      <div className="flex-1 flex items-center gap-3 px-4 py-2.5 pl-[14px] min-w-0">
        <span className="text-[8px] font-mono tracking-[0.18em] text-[var(--text-dim)] uppercase shrink-0">
          #{fileNum}
        </span>
        <span className="font-display text-sm text-[var(--text)] truncate min-w-0 flex-1">
          {employee.name}
        </span>
        <span className="hidden sm:block text-[10px] font-mono text-[var(--text-muted)] truncate min-w-0 max-w-[160px]">
          {employee.role}
        </span>
        <Badge variant={statusVariant[employee.status]}>
          {statusLabel[employee.status]}
        </Badge>
        <span className="text-[var(--text-dim)] group-hover:text-[var(--accent)] transition-colors shrink-0">
          <ExternalLink className="h-3 w-3" />
        </span>
      </div>
    </Link>
  );
}
