# OpenClaw 🦞

> The AI agent that fires your employees so you don't have to feel bad about it.

OpenClaw is a hackathon project built for the "Build agents that act in the world" theme. It's an autonomous HR termination agent that monitors employee performance, decides who gets the axe, and delivers the bad news via a professionally passive-aggressive email — all while you're on vacation.

## What It Does

1. **Watches your team** — indexes codebases, Slack exports, docs, and meeting notes via [Nozomio](https://nozomio.com) to build a persistent, context-rich profile on each employee
2. **Makes the call** — runs a scoring model against configurable "claw criteria" (missed deadlines, bad PRs, too many lunch breaks)
3. **Sends the email** — uses [AgentMail](https://agentmail.to) to draft and send a personalized termination email with just enough warmth to avoid a lawsuit
4. **Handles the fallout** — manages reply threads, answers questions like "why me?", and schedules an exit interview with your Google Calendar

## Stack

- **Nozomio Nia API** — persistent knowledge graph of employee activity across code, docs, and the web
- **AgentMail** — programmable inbox for two-way email threading with terminated employees
- **Claude** — the brain that decides your fate
- **Next.js** — dashboard to review pending firings before the claw drops
- **Supabase** — stores employee profiles and termination history

## Judging Notes

- **Integration Depth**: Nozomio is core — no context, no firing decision. AgentMail is core — no email, no termination.
- **Technical Execution**: Fully agentic loop from data ingestion → decision → email → reply handling
- **Problem & Impact**: Every manager secretly wants this. The market is every company with employees.
- **Creativity**: It's an AI that fires people. With empathy. Via email. Automatically.

## Disclaimer

This is a hackathon joke project. Do not use OpenClaw to actually fire your employees. Unless they really deserve it.

---

Built at Eragon Hackathon 2026 · Team OpenClaw
