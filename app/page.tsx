"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { EmployeeCard, ArchiveRow, EmployeeCardData } from "@/components/employee-card";
import { PendingDecisionCard, PendingDecisionCardData } from "@/components/pending-decision-card";
import { CriteriaPanel } from "@/components/criteria-panel";
import { StatsBar } from "@/components/stats-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Loader2, AlertTriangle, Flame, ChevronDown, ChevronRight, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface Decision {
  _id: string;
  employee_id: string;
  reasoning: string;
  decision: "fire" | "spare";
  email_draft: string;
  status: "pending" | "approved" | "rejected" | "sent";
  created_at: number;
}

export default function CommandCenter() {
  const employees = useQuery(api.employees.list);
  const decisions = useQuery(api.decisions.list);
  const createEmployee = useMutation(api.employees.create);

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "",
    nozomio_entity_id: "",
  });

  const decisionByEmployee = useMemo(() => {
    const map = new Map<string, Decision>();
    for (const d of (decisions ?? []) as Decision[]) {
      if (!map.has(d.employee_id)) map.set(d.employee_id, d);
    }
    return map;
  }, [decisions]);

  const list = (employees ?? []) as EmployeeCardData[];
  const pendingEmployees = list.filter(
    (e) => e.status === "pending" && decisionByEmployee.get(e._id)?.status === "pending",
  );
  const activeEmployees = list.filter((e) => e.status === "active");
  const firedEmployees = list.filter((e) => e.status === "fired");
  const sparedEmployees = list.filter((e) => e.status === "spared");
  const archive = [...firedEmployees, ...sparedEmployees];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createEmployee(form);
      setForm({ name: "", email: "", role: "", nozomio_entity_id: "" });
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const lightFuse = async (id: string) => {
    setRunning((s) => new Set(s).add(id));
    setError(null);
    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id: id }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Agent run failed");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  };

  const evaluateAll = async () => {
    if (activeEmployees.length === 0) return;
    setBulkRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Bulk run failed");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBulkRunning(false);
    }
  };

  const loading = employees === undefined || decisions === undefined;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <section className="pb-5 border-b border-[var(--border)]">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[8px] font-mono tracking-[0.3em] text-[var(--text-dim)] uppercase mb-2">
              Openfire · Command Center
            </div>
            <h1 className="font-display text-4xl font-semibold text-[var(--text)] leading-none">
              The Console
            </h1>
            <p className="text-[11px] font-mono text-[var(--text-muted)] mt-2.5 tracking-wide">
              Roster, decisions, and criteria. One screen. The Claw is watching.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={evaluateAll}
              disabled={bulkRunning || activeEmployees.length === 0}
            >
              {bulkRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
              Evaluate All
            </Button>
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-3 w-3" />
              Add Subject
            </Button>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <StatsBar
        total={list.length}
        active={activeEmployees.length}
        pending={pendingEmployees.length}
        fired={firedEmployees.length}
        spared={sparedEmployees.length}
      />

      {/* Error banner */}
      {error ? (
        <div className="flex items-start gap-3 border border-[var(--accent)]/60 bg-[var(--accent-dim)]/20 p-4">
          <AlertTriangle className="h-3.5 w-3.5 text-[var(--accent)] shrink-0 mt-0.5" />
          <p className="text-[11px] font-mono text-[var(--accent)] flex-1">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-[var(--accent)] hover:text-[var(--accent-bright)] text-[10px] font-mono uppercase tracking-[0.18em]"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Two-column layout */}
      <div className="grid lg:grid-cols-12 gap-6">
        {/* Main column */}
        <div className="lg:col-span-8 space-y-8 min-w-0">
          {loading ? (
            <div className="border border-[var(--border)] bg-[var(--surface)] p-16 text-center">
              <Loader2 className="h-4 w-4 animate-spin mx-auto mb-3 text-[var(--text-dim)]" />
              <p className="text-[10px] font-mono text-[var(--text-dim)] tracking-[0.2em] uppercase">
                Loading roster…
              </p>
            </div>
          ) : (
            <>
              {/* PENDING REVIEW — urgent, top */}
              {pendingEmployees.length > 0 ? (
                <section>
                  <SectionHeader
                    color="var(--amber)"
                    label={`Pending Review · ${pendingEmployees.length}`}
                    sub="The Claw awaits your decree. Decisions cannot be undone once dispatched."
                    pulsing
                  />
                  <div className="space-y-3">
                    {pendingEmployees.map((emp, i) => {
                      const dec = decisionByEmployee.get(emp._id);
                      if (!dec) return null;
                      const data: PendingDecisionCardData = {
                        decisionId: dec._id,
                        employeeId: emp._id,
                        name: emp.name,
                        role: emp.role,
                        email: emp.email,
                        decision: dec.decision,
                        reasoning: dec.reasoning,
                        emailSubjectPreview: extractSubject(dec.email_draft),
                        decisionStatus: dec.status,
                        createdAt: dec.created_at,
                      };
                      return (
                        <div key={dec._id} style={{ animationDelay: `${i * 60}ms` }}>
                          <PendingDecisionCard data={data} />
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {/* ACTIVE ROSTER */}
              <section>
                <SectionHeader
                  color="var(--accent)"
                  label={`Active Roster · ${activeEmployees.length}`}
                  sub="Subjects awaiting evaluation. Light a fuse or wait for the bulk sweep."
                />
                {activeEmployees.length === 0 ? (
                  <div className="border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
                    <div className="text-3xl mb-3 flicker">🔥</div>
                    <p className="font-display text-lg text-[var(--text)] mb-1">The smoke clears.</p>
                    <p className="text-[10px] font-mono text-[var(--text-muted)]">
                      No active subjects. Add one to begin.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {activeEmployees.map((emp, i) => (
                      <div
                        key={emp._id}
                        className="relative"
                        style={{ animationDelay: `${i * 50}ms` }}
                      >
                        <EmployeeCard employee={emp} onLightFuse={lightFuse} />
                        {(running.has(emp._id) || bulkRunning) ? (
                          <div className="absolute inset-0 bg-[var(--bg)]/85 backdrop-blur-sm flex flex-col items-center justify-center gap-2 z-10">
                            <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
                            <div className="text-[8px] font-mono tracking-[0.25em] text-[var(--accent)] uppercase flicker">
                              Deliberating…
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* ARCHIVE — collapsible */}
              {archive.length > 0 ? (
                <section>
                  <button
                    onClick={() => setArchiveOpen((v) => !v)}
                    className="group w-full flex items-center gap-3 mb-3 text-left"
                  >
                    {archiveOpen ? (
                      <ChevronDown className="h-3 w-3 text-[var(--text-dim)] group-hover:text-[var(--text-muted)]" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-[var(--text-dim)] group-hover:text-[var(--text-muted)]" />
                    )}
                    <div className="h-[1px] w-4 bg-[var(--text-dim)]" />
                    <span className="text-[9px] font-mono tracking-[0.25em] text-[var(--text-dim)] group-hover:text-[var(--text-muted)] uppercase transition-colors">
                      Archive · {archive.length}
                    </span>
                    <span className="text-[8px] font-mono tracking-[0.18em] text-[var(--text-dim)] uppercase ml-auto">
                      {firedEmployees.length} terminated · {sparedEmployees.length} spared
                    </span>
                  </button>

                  {archiveOpen ? (
                    <div className="space-y-1.5">
                      {archive.map((emp, i) => (
                        <div key={emp._id} style={{ animationDelay: `${i * 30}ms` }}>
                          <ArchiveRow employee={emp} />
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
              ) : null}
            </>
          )}
        </div>

        {/* Sidebar — criteria */}
        <aside className="lg:col-span-4">
          <CriteriaPanel />
        </aside>
      </div>

      {/* Add Subject dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onClose={() => setOpen(false)}>
          <DialogHeader>
            <DialogTitle>Register Subject</DialogTitle>
            <DialogDescription>
              Add an employee to the active roster. They will await evaluation by The Claw.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Full Name" id="name">
              <Input
                id="name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Jane Doe"
              />
            </Field>
            <Field label="Email Address" id="email">
              <Input
                id="email"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="jane@example.com"
              />
            </Field>
            <Field label="Role / Title" id="role">
              <Input
                id="role"
                required
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                placeholder="Senior Software Engineer"
              />
            </Field>
            <Field label="Nozomio Entity ID" id="nz">
              <Input
                id="nz"
                required
                value={form.nozomio_entity_id}
                onChange={(e) => setForm({ ...form, nozomio_entity_id: e.target.value })}
                placeholder="ent_abc123"
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Flame className="h-3 w-3" />}
                Register
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function SectionHeader({
  color,
  label,
  sub,
  pulsing,
}: {
  color: string;
  label: string;
  sub: string;
  pulsing?: boolean;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-3 mb-1.5">
        {pulsing ? (
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: color }}
          />
        ) : null}
        <div className="h-[1px] w-4" style={{ background: color }} />
        <span
          className={cn("text-[9px] font-mono tracking-[0.25em] uppercase font-semibold")}
          style={{ color }}
        >
          {label}
        </span>
      </div>
      <p className="text-[10px] font-mono text-[var(--text-muted)] ml-7">{sub}</p>
    </div>
  );
}

/** Pull "Subject: ..." line from email_draft, fallback to first line. */
function extractSubject(draft: string): string {
  const lines = draft.split("\n");
  for (const line of lines) {
    const m = line.match(/^subject:\s*(.+)$/i);
    if (m) return m[1].trim();
  }
  return lines.find((l) => l.trim().length > 0)?.trim() ?? "";
}
