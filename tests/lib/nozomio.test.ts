import { describe, expect, test } from "bun:test";
import {
  getEntityContext,
  ingestSourcesForEntity,
  unifiedSearch,
} from "@/lib/nozomio";

describe("ingestSourcesForEntity (demo mode)", () => {
  test("returns sources_indexed equal to input length", async () => {
    const result = await ingestSourcesForEntity("ent_1", [
      { type: "github", name: "PR #1" },
      { type: "slack", name: "#infra thread" },
    ]);
    expect(result.entity_id).toBe("ent_1");
    expect(result.sources_indexed).toBe(2);
    expect(result.last_indexed_at).toBeGreaterThan(0);
  });

  test("handles empty input array", async () => {
    const result = await ingestSourcesForEntity("ent_2", []);
    expect(result.sources_indexed).toBe(0);
  });
});

describe("unifiedSearch (demo mode)", () => {
  test("returns at least 3 demo citations", async () => {
    const result = await unifiedSearch(["ns1", "ns2"], "payroll handoff");
    expect(result.citations.length).toBeGreaterThanOrEqual(3);
    expect(result.namespaces).toEqual(["ns1", "ns2"]);
    expect(result.query).toBe("payroll handoff");
  });

  test("citation source_ids are stable for the same input", async () => {
    const a = await unifiedSearch(["ns1"], "q");
    const b = await unifiedSearch(["ns1"], "q");
    expect(a.citations.map((c) => c.source_id)).toEqual(
      b.citations.map((c) => c.source_id)
    );
  });

  test("each citation has label + snippet + freshness", async () => {
    const r = await unifiedSearch(["ns"], "x");
    for (const c of r.citations) {
      expect(typeof c.source_id).toBe("string");
      expect(typeof c.label).toBe("string");
      expect(typeof c.snippet).toBe("string");
      expect(typeof c.freshness).toBe("number");
    }
  });

  test("source_types filter retains only matching types", async () => {
    const r = await unifiedSearch(["ns"], "x", ["github"]);
    expect(r.citations.length).toBeGreaterThan(0);
    for (const c of r.citations) {
      expect(c.label.toLowerCase().startsWith("github:")).toBe(true);
    }
  });

  test("source_types filter accepts multiple types", async () => {
    const r = await unifiedSearch(["ns"], "x", ["github", "slack"]);
    expect(r.citations.length).toBeGreaterThan(0);
    for (const c of r.citations) {
      const label = c.label.toLowerCase();
      expect(
        label.startsWith("github:") || label.startsWith("slack:"),
      ).toBe(true);
    }
    expect(r.citations.some((c) => c.label.toLowerCase().startsWith("github:"))).toBe(true);
    expect(r.citations.some((c) => c.label.toLowerCase().startsWith("slack:"))).toBe(true);
  });

  test("source_types is case-insensitive", async () => {
    const upper = await unifiedSearch(["ns"], "x", ["GITHUB"]);
    const lower = await unifiedSearch(["ns"], "x", ["github"]);
    expect(upper.citations.map((c) => c.source_id)).toEqual(
      lower.citations.map((c) => c.source_id),
    );
    // Mixed casing also works (catches label-format mismatch where filter
    // would only see lowercase labels even if Nia returns capitalized types).
    const mixed = await unifiedSearch(["ns"], "x", ["GitHub"]);
    expect(mixed.citations.length).toBe(lower.citations.length);
  });

  test("empty source_types passes all citations through", async () => {
    const noFilter = await unifiedSearch(["ns"], "x");
    const empty = await unifiedSearch(["ns"], "x", []);
    expect(empty.citations).toEqual(noFilter.citations);
  });

  test("source_types with no matches returns empty citations", async () => {
    const r = await unifiedSearch(["ns"], "x", ["nonexistent_type"]);
    expect(r.citations).toEqual([]);
  });
});

describe("getEntityContext (demo mode)", () => {
  test("returns sources covering github, jira, slack", async () => {
    const ctx = await getEntityContext("emp_demo");
    const types = new Set(ctx.sources.map((s) => s.type));
    expect(types.has("github")).toBe(true);
    expect(types.has("jira")).toBe(true);
    expect(types.has("slack")).toBe(true);
  });

  test("entity_id is preserved", async () => {
    const ctx = await getEntityContext("alex_42");
    expect(ctx.entity_id).toBe("alex_42");
  });
});
