"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { AgentAvatar } from "@/components/agent-avatar";
import Link from "next/link";
// lucide-react in this project doesn't ship the social brand icons we
// want, so we use generic ones (Code/Hash/Globe/User) and just label
// the kind in text.
import { Loader2, Plus, Code, Hash, Globe, User as UserIcon, Briefcase } from "lucide-react";

const Github = Code;
const Instagram = Globe;
const Slack = Hash;
const Linkedin = Briefcase;
const Twitter = UserIcon;

type TemplateType =
  | "engineer"
  | "gtm"
  | "recruiter"
  | "cse"
  | "pm"
  | "researcher";

type ResourceKind = "github" | "instagram" | "twitter" | "slack" | "linkedin";

interface LinkedResource {
  kind: ResourceKind;
  config: Record<string, unknown>;
  enabled: boolean;
  linked_at: number;
}

interface DigitalEmployee {
  _id: string;
  name: string;
  role: string;
  agentmail_address: string;
  a2a_endpoint_url: string;
  is_orchestrator: boolean;
  status: "provisioning" | "active" | "retired";
  knowledge_stats: { sources_indexed: number; last_indexed_at: number };
  skills: string[];
  template_type?: TemplateType;
  linked_resources?: LinkedResource[];
}

const TEMPLATE_OPTIONS: { value: TemplateType; label: string; defaultRole: string }[] = [
  { value: "engineer", label: "Senior Software Engineer", defaultRole: "Senior Software Engineer" },
  { value: "gtm", label: "Outbound SDR", defaultRole: "Sales Development Rep" },
  { value: "recruiter", label: "Technical Recruiter", defaultRole: "Technical Recruiter" },
  { value: "cse", label: "Customer Success Engineer", defaultRole: "Customer Success Engineer" },
  { value: "pm", label: "Product Manager", defaultRole: "Product Manager" },
  { value: "researcher", label: "Research Analyst", defaultRole: "Research Analyst" },
];

export default function DigitalEmployeesPage() {
  const list = useQuery(api.digitalEmployees.list);
  const [hireOpen, setHireOpen] = useState(false);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Digital Employees</h1>
          <p className="text-sm text-zinc-400">
            Autonomous AI workers with provisioned inboxes, A2A endpoints, and
            optional external resources (GitHub, Slack, social).
          </p>
        </div>
        <Button onClick={() => setHireOpen(true)}>
          <Plus className="h-3 w-3" /> Hire New
        </Button>
      </header>

      {list === undefined ? (
        <Card>
          <CardContent className="py-12 text-center text-zinc-500">Loading…</CardContent>
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-zinc-500 space-y-3">
            <p>No digital employees yet.</p>
            <Button variant="fire" onClick={() => setHireOpen(true)}>
              <Plus className="h-3 w-3" /> Hire your first
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(list as DigitalEmployee[]).map((a) => (
            <EmployeeCard key={a._id} a={a} />
          ))}
        </div>
      )}

      <HireDialog open={hireOpen} onOpenChange={setHireOpen} />
    </div>
  );
}

function EmployeeCard({ a }: { a: DigitalEmployee }) {
  const resources = a.linked_resources ?? [];
  return (
    <Link href={`/digital-employees/${a._id}`}>
      <Card className="hover:border-orange-700/60 transition cursor-pointer h-full">
        <CardContent className="p-4 flex items-start gap-3">
          <AgentAvatar name={a.name} isOrchestrator={a.is_orchestrator} size={40} />
          <div className="flex-1 space-y-1.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{a.name}</span>
              {a.is_orchestrator ? <Badge variant="fired">Orchestrator</Badge> : null}
              <Badge
                variant={
                  a.status === "active"
                    ? "active"
                    : a.status === "provisioning"
                      ? "pending"
                      : "default"
                }
              >
                {a.status}
              </Badge>
              {a.template_type ? (
                <Badge variant="spared">{a.template_type}</Badge>
              ) : null}
            </div>
            <div className="text-xs text-zinc-400">{a.role}</div>
            <div className="text-[10px] font-mono text-zinc-500 break-all">
              {a.agentmail_address}
            </div>
            {resources.length ? (
              <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                {resources.map((r) => (
                  <ResourceChip key={r.kind} r={r} />
                ))}
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function ResourceChip({ r }: { r: LinkedResource }) {
  const Icon =
    r.kind === "github" ? Github
    : r.kind === "instagram" ? Instagram
    : r.kind === "slack" ? Slack
    : r.kind === "linkedin" ? Linkedin
    : Twitter;
  const label =
    r.kind === "github"
      ? `${(r.config as { owner?: string }).owner ?? "?"}/${(r.config as { repo?: string }).repo ?? "?"}`
      : (r.config as { handle?: string; channel?: string }).handle ??
        (r.config as { channel?: string }).channel ??
        r.kind;
  const color = r.kind === "github" ? "text-white" : "text-zinc-400";
  return (
    <span
      className={`inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-[0.15em] border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 ${color}`}
    >
      <Icon className="h-3 w-3" />
      <span className="truncate max-w-[140px]">{label}</span>
    </span>
  );
}

function HireDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    role: "",
    template_type: "engineer" as TemplateType,
    github_repo: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/digital-employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          role:
            form.role ||
            TEMPLATE_OPTIONS.find((t) => t.value === form.template_type)
              ?.defaultRole ||
            "Worker",
          template_type: form.template_type,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "create failed");
      const id = data.id as string;
      // If a github repo was provided, link it.
      if (form.github_repo.trim()) {
        const linkRes = await fetch(
          `/api/digital-employees/${id}/link-resource`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: "github",
              config: { input: form.github_repo.trim() },
              enabled: true,
            }),
          }
        );
        const linkData = await linkRes.json();
        if (!linkRes.ok) throw new Error(linkData.error ?? "github link failed");
      }
      setForm({
        name: "",
        role: "",
        template_type: "engineer",
        github_repo: "",
      });
      onOpenChange(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Hire a Digital Employee</DialogTitle>
          <DialogDescription>
            Spawn an autonomous AI worker. Picking a template wires its tools
            and prompt; linking GitHub lets it file real issues.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              required
              minLength={2}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Hank"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="template">Role Template</Label>
            <select
              id="template"
              value={form.template_type}
              onChange={(e) =>
                setForm({ ...form, template_type: e.target.value as TemplateType })
              }
              className="w-full bg-[var(--surface)] border border-[var(--border)] text-[11px] font-mono text-[var(--text)] px-3 py-2 focus:outline-none focus:border-[var(--accent)]"
            >
              {TEMPLATE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="role">Title (optional override)</Label>
            <Input
              id="role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              placeholder={
                TEMPLATE_OPTIONS.find((t) => t.value === form.template_type)
                  ?.defaultRole
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gh">
              <span className="inline-flex items-center gap-1.5">
                <Github className="h-3 w-3" /> GitHub repo (optional)
              </span>
            </Label>
            <Input
              id="gh"
              value={form.github_repo}
              onChange={(e) => setForm({ ...form, github_repo: e.target.value })}
              placeholder="owner/repo or https://github.com/owner/repo"
            />
            <p className="text-[9px] font-mono text-[var(--text-dim)] tracking-wide">
              When linked, this employee can file real GitHub issues against
              the repo. Requires GITHUB_TOKEN; without it, posts are simulated.
            </p>
          </div>

          {error ? (
            <div className="border border-[var(--accent)]/60 bg-[var(--accent-dim)]/20 p-3">
              <p className="text-[10px] font-mono text-[var(--accent)]">{error}</p>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" variant="fire" disabled={busy}>
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Hire
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
