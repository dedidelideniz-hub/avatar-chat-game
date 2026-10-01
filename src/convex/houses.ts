/**
 * 🏠 OYUNCU EVLERİ — her oyuncunun KENDİ odası, otomatik açılır.
 *
 * TASARIM: caddede TEK bir ev/konak vardır (cadı dükkânı modeli). Evi kurmak,
 * arsa seçmek, haritada yer kapmak YOKTUR — oyuncu evin kapısına geldiğinde
 * "Evine gir" seçeneği çıkar; girdiğinde sunucu o oyuncunun odasını OTOMATİK
 * açar (kayıt yoksa ilk girişte oluşturulur). Kapı herkes için aynı, oda herkes
 * için ayrıdır: odanın adı, giriş sayısı ve ziyaretçi defteri oyuncuya özeldir.
 *
 * Kayıt sunucuda tutulur, yani odalar ONLINEdır: komşu bir oyuncunun odasına
 * girdiğinde adın onun defterine yazılır (`visit`) ve o da bunu görür.
 *
 * SINIRLAR (istemciye güvenilmez):
 *   · oyuncu başına TEK oda,
 *   · oda adı 1…`NAME_MAX` karakter (boşsa varsayılan `"<oyuncu> Odası"`),
 *   · ziyaretçi defteri en çok `MAX_VISITORS` ad tutar (en yeni başta).
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

/** Defterde tutulan son ziyaretçi sayısı. */
export const MAX_VISITORS = 8;
/** Oda adı en fazla bu kadar karakter. */
export const NAME_MAX = 24;

/** Okuma gerektiren yardımcılar hem sorguda hem mutation'da çalışır. */
type ReadCtx = QueryCtx | MutationCtx;

function normalizeName(raw: string | undefined, ownerName: string): string {
  const name = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!name) return `${ownerName} Odası`;
  return name.slice(0, NAME_MAX);
}

/** `profiles` kaydından oyuncunun görünen adını okur. */
async function usernameOf(ctx: ReadCtx, userId: Id<"users">): Promise<string> {
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
  return profile?.username ?? "Oyuncu";
}

async function houseOfUser(ctx: ReadCtx, userId: Id<"users">) {
  return ctx.db
    .query("houses")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
}

function toView(house: Doc<"houses">, userId: Id<"users"> | null) {
  return {
    ownerName: house.ownerName,
    name: house.name,
    visits: house.visits,
    visitors: house.visitors,
    isMine: userId !== null && house.userId === userId,
  };
}

/** Benim odam (henüz hiç girmemişsem `null` — kayıt ilk girişte açılır). */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const house = await houseOfUser(ctx, userId);
    return house ? toView(house, userId) : null;
  },
});

/** Bir oyuncunun odası (komşuyu ziyaret etmek için) — yoksa `null`. */
export const view = query({
  args: { ownerName: v.string() },
  handler: async (ctx, { ownerName }) => {
    const userId = await getAuthUserId(ctx);
    const house = await ctx.db
      .query("houses")
      .withIndex("by_ownerName", (q) => q.eq("ownerName", ownerName))
      .first();
    return house ? toView(house, userId) : null;
  },
});

/**
 * EVİNE GİR — odamı açar. Kayıt yoksa OTOMATİK oluşturulur (arsa/kurulum yok),
 * her giriş giriş sayacını artırır. Dönen değer, odayı çizecek veridir.
 */
export const enter = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Oturum açman gerekiyor.");
    const ownerName = await usernameOf(ctx, userId);
    const now = Date.now();
    const existing = await houseOfUser(ctx, userId);

    if (existing === null) {
      await ctx.db.insert("houses", {
        userId,
        ownerName,
        name: normalizeName(undefined, ownerName),
        visits: 1,
        visitors: [],
        createdAt: now,
        updatedAt: now,
      });
    } else {
      // Ad, oyuncunun profiliyle aynı kalsın (kullanıcı adı değişmişse).
      await ctx.db.patch(existing._id, {
        ownerName,
        visits: existing.visits + 1,
        updatedAt: now,
      });
    }

    const house = await houseOfUser(ctx, userId);
    return house ? toView(house, userId) : null;
  },
});

/** Odanın adını değiştir. */
export const rename = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Oturum açman gerekiyor.");
    const house = await houseOfUser(ctx, userId);
    if (house === null) throw new Error("Önce evine gir.");
    await ctx.db.patch(house._id, {
      name: normalizeName(name, house.ownerName),
      updatedAt: Date.now(),
    });
    const saved = await houseOfUser(ctx, userId);
    return saved ? toView(saved, userId) : null;
  },
});

/**
 * Komşunun odasına gir: adın onun ziyaretçi defterine yazılır (en yeni başta,
 * tekrar eden ad başa alınır) ve giriş sayısı artar. Kendi odanı ziyaret
 * saymaz.
 */
export const visit = mutation({
  args: { ownerName: v.string() },
  handler: async (ctx, { ownerName }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Oturum açman gerekiyor.");
    const house = await ctx.db
      .query("houses")
      .withIndex("by_ownerName", (q) => q.eq("ownerName", ownerName))
      .first();
    if (house === null) throw new Error("Bu oyuncunun evi yok.");
    if (house.userId === userId) return toView(house, userId);

    const guest = await usernameOf(ctx, userId);
    const visitors = [guest, ...house.visitors.filter((n) => n !== guest)].slice(
      0,
      MAX_VISITORS,
    );
    await ctx.db.patch(house._id, {
      visits: house.visits + 1,
      visitors,
      updatedAt: Date.now(),
    });
    const saved = await ctx.db
      .query("houses")
      .withIndex("by_ownerName", (q) => q.eq("ownerName", ownerName))
      .first();
    return saved ? toView(saved, userId) : null;
  },
});
