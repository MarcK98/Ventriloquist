// Per-project settings + secrets (decisions #5 and #9) — Phase 0 seam.
//
// Shape is the contract; persistence lands with the settings page (Phase 2).
// Two hard rules already enforced by the split below:
//   - `settings` are client-visible and JSON-safe (fed to the settings page).
//   - `secrets` are daemon-side ONLY: injected into agent runs as env/config,
//     never returned by a daemon method, never in an event, never to a
//     remote/mobile client. getProjectSettings() therefore returns settings
//     WITHOUT secrets by construction, not by filtering.

const DEFAULTS = {
  approvalMode: "prompt", // "prompt" | "auto" — per project, no global default
  allowedModels: ["haiku", "sonnet", "opus"], // fable requires explicit opt-in
  defaultModel: "", // empty = harness default
  mcps: [], // MCP server names enabled for this project
  skills: [], // skill names enabled for this project
};

const settingsByProject = new Map(); // projectId -> settings (in-memory, Phase 0)
const secretsByProject = new Map(); // projectId -> {KEY: value} — never leaves the daemon

export function getProjectSettings(projectId) {
  return { ...DEFAULTS, ...(settingsByProject.get(projectId) ?? {}) };
}

export function updateProjectSettings(projectId, patch) {
  const clean = { ...patch };
  delete clean.secrets; // secrets have their own write path, never this one
  settingsByProject.set(projectId, { ...getProjectSettings(projectId), ...clean });
  return getProjectSettings(projectId);
}

// Daemon-internal: resolve secrets to inject into a run's environment.
export function getProjectSecrets(projectId) {
  return { ...(secretsByProject.get(projectId) ?? {}) };
}

export function setProjectSecret(projectId, key, value) {
  const cur = secretsByProject.get(projectId) ?? {};
  secretsByProject.set(projectId, { ...cur, [key]: value });
  return true; // never echo the value back
}
