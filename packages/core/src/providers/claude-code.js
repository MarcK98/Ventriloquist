import {
  askClaude,
  cancelRun,
  resetSession,
  getLastStats,
} from "../claude.js";

// Claude Code AgentProvider — a thin adapter over the existing battle-tested
// spawn/stream pipeline in claude.js (queueing, --resume, stream-json parsing,
// timeouts, cancellation, usage recording). No orchestration logic lives here;
// if a capability is missing, add it to claude.js and expose it, don't fork it.
export const claudeCodeProvider = {
  id: "claude-code",

  startTurn({ sessionKey, prompt, cwd, model, effort, persistSession = true, onText, onProgress }) {
    const done = askClaude(sessionKey, prompt, cwd, onText ?? (() => {}), {
      model,
      effort,
      onProgress,
      persistSessions: persistSession,
      meta: { source: "provider:claude-code" },
    });
    return { done };
  },

  cancel: (sessionKey) => cancelRun(sessionKey),
  resetSession: (sessionKey) => resetSession(sessionKey),
  lastStats: (sessionKey) => getLastStats(sessionKey),
};
