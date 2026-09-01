import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  ABILITIES,
  BUBBLE_COLORS,
  DAILY_BONUS,
  DAILY_BONUS_MS,
  DEFAULT_ABILITY,
  DEFAULT_BUBBLE_COLOR,
  STARTING_COINS,
  VIP_DURATION_MS,
  VIP_PRICE,
  WEAR_SLOT_CAPACITY,
  abilityOf,
  getProduct,
  isAbilityId,
  type WearSlot,
} from "../lib/shop";

export const avatarValidator = v.object({
  skin: v.string(),
  hair: v.string(),
  hairColor: v.string(),
  shirt: v.string(),
  pants: v.string(),
  shoes: v.string(),
});

/** Older profiles predate the wallet/equipped fields; fill sensible defaults. */
export const MAX_LEVEL = 10;
export const WINS_PER_LEVEL = 100;

/** Level 1 starts at zero wins; each next level requires another 100 wins. */
export function levelFromWins(wins: number): number {
  return Math.min(MAX_LEVEL, Math.floor(Math.max(0, wins) / WINS_PER_LEVEL) + 1);
}

function withWallet(profile: Doc<"profiles">) {
  return {
    ...profile,
    battleWins: profile.battleWins ?? 0,
    level: levelFromWins(profile.battleWins ?? 0),
    coins: profile.coins ?? STARTING_COINS,
    items: profile.items ?? [],
    equipped: profile.equipped ?? [],
    bubbleColor: profile.bubbleColor ?? DEFAULT_BUBBLE_COLOR,
    abilities: profile.abilities ?? [DEFAULT_ABILITY],
    equippedAbility: profile.equippedAbility ?? DEFAULT_ABILITY,
    // VIP is a time-boxed membership — derive the live flag at read time.
    vip: (profile.vipUntil ?? 0) > Date.now(),
  };
}

/** Banned players are locked out of the game — enforced server-side too. */
function assertNotBanned(profile: Doc<"profiles">) {
  if (profile.banned) {
    throw new Error(
      "Hesabın oyundan yasaklandı. Detay için yöneticiye başvurabilirsin.",
    );
  }
}

/**
 * The current user's profile (username + avatar + wallet). Returns null if
 * the user has not created one yet.
 */
export const getMyProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    return profile === null ? null : withWallet(profile);
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
    return withWallet(profile);
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
      // Suggest a unique variant with a random number suffix.
      const suffix = Math.floor(100 + Math.random() * 900);
      throw new Error(
        `"${trimmed}" zaten alınmış. Fikir: "${trimmed}${suffix}" deneyebilirsin!`,
      );
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (existing !== null) {
      assertNotBanned(existing);
      await ctx.db.patch(existing._id, {
        username: trimmed,
        avatar,
        updatedAt: now,
      });    return { _id: existing._id, userId, username: trimmed, avatar, createdAt: existing.createdAt, updatedAt: now };
  }

    const id = await ctx.db.insert("profiles", {
      userId,
      username: trimmed,
      avatar,
      coins: STARTING_COINS,
      items: [],
      equipped: [],
      abilities: [DEFAULT_ABILITY],
      equippedAbility: DEFAULT_ABILITY,
      createdAt: now,
      updatedAt: now,
    });
    return { _id: id, userId, username: trimmed, avatar, coins: STARTING_COINS, items: [], equipped: [], abilities: [DEFAULT_ABILITY], equippedAbility: DEFAULT_ABILITY, createdAt: now, updatedAt: now };
  },
});

/**
 * Buy a product from a street vendor. Deducts Sanalika Parası and adds the
 * item to the player's bag (each product can be owned once).
 */
export const buyItem = mutation({
  args: { productId: v.string() },
  handler: async (ctx, { productId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Oturum açman gerekiyor.");
    }
    const product = getProduct(productId);
    if (product === undefined) {
      throw new Error("Bu ürün caddede yok.");
    }
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (profile === null) {
      throw new Error("Önce karakterini oluştur.");
    }
    assertNotBanned(profile);
    const coins = profile.coins ?? STARTING_COINS;
    const items = profile.items ?? [];
    if (items.includes(productId)) {
      throw new Error("Bu ürün zaten çantanda!");
    }
    if (coins < product.price) {
      throw new Error(
        `Yeterli Sanalika Paran yok — ${product.price} SP gerekiyor.`,
      );
    }
    await ctx.db.patch(profile._id, {
      coins: coins - product.price,
      items: [...items, productId],
      updatedAt: Date.now(),
    });
    return withWallet({
      ...profile,
      coins: coins - product.price,
      items: [...items, productId],
    });
  },
});

/**
 * Wear or take off an owned product. Equipping respects per-slot capacity
 * (e.g. one hat, up to two hand-held items): a new item replaces older ones
 * in the same slot. Returns the new equipped list.
 */
export const setEquipped = mutation({
  args: {
    productId: v.string(),
    equip: v.boolean(),
  },
  handler: async (ctx, { productId, equip }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Oturum açman gerekiyor.");
    }
    const product = getProduct(productId);
    if (product === undefined) {
      throw new Error("Bu ürün caddede yok.");
    }
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (profile === null) {
      throw new Error("Önce karakterini oluştur.");
    }
    assertNotBanned(profile);
    const items = profile.items ?? [];
    if (!items.includes(productId)) {
      throw new Error("Bu ürün çantanda yok — önce satın al.");
    }

    const equipped = profile.equipped ?? [];
    if (!equip) {
      const next = equipped.filter((id) => id !== productId);
      await ctx.db.patch(profile._id, {
        equipped: next,
        updatedAt: Date.now(),
      });
      return next;
    }

    const slot = product.slot as WearSlot;
    const capacity = WEAR_SLOT_CAPACITY[slot];
    const others = equipped.filter((id) => getProduct(id)?.slot !== slot);
    const sameSlot = equipped.filter((id) => getProduct(id)?.slot === slot);
    const next = [...others, ...sameSlot.slice(-(capacity - 1)), productId];
    await ctx.db.patch(profile._id, {
      equipped: next,
      updatedAt: Date.now(),
    });
    return next;
  },
});

