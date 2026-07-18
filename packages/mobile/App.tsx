import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, SafeAreaView, StatusBar, Text, TextInput, View } from "react-native";
import { RelayClient } from "./src/api";
import { C } from "./src/theme";
import { ApprovalsScreen, BoardScreen, Btn, Dot, RunsScreen, ThreadScreen } from "./src/screens";

// Spawn mobile — a relay client of the local daemon. Connect screen takes the
// relay URL + token (dev token now; Supabase sign-in replaces this screen when
// the account lands — the RelayClient API stays identical).

type Tab = "board" | "approvals" | "runs";

export default function App() {
  const [conn, setConn] = useState<{ url: string; token: string } | null>(null);
  const [url, setUrl] = useState("ws://192.168.1.0:8820");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<string>("disconnected");
  const [tab, setTab] = useState<Tab>("board");
  const [thread, setThread] = useState<{ id: number; title: string } | null>(null);
  const [approvalCount, setApprovalCount] = useState(0);
  const [liveTotal, setLiveTotal] = useState(0);
  const liveMap = useRef(new Map<number, number>());

  const client = useMemo(() => (conn ? new RelayClient(conn.url, conn.token) : null), [conn]);

  useEffect(() => {
    if (!client) return;
    client.connect();
    const offStatus = client.onStatus(setStatus);
    const offEvents = client.onEvent((ev) => {
      if (ev.type === "approval:request") setApprovalCount((n) => n + 1);
      if (ev.type === "approval:resolved") setApprovalCount((n) => Math.max(0, n - 1));
      if (ev.type === "turn:usage") {
        liveMap.current.set(ev.payload.threadId, ev.payload.liveTokens);
        setLiveTotal([...liveMap.current.values()].reduce((a, b) => a + b, 0));
      }
      if (ev.type === "turn:done") {
        liveMap.current.delete(ev.payload.threadId);
        setLiveTotal([...liveMap.current.values()].reduce((a, b) => a + b, 0));
      }
    });
    client.rpc<any[]>("listApprovals").then((a) => setApprovalCount(a.length)).catch(() => {});
    return () => {
      offStatus();
      offEvents();
      client.close();
    };
  }, [client]);

  if (!client) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <StatusBar barStyle="light-content" />
        <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 14 }}>
          <Text style={{ color: C.text, fontSize: 26, fontWeight: "500" }}>Spawn</Text>
          <Text style={{ color: C.n500, fontSize: 13, marginBottom: 10 }}>
            Connect to your relay. Dev token for now — Supabase sign-in replaces this once the
            account exists.
          </Text>
          <TextInput
            style={inputStyle}
            value={url}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="ws://<mac-ip>:8820"
            placeholderTextColor={C.n600}
            onChangeText={setUrl}
          />
          <TextInput
            style={inputStyle}
            value={token}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            placeholder="access token"
            placeholderTextColor={C.n600}
            onChangeText={setToken}
          />
          <Btn label="Connect" color={C.accent} onPress={() => setConn({ url, token })} disabled={!url || !token} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="light-content" />
      {/* Top bar */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 10,
          gap: 10,
        }}
      >
        <Text style={{ color: C.text, fontSize: 17, fontWeight: "600" }}>Spawn</Text>
        <Dot color={status === "ready" ? C.ok : status === "daemon-offline" ? C.warn : C.n600} />
        <Text style={{ color: C.n600, fontSize: 11 }}>{status}</Text>
        <View style={{ flex: 1 }} />
        {liveTotal > 0 && (
          <Text style={{ color: C.ok, fontSize: 12 }}>
            ⚡ {liveTotal >= 1e6 ? `${(liveTotal / 1e6).toFixed(1)}M` : `${Math.round(liveTotal / 1e3)}k`} in flight
          </Text>
        )}
        <Pressable onPress={() => setConn(null)} hitSlop={10}>
          <Text style={{ color: C.n600, fontSize: 12 }}>disconnect</Text>
        </Pressable>
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        {thread ? (
          <ThreadScreen
            client={client}
            threadId={thread.id}
            title={thread.title}
            onBack={() => setThread(null)}
          />
        ) : tab === "board" ? (
          <BoardScreen client={client} openThread={(id, title) => setThread({ id, title })} />
        ) : tab === "approvals" ? (
          <ApprovalsScreen client={client} />
        ) : (
          <RunsScreen client={client} openThread={(id, title) => setThread({ id, title })} />
        )}
      </View>

      {/* Tabs */}
      {!thread && (
        <View
          style={{
            flexDirection: "row",
            borderTopWidth: 1,
            borderTopColor: C.n800,
            paddingVertical: 8,
            paddingBottom: 4,
          }}
        >
          {(
            [
              ["board", "Board"],
              ["approvals", approvalCount ? `Approvals (${approvalCount})` : "Approvals"],
              ["runs", "Runs"],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <Pressable key={key} style={{ flex: 1, alignItems: "center", padding: 8 }} onPress={() => setTab(key)}>
              <Text
                style={{
                  color: tab === key ? C.accent300 : C.n500,
                  fontSize: 13,
                  fontWeight: tab === key ? "600" : "400",
                }}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}

const inputStyle = {
  backgroundColor: C.surface,
  borderRadius: 10,
  borderWidth: 1,
  borderColor: C.n800,
  color: C.text,
  paddingHorizontal: 14,
  paddingVertical: 12,
  fontSize: 14,
} as const;
