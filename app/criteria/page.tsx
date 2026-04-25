"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, Plus } from "lucide-react";

interface Criterion {
  _id: string;
  name: string;
  description: string;
  weight: number;
  active: boolean;
}

export default function CriteriaPage() {
  const criteria = useQuery(api.criteria.list);
  const createCriterion = useMutation(api.criteria.create);
  const toggleCriterion = useMutation(api.criteria.toggle);
  const removeCriterion = useMutation(api.criteria.remove);

  const [form, setForm] = useState({ name: "", description: "", weight: 1 });
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createCriterion({
        name: form.name,
        description: form.description,
        weight: form.weight,
      });
      setForm({ name: "", description: "", weight: 1 });
    } finally {
      setSubmitting(false);
    }
  };

  const list = (criteria ?? []) as Criterion[];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Fire Criteria</h1>
        <p className="text-zinc-400 mt-1 text-sm">
          Define the rules The Claw uses to evaluate employees. Higher weight =
          more influence on the decision.
        </p>
      </header>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 h-fit">
          <CardHeader>
            <CardTitle>New criterion</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="cname">Name</Label>
                <Input
                  id="cname"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="3+ missed deadlines"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cdesc">Description</Label>
                <Textarea
                  id="cdesc"
                  required
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder="Employee has missed at least 3 deadlines in the last 30 days based on Jira/Linear/Asana data."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cw">Weight (1-10)</Label>
                <Input
                  id="cw"
                  type="number"
                  min={1}
                  max={10}
                  value={form.weight}
                  onChange={(e) =>
                    setForm({ ...form, weight: Number(e.target.value) })
                  }
                />
              </div>
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Add criterion
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-3">
          {criteria === undefined ? (
            <Card>
              <CardContent className="py-10 text-center text-zinc-500">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                Loading rules…
              </CardContent>
            </Card>
          ) : list.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <p className="text-zinc-300">No criteria yet.</p>
                <p className="text-sm text-zinc-500 mt-1">
                  Without criteria, The Claw will be very forgiving.
                </p>
              </CardContent>
            </Card>
          ) : (
            list.map((c) => (
              <Card key={c._id}>
                <CardContent className="p-5 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-zinc-100">{c.name}</h3>
                      <Badge variant={c.active ? "active" : "default"}>
                        {c.active ? "active" : "disabled"}
                      </Badge>
                      <Badge variant="default">weight {c.weight}</Badge>
                    </div>
                    <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
                      {c.description}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant={c.active ? "outline" : "secondary"}
                      onClick={() => toggleCriterion({ id: c._id as never })}
                    >
                      {c.active ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeCriterion({ id: c._id as never })}
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
