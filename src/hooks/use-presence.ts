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
      // Heartbeat carries the last payload: if the row was swept (e.g. while
      // the tab was backgrounded) the server re-announces it instead of
      // silently no-op'ing, so the player reappears on every other phone.
      void heartbeat({ room, sessionId, data: latestDataRef.current ?? undefined });
    }, 4000);
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
    // Drop the session only when the tab is really going away. NOT on React
    // unmount: in dev StrictMode mounts -> unmounts -> remounts, and a queued
    // `leave` can land after the remount's publish and delete the fresh row,
    // making the player invisible to everyone until the next publish.
    const onPageHide = () => void leave({ room, sessionId });
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pagehide", onPageHide);
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
