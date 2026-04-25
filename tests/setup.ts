/**
 * Test setup: forces demo-mode for every lib by clearing API keys, and
 * exposes a mockFetch helper to swap globalThis.fetch per test.
 *
 * Imported via bun's --preload from bunfig.toml so it runs before each
 * test file. If bunfig.toml is absent, individual test files can still
 * `import "../setup"` at the top.
 */

const KEYS_TO_CLEAR = [
  "NIA_API_KEY",
  "NOZOMIO_API_KEY",
  "AGENTMAIL_API_KEY",
  "AGENTMAIL_WEBHOOK_SECRET",
  "ANTHROPIC_API_KEY",
];

for (const k of KEYS_TO_CLEAR) {
  delete process.env[k];
}

// Provide deterministic defaults so libs that read these don't hit
// undefined branches.
process.env.AGENTMAIL_BASE_URL ??= "https://api.agentmail.to";
process.env.AGENTMAIL_DOMAIN ??= "demo.agentmail.to";
process.env.AGENTMAIL_INBOX_ADDRESS ??= "claw@openfire.local";
process.env.OPENFIRE_PUBLIC_URL ??= "http://localhost:3000";
process.env.OPENFIRE_MANAGER_EMAIL ??= "manager@openfire.local";

const realFetch = globalThis.fetch;

export type FetchHandler = (
  input: Request | string | URL,
  init?: RequestInit
) => Promise<Response> | Response;

export interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

export interface MockFetchHandle {
  calls: FetchCall[];
  restore: () => void;
}

export function mockFetch(handler: FetchHandler): MockFetchHandle {
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (
    input: Request | string | URL,
    init?: RequestInit
  ) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const method =
      (init?.method ?? (typeof input === "object" && "method" in input
        ? (input as Request).method
        : "GET")) || "GET";
    const headers: Record<string, string> = {};
    const initHeaders = init?.headers;
    if (initHeaders) {
      if (initHeaders instanceof Headers) {
        initHeaders.forEach((v, k) => (headers[k.toLowerCase()] = v));
      } else if (Array.isArray(initHeaders)) {
        for (const [k, v] of initHeaders) headers[k.toLowerCase()] = v;
      } else {
        for (const [k, v] of Object.entries(initHeaders))
          headers[k.toLowerCase()] = String(v);
      }
    }
    const body =
      typeof init?.body === "string" ? init.body : undefined;
    calls.push({ url, method, headers, body });
    return handler(input, init);
  }) as typeof fetch;

  return {
    calls,
    restore: () => {
      globalThis.fetch = realFetch;
    },
  };
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
