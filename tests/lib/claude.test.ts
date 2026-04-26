import { describe, expect, test } from "bun:test";
import {
  evaluateEmployee,
  generateAgentReply,
  generateOnboardingEmail,
  orchestratorAggregate,
  orchestratorPlan,
} from "@/lib/claude";

describe("evaluateEmployee (demo mode)", () => {
  test("tool-loop returns a decision outcome with valid shape", async () => {
    const result = await evaluateEmployee(
      { name: "Alex Doe", email: "a@d.e", role: "Engineer" },
      [{ name: "Code Quality", description: "ship clean code", weight: 1 }],
      {
        getNozomioContext: async () => ({
          entity_id: "x",
          summary: "Some context.",
          sources: [{ type: "github", name: "PR", summary: "stale" }],
        }),
        searchEmployeeHistory: async () => [],
      }
    );
    expect(result.outcome.kind).toBe("decision");
    if (result.outcome.kind === "decision") {
      expect(["fire", "spare"]).toContain(result.outcome.result.decision);
      expect(result.outcome.result.reasoning.length).toBeGreaterThan(10);
      expect(result.outcome.result.emailDraft.length).toBeGreaterThan(10);
    }
    expect(Array.isArray(result.toolCalls)).toBe(true);
  });
});

describe("generateOnboardingEmail (demo mode)", () => {
  test("references indexed source count and predecessor name", async () => {
    const result = await generateOnboardingEmail(
      {
        name: "Ada",
        role: "Payroll Engineer",
        agentmail_address: "ada@d.e",
        knowledge_stats: { sources_indexed: 47 },
        replaces_name: "Alex",
      },
      { entity_id: "alex", summary: "ctx", sources: [] }
    );
    expect(result.subject).toContain("Ada");
    expect(result.email).toContain("47");
    expect(result.email).toContain("Alex");
    expect(result.email).toContain("ada@d.e");
    expect(result.evidence_summary.length).toBeGreaterThan(0);
  });
});

describe("generateAgentReply (demo mode)", () => {
  test("includes citations footer with provided source ids", async () => {
    const result = await generateAgentReply({
      agent: { name: "Ada", role: "x", agentmail_address: "ada@d.e" },
      thread: [
        {
          direction: "inbound",
          from: "manager@d.e",
          subject: "Q",
          body: "what's up?",
        },
      ],
      niaCitations: [
        {
          source_id: "src_1",
          label: "github: notes.md",
          snippet: "stuff",
          freshness: 1234,
        },
        {
          source_id: "src_2",
          label: "slack: #infra",
          snippet: "more",
          freshness: 5678,
        },
      ],
    });
    expect(result.reply).toContain("--- citations ---");
    expect(result.cited_source_ids).toEqual(["src_1", "src_2"]);
  });

  test("handles empty citations gracefully", async () => {
    const result = await generateAgentReply({
      agent: { name: "Ada", role: "x", agentmail_address: "ada@d.e" },
      thread: [
        {
          direction: "inbound",
          from: "x@y.z",
          subject: "?",
          body: "?",
        },
      ],
      niaCitations: [],
    });
    expect(result.cited_source_ids).toEqual([]);
    expect(result.reply.length).toBeGreaterThan(0);
  });
});

describe("orchestratorPlan (demo mode)", () => {
  test("returns at most 3 subtasks and uses a directory entry", async () => {
    const plan = await orchestratorPlan("loop ada in", [
      { name: "Ada", role: "infra", skills: ["answer"] },
      { name: "Ben", role: "data", skills: ["answer"] },
    ]);
    expect(plan.subtasks.length).toBeLessThanOrEqual(3);
    for (const st of plan.subtasks) {
      expect(["Ada", "Ben"]).toContain(st.agent_name);
    }
    expect(plan.rationale.length).toBeGreaterThan(0);
  });

  test("returns empty subtasks when directory is empty", async () => {
    const plan = await orchestratorPlan("nothing", []);
    expect(plan.subtasks).toEqual([]);
  });
});

describe("orchestratorAggregate (demo mode)", () => {
  test("references each worker by name", async () => {
    const result = await orchestratorAggregate("payroll", [
      { agent: "Ada", output: "Ada says hi.", sources: ["src_1"] },
      { agent: "Ben", output: "Ben says yo.", sources: ["src_2"] },
    ]);
    expect(result.reply).toContain("Ada");
    expect(result.reply).toContain("Ben");
  });
});
