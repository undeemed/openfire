---
name: openfire-eval
description: Run the OpenFire agent against a single employee end-to-end and print the decision + trace. Use to validate the agent loop after prompt or tool changes.
---

# OpenFire — Evaluate Single Employee

Trigger one agent run and inspect the result. Useful for regression-checking after edits to `lib/claude.ts`, `lib/agent-tools.ts`, or any of the tool handlers.

## When to use

- After editing the agent system prompt or tools.
- After changing the Nozomio fallback or signals.
- "run the claw on Alex"
- "test the eval loop end-to-end"

## Steps

1. Pick the target employee (ask if not provided):
   ```sh
   bunx convex run employees:list | head -20
   ```

2. Run the agent on that employee:
   ```sh
   curl -X POST http://localhost:3000/api/agent/run \
     -H 'content-type: application/json' \
     -d '{"employee_id":"<id>"}'
   ```
   Expect JSON like `{ ok: true, processed: 1, flagged: 0|1, escalated: 0|1, failed: 0|1 }`.

3. Find the new decision row:
   ```sh
   bunx convex run decisions:listForEmployee '{"employee_id":"<id>"}' | head -1
   ```

4. Print the trace using the openfire-trace skill, or directly:
   ```sh
   bunx convex run toolCalls:listForDecision '{"decision_id":"<id>"}'
   ```

5. Summarize for the user:
   - Outcome: fire / spare / escalated
   - Iterations
   - Tool sequence (one line per call)
   - Reasoning excerpt (first 200 chars)
   - Any tool errors (`is_error: true` rows)

## What to look for

- Did the agent actually call `fetch_nozomio_context` before deciding?
- Did it escalate when it should have? (Look at the reasoning + last_text in the escalation reason field.)
- Is `iterations` reasonable? <2 means single-shot. >6 means the agent over-thought.
- Any `is_error: true` rows in the trace? Those mean a handler threw.

## Don't

- Don't run on a fired or already-pending employee — the agent skips them. Pick `status: "active"`.
- Don't run on an employee with no `nozomio_entity_id` — also skipped.
- Don't run without `ANTHROPIC_API_KEY` set unless intentionally testing the demo path.
