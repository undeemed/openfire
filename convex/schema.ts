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
      v.literal("sent"),
      v.literal("escalated")
    ),
    created_at: v.number(),
    // Set when handleReply or evaluateEmployee bails out and asks a human
    // to take over (e.g. evidence is too thin to act on).
    escalated_reason: v.optional(v.string()),
    // Filled in by book_exit_interview tool — replaces the regex check in
    // emailHandler.ts so the reply loop knows the slot is booked.
    exit_interview_event_id: v.optional(v.string()),
    // How many tool-use iterations the agent ran to reach this decision.
    // Useful for cost / quality regression tracking.
    iterations: v.optional(v.number()),
  })
    .index("by_employee", ["employee_id"])
    .index("by_status", ["status"])
    .index("by_thread", ["agentmail_thread_id"]),

  tool_calls: defineTable({
    decision_id: v.id("decisions"),
    iteration: v.number(),
    tool_name: v.string(),
    // Stored as JSON strings so the schema doesn't have to enumerate every
    // tool's input/output shape. The dispatcher owns serialization.
    input_json: v.string(),
    output_json: v.string(),
    is_error: v.boolean(),
    duration_ms: v.number(),
    created_at: v.number(),
  })
    .index("by_decision", ["decision_id"])
    .index("by_decision_and_iteration", ["decision_id", "iteration"]),

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
