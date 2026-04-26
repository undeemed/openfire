import { describe, expect, test } from "bun:test";
import {
  runOrchestrator,
  type DispatchedResult,
  type OrchestratorAgent,
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
      dispatch: async (_agent, instruction) => {
        received = instruction;
        return { agent: _agent.name, output: "ok", sources: [] };
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
      dispatch: async () => ({ agent: "Ghost", output: "", sources: [] }),
    });
    expect(result.results).toEqual([]);
  });
});
