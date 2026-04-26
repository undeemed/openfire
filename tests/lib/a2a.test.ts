import { afterEach, describe, expect, test } from "bun:test";
import {
  buildAgentCard,
  getTask,
  messageText,
  newMessageId,
  newRpcId,
  sendMessage,
  type A2AMessage,
} from "@/lib/a2a";
import { jsonResponse, mockFetch } from "../setup";

let handle: { restore: () => void } | null = null;
afterEach(() => {
  handle?.restore();
  handle = null;
});

describe("buildAgentCard", () => {
  test("returns A2A 0.2.x shape", () => {
    const card = buildAgentCard({
      name: "Ada",
      description: "test",
      url: "http://x/api/a2a/abc",
    });
    expect(card.name).toBe("Ada");
    expect(card.url).toBe("http://x/api/a2a/abc");
    expect(card.version).toBe("0.1.0");
    expect(card.capabilities.streaming).toBe(false);
    expect(card.capabilities.pushNotifications).toBe(false);
    expect(card.skills.length).toBeGreaterThan(0);
    expect(card.defaultInputModes).toEqual(["text"]);
    expect(card.defaultOutputModes).toEqual(["text"]);
  });

  test("custom skills override defaults", () => {
    const card = buildAgentCard({
      name: "x",
      description: "y",
      url: "u",
      skills: [{ id: "only", name: "Only" }],
    });
    expect(card.skills).toHaveLength(1);
    expect(card.skills[0].id).toBe("only");
  });
});

describe("id generators", () => {
  test("newMessageId is unique across many calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(newMessageId());
    expect(ids.size).toBe(1000);
  });
  test("newRpcId is unique across many calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(newRpcId());
    expect(ids.size).toBe(1000);
  });
});

describe("messageText", () => {
  test("joins all text parts with newline", () => {
    const m: A2AMessage = {
      role: "user",
      messageId: "m1",
      parts: [
        { kind: "text", text: "hello" },
        { kind: "data", data: { ignored: true } },
        { kind: "text", text: "world" },
      ],
    };
    expect(messageText(m)).toBe("hello\nworld");
  });

  test("empty when null/undefined", () => {
    expect(messageText(null)).toBe("");
    expect(messageText(undefined)).toBe("");
  });
});

describe("sendMessage", () => {
  test("returns parsed task on JSON-RPC success", async () => {
    handle = mockFetch(() =>
      jsonResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          id: "task_1",
          contextId: "ctx_1",
          status: { state: "completed" },
          kind: "task",
        },
      })
    );
    const task = await sendMessage("http://fake/a2a", { text: "hi" });
    expect(task).not.toBeNull();
    expect(task!.id).toBe("task_1");
    expect(task!.status.state).toBe("completed");
  });

  test("returns null on HTTP 500", async () => {
    handle = mockFetch(() => new Response("boom", { status: 500 }));
    const task = await sendMessage("http://fake/a2a", { text: "hi" });
    expect(task).toBeNull();
  });

  test("returns null on JSON-RPC error envelope", async () => {
    handle = mockFetch(() =>
      jsonResponse({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32601, message: "not found" },
      })
    );
    const task = await sendMessage("http://fake/a2a", { text: "hi" });
    expect(task).toBeNull();
  });

  test("forwards text + contextId in params.message", async () => {
    let captured: string | undefined;
    handle = mockFetch((_input, init) => {
      captured = typeof init?.body === "string" ? init.body : undefined;
      return jsonResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          id: "t",
          contextId: "ctx_x",
          status: { state: "completed" },
          kind: "task",
        },
      });
    });
    await sendMessage("http://fake/a2a", {
      text: "yo",
      contextId: "ctx_x",
    });
    expect(captured).toBeDefined();
    const parsed = JSON.parse(captured!);
    expect(parsed.method).toBe("message/send");
    expect(parsed.params.message.parts[0].text).toBe("yo");
    expect(parsed.params.message.contextId).toBe("ctx_x");
  });

  test("workerTask is encoded as a data part alongside text", async () => {
    let captured: string | undefined;
    handle = mockFetch((_input, init) => {
      captured = typeof init?.body === "string" ? init.body : undefined;
      return jsonResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          id: "t",
          contextId: "ctx_x",
          status: { state: "completed" },
          kind: "task",
        },
      });
    });
    await sendMessage("http://fake/a2a", {
      text: "do thing",
      workerTask: {
        data_query: {
          namespaces: ["thread_1", "ent_ada"],
          source_types: ["github", "jira"],
        },
        output_schema: { required_fields: ["answer"] },
      },
    });
    expect(captured).toBeDefined();
    const parsed = JSON.parse(captured!);
    const parts = parsed.params.message.parts as Array<{
      kind: string;
      text?: string;
      data?: { data_query?: { source_types?: string[] } };
    }>;
    expect(parts).toHaveLength(2);
    expect(parts[0].kind).toBe("text");
    expect(parts[0].text).toBe("do thing");
    expect(parts[1].kind).toBe("data");
    expect(parts[1].data?.data_query?.source_types).toEqual(["github", "jira"]);
  });

  test("omitting workerTask still produces single text part", async () => {
    let captured: string | undefined;
    handle = mockFetch((_input, init) => {
      captured = typeof init?.body === "string" ? init.body : undefined;
      return jsonResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          id: "t",
          contextId: "c",
          status: { state: "completed" },
          kind: "task",
        },
      });
    });
    await sendMessage("http://fake/a2a", { text: "no task bundle" });
    const parsed = JSON.parse(captured!);
    expect(parsed.params.message.parts).toHaveLength(1);
    expect(parsed.params.message.parts[0].kind).toBe("text");
  });
});

describe("getTask", () => {
  test("returns null on HTTP error", async () => {
    handle = mockFetch(() => new Response("nope", { status: 404 }));
    const result = await getTask("http://fake/a2a", "task_1");
    expect(result).toBeNull();
  });
});
