---
name: openfire-trace
description: Pretty-print the most recent agent decision's tool-use trace from Convex. Use when debugging why the agent reached a verdict or escalated.
---

# OpenFire — Decision Trace

Print the latest decision's reasoning trace: which tools the agent called, in what order, with timing and any errors.

## When to use

- "why did the agent escalate this employee?"
- "show me the last decision's trace"
- "did fetch_nozomio_source actually return useful evidence?"
- After running `runFireAgent` and the result is surprising.

## How to run

1. Identify the latest decision id (or take one from the user):
   ```sh
   bunx convex run decisions:list | head -20
   ```
2. List its tool calls in order:
   ```sh
   bunx convex run toolCalls:listForDecision '{"decision_id":"<id>"}'
   ```
3. For each row, parse `input_json` and `output_json` and present:
   - `iteration` · `tool_name` · `duration_ms` · `is_error`
   - input (compact JSON)
   - output (compact JSON, truncated to 400 chars per field)

## Output format

```
[i1] fetch_nozomio_context  120ms ok
       in:  {}
       out: { entity_id: "ent_…", summary: "…", sources: [3] }

[i2] propose_decision       80ms  ok  ★ terminal
       in:  { decision: "fire", reasoning: "…", emailDraft: "…" }
       out: { accepted: true }
```

Mark terminal tools with ★. Mark errors with ✗ in red. Show total wall time and iteration count at the top.

## Don't

- Don't run the agent — this skill is read-only.
- Don't dump full output_json verbatim if it exceeds 400 chars — truncate with `…`.
