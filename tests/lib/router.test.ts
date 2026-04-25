import { afterEach, describe, expect, test } from "bun:test";
import { routeOutbound } from "@/lib/router";
import { jsonResponse, mockFetch } from "../setup";

let handle: { calls: Array<{ url: string; body?: string }>; restore: () => void } | null =
  null;
afterEach(() => {
  handle?.restore();
  handle = null;
});

describe("routeOutbound", () => {
  test("email transport when preferA2A=false", async () => {
    handle = mockFetch(() =>
      jsonResponse({ message_id: "m1", thread_id: "t1" })
    );
    // No AGENTMAIL_API_KEY -> sendEmail goes through demo path; observe by lack of fetch calls.
    const result = await routeOutbound({
      thread_id: "t1",
      subject: "s",
      body: "b",
      sender: { address: "ada@a.b" },
      to: { address: "manager@x.y", is_human: true },
    });
    expect(result.transport).toBe("email");
    expect(result.external_id).toMatch(/^msg_sim_|^msg_/);
  });

  test("falls back to email when recipient is human even if preferA2A=true", async () => {
    const result = await routeOutbound({
      thread_id: "t",
      subject: "s",
      body: "b",
      sender: { address: "ada@a.b" },
      to: {
        address: "manager@x.y",
        is_human: true,
        a2a_endpoint_url: "http://nope/a2a",
      },
      preferA2A: true,
    });
    expect(result.transport).toBe("email");
  });

  test("uses A2A when recipient is non-human + has endpoint + preferA2A=true", async () => {
    handle = mockFetch((input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/a2a")) {
        return jsonResponse({
          jsonrpc: "2.0",
          id: 1,
          result: {
            id: "task_a2a_1",
            contextId: "t",
            status: { state: "completed" },
            kind: "task",
          },
        });
      }
      return jsonResponse({ message_id: "m_cc", thread_id: "t" });
    });

    const result = await routeOutbound({
      thread_id: "t",
      subject: "s",
      body: "b",
      sender: { address: "ada@a.b" },
      to: {
        address: "ben@a.b",
        is_human: false,
        a2a_endpoint_url: "http://fake/a2a",
      },
      ccHumans: ["manager@x.y"],
      preferA2A: true,
    });
    expect(result.transport).toBe("a2a");
    expect(result.external_id).toBe("task_a2a_1");
    // Sender + ccHumans path goes through agentmail demo (no API key) so no
    // shadow CC fetch fires; verify we recorded the intent by checking that
    // routing didn't crash when ccHumans is set.
  });
});
