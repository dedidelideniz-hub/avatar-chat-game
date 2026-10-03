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
// `Id` tipi `roomIdFor` ve `byRoom` içinde kullanılır.
import type { Doc, Id } from "./_generated/dataModel";

/** Defterde tutulan son ziyaretçi sayısı. */
export const MAX_VISITORS = 8;
/**
 * BİR KARAKTER EN FAZLA BU KADAR EVE SAHİP OLABİLİR.
 *
 * Oda zaten ilk girişte otomatik açılır ve `houseOfUser` tek satır (`first`)
 * okur; asıl kural ihlali riski bahisli düellodaki EV DEVRİYDİ. Sunucu artık
 * bunu hem `wagers.finish` (kazananın başka evi varsa devretmez) hem de burada
 * (fazladan satır kalırsa temizler) zorlar.
 */
export const MAX_HOUSES_PER_USER = 1;
/** Oda adı en fazla bu kadar karakter. */
export const NAME_MAX = 24;

/** Oda örneği kimliklerinin ön eki (`room_ab12…`). */
export const ROOM_ID_PREFIX = "room_";

/**
 * Bir ev satırının ODA ÖRNEĞİ KİMLİĞİ.
 *
 * Kimlik satırın `_id`inden türetilir: sunucu üretir (istemci uyduramaz),
 * benzersizdir ve bir odayı ADIYLA değil KİMLİĞİYLE çağırmanı sağlar (aynı oda
 * adını iki oyuncu seçebilir). Alan eklenmeden açılmış satırlarda da AYNI değer
 * türetilir, yani okuma tarafı hiçbir zaman boş kimlik görmez.
 */
export function roomIdFor(rowId: Id<"houses"> | string): string {
  return `${ROOM_ID_PREFIX}${rowId}`;
}

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
    /** Oda örneği kimliği — istemci bunu odayı "çağırmak" için kullanır. */
    roomId: house.roomId ?? roomIdFor(house._id),
    ownerName: house.ownerName,
    name: house.name,
    visits: house.visits,
    visitors: house.visitors,
    isMine: userId !== null && house.userId === userId,
  };
}

/** Kimliği eksik (eski) satıra kalıcı kimliğini yazar ve satırı döner. */
async function ensureRoomId(ctx: MutationCtx, house: Doc<"houses">) {
  if (house.roomId) return house;
  await ctx.db.patch(house._id, { roomId: roomIdFor(house._id) });
  const fresh = await ctx.db.get(house._id);
  return fresh ?? house;
}

/** Benim odam (henüz hiç girmemişsem `null` — kayıt ilk girişte açılır). */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const house = await houseOfUser(ctx, userId);
    // Sorgu YAZMAZ: kimlik yazılmamışsa `toView` türetilmiş değeri döner.
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
 * ODAYI ÖRNEK KİMLİĞİYLE çağır — `room_…`.
 *
 * Kimlik sabittir ve paylaşılabilir (ör. ileride "odaya katıl" bağlantısı).
 * Kimliği henüz yazılmamış eski odalar için türetilmiş değer taranır.
 */
export const byRoom = query({
  args: { roomId: v.string() },
  handler: async (ctx, { roomId }) => {
    const userId = await getAuthUserId(ctx);
    const house = await ctx.db
      .query("houses")
      .withIndex("by_roomId", (q) => q.eq("roomId", roomId))
      .first();
    if (house) return toView(house, userId);
    // Kimlik yazılmadan ÖNCE açılmış oda: satırı doğrudan çöz.
    if (!roomId.startsWith(ROOM_ID_PREFIX)) return null;
    const rowId = roomId.slice(ROOM_ID_PREFIX.length);
    const legacy = await ctx.db.get(rowId as Id<"houses">).catch(() => null);
    return legacy ? toView(legacy, userId) : null;
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

    // TEK EV KURALI (istemciye güvenilmez): bir karakter en fazla BİR eve sahip
    // olabilir. Normalde `houseOfUser` tek satır okur; yine de eski/bozuk veride
    // birden çok satır kalırsa EN ESKİSİ tutulur, fazlalıklar silinir (mobilya
    // satırları `userId`yle tutulduğu için kaybolmaz).
    const owned = await ctx.db
      .query("houses")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    let existing = owned[0] ?? null;
    if (owned.length > MAX_HOUSES_PER_USER) {
      const sorted = [...owned].sort((a, b) => a.createdAt - b.createdAt);
      existing = sorted[0];
      for (const extra of sorted.slice(MAX_HOUSES_PER_USER)) {
        await ctx.db.delete(extra._id);
      }
    }

    if (existing === null) {
      // 1) Satır açılır, 2) kimlik satır `_id`inden türetilip yazılır: oda
      //    böylece DB'de KİMLİKLİ bir ÖRNEK olur (`room_…`).
      const rowId = await ctx.db.insert("houses", {
        userId,
        ownerName,
        name: normalizeName(undefined, ownerName),
        visits: 1,
        visitors: [],
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(rowId, { roomId: roomIdFor(rowId) });
    } else {
      // Ad, oyuncunun profiliyle aynı kalsın (kullanıcı adı değişmişse) ve
      // eski odalarda eksik kalan örnek kimliği kalıcı olarak yazılsın.
      await ctx.db.patch(existing._id, {
        ownerName,
        roomId: existing.roomId ?? roomIdFor(existing._id),
        visits: existing.visits + 1,
        updatedAt: now,
      });
    }

    const house = await houseOfUser(ctx, userId);
    return house ? toView(await ensureRoomId(ctx, house), userId) : null;
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
      // Eski odada eksik kalan örnek kimliği de kalıcı olarak yazılır.
      roomId: house.roomId ?? roomIdFor(house._id),
      updatedAt: Date.now(),
    });
    const saved = await houseOfUser(ctx, userId);
    return saved ? toView(await ensureRoomId(ctx, saved), userId) : null;
  },
});

/**
 * Komşunun odasına gir: adın onun ziyaretçi defterine yazılır (en yeni başta,
 * tekrar eden ad başa alınır) ve giriş sayısı artar. Kendi odanı ziyaret
 * saymaz.
 *
 * Oda `ownerName` VEYA örnek kimliğiyle (`roomId`) çağrılabilir; kimlik
 * verilirse aynı adı taşıyan iki oyuncu karışmaz (asıl örnek çağrısı budur).
 */
export const visit = mutation({
  args: { ownerName: v.string(), roomId: v.optional(v.string()) },
  handler: async (ctx, { ownerName, roomId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Oturum açman gerekiyor.");
    // Örnek kimliği verildiyse ODOĞRUDAN o oda: aynı adı taşıyan iki oyuncunun
    // odası birbirine karışmaz.
    const house =
      roomId !== undefined
        ? await ctx.db
            .query("houses")
            .withIndex("by_roomId", (q) => q.eq("roomId", roomId))
            .first()
        : await ctx.db
            .query("houses")
            .withIndex("by_ownerName", (q) => q.eq("ownerName", ownerName))
            .first();
    if (house === null) throw new Error("Bu oyuncunun evi yok.");
    if (house.userId === userId) {
      return toView(await ensureRoomId(ctx, house), userId);
    }

    const guest = await usernameOf(ctx, userId);
    const visitors = [guest, ...house.visitors.filter((n) => n !== guest)].slice(
      0,
      MAX_VISITORS,
    );
    await ctx.db.patch(house._id, {
      visits: house.visits + 1,
      visitors,
      roomId: house.roomId ?? roomIdFor(house._id),
      updatedAt: Date.now(),
    });
    const saved = await ctx.db.get(house._id);
    return saved ? toView(saved, userId) : null;
  },
});
