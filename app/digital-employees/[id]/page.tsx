"use client";

import { use, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AgentAvatar } from "@/components/agent-avatar";
import Link from "next/link";
// lucide-react in this project lacks brand icons; use Code as a github
// stand-in. The label "GitHub" is provided in text alongside.
import { Code as Github, Loader2, ExternalLink, Send } from "lucide-react";

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
  nozomio_entity_id: string;
  is_orchestrator: boolean;
  status: "provisioning" | "active" | "retired";
  knowledge_stats: { sources_indexed: number; last_indexed_at: number };
  skills: string[];
  template_type?: string;
  linked_resources?: LinkedResource[];
}

interface GitHubIssue {
  _id: string;
  owner: string;
  repo: string;
  issue_number: number;
  issue_url: string;
  title: string;
  task_brief: string;
  labels: string[];
  simulated: boolean;
  created_at: number;
}

export default function DigitalEmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const agent = useQuery(api.digitalEmployees.get, { id: id as never });
  const issues = useQuery(api.githubIssues.listForEmployee, {
    digital_employee_id: id as never,
  });

  if (agent === undefined) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-zinc-500">Loading…</CardContent>
      </Card>
    );
  }
  if (agent === null) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-zinc-500">
          Digital employee not found.
        </CardContent>
      </Card>
    );
  }

  const a = agent as DigitalEmployee;
  const githubResource = (a.linked_resources ?? []).find(
    (r) => r.kind === "github" && r.enabled
  );
  const issueList = (issues ?? []) as GitHubIssue[];

  return (
    <div className="space-y-8">
      <Link
        href="/digital-employees"
        className="text-sm text-zinc-500 hover:text-orange-400 transition"
      >
        ← Roster
      </Link>

      <header className="flex items-start gap-4">
        <AgentAvatar name={a.name} isOrchestrator={a.is_orchestrator} size={56} />
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight">{a.name}</h1>
            {a.is_orchestrator ? <Badge variant="fired">Orchestrator</Badge> : null}
            <Badge variant={a.status === "active" ? "active" : "pending"}>
              {a.status}
            </Badge>
            {a.template_type ? (
              <Badge variant="spared">{a.template_type}</Badge>
            ) : null}
          </div>
          <p className="text-zinc-400">{a.role}</p>
        </div>
      </header>

      <DispatchPanel
        employeeId={a._id}
        githubLinked={!!githubResource}
        repo={
          githubResource
            ? `${(githubResource.config as { owner?: string }).owner ?? ""}/${(githubResource.config as { repo?: string }).repo ?? ""}`
            : ""
        }
      />

      <ResourcesPanel employeeId={a._id} resources={a.linked_resources ?? []} />

      {issueList.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>GitHub Issues Filed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {issueList.map((iss) => (
              <a
                key={iss._id}
                href={iss.issue_url}
                target="_blank"
                rel="noreferrer"
                className="block border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] p-3 transition"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[10px] font-mono text-[var(--text-dim)]">
                        {iss.owner}/{iss.repo} #{iss.issue_number}
                      </span>
                      {iss.simulated ? (
                        <Badge variant="pending">simulated</Badge>
                      ) : (
                        <Badge variant="active">live</Badge>
                      )}
                      {iss.labels.map((l) => (
                        <span
                          key={l}
                          className="text-[8px] font-mono uppercase tracking-[0.15em] text-[var(--text-dim)] border border-[var(--border)] px-1.5 py-0.5"
                        >
                          {l}
                        </span>
                      ))}
                    </div>
                    <div className="font-semibold text-sm truncate">{iss.title}</div>
                    <div className="text-[10px] font-mono text-[var(--text-dim)] mt-1">
                      Brief: {iss.task_brief.slice(0, 120)}
                      {iss.task_brief.length > 120 ? "…" : ""}
                    </div>
                  </div>
                  <ExternalLink className="h-3 w-3 text-[var(--text-dim)] shrink-0 mt-1" />
                </div>
              </a>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row k="AgentMail inbox" v={a.agentmail_address} mono />
          <Row k="A2A endpoint" v={a.a2a_endpoint_url} mono />
          <Row k="Nia entity_id" v={a.nozomio_entity_id} mono />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Knowledge (Nia)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row k="Sources indexed" v={String(a.knowledge_stats.sources_indexed)} />
          <Row
            k="Last indexed"
            v={new Date(a.knowledge_stats.last_indexed_at).toLocaleString()}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function DispatchPanel({
  employeeId,
  githubLinked,
  repo,
}: {
  employeeId: string;
  githubLinked: boolean;
  repo: string;
}) {
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    issue_url?: string;
    title?: string;
    error?: string;
    simulated?: boolean;
  } | null>(null);

  const dispatch = async () => {
    if (!brief.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(
        `/api/digital-employees/${employeeId}/dispatch-github`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brief: brief.trim() }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "dispatch failed");
      setResult(data);
      if (data.ok) setBrief("");
    } catch (e: unknown) {
      setResult({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Github className="h-4 w-4" /> Dispatch GitHub Task
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!githubLinked ? (
          <p className="text-[11px] font-mono text-[var(--text-dim)]">
            Link a GitHub repo below to enable real issue creation.
          </p>
        ) : (
          <p className="text-[11px] font-mono text-[var(--text-muted)]">
            Linked to <span className="text-[var(--text)]">{repo}</span>. Briefs
            below run the engineer prompt and post a real issue (or a simulated
            one if no GITHUB_TOKEN is configured).
          </p>
        )}
        <Textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Describe the task. e.g. 'Auth middleware rejects valid tokens issued in the last 5 seconds — likely a clock-skew bug. Reproduce and patch.'"
          className="min-h-[100px]"
          disabled={!githubLinked || busy}
        />
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10px] font-mono text-[var(--text-dim)]">
            {brief.length} chars
          </div>
          <Button
            variant="fire"
            disabled={!githubLinked || busy || brief.trim().length < 5}
            onClick={dispatch}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            File Issue
          </Button>
        </div>
        {result?.issue_url ? (
          <div className="border border-[var(--accent)]/60 bg-[var(--accent-dim)]/20 p-3 space-y-1">
            <div className="text-[10px] font-mono text-[var(--accent)] tracking-[0.15em] uppercase">
              {result.simulated ? "simulated" : "live"} · Issue filed
            </div>
            <div className="font-semibold text-sm">{result.title}</div>
            <a
              href={result.issue_url}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-mono text-[var(--accent-bright)] hover:underline break-all"
            >
              {result.issue_url}
            </a>
          </div>
        ) : null}
        {result?.error ? (
          <div className="border border-red-700 bg-red-900/30 p-3 text-[11px] font-mono text-red-300">
            {result.error}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ResourcesPanel({
  employeeId,
  resources,
}: {
  employeeId: string;
  resources: LinkedResource[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [github, setGithub] = useState(() => {
    const ex = resources.find((r) => r.kind === "github");
    if (!ex) return "";
    const c = ex.config as { owner?: string; repo?: string };
    return c.owner && c.repo ? `${c.owner}/${c.repo}` : "";
  });
  const [insta, setInsta] = useState(() => {
    const ex = resources.find((r) => r.kind === "instagram");
    return (ex?.config as { handle?: string })?.handle ?? "";
  });
  const [slack, setSlack] = useState(() => {
    const ex = resources.find((r) => r.kind === "slack");
    return (ex?.config as { channel?: string })?.channel ?? "";
  });

  const link = async (kind: ResourceKind, config: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/digital-employees/${employeeId}/link-resource`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, config, enabled: true }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "link failed");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Linked Resources</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="rc-gh">
            <span className="inline-flex items-center gap-1.5">
              <Github className="h-3 w-3" /> GitHub repo
              <Badge variant="active">live</Badge>
            </span>
          </Label>
          <div className="flex gap-2">
            <Input
              id="rc-gh"
              value={github}
              onChange={(e) => setGithub(e.target.value)}
              placeholder="owner/repo"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !github.trim()}
              onClick={() => link("github", { input: github.trim() })}
            >
              Link
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rc-ig">
            <span className="inline-flex items-center gap-1.5">
              Instagram handle
              <Badge variant="pending">mock</Badge>
            </span>
          </Label>
          <div className="flex gap-2">
            <Input
              id="rc-ig"
              value={insta}
              onChange={(e) => setInsta(e.target.value)}
              placeholder="@yourhandle"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !insta.trim()}
              onClick={() => link("instagram", { handle: insta.trim() })}
            >
              Link
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rc-slack">
            <span className="inline-flex items-center gap-1.5">
              Slack channel
              <Badge variant="pending">mock</Badge>
            </span>
          </Label>
          <div className="flex gap-2">
            <Input
              id="rc-slack"
              value={slack}
              onChange={(e) => setSlack(e.target.value)}
              placeholder="#channel"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !slack.trim()}
              onClick={() => link("slack", { channel: slack.trim() })}
            >
              Link
            </Button>
          </div>
        </div>
        {error ? (
          <div className="border border-red-700 bg-red-900/30 p-3 text-[11px] font-mono text-red-300">
            {error}
          </div>
        ) : null}
        <p className="text-[9px] font-mono text-[var(--text-dim)] tracking-wide">
          Only GitHub triggers a real backend integration. Other links are
          recorded as metadata for the agent dossier; their tools are stubbed.
        </p>
      </CardContent>
    </Card>
  );
}

function Row({
  k,
  v,
  mono,
}: {
  k: string;
  v: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2">
      <div className="text-zinc-500 text-xs uppercase tracking-wider">{k}</div>
      <div className={mono ? "font-mono text-xs break-all" : ""}>{v}</div>
    </div>
  );
}
