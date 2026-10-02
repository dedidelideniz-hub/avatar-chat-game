/**
 * 🛋️ MOBİLYA EKONOMİSİ — stanttan Vaelos Parası (SP) ile alınan eşyalar ve
 * oyuncunun odasındaki yerleşimleri.
 *
 * AKIŞ: oyuncu caddedeki/odadaki MOBİLYA STANDINDAN eşya satın alır (`buy` →
 * SP düşer, satır açılır) ve SAHİP OLDUĞU eşyaları odasına dizer (`place` →
 * oransal konum yazılır) ya da kaldırıp dolabına atar (`lift`). Yani "ne aldım"
 * ile "ne dizdim" AYNI tabloda yaşar: bir satır = BİR ADET eşya.
 *
 * GÜVEN (istemciye güvenilmez):
 *   · FİYAT istemciden gelmez — katalogdan (`engine/roomBuild.FURNITURE`,
 *     sunucuda da aynı dosya okunur) okunur, yani istemci istediği fiyatı
 *     uyduramaz (bkz. `profiles.buyItem` ile aynı desen),
 *   · satır yalnızca SAHİBİ tarafından dizilir/kaldırılır (`row.userId` kontrolü),
 *   · adetler sınırlıdır (`MAX_PER_ITEM`, `MAX_ITEMS`) — oda sınırsız eşyayla
 *     doldurulamaz,
 *   · konum `-1…1` ORANINA kırpılır: oda ölçüsü istemcide ölçülür, sunucu
 *     metre kabul etseydi eşya duvarın dışına yazılabilirdi,
 *   · yasaklı (`banned`) oyuncu alım/dizme yapamaz.
 *
 * BAŞLANGIÇ TAKIMI: odaya ilk girişte az sayıda eşya HEDİYE edilir
 * (`seedStarter`) — oda çıplak başlamasın diye. Hediye eşyalar da GERÇEK
 * satırlardır: taşınabilir, kaldırılabilir, fazladan adedi satın alınabilir.
 * `houses.furnitureSeeded` bayrağı, oyuncu hepsini kaldırsa bile hediyenin her
 * girişte geri gelmemesini sağlar.
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
import { STARTING_COINS } from "../lib/shop";
import { FURNITURE } from "../engine/roomBuild";

/** Aynı eşyadan en fazla kaç adet (odayı aynı koltukla doldurmasın). */
export const MAX_PER_ITEM = 4;
/** Odada+dolapta tutulabilecek toplam eşya sayısı. */
export const MAX_ITEMS = 60;
/** Başlangıç takımında tohumlanabilecek en fazla parça (kötüye kullanım sınırı). */
export const MAX_STARTER = 12;

/** Katalog kimlik → tanım (fiyat buradan okunur, istemciden DEĞİL). */
const CATALOG = new Map(FURNITURE.map((item) => [item.id, item]));

type ReadCtx = QueryCtx | MutationCtx;

/** `-1…1` oranına kırp ve gereksiz uzunluğu at. */
function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(1, Math.max(-1, value)) * 1e4) / 1e4;
}

/** Oturum + profil + yasak kontrolü (alım/dizme için zorunlu kapı). */
async function profileOf(ctx: ReadCtx): Promise<{
  userId: Id<"users">;
  profile: Doc<"profiles">;
}> {
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
  if (profile.banned) {
    throw new Error("Hesabın oyun dışı bırakılmış.");
  }
  return { userId, profile };
}

/** Sunucu satırı → istemcinin beklediği sade biçim (`OwnedFurniture`). */
function toRow(row: Doc<"furniture">) {
  return {
    rowId: row._id,
    itemId: row.itemId,
    fx: row.fx,
    fz: row.fz,
  };
}

async function rowsOf(ctx: ReadCtx, userId: Id<"users">) {
  return ctx.db
    .query("furniture")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
}

/**
 * ODAYI GEZEN / BAKAN için: bir oyuncunun odasındaki eşyalar.
 *
 * Komşunun odasına girildiğinde onun düzeni görünür (sahibi olduğu gibi) ama
 * DEĞİŞTİRİLEMEZ — yazma uçları yalnızca satır sahibine açıktır.
 */
export const byOwnerName = query({
  args: { ownerName: v.string() },
  handler: async (ctx, { ownerName }) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", ownerName))
      .first();
    if (!profile) return [];
    const rows = await rowsOf(ctx, profile.userId);
    return rows.map(toRow);
  },
});

