"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { EmployeeCard, EmployeeCardData } from "@/components/employee-card";
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
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Loader2 } from "lucide-react";

export default function HomePage() {
  const employees = useQuery(api.employees.list);
  const createEmployee = useMutation(api.employees.create);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "",
    nozomio_entity_id: "",
  });

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
    setRunning(id);
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
      setRunning(null);
    }
  };

  const list = (employees ?? []) as EmployeeCardData[];
  const visible = list.filter(
    (e) => e.status === "pending" || e.status === "active"
  );

  return (
    <div className="space-y-8">
      <section className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Pending Departures
          </h1>
          <p className="text-zinc-400 mt-1 text-sm">
            Light the fuse on an employee. The Claw will deliberate.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} variant="default">
          <Plus className="h-4 w-4" />
          Add employee
        </Button>
      </section>

      {error ? (
        <div className="rounded-md border border-red-800/60 bg-red-950/40 p-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {employees === undefined ? (
        <Card>
          <CardContent className="py-16 text-center text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
            Loading roster…
          </CardContent>
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="py-20 text-center">
            <div className="text-4xl mb-3 animate-flicker">🔥</div>
            <p className="text-lg text-zinc-300">
              The smoke clears… no one to fire today.
            </p>
            <p className="text-sm text-zinc-500 mt-2">
              Add an employee to populate the roster.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((emp) => (
            <div key={emp._id} className="relative">
              <EmployeeCard employee={emp} onLightFuse={lightFuse} />
              {running === emp._id ? (
                <div className="absolute inset-0 rounded-xl bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-2 z-10">
                  <Loader2 className="h-6 w-6 animate-spin text-orange-400" />
                  <div className="text-sm text-orange-300 animate-flicker">
                    The Claw deliberates…
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onClose={() => setOpen(false)}>
          <DialogHeader>
            <DialogTitle>Add employee</DialogTitle>
            <DialogDescription>
              They&rsquo;ll show up on the roster, awaiting their fate.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Jane Doe"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="jane@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role">Role</Label>
              <Input
                id="role"
                required
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                placeholder="Senior Software Engineer"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nz">Nozomio entity ID</Label>
              <Input
                id="nz"
                required
                value={form.nozomio_entity_id}
                onChange={(e) =>
                  setForm({ ...form, nozomio_entity_id: e.target.value })
                }
                placeholder="ent_abc123"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} variant="default">
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Add
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
