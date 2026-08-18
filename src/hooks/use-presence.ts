import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef } from "react";

export interface PresenceEntry<T> {
  sessionId: string;
  data: T | undefined;
}

/** A session id unique to this browser tab. */
function makeSessionId(): string {
  const g = globalThis.crypto as Crypto | undefined;
  if (g && typeof g.randomUUID === "function") {
    return `s_${g.randomUUID()}`;
  }
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Publish live data to a Convex presence room and keep the session alive.
 * The returned `publish` is stable — safe to call from a game loop.
 */
export function usePresencePublisher(room: string) {
  const sessionIdRef = useRef<string | null>(null);
  if (sessionIdRef.current === null) {
    sessionIdRef.current = makeSessionId();
  }
  const sessionId = sessionIdRef.current;

  const updatePresence = useMutation(api.presence.update);
  const heartbeat = useMutation(api.presence.heartbeat);
  const leave = useMutation(api.presence.leave);
  // Keep the last published payload so the session can be re-announced if
  // the server cleaned it up while the tab was backgrounded.
  const latestDataRef = useRef<unknown>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void heartbeat({ room, sessionId });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [room, sessionId, heartbeat]);

  // Browsers throttle timers in background tabs, so heartbeats can stop and
  // the session may get swept. As soon as the tab is visible again, announce
  // the latest payload so other players see you reappear immediately.
  useEffect(() => {
    const rejoin = () => {
      const data = latestDataRef.current;
      if (data !== null) void updatePresence({ room, sessionId, data });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") rejoin();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      // Best-effort: drop my session right away when leaving the page.
      void leave({ room, sessionId });
    };
  }, [room, sessionId, updatePresence, leave]);

  const publish = useCallback(
    (data: unknown) => {
      latestDataRef.current = data;
      void updatePresence({ room, sessionId, data });
    },
    [room, sessionId, updatePresence],
  );

  return { publish, sessionId };
}

/**
 * Subscribe to everyone else currently in a room (self is filtered out
 * server-side). Re-renders only when the actual data changes.
 */
export function usePresenceOthers<T>(room: string, sessionId: string) {
  const presence = useQuery(api.presence.list, { room, sessionId });
  const json = JSON.stringify(presence ?? []);
  const others = useMemo<PresenceEntry<T>[]>(
    () => JSON.parse(json) as PresenceEntry<T>[],
    [json],
  );
  return { others };
}
