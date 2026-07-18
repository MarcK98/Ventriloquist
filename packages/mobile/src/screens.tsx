import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { RelayClient, SpawnEvent } from "./api";
import { C } from "./theme";

// The four phone surfaces: Board, Approvals, Runs, Thread. Deliberately
// lean — RN core components only, Nocturne colors, same daemon payloads as
// the desktop.

const fmtTok = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n);

const S = {
  card: {
    backgroundColor: C.surface,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  title: { color: C.text, fontSize: 14, fontWeight: "500" as const },
  dim: { color: C.n500, fontSize: 12 },
  tag: {
    color: C.accent300,
    fontSize: 11,
    borderColor: C.accent,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: "hidden" as const,
  },
};

function useSpawnEvents(client: RelayClient, types: string[], cb: (ev: SpawnEvent) => void) {
  const cbRef = useRef(cb);
  cbRef.current = cb;
  useEffect(
    () => client.onEvent((ev) => {
      if (types.includes(ev.type)) cbRef.current(ev);
    }),
    [client] // eslint-disable-line react-hooks/exhaustive-deps
  );
}

// ── Board ────────────────────────────────────────────────────────────────────
const COLUMNS = ["todo", "in-progress", "blocked", "in-review", "done"] as const;

export function BoardScreen({
  client,
  openThread,
}: {
  client: RelayClient;
  openThread: (threadId: number, title: string) => void;
}) {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(() => {
    client
      .rpc<any[]>("listTickets")
      .then((t) => {
        setTickets(t);
        setLoaded(true);
      })
      .catch(() => {});
  }, [client]);
  useEffect(refresh, [refresh]);
  useSpawnEvents(client, ["ticket:created", "ticket:updated", "ticket:deleted", "turn:done"], refresh);

  if (!loaded) return <Center spinner />;
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
      {COLUMNS.map((col) => {
        const rows = tickets.filter((t) => t.status === col);
        if (!rows.length) return null;
        return (
          <View key={col} style={{ marginBottom: 18 }}>
            <Text
              style={{
                color: col === "in-progress" ? C.ok : col === "blocked" ? C.warn : C.n500,
                fontSize: 11,
                letterSpacing: 1,
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              {col.replace("-", " ")} · {rows.length}
            </Text>
            {rows.map((t) => (
              <Pressable
                key={t.id}
                style={S.card}
                onPress={() => t.thread_id != null && openThread(t.thread_id, t.title)}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                  {t.running && <Dot color={C.ok} />}
                  <Text style={[S.title, { flex: 1 }]} numberOfLines={2}>
                    {t.title}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 7, alignItems: "center" }}>
                  <Text style={S.dim}>SPWN-{t.id}</Text>
                  <Text style={S.dim}>{t.project_name}</Text>
                  {t.branch && (
                    <Text style={[S.dim, { color: C.accent300 }]} numberOfLines={1}>
                      ⎇ {String(t.branch).replace(/^ticket\//, "")}
                    </Text>
                  )}
                </View>
              </Pressable>
            ))}
          </View>
        );
      })}
      {tickets.length === 0 && <Center text="Board is empty." />}
    </ScrollView>
  );
}

// ── Approvals ────────────────────────────────────────────────────────────────
export function ApprovalsScreen({ client }: { client: RelayClient }) {
  const [pending, setPending] = useState<any[]>([]);
  const refresh = useCallback(() => {
    client.rpc<any[]>("listApprovals").then(setPending).catch(() => {});
  }, [client]);
  useEffect(refresh, [refresh]);
  useSpawnEvents(client, ["approval:request", "approval:resolved"], refresh);

  const answer = async (id: number, allow: boolean) => {
    await client.rpc("resolveApproval", id, allow);
    refresh();
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14 }}>
      {pending.map((a) => (
        <View key={a.id} style={[S.card, { borderColor: C.warn, borderWidth: 1 }]}>
          <Text style={S.title}>✋ {a.tool}</Text>
          <Text style={[S.dim, { marginTop: 6 }]} numberOfLines={6}>
            {JSON.stringify(a.input, null, 2)}
          </Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <Btn label="Allow" color={C.ok} onPress={() => answer(a.id, true)} />
            <Btn label="Deny" color={C.err} onPress={() => answer(a.id, false)} />
          </View>
        </View>
      ))}
      {pending.length === 0 && <Center text="Nothing waiting on you." />}
    </ScrollView>
  );
}

