// AgentProvider seam (decision #8: seams only — one implementation for now).
//
// A provider turns a prompt into a streamed agent run inside a working
// directory. Claude Code is the only implementation today; a future
// OpenAI/Gemini/etc provider implements the same shape and registers here.
//
// Interface (duck-typed; JSDoc is the contract):
//
// @typedef {Object} AgentTurnHandle
// @property {Promise<AgentResult>} done   resolves when the turn finishes
//
// @typedef {Object} AgentResult
// @property {boolean} ok
// @property {string}  text            final assistant message
// @property {boolean} [cancelled]
// @property {number}  [contextTokens]
// @property {boolean} [contextReset]
//
// @typedef {Object} AgentProvider
// @property {string} id                              e.g. "claude-code"
// @property {(opts: {
//     sessionKey: string,            stable id for resume/serialization
//     prompt: string,
//     cwd: string,
//     model?: string, effort?: string,
//     persistSession?: boolean,      false = ephemeral (ticket threads)
//     onText?: (text: string) => void,
//     onProgress?: (ev: {tool: string, input: any}) => void,
//   }) => AgentTurnHandle} startTurn
// @property {(sessionKey: string) => boolean} cancel      stop the active turn
// @property {(sessionKey: string) => boolean} resetSession forget the conversation
// @property {(sessionKey: string) => object|null} lastStats usage of last run

import { claudeCodeProvider } from "./claude-code.js";

const providers = new Map([[claudeCodeProvider.id, claudeCodeProvider]]);

export const getProvider = (id = "claude-code") => {
  const p = providers.get(id);
  if (!p) throw new Error(`Unknown agent provider: ${id}`);
  return p;
};
export const registerProvider = (p) => providers.set(p.id, p);
