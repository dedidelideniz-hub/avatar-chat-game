import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Public street chat — append-only messages broadcast to everyone in a room.
 * Every phone subscribes to `list` and appends new messages in real time, so
 * the Sanalika street feels genuinely online: what one player types shows up
 * on every other phone within a moment.
 *
 * Rooms are plain strings (\"world\" today; a future per-location room is just
 * another string). Messages are capped server-side (only the latest 50 are
 * returned) and a light per-user cooldown stops spam.
 */

const MAX_TEXT = 120;
const HISTORY = 50;
/** One message per user per interval — enough for chat, too fast for spam. */
const COOLDOWN_MS = 600;

/** Latest messages in a room (oldest first). Reactive: new sends re-run it. */
export const list = query({
  args: { room: v.string() },
  handler: async (ctx, { room }) => {
    const rows = await ctx.db
      .query("chat")
      .withIndex("by_room_time", (q) => q.eq("room", room))
      .order("desc")
      .take(HISTORY);
    return rows.reverse();
  },
});

/** Post a message to a room as the signed-in user. Returns the saved row. */
export const send = mutation({
  args: { room: v.string(), text: v.string() },
  handler: async (ctx, { room, text }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Oturum açman gerekiyor.");
    }
    const trimmed = text.trim().slice(0, MAX_TEXT);
    if (!trimmed) {
      throw new Error("Boş mesaj gönderilemez.");
    }
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (profile === null) {
      throw new Error("Önce karakterini oluştur.");
    }
    if (profile.banned) {
      throw new Error(
        "Hesabın oyundan yasaklandı. Detay için yöneticiye başvurabilirsin.",
      );
    }

    // Cooldown: reuse my last message if I sent it moments ago.
    const mine = await ctx.db
      .query("chat")
      .withIndex("by_sender", (q) => q.eq("senderId", userId))
      .order("desc")
      .first();
    if (mine && Date.now() - mine.createdAt < COOLDOWN_MS) {
      throw new Error("Çok hızlı yazıyorsun — bir nefes al! 😄");
    }

    const now = Date.now();
    const id = await ctx.db.insert("chat", {
      room,
      senderId: userId,
      senderName: profile.username,
      text: trimmed,
      color: profile.bubbleColor,
      createdAt: now,
    });
    return {
      _id: id,
      room,
      senderId: userId,
      senderName: profile.username,
      text: trimmed,
      color: profile.bubbleColor,
      createdAt: now,
    };
  },
});
