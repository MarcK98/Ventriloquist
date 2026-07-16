# Spawn — Phase 0 report (checkpoint for Marc)

Phase 0 of `docs/desktop-app-plan.md` is done, on branch `phase-0-scaffold`.
Per your instruction this is a hard stop — no Phase 1 work starts until you say go.

## Delivered

**Monorepo restructure (decision #3)**
- `src/` → `packages/core` (`@spawn/core`), `public/` and `scripts/` moved with it.
- Root `src/` now holds two compatibility shims (`index.js`, `mcp/approval-server.js`)
  so the RUNNING bridge and the muscle-memory `node src/index.js` restart keep working
  untouched until the Discord hard-cut. Verified: shim MCP handshake works under the
  bridge's actual runtime (asdf node v20.9.0).
- Runtime state (sessions.json, usage.jsonl, projects.json, .trello-state.json, spawn.db)
  now resolves through one `dataDir` (default repo root, override `SPAWN_DATA_DIR`).

**SQLite store (decision #4)**
- `better-sqlite3` (fastest embedded option), WAL, FK-enforced, `user_version` migrations.
- Schema v1: `projects` / `threads` (kind chat|ticket|teamlead, ticket_key, branch,
  worktree_path, status) / `messages` (role user|assistant|tool|system, stream seq).
- ABI note: native module — the desktop runs `electron-rebuild` (script:
  `npm run rebuild-native -w @spawn/desktop`); the bridge never imports the DB module,
  so the two runtimes can't collide. Documented in code.

**AgentProvider seam (decision #8)**
- `packages/core/src/providers/` — interface + registry; `claude-code.js` is a thin
  adapter over the existing `askClaude` pipeline (queueing, --resume, stream parsing,
  timeouts, cancel, usage recording all reused, zero forked logic).
- `claude.js` gained one capability: per-run `persistSessions:false` → ephemeral runs
  for isolated ticket threads.

**Daemon boundary (decisions #1, #5, #7, #9)**
- `packages/core/src/daemon/` — the ONE API clients use: listProjects / threads /
  messages / sendMessage (streams via events) / cancelTurn / settings. JSON-only
  args+results and event-emitter streaming, so a later WS/REST + Supabase Auth layer
  exposes the same surface remotely without reshaping.
- Per-project settings seam (`project-settings.js`): approvalMode prompt|auto,
  allowedModels (fable = explicit opt-in), MCPs, skills — and secrets kept in a separate
  daemon-side store that is structurally excluded from every method result/event.

**Desktop shell (Spawn branding, decision #10)**
- `packages/desktop` — Electron main hosts the daemon in-process; renderer is
  React+TS+Vite, Discord-shaped three panes: projects rail / threads / chat with
  live streaming. `npm run desktop` at root for dev.

## Verified
- Bridge modules all load under runtime node v20.9.0; approval-server shim answers a
  real MCP initialize. Live bridge untouched throughout.
- DB CRUD + pagination round-trip in a temp `SPAWN_DATA_DIR`.
- `tsc --noEmit` clean; `vite build` clean.
- Electron smoke (`SPAWN_SMOKE=1`): in-process daemon boots and lists **26 projects**
  from PROJECTS_ROOT. Headed launch stays up (window renders).

## Operational notes
- Restart the bridge whenever convenient — both old (`node src/index.js`) and new
  layouts work; nothing urgent.
- First `npm install` needed a retry (transient network); nothing structural.

## Token usage (this Phase 0 run, fable)
Exact figures land in `usage.jsonl` / the dashboard when this run completes —
check `/cost` in this channel for the authoritative number. Honest estimate from the
run itself: a long multi-step session (~60 tool calls, heavy repo recon + build/verify
loops); ballpark **~$15–30 of fable** for the phase. The scaffold is deliberately
thin — most spend was verification against the live bridge, which is the part that
had to be right.

## Gate: what Phase 1 would be (awaiting your go)
MVP chat hardening: message streaming without full re-pulls, approval-prompt modals
(prompt mode), thread titles/rename, project settings page backed by the seam, and
running the daemon behind the real WS layer. Say the word (and whether fable
continues or we drop to sonnet for the routine parts).
