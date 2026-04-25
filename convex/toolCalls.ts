import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Tool-call audit log for the agent loop.
 *
 * Each `evaluateEmployee` run can issue multiple tool calls before
 * arriving at a decision. We persist every call (input + output + timing)
 * so the dossier can replay the agent's reasoning and so we can detect
 * regressions when prompts or tools change.
 */

export const listForDecision = query({
  args: { decision_id: v.id("decisions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tool_calls")
      .withIndex("by_decision_and_iteration", (q) =>
        q.eq("decision_id", args.decision_id),
      )
      .order("asc")
      .collect();
  },
});

export const record = mutation({
  args: {
    decision_id: v.id("decisions"),
    iteration: v.number(),
    tool_name: v.string(),
    input_json: v.string(),
    output_json: v.string(),
    is_error: v.boolean(),
    duration_ms: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("tool_calls", {
      ...args,
      created_at: Date.now(),
    });
  },
});
