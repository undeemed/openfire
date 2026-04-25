"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2, X, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Criterion {
  _id: string;
  name: string;
  description: string;
  weight: number;
  active: boolean;
}

export function CriteriaPanel() {
  const criteria = useQuery(api.criteria.list);
  const create = useMutation(api.criteria.create);
  const toggle = useMutation(api.criteria.toggle);
  const remove = useMutation(api.criteria.remove);
  const seed = useMutation(api.criteria.seedDefaultCriteria);

  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", weight: 1 });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await create(form);
      setForm({ name: "", description: "", weight: 1 });
      setAdding(false);
    } finally {
      setSubmitting(false);
    }
  };

  const list = (criteria ?? []) as Criterion[];
  const activeCount = list.filter((c) => c.active).length;

  return (
    <div className="border border-[var(--border)] bg-[var(--surface)] sticky top-[57px]">
      {/* Header */}
      <div className="border-b border-[var(--border)] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 className="h-3 w-3 text-[var(--text-dim)]" />
          <h2 className="text-[9px] font-mono tracking-[0.22em] text-[var(--text-dim)] uppercase">
            Fire Criteria
          </h2>
          <span className="text-[8px] font-mono text-[var(--accent)] tracking-[0.18em]">
            {activeCount}/{list.length}
          </span>
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors"
          aria-label={adding ? "Close form" : "Add criterion"}
        >
          {adding ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Add form (collapsible) */}
      {adding ? (
        <form onSubmit={submit} className="border-b border-[var(--border)] p-4 space-y-3 bg-[var(--surface-raised)]/40">
          <div className="space-y-1">
            <Label htmlFor="cname" className="text-[8px]">Name</Label>
            <Input
              id="cname"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="3+ missed deadlines"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cdesc" className="text-[8px]">Description</Label>
            <Textarea
              id="cdesc"
              required
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Missed at least 3 deadlines in 30 days."
              className="min-h-[60px] text-[10px]"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cw" className="text-[8px]">Weight (1–10)</Label>
            <Input
              id="cw"
              type="number"
              min={1}
              max={10}
              value={form.weight}
              onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })}
            />
          </div>
          <Button type="submit" disabled={submitting} className="w-full" size="sm">
            {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Add
          </Button>
        </form>
      ) : null}

      {/* List */}
      <div className="max-h-[60vh] overflow-y-auto">
        {criteria === undefined ? (
          <div className="p-6 text-center">
            <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto text-[var(--text-dim)]" />
          </div>
        ) : list.length === 0 ? (
          <div className="p-5 text-center space-y-3">
            <p className="text-[10px] font-mono text-[var(--text-muted)] leading-relaxed">
              No criteria. Without these, The Claw is forgiving.
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={seeding}
              onClick={async () => {
                setSeeding(true);
                try { await seed({}); }
                finally { setSeeding(false); }
              }}
            >
              {seeding ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Seed Defaults
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border-dim)]">
            {list.map((c) => (
              <li
                key={c._id}
                className={cn(
                  "group relative px-4 py-2.5 transition-colors",
                  c.active ? "" : "opacity-50",
                  "hover:bg-[var(--surface-raised)]/40"
                )}
              >
                <div className="flex items-start gap-2">
                  <button
                    onClick={() => toggle({ id: c._id as Id<"criteria"> })}
                    className={cn(
                      "mt-1 w-2.5 h-2.5 shrink-0 border transition-colors",
                      c.active
                        ? "bg-[var(--accent)] border-[var(--accent)]"
                        : "bg-transparent border-[var(--text-dim)] hover:border-[var(--text-muted)]"
                    )}
                    aria-label={c.active ? "Disable" : "Enable"}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="font-display text-xs font-semibold text-[var(--text)] truncate">
                        {c.name}
                      </span>
                      <span className="text-[7px] font-mono tracking-[0.15em] text-[var(--text-dim)] uppercase border border-[var(--border)] px-1 leading-3 shrink-0">
                        W{c.weight}
                      </span>
                    </div>
                    <p className="text-[10px] font-mono text-[var(--text-muted)] leading-snug line-clamp-2">
                      {c.description}
                    </p>
                  </div>
                  <button
                    onClick={() => remove({ id: c._id as Id<"criteria"> })}
                    className="opacity-0 group-hover:opacity-100 text-[var(--text-dim)] hover:text-[var(--accent)] transition-all shrink-0 mt-0.5"
                    aria-label="Remove"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
