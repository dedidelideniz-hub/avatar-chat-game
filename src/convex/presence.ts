import { v } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";

// DB-backed presence: room -> sessionId -> { data, updatedAt }.
// Rows live in the `presence` table on purpose — an in-memory Map never
// invalidates the `list` query (Convex queries only re-run when the
// documents they read change) and is not shared across server instances,
// so two phones would never see each other. Database rows fix both.

// A session is dropped after going silent this long (a phone backgrounding
// its tab stops heartbeating; 60s gives it time to come back).
const HEARTBEAT_TIMEOUT_MS = 60_000;
const CLEANUP_INTERVAL_MS = 15_000;

// Per-instance flag so we don't queue a cleanup on every single update.
let cleanupScheduled = false;

async function ensureCleanup(ctx: MutationCtx) {
  if (cleanupScheduled) return;
  cleanupScheduled = true;
  await ctx.scheduler.runAfter(CLEANUP_INTERVAL_MS, internal.presence.cleanup);
}

/** Everyone else currently in a room (self is filtered out server-side). */
export const list = query({
  args: { room: v.string(), sessionId: v.string() },
  handler: async (ctx, { room, sessionId }) => {
    const rows = await ctx.db
      .query("presence")
      .withIndex("by_room", (q) => q.eq("room", room))
      .collect();
    const now = Date.now();
    return rows
      .filter(
        (p) =>
          p.sessionId !== sessionId && now - p.updatedAt < HEARTBEAT_TIMEOUT_MS,
      )
      .map((p) => ({ sessionId: p.sessionId, data: p.data }));
  },
});

/** Publish this session's live data (position, avatar, ...). */
export const update = mutation({
  args: { room: v.string(), sessionId: v.string(), data: v.any() },
  handler: async (ctx, { room, sessionId, data }) => {
    const existing = await ctx.db
      .query("presence")
      .withIndex("by_room_session", (q) =>
        q.eq("room", room).eq("sessionId", sessionId),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { data, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("presence", {
        room,
        sessionId,
        data,
        updatedAt: Date.now(),
      });
      await ensureCleanup(ctx);
    }
  },
});

/** Keep the session alive so it isn't cleaned up. */
export const heartbeat = mutation({
  args: { room: v.string(), sessionId: v.string() },
  handler: async (ctx, { room, sessionId }) => {
    const existing = await ctx.db
      .query("presence")
      .withIndex("by_room_session", (q) =>
        q.eq("room", room).eq("sessionId", sessionId),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { updatedAt: Date.now() });
    }
  },
});

/** Best-effort immediate leave (closed tab / navigated away). */
export const leave = mutation({
  args: { room: v.string(), sessionId: v.string() },
  handler: async (ctx, { room, sessionId }) => {
    const existing = await ctx.db
      .query("presence")
      .withIndex("by_room_session", (q) =>
        q.eq("room", room).eq("sessionId", sessionId),
      )
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

/** Sweep sessions that stopped heartbeating (closed tabs, dead phones). */
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    cleanupScheduled = false;
    const threshold = Date.now() - HEARTBEAT_TIMEOUT_MS;
    const stale = await ctx.db
      .query("presence")
      .filter((q) => q.lt(q.field("updatedAt"), threshold))
      .collect();
    for (const row of stale) {
      await ctx.db.delete(row._id);
    }
    const any = await ctx.db.query("presence").first();
    if (any) {
      cleanupScheduled = true;
      await ctx.scheduler.runAfter(
        CLEANUP_INTERVAL_MS,
        internal.presence.cleanup,
      );
    }
  },
});
