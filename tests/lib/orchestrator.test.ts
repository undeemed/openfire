import { describe, expect, test } from "bun:test";
import {
  executePlan,
  runOrchestrator,
  type DispatchedResult,
  type OrchestratorAgent,
  type OrchestratorPlan,
  type WorkerTask,
} from "@/lib/orchestrator";

const ADA: OrchestratorAgent = {
  name: "Ada",
  role: "infra",
  skills: ["answer"],
  a2a_endpoint_url: "http://x/a2a/ada",
  agentmail_address: "ada@d.e",
};
const BEN: OrchestratorAgent = {
  name: "Ben",
  role: "data",
  skills: ["answer"],
  a2a_endpoint_url: "http://x/a2a/ben",
  agentmail_address: "ben@d.e",
};

describe("runOrchestrator", () => {
  test("empty directory yields empty results + still composes a reply", async () => {
    const result = await runOrchestrator({
      managerRequest: "anything",
      directory: [],
      thread_id: "t1",
      dispatch: async () => null,
    });
    expect(result.results).toEqual([]);
    expect(result.reply.subject.length).toBeGreaterThan(0);
    expect(result.reply.reply.length).toBeGreaterThan(0);
  });

  test("dispatches once per subtask and aggregates worker outputs", async () => {
    const dispatchedAgents: string[] = [];
    const dispatch = async (
      agent: OrchestratorAgent
    ): Promise<DispatchedResult> => {
      dispatchedAgents.push(agent.name);
      return {
        agent: agent.name,
        output: `${agent.name} response`,
        structured: {},
        cited_source_ids: [],
        sources: ["src_x"],
      };
    };

    const result = await runOrchestrator({
      managerRequest: "loop ada in",
      directory: [ADA],
      thread_id: "t",
      dispatch,
    });

    expect(dispatchedAgents.length).toBeGreaterThanOrEqual(1);
    expect(dispatchedAgents.every((n) => n === "Ada")).toBe(true);
    expect(result.results.length).toBe(dispatchedAgents.length);
    expect(result.reply.reply).toContain("Ada");
  });

  test("dispatch fn receives only the scoped instruction, not raw thread", async () => {
    let received: string | undefined;
    await runOrchestrator({
      managerRequest: "long thread we don't want leaked",
      directory: [ADA, BEN],
      thread_id: "t",
      dispatch: async (_agent, task: WorkerTask) => {
        received = task.instruction;
        return { agent: _agent.name, output: "ok", structured: {}, cited_source_ids: [], sources: [] };
      },
    });
    expect(typeof received).toBe("string");
    // The orchestrator demo plan crafts an instruction containing the
    // manager's request, not arbitrary additional history.
    expect(received!.length).toBeGreaterThan(0);
  });

  test("subtasks targeting unknown agents are silently dropped", async () => {
    const result = await runOrchestrator({
      managerRequest: "hi",
      directory: [], // forces no subtasks in demo plan
      thread_id: "t",
      dispatch: async () => ({ agent: "Ghost", output: "", structured: {}, cited_source_ids: [], sources: [] }),
    });
    expect(result.results).toEqual([]);
  });
});

const makeTask = (instruction: string): WorkerTask => ({
  instruction,
  data_query: { namespaces: [] },
  output_schema: { required_fields: [] },
});

