---
name: openfire-seed
description: Seed Convex with default fire criteria and a small set of demo employees with varied Nozomio signal profiles for end-to-end testing.
---

# OpenFire — Seed Demo Data

Bootstrap a fresh Convex deployment with realistic test data so the agent has something to chew on.

## When to use

- First-run setup of a new Convex deployment.
- After `npx convex deploy` to a clean environment.
- Before recording a demo or running E2E tests.
- User says "seed it", "give me test data", "set up demo employees".

## Steps

1. Seed default fire criteria (idempotent):
   ```sh
   bunx convex run criteria:seedDefaultCriteria
   ```
   Creates 4 weighted criteria: Code Quality, Deadline Adherence, Communication, Output Volume.

2. Verify the seed succeeded:
   ```sh
   bunx convex run criteria:listActive
   ```
   Expect 4 entries with `active: true`.

3. Create demo employees with deterministic Nozomio entity ids so `demoContext` produces stable signal profiles:
   ```sh
   bunx convex run employees:create '{"name":"Alex Chen","email":"alex@demo.openfire","role":"Senior Backend Engineer","nozomio_entity_id":"ent_alex_001"}'
   bunx convex run employees:create '{"name":"Maya Patel","email":"maya@demo.openfire","role":"Product Designer","nozomio_entity_id":"ent_maya_002"}'
   bunx convex run employees:create '{"name":"Jordan Reyes","email":"jordan@demo.openfire","role":"Site Reliability Engineer","nozomio_entity_id":"ent_jordan_003"}'
   bunx convex run employees:create '{"name":"Sam Okafor","email":"sam@demo.openfire","role":"Data Scientist","nozomio_entity_id":"ent_sam_004"}'
   bunx convex run employees:create '{"name":"Riley Tanaka","email":"riley@demo.openfire","role":"Engineering Manager","nozomio_entity_id":"ent_riley_005"}'
   ```

4. Confirm:
   ```sh
   bunx convex run employees:list
   ```

## After seeding

Suggest the user trigger an evaluation:
```sh
curl -X POST http://localhost:3000/api/agent/run -H 'content-type: application/json' -d '{}'
```

Or per-employee:
```sh
curl -X POST http://localhost:3000/api/agent/run -H 'content-type: application/json' -d '{"employee_id":"<id>"}'
```

## Don't

- Don't seed if data already exists — `criteria.seedDefaultCriteria` is idempotent but `employees.create` will create duplicates if entity_ids differ. Check `employees:list` first.
- Don't seed in production — these are obvious demo addresses.
