// Shared UI bits — every touchable gives pressed feedback (opacity + subtle
// background) and a selection haptic, the Discord-feel baseline.

import React from "react";
import { ActivityIndicator, Pressable, Text, View, ViewStyle, StyleProp } from "react-native";
import * as Haptics from "expo-haptics";
import { C } from "./theme";

export const fmtTok = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n);

export const tapHaptic = () => Haptics.selectionAsync().catch(() => {});
export const actionHaptic = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

export const S = {
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

// Card-shaped pressable: darkens while pressed, haptic on press-in.
export function Card({
  onPress,
  style,
  children,
}: {
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  if (!onPress) return <View style={[S.card, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={tapHaptic}
      style={({ pressed }) => [
        S.card,
        style,
        pressed && { backgroundColor: C.n900, transform: [{ scale: 0.985 }] },
      ]}
    >
      {children}
    </Pressable>
  );
}

export function Btn({
  label,
  color,
  onPress,
  disabled,
  busy,
}: {
  label: string;
  color: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <Pressable
      onPress={() => {
        actionHaptic();
        onPress();
      }}
      disabled={disabled || busy}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderColor: color,
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
        opacity: disabled && !busy ? 0.4 : 1,
        backgroundColor: pressed ? `${color}22` : "transparent",
      })}
    >
      {busy && <ActivityIndicator size="small" color={color} />}
      <Text style={{ color, fontSize: 14, fontWeight: "500" }}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, on, onPress, dim }: { label: string; on: boolean; onPress: () => void; dim?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        tapHaptic();
        onPress();
      }}
      style={({ pressed }) => ({
        borderWidth: 1,
        borderColor: on ? C.accent : C.n800,
        backgroundColor: pressed ? C.n900 : on ? C.accent800 : "transparent",
        borderRadius: 7,
        paddingHorizontal: 11,
        paddingVertical: 5,
        opacity: dim ? 0.4 : 1,
      })}
    >
      <Text style={{ color: on ? C.accent200 : C.n400, fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

export function Dot({ color }: { color: string }) {
  return <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />;
}

export function Center({ text, spinner }: { text?: string; spinner?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}>
      {spinner ? <ActivityIndicator color={C.accent} /> : <Text style={S.dim}>{text}</Text>}
    </View>
  );
}

// Per-screen fetch-failure strip with a retry — failures must look different
// from "empty".
export function ErrorBar({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        margin: 14,
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: C.err,
        backgroundColor: `${C.err}18`,
      }}
    >
      <Text style={{ color: C.err, fontSize: 12, flex: 1 }}>{message}</Text>
      <Btn label="Retry" color={C.err} onPress={onRetry} />
    </View>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 5 }}>
      <Text style={{ color: C.n500, fontSize: 11 }}>{label}</Text>
      {children}
    </View>
  );
}