// ── Runs ─────────────────────────────────────────────────────────────────────
export function RunsScreen({
  client,
  openThread,
}: {
  client: RelayClient;
  openThread: (threadId: number, title: string) => void;
}) {
  const [runs, setRuns] = useState<any[]>([]);
  const [live, setLive] = useState<Map<number, number>>(new Map());

  const refresh = useCallback(() => {
    client.rpc<any[]>("listActiveThreads").then(setRuns).catch(() => {});
  }, [client]);
  useEffect(refresh, [refresh]);
  useSpawnEvents(client, ["thread:created", "thread:updated", "turn:start", "turn:done"], refresh);
  useSpawnEvents(client, ["turn:usage"], (ev) =>
    setLive((prev) => new Map(prev).set(ev.payload.threadId, ev.payload.liveTokens))
  );
  useSpawnEvents(client, ["turn:done"], (ev) =>
    setLive((prev) => {
      const next = new Map(prev);
      next.delete(ev.payload.threadId);
      return next;
    })
  );

  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 14 }}
      data={runs}
      keyExtractor={(t) => String(t.id)}
      ListEmptyComponent={<Center text="Nothing active." />}
      renderItem={({ item: t }) => {
        const lt = live.get(t.id) ?? t.liveTokens;
        return (
          <Pressable style={S.card} onPress={() => openThread(t.id, t.title)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
              <Dot color={t.running ? C.ok : C.n600} />
              <Text style={[S.title, { flex: 1 }]} numberOfLines={1}>
                {t.title}
              </Text>
              {t.running && lt != null && lt > 0 && (
                <Text style={{ color: C.ok, fontSize: 12 }}>⚡ {fmtTok(lt)}</Text>
              )}
            </View>
            <Text style={[S.dim, { marginTop: 4 }]}>
              {t.project_name} · {t.kind}
              {t.branch ? ` · ${String(t.branch).replace(/^ticket\//, "")}` : ""}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}

// ── Thread ───────────────────────────────────────────────────────────────────
export function ThreadScreen({
  client,
  threadId,
  onBack,
  title,
}: {
  client: RelayClient;
  threadId: number;
  title: string;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<any[]>([]);
  const [liveText, setLiveText] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<ScrollView>(null);

  useEffect(() => {
    client.rpc<any[]>("listMessages", threadId).then(setMessages).catch(() => {});
  }, [client, threadId]);
  useSpawnEvents(client, ["turn:delta", "turn:text", "turn:tool", "turn:done"], (ev) => {
    if (ev.payload.threadId !== threadId) return;
    if (ev.type === "turn:delta") setLiveText((p) => p + ev.payload.text);
    else if (ev.type === "turn:done") {
      setLiveText("");
      setBusy(false);
    } else {
      if (ev.type === "turn:text") setLiveText("");
      const msg = ev.payload.message;
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    }
  });
  useEffect(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  }, [messages, liveText]);

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    setBusy(true);
    await client.rpc("sendMessage", threadId, text).catch(() => setBusy(false));
    setMessages(await client.rpc("listMessages", threadId).catch(() => messages));
  };

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 14,
          paddingVertical: 10,
          gap: 10,
          borderBottomWidth: 1,
          borderBottomColor: C.n800,
        }}
      >
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={{ color: C.accent, fontSize: 15 }}>‹ Back</Text>
        </Pressable>
        <Text style={[S.title, { flex: 1 }]} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <ScrollView ref={listRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 14 }}>
        {messages.map((m) =>
          m.role === "tool" ? (
            <Text key={m.id} style={[S.dim, { marginBottom: 8, fontFamily: "Menlo" }]} numberOfLines={1}>
              ⚙ {m.tool_name}
            </Text>
          ) : (
            <View key={m.id} style={{ marginBottom: 12 }}>
              <Text style={{ color: m.role === "user" ? C.accent300 : C.ok, fontSize: 11, marginBottom: 2 }}>
                {m.role === "user" ? "you" : "agent"}
              </Text>
              <Text style={{ color: m.role === "system" ? C.n500 : C.text, fontSize: 14, lineHeight: 20 }}>
                {m.text}
              </Text>
            </View>
          )
        )}
        {liveText !== "" && (
          <View style={{ marginBottom: 12 }}>
            <Text style={{ color: C.ok, fontSize: 11, marginBottom: 2 }}>agent</Text>
            <Text style={{ color: C.text, fontSize: 14, lineHeight: 20 }}>{liveText}▌</Text>
          </View>
        )}
        {busy && liveText === "" && <Text style={S.dim}>working…</Text>}
      </ScrollView>
      <View style={{ flexDirection: "row", gap: 8, padding: 12, alignItems: "flex-end" }}>
        <TextInput
          style={{
            flex: 1,
            backgroundColor: C.surface,
            borderRadius: 12,
            color: C.text,
            paddingHorizontal: 14,
            paddingVertical: 10,
            maxHeight: 120,
            borderWidth: 1,
            borderColor: C.n800,
          }}
          multiline
          value={draft}
          placeholder="Steer the agent…"
          placeholderTextColor={C.n600}
          onChangeText={setDraft}
        />
        <Btn label="Send" color={C.accent} onPress={send} disabled={busy || !draft.trim()} />
      </View>
    </View>
  );
}

// ── Bits ─────────────────────────────────────────────────────────────────────
export function Dot({ color }: { color: string }) {
  return <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />;
}

export function Btn({
  label,
  color,
  onPress,
  disabled,
}: {
  label: string;
  color: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        borderColor: color,
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text style={{ color, fontSize: 14, fontWeight: "500" }}>{label}</Text>
    </Pressable>
  );
}

export function Center({ text, spinner }: { text?: string; spinner?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}>
      {spinner ? <ActivityIndicator color={C.accent} /> : <Text style={S.dim}>{text}</Text>}
    </View>
  );
}
