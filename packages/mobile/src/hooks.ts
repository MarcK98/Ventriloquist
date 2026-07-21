import { useCallback, useEffect, useRef, useState } from "react";
import { RelayClient, SpawnEvent } from "./api";
import { kvGet, kvSet } from "./db";

export function useSpawnEvents(client: RelayClient, types: string[], cb: (ev: SpawnEvent) => void) {
  const cbRef = useRef(cb);
  cbRef.current = cb;
  useEffect(
    () => client.onEvent((ev) => {
      if (types.includes(ev.type)) cbRef.current(ev);
    }),
    [client] // eslint-disable-line react-hooks/exhaustive-deps
  );
}

// Run cb every time the relay reports ready — screens use it to reconcile
// after a reconnect (events missed during the drop are otherwise lost).
export function useOnReady(client: RelayClient, cb: () => void) {
  const cbRef = useRef(cb);
  cbRef.current = cb;
  useEffect(
    () => client.onStatus((st) => {
      if (st === "ready") cbRef.current();
    }),
    [client]
  );
}

// Cache-first fetch: hydrate synchronously from SQLite, fetch live, write
// through, refetch whenever the relay (re)connects. `error` is set only when
// the fetch fails AND nothing is cached — stale data beats an error screen.
export function useCachedRpc<T>(client: RelayClient, cacheKey: string, method: string, ...args: any[]) {
  const [data, setData] = useState<T | null>(() => kvGet<T>(cacheKey));
  const [stale, setStale] = useState(true);
  const [error, setError] = useState("");
  const argsKey = JSON.stringify(args);

  const refresh = useCallback(() => {
    client
      .rpc<T>(method, ...(JSON.parse(argsKey) as any[]))
      .then((v) => {
        setData(v);
        setStale(false);
        setError("");
        kvSet(cacheKey, v);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [client, cacheKey, method, argsKey]);

  useEffect(() => {
    setData(kvGet<T>(cacheKey));
    setStale(true);
    refresh();
  }, [refresh, cacheKey]);
  useOnReady(client, refresh);

  return { data, stale, error: data == null ? error : "", refresh, setData };
}
