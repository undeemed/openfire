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

  worker_templates: defineTable({
    type: v.union(
      v.literal("engineer"),
      v.literal("gtm"),
      v.literal("recruiter"),
      v.literal("cse"),
      v.literal("pm"),
      v.literal("researcher")
    ),
    display_name: v.string(),
    description: v.string(),
    default_corpora: v.array(v.string()),
    system_prompt: v.string(),
    // Tighter than v.any(): require at minimum the Anthropic tool-use top-level
    // shape. input_schema stays free-form because it varies wildly per tool.
    tools: v.array(
      v.object({
        name: v.string(),
        description: v.string(),
        input_schema: v.any(),
      })
    ),
    created_at: v.optional(v.number()),
    updated_at: v.optional(v.number()),
  }).index("by_type", ["type"]),

  worker_instances: defineTable({
    template_type: v.union(
      v.literal("engineer"),
      v.literal("gtm"),
      v.literal("recruiter"),
      v.literal("cse"),
      v.literal("pm"),
      v.literal("researcher")
    ),
    name: v.string(),
    agentmail_inbox_id: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("fired")),
    hired_at: v.number(),
    fired_at: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_template_type", ["template_type"]),

  worker_tasks: defineTable({
    worker_id: v.id("worker_instances"),
    brief: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("in_progress"),
      v.literal("waiting_input"),
      v.literal("done"),
      v.literal("failed"),
      v.literal("refused")
    ),
    result_summary: v.optional(v.string()),
    deliverable_url: v.optional(v.string()),
    agentmail_thread_id: v.optional(v.string()),
    error: v.optional(v.string()),
    created_at: v.number(),
    finished_at: v.optional(v.number()),
  })
    .index("by_worker", ["worker_id"])
    .index("by_status", ["status"]),

  worker_task_steps: defineTable({
    task_id: v.id("worker_tasks"),
    turn: v.number(),
    kind: v.union(
      v.literal("reasoning"),
      v.literal("tool_call"),
      v.literal("tool_result"),
      v.literal("final")
    ),
    content: v.string(),
    tool_name: v.optional(v.string()),
    created_at: v.number(),
  }).index("by_task", ["task_id"]),
});