/** Oyuncunun KENDİ eşyaları (dizilmiş + dolapta bekleyen). */
export const myFurniture = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const rows = await rowsOf(ctx, userId);
    return rows.map(toRow);
  },
});

/** Stanttan eşya al — SP düşer, eşya DOLABA eklenir (dizilmemiş). */
export const buy = mutation({
  args: { itemId: v.string() },
  handler: async (ctx, { itemId }) => {
    const def = CATALOG.get(itemId);
    if (!def) {
      throw new Error("Bu eşya stantta yok.");
    }
    const { userId, profile } = await profileOf(ctx);
    const rows = await rowsOf(ctx, userId);
    if (rows.length >= MAX_ITEMS) {
      throw new Error(`En fazla ${MAX_ITEMS} eşya tutabilirsin.`);
    }
    if (rows.filter((row) => row.itemId === itemId).length >= MAX_PER_ITEM) {
      throw new Error(
        `Bir eşyadan en fazla ${MAX_PER_ITEM} adet alabilirsin.`,
      );
    }
    const coins = profile.coins ?? STARTING_COINS;
    if (coins < def.price) {
      throw new Error(
        `Yeterli SP yok — ${def.label} ${def.price} SP. Şu an ${coins} SP'n var.`,
      );
    }
    const now = Date.now();
    const next = coins - def.price;
    await ctx.db.patch(profile._id, { coins: next, updatedAt: now });
    const rowId = await ctx.db.insert("furniture", {
      userId,
      itemId: def.id,
      createdAt: now,
      updatedAt: now,
    });
    return { rowId, coins: next, itemId: def.id };
  },
});

/** Eşyayı odada bir noktaya koy (oransal konum — KALICI). */
export const place = mutation({
  args: {
    rowId: v.id("furniture"),
    fx: v.number(),
    fz: v.number(),
  },
  handler: async (ctx, { rowId, fx, fz }) => {
    const { userId } = await profileOf(ctx);
    const row = await ctx.db.get(rowId);
    if (!row || row.userId !== userId) {
      throw new Error("Bu eşya sende değil.");
    }
    await ctx.db.patch(rowId, {
      fx: clampRatio(fx),
      fz: clampRatio(fz),
      updatedAt: Date.now(),
    });
  },
});

/** Eşyayı odadan kaldır — dolaba döner (satın alma geçmişi silinmez). */
export const lift = mutation({
  args: { rowId: v.id("furniture") },
  handler: async (ctx, { rowId }) => {
    const { userId } = await profileOf(ctx);
    const row = await ctx.db.get(rowId);
    if (!row || row.userId !== userId) {
      throw new Error("Bu eşya sende değil.");
    }
    await ctx.db.patch(rowId, {
      fx: undefined,
      fz: undefined,
      updatedAt: Date.now(),
    });
  },
});

/**
 * BAŞLANGIÇ TAKIMINI VER (oda ilk açıldığında, bir kez).
 *
 * Konumlar İSTEMCİDEN gelir çünkü oransaldır ve oda ölçüsü istemcide ölçülür;
 * sunucu yalnızca KİMLİKLERİ katalogla, ADEDİ sınırla doğrular ve `house`
 * kaydına "verildi" işaretini koyar (ikinci çağrı hiçbir şey yapmaz).
 */
export const seedStarter = mutation({
  args: {
    items: v.array(
      v.object({
        itemId: v.string(),
        fx: v.number(),
        fz: v.number(),
      }),
    ),
  },
  handler: async (ctx, { items }) => {
    const { userId } = await profileOf(ctx);
    const house = await ctx.db
      .query("houses")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (house === null) {
      // Oda henüz açılmamış: hediye, oda açıldığında verilir.
      return { seeded: false };
    }
    if (house.furnitureSeeded) return { seeded: false };

    const now = Date.now();
    let inserted = 0;
    for (const item of items.slice(0, MAX_STARTER)) {
      const def = CATALOG.get(item.itemId);
      if (!def) continue; // katalogda olmayan kimlik sessizce atlanır
      await ctx.db.insert("furniture", {
        userId,
        itemId: def.id,
        fx: clampRatio(item.fx),
        fz: clampRatio(item.fz),
        createdAt: now,
        updatedAt: now,
      });
      inserted += 1;
    }
    await ctx.db.patch(house._id, { furnitureSeeded: true, updatedAt: now });
    return { seeded: true, inserted };
  },
});
