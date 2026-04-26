#!/usr/bin/env bash
# OpenFire end-to-end smoke driver.
#
# Drives the full stack with curl. Prereqs:
#   1. `bunx convex dev` running in another terminal (Convex schema pushed).
#   2. `bun dev` running on $BASE_URL (defaults to http://localhost:3000).
#   3. An employee row already exists (use the dashboard "Add employee" form
#      or pass EMPLOYEE_ID=<id> in the env).
#
# Optional env:
#   BASE_URL       — Next.js base URL (default http://localhost:3000)
#   EMPLOYEE_ID    — pre-seeded employee Convex id
#
# This script does not gate CI. Run manually when verifying the demo.
set -euo pipefail

BASE=${BASE_URL:-http://localhost:3000}

if [[ -z "${EMPLOYEE_ID:-}" ]]; then
  echo "EMPLOYEE_ID is not set. Add an employee from the dashboard first."
  exit 2
fi

echo "==> running fire pipeline against $BASE"
curl -fsS -X POST "$BASE/api/agent/run" \
  -H 'content-type: application/json' \
  -d "{\"employee_id\":\"$EMPLOYEE_ID\"}" \
  | jq '.flagged, .processed'

echo "==> hiring digital replacement"
HIRE=$(curl -fsS -X POST "$BASE/api/hire" \
  -H 'content-type: application/json' \
  -d "{\"employee_id\":\"$EMPLOYEE_ID\"}")
echo "$HIRE" | jq .

A2A_URL=$(echo "$HIRE" | jq -r '.a2a_endpoint_url')
ENTITY_ID=${A2A_URL##*/}
THREAD_ID=$(echo "$HIRE" | jq -r '.onboarding_thread_id')

echo "==> fetching agent card for $ENTITY_ID"
curl -fsS "$BASE/api/a2a/$ENTITY_ID/agent.json" | jq .

echo "==> sending JSON-RPC message/send to the new agent"
curl -fsS -X POST "$BASE/api/a2a/$ENTITY_ID" \
  -H 'content-type: application/json' \
  -d "{
    \"jsonrpc\":\"2.0\",
    \"id\":1,
    \"method\":\"message/send\",
    \"params\":{
      \"sender\":\"manager@openfire.local\",
      \"message\":{
        \"role\":\"user\",
        \"parts\":[{\"kind\":\"text\",\"text\":\"What did the predecessor leave open?\"}],
        \"messageId\":\"e2e_$(date +%s)\",
        \"contextId\":\"$THREAD_ID\"
      }
    }
  }" | jq '.result.status.state, .result.artifacts'

echo "==> agent directory"
curl -fsS "$BASE/api/agents/directory" | jq '.agents | length'

echo "==> done"