/**
 * Switch the speech-bubble color. The default color is free for everyone;
 * colored bubbles require an active VIP membership.
 */
export const setBubbleColor = mutation({
  args: { colorId: v.string() },
  handler: async (ctx, { colorId }) => {
    const color = BUBBLE_COLORS.find((c) => c.id === colorId);
    if (color === undefined) {
      throw new Error("Bu balon rengi yok.");
    }
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Oturum açman gerekiyor.");
    }
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (profile === null) {
      throw new Error("Önce karakterini oluştur.");
    }
    assertNotBanned(profile);
    if (color.vip && (profile.vipUntil ?? 0) <= Date.now()) {
      throw new Error(
        "Bu renk VIP üyeliğe özel. VIP üyeliği satın almak için caddedeki Kraliyet VIP Köşesi'ne uğra.",
      );
    }
    await ctx.db.patch(profile._id, {
      bubbleColor: colorId,
      updatedAt: Date.now(),
    });
    return colorId;
  },
});

/**
 * Buy VIP membership at the VIP stand. Grants every bubble color + the VIP
 * crown badge for VIP_DURATION_MS (30 days); renewing extends the timer.
 */
export const buyVip = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Oturum açman gerekiyor.");
    }
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (profile === null) {
      throw new Error("Önce karakterini oluştur.");
    }
    assertNotBanned(profile);
    const coins = profile.coins ?? STARTING_COINS;
    if (coins < VIP_PRICE) {
      throw new Error(
        `VIP üyelik ${VIP_PRICE} SP. Şu an ${coins} SP'n var — hediye kutusu ve tezgâhlardan toplamaya devam et.`,
      );
    }
    const now = Date.now();
    const base = Math.max(profile.vipUntil ?? 0, now);
    const vipUntil = base + VIP_DURATION_MS;
    await ctx.db.patch(profile._id, {
      coins: coins - VIP_PRICE,
      vipUntil,
      updatedAt: now,
    });
    return withWallet({
      ...profile,
      coins: coins - VIP_PRICE,
      vipUntil,
    });
  },
});

/**
 * Claim the daily gift box on the street. Grants DAILY_BONUS coins, once per
 * 24 hours.
 */
export const claimDailyBonus = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Oturum açman gerekiyor.");
    }
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (profile === null) {
      throw new Error("Önce karakterini oluştur.");
    }
    assertNotBanned(profile);
    const last = profile.lastDailyClaim ?? 0;
    if (Date.now() - last < DAILY_BONUS_MS) {
      throw new Error("Bugünkü hediye kutusu çoktan toplandı. Yarın tekrar uğra!");
    }
    const coins = (profile.coins ?? STARTING_COINS) + DAILY_BONUS;
    await ctx.db.patch(profile._id, {
      coins,
      lastDailyClaim: Date.now(),
      updatedAt: Date.now(),
    });
    return coins;
  },
});

/** Buy a battle super from the ability shop (banned players are blocked). */
export const buyAbility = mutation({
  args: { abilityId: v.string() },
  handler: async (ctx, { abilityId }) => {
    if (!isAbilityId(abilityId)) {
      throw new Error("Bu yetenek mağazada yok.");
    }
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Oturum açman gerekiyor.");
    }
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (profile === null) {
      throw new Error("Önce karakterini oluştur.");
    }
    assertNotBanned(profile);
    const owned = profile.abilities ?? [DEFAULT_ABILITY];
    if (owned.includes(abilityId)) {
      throw new Error("Bu yetenek zaten sende.");
    }
    const ability = abilityOf(abilityId);
    const coins = profile.coins ?? STARTING_COINS;
    if (coins < ability.price) {
      throw new Error(
        `Yeterli Sanalika Paran yok — ${ability.price} SP gerekiyor.`,
      );
    }
    await ctx.db.patch(profile._id, {
      coins: coins - ability.price,
      abilities: [...owned, abilityId],
      equippedAbility: abilityId,
      updatedAt: Date.now(),
    });
    return { coins: coins - ability.price, equippedAbility: abilityId };
  },
});

/** Equip an owned battle super (no cost). */
export const equipAbility = mutation({
  args: { abilityId: v.string() },
  handler: async (ctx, { abilityId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Oturum açman gerekiyor.");
    }
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (profile === null) {
      throw new Error("Önce karakterini oluştur.");
    }
    assertNotBanned(profile);
    const owned = profile.abilities ?? [DEFAULT_ABILITY];
    if (!owned.includes(abilityId)) {
      throw new Error("Önce bu yeteneği satın al.");
    }
    await ctx.db.patch(profile._id, {
      equippedAbility: abilityId,
      updatedAt: Date.now(),
    });
    return abilityId;
  },
});

/** Reward for winning a street duel — +150 SP to the winner's wallet. */
export const battleVictory = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Oturum açman gerekiyor.");
    }
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (profile === null) {
      throw new Error("Önce karakterini oluştur.");
    }
    assertNotBanned(profile);
    const coins = (profile.coins ?? STARTING_COINS) + DAILY_BONUS;
    const battleWins = (profile.battleWins ?? 0) + 1;
    await ctx.db.patch(profile._id, {
      coins,
      battleWins,
      updatedAt: Date.now(),
    });
    return { coins, battleWins, level: levelFromWins(battleWins) };
  },
});
