"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DecisionModal, DecisionModalData } from "@/components/decision-modal";
import { EmailThread, EmailMessage } from "@/components/email-thread";
import { Loader2 } from "lucide-react";
import Link from "next/link";

interface Employee {
  _id: string;
  name: string;
  email: string;
  role: string;
  nozomio_entity_id: string;
  status: "active" | "pending" | "fired" | "spared";
}

interface Decision {
  _id: string;
  employee_id: string;
  reasoning: string;
  decision: "fire" | "spare";
  email_draft: string;
  status: "pending" | "approved" | "rejected" | "sent";
  created_at: number;
}

export default function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const employee = useQuery(api.employees.get, { id: id as never });
  const decisions = useQuery(api.decisions.listForEmployee, {
    employee_id: id as never,
  });
  const latestDecision = (decisions ?? [])[0] as Decision | undefined;
  const messages = useQuery(
    api.messages.listForDecision,
    latestDecision ? { decision_id: latestDecision._id as never } : "skip"
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [hireBusy, setHireBusy] = useState(false);
  const [hireError, setHireError] = useState<string | null>(null);
  const router = useRouter();

  const hireDigitalReplacement = async () => {
    setHireBusy(true);
    setHireError(null);
    try {
      const res = await fetch("/api/hire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "hire failed");
      router.push(`/digital-employees/${data.digital_employee_id}`);
    } catch (e: unknown) {
      setHireError(e instanceof Error ? e.message : String(e));
    } finally {
      setHireBusy(false);
    }
  };

  if (employee === undefined) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-zinc-500">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
          Loading…
        </CardContent>
      </Card>
    );
  }
  if (employee === null) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-zinc-300">Employee not found.</p>
          <Link href="/" className="text-orange-400 hover:underline text-sm mt-2 inline-block">
            ← Back to roster
          </Link>
        </CardContent>
      </Card>
    );
  }

  const emp = employee as Employee;
  const list = (decisions ?? []) as Decision[];
  const msgs = (messages ?? []) as EmailMessage[];

  return (
    <div className="space-y-8">
      <Link
        href="/"
        className="text-sm text-zinc-500 hover:text-orange-400 transition"
      >
        ← Back to roster
      </Link>

      <header className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-bold tracking-tight">{emp.name}</h1>
          <Badge
            variant={
              emp.status === "fired"
                ? "fired"
                : emp.status === "pending"
                  ? "pending"
                  : emp.status === "spared"
                    ? "spared"
                    : "active"
            }
          >
            {emp.status}
          </Badge>
        </div>
        <p className="text-zinc-400">{emp.role}</p>
        <div className="text-xs text-zinc-500 font-mono">{emp.email}</div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-600">
          nozomio: {emp.nozomio_entity_id}
        </div>
      </header>

      {emp.status === "fired" ? (
        <Card>
          <CardHeader>
            <CardTitle>Hire digital replacement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-zinc-400">
              Spawn a digital employee with {emp.name}&apos;s institutional
              knowledge. Provisions a real AgentMail inbox, transfers the Nia
              source bundle into a fresh entity namespace, publishes an A2A
              agent card, and sends an onboarding email from the new inbox.
            </p>
            <div>
              <Button
                onClick={hireDigitalReplacement}
                disabled={hireBusy}
                variant="fire"
              >
                {hireBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : null}
                Hire digital replacement
              </Button>
            </div>
            {hireError ? (
              <div className="rounded-md border border-red-800/60 bg-red-950/40 p-3 text-xs text-red-300">
                {hireError}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {latestDecision ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Latest decision
              <Badge
                variant={
                  latestDecision.status === "sent"
                    ? "fired"
                    : latestDecision.status === "rejected"
                      ? "spared"
                      : latestDecision.status === "approved"
                        ? "pending"
                        : "pending"
                }
              >
                {latestDecision.status}
              </Badge>
              <Badge
                variant={latestDecision.decision === "fire" ? "fired" : "spared"}
              >
                {latestDecision.decision}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">
                Reasoning
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                {latestDecision.reasoning}
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setModalOpen(true)} variant="secondary">
                Review email draft
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-widest text-zinc-400">
          Email thread
        </h2>
        <EmailThread messages={msgs} />
      </section>

      {list.length > 1 ? (
        <section className="space-y-3">
          <h2 className="text-sm uppercase tracking-widest text-zinc-400">
            Decision history
          </h2>
          <div className="space-y-2">
            {list.slice(1).map((d) => (
              <Card key={d._id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="text-xs text-zinc-500">
                    {new Date(d.created_at).toLocaleString()}
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="default">{d.decision}</Badge>
                    <Badge variant="default">{d.status}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <DecisionModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        decision={(latestDecision as DecisionModalData) ?? null}
        employeeName={emp.name}
      />
    </div>
  );
}
