import { useEffect, useRef, useState } from "react";
import type { Message, Project, Thread } from "./types";

// Spawn MVP shell — three panes, Discord-shaped: projects rail / threads /
// active thread. Phase 0 scope: list projects, open (or create) a thread,
// send a message, watch the reply stream.

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadId, setThreadId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.spawn.listProjects().then(setProjects);
  }, []);

  useEffect(() => {
    if (projectId == null) return;
    window.spawn.listThreads(projectId).then(setThreads);
    setThreadId(null);
    setMessages([]);
  }, [projectId]);

  useEffect(() => {
    if (threadId == null) return;
    window.spawn.listMessages(threadId).then(setMessages);
  }, [threadId]);

  useEffect(() => {
    return window.spawn.onEvent((ev) => {
      if (!("threadId" in ev.payload) || ev.payload.threadId !== threadId) return;
      if (ev.type === "turn:done") {
        setBusy(false);
        window.spawn.listMessages(threadId!).then(setMessages);
      } else if (ev.type === "turn:text" || ev.type === "turn:tool") {
        // Streamed rows are already persisted — re-pull keeps it simple for MVP.
        window.spawn.listMessages(threadId!).then(setMessages);
      }
    });
  }, [threadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const openThread = async () => {
    if (projectId == null) return;
    const t = await window.spawn.createThread({
      projectId,
      title: `Thread ${new Date().toLocaleString()}`,
    });
    setThreads((prev) => [t, ...prev]);
    setThreadId(t.id);
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || threadId == null || busy) return;
    setDraft("");
    setBusy(true);
    await window.spawn.sendMessage(threadId, text);
    setMessages(await window.spawn.listMessages(threadId));
  };

  return (
    <div className="shell">
      <aside className="rail">
        <h1>Spawn</h1>
        {projects.map((p) => (
          <button
            key={p.id}
            className={p.id === projectId ? "item active" : "item"}
            onClick={() => setProjectId(p.id)}
            title={p.dir}
          >
            {p.name}
          </button>
        ))}
      </aside>

      <aside className="threads">
        <div className="pane-head">
          <span>Threads</span>
          <button onClick={openThread} disabled={projectId == null}>
            +
          </button>
        </div>
        {threads.map((t) => (
          <button
            key={t.id}
            className={t.id === threadId ? "item active" : "item"}
            onClick={() => setThreadId(t.id)}
          >
            <span className={`dot ${t.status}`} />
            {t.title}
          </button>
        ))}
      </aside>

      <main className="chat">
        {threadId == null ? (
          <div className="empty">Pick a project, open a thread.</div>
        ) : (
          <>
            <div className="messages">
              {messages.map((m) => (
                <div key={m.id} className={`msg ${m.role}`}>
                  {m.role === "tool" ? (
                    <code>⚙ {m.tool_name}</code>
                  ) : (
                    <pre>{m.text}</pre>
                  )}
                </div>
              ))}
              {busy && <div className="msg system">…working…</div>}
              <div ref={bottomRef} />
            </div>
            <div className="composer">
              <textarea
                value={draft}
                placeholder="Message the agent…"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <button onClick={send} disabled={busy || !draft.trim()}>
                Send
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
