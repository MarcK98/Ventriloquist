#!/usr/bin/env node
// Stdio MCP server attached to TEAM-LEAD runs only (see daemon launchTurn):
// pull-based access to the Spawn board's archive. The lead's injected context
// carries open tickets only; these tools let it search everything — done
// tickets included — when asked about past work.
//
// Talks to the local Spawn daemon's /rpc using the per-start token file
// (same-user read), so there is exactly one reader of the SQLite store.
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { dataPath } from "../config.js";

const PORT = Number(process.env.SPAWN_DAEMON_PORT) || 8810;

const rpc = async (method, ...args) => {
  const token = readFileSync(dataPath("spawn-daemon.token"), "utf8").trim();
  const res = await fetch(`http://127.0.0.1:${PORT}/rpc`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-spawn-token": token },
    body: JSON.stringify({ method, args }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json();
  if (!body.ok) throw new Error(body.error || `rpc ${method} failed`);
  return body.result;
};

const server = new McpServer({ name: "board", version: "1.0.0" });

const fmtTicket = (k) =>
  `• SPWN-${k.id} [${k.status}] ${k.project_name}: ${k.title}` +
  `${k.branch ? ` (${k.branch})` : ""} · updated ${k.updated_at}`;

server.tool(
  "search_tickets",
  "Search the Spawn board — ALL tickets, including the Done archive (which is omitted from your standing context). Use when asked about past/finished work. `query` matches title and body; optional `status` (todo|in-progress|blocked|in-review|done) and `project` (project name) filters; `limit` default 20.",
  {
    query: z.string().optional(),
    status: z.enum(["todo", "in-progress", "blocked", "in-review", "done"]).optional(),
    project: z.string().optional(),
    limit: z.number().optional(),
  },
  async ({ query, status, project, limit }) => {
    let text;
    try {
      const rows = await rpc("searchTickets", { query, status, project, limit });
      text = rows.length ? rows.map(fmtTicket).join("\n") : "No tickets matched.";
    } catch (err) {
      text = `error: ${err.message}`;
    }
    return { content: [{ type: "text", text }] };
  }
);

server.tool(
  "get_ticket",
  "Fetch one Spawn ticket by its number (the N in SPWN-N): full body plus the closing messages of its run — what was actually done / how it ended. Works for archived (done) tickets.",
  { id: z.number() },
  async ({ id }) => {
    let text;
    try {
      const k = await rpc("getTicketDetail", id);
      text =
        `${fmtTicket(k)}\n\n${k.body || "(no body)"}` +
        (k.outcome?.length
          ? `\n\nOutcome (closing messages):\n${k.outcome.map((t) => `> ${t.split("\n").join("\n> ")}`).join("\n---\n")}`
          : "\n\n(never delegated — no run transcript)");
    } catch (err) {
      text = `error: ${err.message}`;
    }
    return { content: [{ type: "text", text }] };
  }
);

await server.connect(new StdioServerTransport());
