import { EventEmitter } from "node:events";
import { readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { config } from "../config.js";
import { log } from "../logger.js";
import { getProvider } from "../providers/index.js";
import { getOverrides } from "../projects.js";
import * as db from "../db/index.js";
import { getProjectSettings, updateProjectSettings } from "./project-settings.js";

// The Spawn daemon — the ONE API boundary clients talk through (decision #1).
// For MVP it runs in-process inside the Electron main process; the method
// surface below is deliberately transport-shaped (plain-JSON args/results,
// events as {type, payload}) so a later WS/REST layer with Supabase Auth can
// expose the same object remotely without reshaping. Rules that keep that
// possible:
//   - every method takes/returns JSON-serializable values only
//   - streaming happens via the `events` emitter, never callbacks in args
//   - secrets NEVER appear in a method result or event (decision #9) —
//     they stay daemon-side; see project-settings.js
//
// sessionKey convention: "spawn:thread:<threadId>" — parallel threads never
// share a key, so provider-level serialization applies per thread, not per
// project (the per-ticket isolation model).

const threadKey = (threadId) => `spawn:thread:${threadId}`;

export function createDaemon({ providerId = "claude-code" } = {}) {
  const events = new EventEmitter();
  const provider = getProvider(providerId);
  const emit = (type, payload) => events.emit("event", { type, payload });

  // ── Projects: union of dirs under PROJECTS_ROOT and projects.json overrides,
  // mirrored into SQLite so threads can reference them.
  const discoverProjects = () => {
    const root = config.projects.root;
    const dirs = new Map(); // name -> dir
    if (root) {
      try {
        for (const entry of readdirSync(root)) {
          if (entry.startsWith(".")) continue;
          const dir = join(root, entry);
          try {
            if (statSync(dir).isDirectory()) dirs.set(entry, dir);
          } catch {
            /* unreadable entry */
          }
        }
      } catch (err) {
        log.warn(`Spawn daemon: cannot read PROJECTS_ROOT ${root}: ${err.message}`);
      }
    }
    for (const [name, dir] of Object.entries(getOverrides())) {
      dirs.set(basename(name), dir);
    }
    return [...dirs].map(([name, dir]) => db.upsertProject(name, dir));
  };

  return {
    events,

    listProjects: () => {
      discoverProjects();
      return db.listProjects();
    },

    getProjectSettings: (projectId) => getProjectSettings(projectId),
    updateProjectSettings: (projectId, patch) => updateProjectSettings(projectId, patch),

    listThreads: (projectId) => db.listThreads(projectId),
    getThread: (threadId) => db.getThread(threadId),
    listMessages: (threadId, opts) => db.listMessages(threadId, opts),

    createThread: ({ projectId, title, kind = "chat", ticketKey = null }) => {
      const thread = db.createThread({ projectId, kind, title, ticketKey });
      emit("thread:created", thread);
      return thread;
    },

    // Send one user turn into a thread; the reply streams out as events:
    //   turn:start {threadId} → turn:text {threadId,text}* / turn:tool
    //   {threadId,tool,input}* → turn:done {threadId, ok, text, ...}
    // Messages are persisted as they stream, so history survives restarts.
    sendMessage: (threadId, text) => {
      const thread = db.getThread(threadId);
      if (!thread) throw new Error(`No such thread: ${threadId}`);
      const project = db.listProjects().find((p) => p.id === thread.project_id);
      if (!project) throw new Error(`Thread ${threadId} has no project`);
      const settings = getProjectSettings(project.id);

      db.addMessage({ threadId, role: "user", text });
      emit("turn:start", { threadId });

      let seq = 0;
      const handle = provider.startTurn({
        sessionKey: threadKey(threadId),
        prompt: text,
        cwd: thread.worktree_path || project.dir,
        model: settings.defaultModel || undefined,
        persistSession: thread.kind !== "ticket",
        onText: (t) => {
          db.addMessage({ threadId, role: "assistant", text: t, seq: seq++ });
          emit("turn:text", { threadId, text: t });
        },
        onProgress: ({ tool, input }) => {
          db.addMessage({ threadId, role: "tool", toolName: tool, toolInput: input, seq: seq++ });
          emit("turn:tool", { threadId, tool });
        },
      });

      handle.done.then((res) => {
        // Final text arrives via onText already when streamed; store the result
        // only if nothing streamed (e.g. an error string).
        if (res.text && !res.streamed) {
          db.addMessage({ threadId, role: res.ok ? "assistant" : "system", text: res.text, seq: seq++ });
        }
        emit("turn:done", {
          threadId,
          ok: res.ok,
          cancelled: res.cancelled ?? false,
          contextTokens: res.contextTokens ?? null,
        });
      });

      return { threadId, started: true };
    },

    cancelTurn: (threadId) => provider.cancel(threadKey(threadId)),
    resetThreadSession: (threadId) => provider.resetSession(threadKey(threadId)),
    lastTurnStats: (threadId) => provider.lastStats(threadKey(threadId)),
  };
}
