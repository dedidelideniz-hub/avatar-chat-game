import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Demo admin credentials — hardcoded for now, exactly as requested
 * (kullanıcı adı: admin, şifre: admin). The same check runs inside every
 * admin query/mutation so the panel cannot be used without the password.
 */
const ADMIN_USER = "admin";
const ADMIN_PASS = "admin";

function isAdmin(user: string, pass: string): boolean {
  return user === ADMIN_USER && pass === ADMIN_PASS;
}

/** A minimal admin session payload sent to every backend call. */
export const adminCredentials = v.object({
  adminUser: v.string(),
  adminPass: v.string(),
});

/**
 * Registered players: every account that created a profile (avatar + wallet).
 * Joined with the auth user so the admin sees the e-mail too.
 */
export const listPlayers = query({
  args: { ...adminCredentials.fields },
  handler: async (ctx, { adminUser, adminPass }) => {
    if (!isAdmin(adminUser, adminPass)) {
      throw new Error("Yetkisiz erişim.");
    }
    const profiles = await ctx.db.query("profiles").collect();
    const users = await ctx.db.query("users").collect();
    const userById = new Map(users.map((u) => [u._id, u]));
    return profiles
      .map((p) => {
        const user = userById.get(p.userId);
        return {
          profileId: p._id,
          username: p.username,
          email: user?.email ?? null,
          isAnonymous: user?.isAnonymous ?? false,
          coins: p.coins ?? 500,
          items: (p.items ?? []).length,
          vip: (p.vipUntil ?? 0) > Date.now(),
          createdAt: p.createdAt,
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

/**
 * Guests: signed-in accounts that have NOT created a profile yet (or signed
 * in anonymously) — they only appear as "Misafir" in the world until they
 * finish avatar creation.
 */
export const listGuests = query({
  args: { ...adminCredentials.fields },
  handler: async (ctx, { adminUser, adminPass }) => {
    if (!isAdmin(adminUser, adminPass)) {
      throw new Error("Yetkisiz erişim.");
    }
    const users = await ctx.db.query("users").collect();
    const profiles = await ctx.db.query("profiles").collect();
    const profileUserIds = new Set(profiles.map((p) => p.userId));
    return users
      .filter((u) => u.isAnonymous || !profileUserIds.has(u._id))
      .map((u) => ({
        userId: u._id,
        email: u.email ?? null,
        isAnonymous: u.isAnonymous ?? false,
        createdAt: u._creationTime,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

/**
 * Credit Sanalika Parası to a player's wallet (admin only). Positive integer
 * between 1 and 1.000.000. Returns the new balance.
 */
export const addCoins = mutation({
  args: {
    ...adminCredentials.fields,
    profileId: v.id("profiles"),
    amount: v.number(),
  },
  handler: async (ctx, { adminUser, adminPass, profileId, amount }) => {
    if (!isAdmin(adminUser, adminPass)) {
      throw new Error("Yetkisiz erişim.");
    }
    if (!Number.isInteger(amount) || amount <= 0 || amount > 1_000_000) {
      throw new Error("Geçersiz miktar — 1 ile 1.000.000 arasında olmalı.");
    }
    const profile = await ctx.db.get(profileId);
    if (profile === null) {
      throw new Error("Oyuncu bulunamadı.");
    }
    const coins = (profile.coins ?? 500) + amount;
    await ctx.db.patch(profileId, {
      coins,
      updatedAt: Date.now(),
    });
    return coins;
  },
});
