import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const avatarValidator = v.object({
  skin: v.string(),
  hair: v.string(),
  hairColor: v.string(),
  shirt: v.string(),
  pants: v.string(),
  shoes: v.string(),
});

/**
 * The current user's profile (username + avatar). Returns null if the user
 * has not created one yet.
 */
export const getMyProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }
    return await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
  },
});

/**
 * A profile by username, used later for public profile pages / friend lists.
 */
export const getByUsername = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username.trim()))
      .first();
    if (profile === null) {
      return null;
    }
    return profile;
  },
});

const USERNAME_RE = /^[\p{L}\p{N}_ ]{2,20}$/u;

/**
 * Create or update the current user's profile. Usernames are unique
 * (case-insensitive). Returns the saved profile.
 */
export const saveProfile = mutation({
  args: {
    username: v.string(),
    avatar: avatarValidator,
  },
  handler: async (ctx, { username, avatar }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Oturum açman gerekiyor.");
    }

    const trimmed = username.trim();
    if (!USERNAME_RE.test(trimmed)) {
      throw new Error(
        "Kullanıcı adı 2-20 karakter olmalı ve yalnızca harf, rakam, alt çizgi ve boşluk içerebilir.",
      );
    }

    const lower = trimmed.toLowerCase();
    const candidates = await ctx.db.query("profiles").collect();
    const taken = candidates.some(
      (p) => p.userId !== userId && p.username.toLowerCase() === lower,
    );
    if (taken) {
      throw new Error("Bu kullanıcı adı zaten alınmış. Başka bir tane dene.");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        username: trimmed,
        avatar,
        updatedAt: now,
      });
      return { _id: existing._id, userId, username: trimmed, avatar, createdAt: existing.createdAt, updatedAt: now };
    }

    const id = await ctx.db.insert("profiles", {
      userId,
      username: trimmed,
      avatar,
      createdAt: now,
      updatedAt: now,
    });
    return { _id: id, userId, username: trimmed, avatar, createdAt: now, updatedAt: now };
  },
});
