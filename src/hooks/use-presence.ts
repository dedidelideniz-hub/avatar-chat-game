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

  useEffect(() => {
    const timer = window.setInterval(() => {
      void heartbeat({ room, sessionId });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [room, sessionId, heartbeat]);

  const publish = useCallback(
    (data: unknown) => {
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
