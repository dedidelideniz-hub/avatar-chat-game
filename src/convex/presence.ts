import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";

// In-memory presence: room -> sessionId -> { data, updatedAt }.
// Live presence is ephemeral on purpose — a server restart simply drops
// everyone's cursor, and the client re-publishes on the next heartbeat.
const presence = new Map<
  string,
  Map<string, { data: unknown; updatedAt: number }>
>();
const presenceSessions = new Map<string, number>(); // sessionId -> last seen

// A session is dropped after going silent this long (a phone backgrounding
// its tab stops heartbeating; 60s gives it time to come back).
const HEARTBEAT_TIMEOUT_MS = 60_000;
const CLEANUP_INTERVAL_MS = 15_000;

/** Everyone else currently in a room (self is filtered out server-side). */
export const list = query({
  args: { room: v.string(), sessionId: v.string() },
  handler: async (_ctx, { room, sessionId }) => {
    const roomMap = presence.get(room);
    if (roomMap === undefined) {
      return [];
    }
    const ret: { sessionId: string; data: unknown }[] = [];
    for (const [sid, p] of roomMap) {
      if (sid !== sessionId) {
        ret.push({ sessionId: sid, data: p.data });
      }
    }
    return ret;
  },
});

/** Publish this session's live data (position, avatar, ...). */
export const update = mutation({
  args: { room: v.string(), sessionId: v.string(), data: v.any() },
  handler: async (ctx, { room, sessionId, data }) => {
    let roomMap = presence.get(room);
    if (roomMap === undefined) {
      roomMap = new Map();
      presence.set(room, roomMap);
    }
    roomMap.set(sessionId, { data, updatedAt: Date.now() });
    presenceSessions.set(sessionId, Date.now());
    // Start the janitor the first time a session appears.
    if (presenceSessions.size === 1) {
      await ctx.scheduler.runAfter(CLEANUP_INTERVAL_MS, internal.presence.cleanup);
    }
  },
});

/** Keep the session alive so it isn't cleaned up. */
export const heartbeat = mutation({
  args: { room: v.string(), sessionId: v.string() },
  handler: async (_ctx, { room, sessionId }) => {
    const roomMap = presence.get(room);
    if (roomMap !== undefined && roomMap.has(sessionId)) {
      presenceSessions.set(sessionId, Date.now());
    }
  },
});

/** Drop sessions that stopped heartbeating (closed tabs, dead phones). */
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const threshold = now - HEARTBEAT_TIMEOUT_MS;
    for (const [sessionId, lastSeen] of presenceSessions) {
      if (lastSeen < threshold) {
        presenceSessions.delete(sessionId);
        for (const roomMap of presence.values()) {
          roomMap.delete(sessionId);
        }
      }
    }
    if (presenceSessions.size > 0) {
      await ctx.scheduler.runAfter(CLEANUP_INTERVAL_MS, internal.presence.cleanup);
    }
  },
});
