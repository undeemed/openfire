/**
 * Persistence for GitHub issues a digital employee has filed. Indexed
 * by employee for the dossier view, and by repo for org-wide drill-down.
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listForEmployee = query({
  args: { digital_employee_id: v.id("digital_employees") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("github_issues")
      .withIndex("by_employee", (q) =>
        q.eq("digital_employee_id", args.digital_employee_id)
      )
      .order("desc")
      .collect();
  },
});

export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("github_issues").order("desc").collect();
    return all.slice(0, args.limit ?? 25);
  },
});

export const create = mutation({
  args: {
    digital_employee_id: v.id("digital_employees"),
    owner: v.string(),
    repo: v.string(),
    issue_number: v.number(),
    issue_url: v.string(),
    title: v.string(),
    body: v.string(),
    labels: v.array(v.string()),
    task_brief: v.string(),
    simulated: v.boolean(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("github_issues", {
      ...args,
      created_at: Date.now(),
    });
  },
});
