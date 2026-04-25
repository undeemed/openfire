import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  employees: defineTable({
    name: v.string(),
    email: v.string(),
    role: v.string(),
    nozomio_entity_id: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("pending"),
      v.literal("fired"),
      v.literal("spared")
    ),
    created_at: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_email", ["email"]),

  decisions: defineTable({
    employee_id: v.id("employees"),
    reasoning: v.string(),
    decision: v.union(v.literal("fire"), v.literal("spare")),
    email_draft: v.string(),
    agentmail_thread_id: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("sent")
    ),
    created_at: v.number(),
  })
    .index("by_employee", ["employee_id"])
    .index("by_status", ["status"])
    .index("by_thread", ["agentmail_thread_id"]),

  criteria: defineTable({
    name: v.string(),
    description: v.string(),
    weight: v.number(),
    active: v.boolean(),
  }).index("by_active", ["active"]),

  messages: defineTable({
    decision_id: v.id("decisions"),
    direction: v.union(v.literal("inbound"), v.literal("outbound")),
    subject: v.string(),
    body: v.string(),
    from: v.string(),
    created_at: v.number(),
    agentmail_message_id: v.optional(v.string()),
  })
    .index("by_decision", ["decision_id"])
    .index("by_message_id", ["agentmail_message_id"]),
});
