import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * History search backing the agent's `search_employee_history` tool.
 *
 * Substring match (case-insensitive) over the employee's prior decision
 * reasonings and the bodies of email messages tied to those decisions.
 * No full-text index — typical employees have <10 prior decisions and
 * <50 messages, so a small linear scan is fine.
 */
export const searchForEmployee = query({
  args: {
    employee_id: v.id("employees"),
    query: v.string(),
  },
  handler: async (ctx, args) => {
    const needle = args.query.trim().toLowerCase();
    if (!needle) return [];

    const decisions = await ctx.db
      .query("decisions")
      .withIndex("by_employee", (q) => q.eq("employee_id", args.employee_id))
      .order("desc")
      .collect();

    const hits: Array<{
      decision_id: string;
      created_at: number;
      snippet: string;
      source: "reasoning" | "message";
    }> = [];

    for (const d of decisions) {
      if (d.reasoning.toLowerCase().includes(needle)) {
        hits.push({
          decision_id: d._id,
          created_at: d.created_at,
          snippet: snippet(d.reasoning, needle),
          source: "reasoning",
        });
      }

      const messages = await ctx.db
        .query("messages")
        .withIndex("by_decision", (q) => q.eq("decision_id", d._id))
        .collect();

      for (const m of messages) {
        if (m.body.toLowerCase().includes(needle)) {
          hits.push({
            decision_id: d._id,
            created_at: m.created_at,
            snippet: snippet(m.body, needle),
            source: "message",
          });
        }
      }

      if (hits.length >= 5) break;
    }

    return hits.slice(0, 5);
  },
});

function snippet(text: string, needle: string): string {
  const idx = text.toLowerCase().indexOf(needle);
  if (idx < 0) return text.slice(0, 160);
  const start = Math.max(0, idx - 60);
  const end = Math.min(text.length, idx + needle.length + 60);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return prefix + text.slice(start, end) + suffix;
}
