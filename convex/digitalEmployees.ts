import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("digital_employees").order("desc").collect();
  },
});

export const listActive = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("digital_employees")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { id: v.id("digital_employees") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getByInbox = query({
  args: { agentmail_address: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("digital_employees")
      .withIndex("by_inbox", (q) =>
        q.eq("agentmail_address", args.agentmail_address.toLowerCase())
      )
      .first();
  },
});

export const getOrchestrator = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("digital_employees")
      .withIndex("by_orchestrator", (q) => q.eq("is_orchestrator", true))
      .first();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    role: v.string(),
    replaces_employee_id: v.optional(v.id("employees")),
    nozomio_entity_id: v.string(),
    agentmail_inbox_id: v.string(),
    agentmail_address: v.string(),
    a2a_endpoint_url: v.string(),
    a2a_card: v.any(),
    skills: v.array(v.string()),
    is_orchestrator: v.boolean(),
    sources_indexed: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("digital_employees")
      .withIndex("by_inbox", (q) =>
        q.eq("agentmail_address", args.agentmail_address.toLowerCase())
      )
      .first();
    if (existing) return existing._id;
    const now = Date.now();
    return await ctx.db.insert("digital_employees", {
      name: args.name,
      role: args.role,
      replaces_employee_id: args.replaces_employee_id,
      nozomio_entity_id: args.nozomio_entity_id,
      agentmail_inbox_id: args.agentmail_inbox_id,
      agentmail_address: args.agentmail_address.toLowerCase(),
      a2a_endpoint_url: args.a2a_endpoint_url,
      a2a_card: args.a2a_card,
      skills: args.skills,
      is_orchestrator: args.is_orchestrator,
      status: "active",
      knowledge_stats: {
        sources_indexed: args.sources_indexed,
        last_indexed_at: now,
      },
      created_at: now,
    });
  },
});

export const setStatus = mutation({
  args: {
    id: v.id("digital_employees"),
    status: v.union(
      v.literal("provisioning"),
      v.literal("active"),
      v.literal("retired")
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: args.status });
  },
});

export const updateKnowledgeStats = mutation({
  args: {
    id: v.id("digital_employees"),
    sources_indexed: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      knowledge_stats: {
        sources_indexed: args.sources_indexed,
        last_indexed_at: Date.now(),
      },
    });
  },
});

const TEMPLATE_TYPE = v.union(
  v.literal("engineer"),
  v.literal("gtm"),
  v.literal("recruiter"),
  v.literal("cse"),
  v.literal("pm"),
  v.literal("researcher")
);

const RESOURCE_KIND = v.union(
  v.literal("github"),
  v.literal("instagram"),
  v.literal("twitter"),
  v.literal("slack"),
  v.literal("linkedin")
);

/**
 * Standalone hire — provisions a digital employee from scratch
 * (without coming through the fired-employee replacement flow). Used by
 * the /digital-employees hire form.
 */
export const createStandalone = mutation({
  args: {
    name: v.string(),
    role: v.string(),
    template_type: TEMPLATE_TYPE,
    nozomio_entity_id: v.optional(v.string()),
    agentmail_inbox_id: v.optional(v.string()),
    agentmail_address: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const shortId = Math.random().toString(36).slice(2, 7);
    const safeLocal = args.name
      .toLowerCase()
      .replace(/[^a-z0-9.-]/g, "-")
      .slice(0, 32);
    const fallbackInbox = args.agentmail_address
      ? args.agentmail_address.toLowerCase()
      : `${safeLocal}-${shortId}@demo.openfire.local`;

    const existing = await ctx.db
      .query("digital_employees")
      .withIndex("by_inbox", (q) => q.eq("agentmail_address", fallbackInbox))
      .first();
    if (existing) return existing._id;

    return await ctx.db.insert("digital_employees", {
      name: args.name,
      role: args.role,
      nozomio_entity_id:
        args.nozomio_entity_id ?? `de_${safeLocal}_${shortId}`,
      agentmail_inbox_id:
        args.agentmail_inbox_id ?? `inbox_sim_${shortId}`,
      agentmail_address: fallbackInbox,
      a2a_endpoint_url: `/api/a2a/de_${safeLocal}_${shortId}`,
      a2a_card: { name: args.name, role: args.role },
      skills: [],
      is_orchestrator: false,
      status: "active",
      knowledge_stats: {
        sources_indexed: 0,
        last_indexed_at: now,
      },
      template_type: args.template_type,
      linked_resources: [],
      created_at: now,
    });
  },
});

/**
 * Add (or replace) a linked resource on a digital employee. Idempotent
 * on (employee, kind) — re-linking github with a new repo updates the
 * existing entry instead of duplicating.
 */
export const linkResource = mutation({
  args: {
    id: v.id("digital_employees"),
    kind: RESOURCE_KIND,
    config: v.any(),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const e = await ctx.db.get(args.id);
    if (!e) throw new Error("digital employee not found");
    const existing = e.linked_resources ?? [];
    const next = existing.filter((r) => r.kind !== args.kind);
    next.push({
      kind: args.kind,
      config: args.config,
      enabled: args.enabled ?? true,
      linked_at: Date.now(),
    });
    await ctx.db.patch(args.id, { linked_resources: next });
    return { ok: true };
  },
});

export const unlinkResource = mutation({
  args: { id: v.id("digital_employees"), kind: RESOURCE_KIND },
  handler: async (ctx, args) => {
    const e = await ctx.db.get(args.id);
    if (!e) throw new Error("digital employee not found");
    const next = (e.linked_resources ?? []).filter((r) => r.kind !== args.kind);
    await ctx.db.patch(args.id, { linked_resources: next });
    return { ok: true };
  },
});