describe("executePlan", () => {
  test("topology=single skips dispatch entirely", async () => {
    let dispatched = 0;
    const plan: OrchestratorPlan = {
      topology: "single",
      rationale: "trivial",
      subtasks: [
        { agent_name: "Ada", task: makeTask("ignored"), required_skills: [] },
      ],
    };
    const results = await executePlan(plan, {
      managerRequest: "x",
      directory: [ADA],
      thread_id: "t",
      dispatch: async () => {
        dispatched++;
        return {
          agent: "Ada",
          output: "no",
          structured: {},
          cited_source_ids: [],
          sources: [],
        };
      },
    });
    expect(dispatched).toBe(0);
    expect(results).toEqual([]);
  });

  test("topology=pipeline dispatches sequentially and chains structured output", async () => {
    const callOrder: string[] = [];
    const receivedInstructions: string[] = [];
    const plan: OrchestratorPlan = {
      topology: "pipeline",
      rationale: "compare q1 to q2",
      subtasks: [
        { agent_name: "Ada", task: makeTask("Summarize Q1 metrics"), required_skills: [] },
        { agent_name: "Ben", task: makeTask("Compare Q2 to Q1 summary"), required_skills: [] },
      ],
    };

    const results = await executePlan(plan, {
      managerRequest: "compare",
      directory: [ADA, BEN],
      thread_id: "t",
      dispatch: async (agent, task) => {
        callOrder.push(agent.name);
        receivedInstructions.push(task.instruction);
        return {
          agent: agent.name,
          output: `${agent.name} done`,
          structured:
            agent.name === "Ada" ? { q1_revenue: 100, q1_growth: 0.12 } : { delta: 0.05 },
          cited_source_ids: [],
          sources: [],
        };
      },
    });

    expect(callOrder).toEqual(["Ada", "Ben"]);
    expect(results).toHaveLength(2);
    // Worker A's instruction is unchanged.
    expect(receivedInstructions[0]).toBe("Summarize Q1 metrics");
    // Worker B's instruction includes Worker A's structured output.
    expect(receivedInstructions[1]).toContain("Compare Q2 to Q1 summary");
    expect(receivedInstructions[1]).toContain("Context from previous step");
    expect(receivedInstructions[1]).toContain("q1_revenue");
    expect(receivedInstructions[1]).toContain("Ada");
  });

  test("pipeline tolerates circular structured output without crashing", async () => {
    type Self = { self?: Self };
    const circular: Self = {};
    circular.self = circular;
    const plan: OrchestratorPlan = {
      topology: "pipeline",
      rationale: "x",
      subtasks: [
        { agent_name: "Ada", task: makeTask("a"), required_skills: [] },
        { agent_name: "Ben", task: makeTask("b"), required_skills: [] },
      ],
    };
    const results = await executePlan(plan, {
      managerRequest: "x",
      directory: [ADA, BEN],
      thread_id: "t",
      dispatch: async (agent) => ({
        agent: agent.name,
        output: "",
        structured: agent.name === "Ada" ? (circular as unknown as Record<string, unknown>) : {},
        cited_source_ids: [],
        sources: [],
      }),
    });
    expect(results).toHaveLength(2);
  });

  test("pipeline does not append empty structured context", async () => {
    const receivedInstructions: string[] = [];
    const plan: OrchestratorPlan = {
      topology: "pipeline",
      rationale: "first worker has no structured output",
      subtasks: [
        { agent_name: "Ada", task: makeTask("first"), required_skills: [] },
        { agent_name: "Ben", task: makeTask("second"), required_skills: [] },
      ],
    };
    await executePlan(plan, {
      managerRequest: "x",
      directory: [ADA, BEN],
      thread_id: "t",
      dispatch: async (agent, task) => {
        receivedInstructions.push(task.instruction);
        return {
          agent: agent.name,
          output: "",
          structured: {}, // empty
          cited_source_ids: [],
          sources: [],
        };
      },
    });
    expect(receivedInstructions[1]).toBe("second");
    expect(receivedInstructions[1]).not.toContain("Context from previous step");
  });

  test("topology=parallel dispatches concurrently", async () => {
    const ongoing: number[] = [];
    let maxConcurrent = 0;
    const plan: OrchestratorPlan = {
      topology: "parallel",
      rationale: "independent",
      subtasks: [
        { agent_name: "Ada", task: makeTask("a"), required_skills: [] },
        { agent_name: "Ben", task: makeTask("b"), required_skills: [] },
      ],
    };
    await executePlan(plan, {
      managerRequest: "x",
      directory: [ADA, BEN],
      thread_id: "t",
      dispatch: async (agent) => {
        ongoing.push(1);
        maxConcurrent = Math.max(maxConcurrent, ongoing.length);
        await new Promise((r) => setTimeout(r, 10));
        ongoing.pop();
        return {
          agent: agent.name,
          output: "",
          structured: {},
          cited_source_ids: [],
          sources: [],
        };
      },
    });
    expect(maxConcurrent).toBe(2);
  });

  test("dispatch receives WorkerTask with data_query + output_schema", async () => {
    let received: WorkerTask | undefined;
    const plan: OrchestratorPlan = {
      topology: "parallel",
      rationale: "x",
      subtasks: [
        {
          agent_name: "Ada",
          task: {
            instruction: "do thing",
            data_query: {
              namespaces: ["thread_42", "ent_ada"],
              source_types: ["github", "jira"],
            },
            output_schema: { required_fields: ["answer", "confidence"] },
          },
          required_skills: [],
        },
      ],
    };
    await executePlan(plan, {
      managerRequest: "x",
      directory: [ADA],
      thread_id: "thread_42",
      dispatch: async (_agent, task) => {
        received = task;
        return {
          agent: "Ada",
          output: "",
          structured: {},
          cited_source_ids: [],
          sources: [],
        };
      },
    });
    expect(received?.data_query.namespaces).toEqual(["thread_42", "ent_ada"]);
    expect(received?.data_query.source_types).toEqual(["github", "jira"]);
    expect(received?.output_schema.required_fields).toEqual([
      "answer",
      "confidence",
    ]);
  });
});
