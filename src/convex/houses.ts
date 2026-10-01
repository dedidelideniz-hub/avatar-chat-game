/**
 * 🏠 OYUNCU EVLERİ — her oyuncunun caddede kendi evi.
 *
 * TASARIM: ev, kilitli bir oda değil CADDE ÜZERİNDEKİ bir arsadır
 * (`constants.BUILDINGS` gözü). Oyuncu bir arsaya evini kurar; ev 3D katmanda
 * sahibinin adının yazdığı modelle çizilir (bkz. `engine/GameEngine3D.tsx` →
 * `houseBuildings`). Kayıt sunucuda olduğu için evler ONLINE: `list` reaktif
 * bir sorgudur, bir oyuncu ev kurduğunda/değiştirdiğinde herkesin caddesi
 * kendiliğinden güncellenir. Ziyaretler de sunucuda birikir; böylece
 * "kim evime geldi" listesi herkese açıktır (oyun içi sosyal döngü).
 *
 * SINIRLAR (istemciye güvenilmez, hepsi burada doğrulanır):
 *   · oyuncu başına TEK ev,
 *   · yalnızca cadde sırasındaki arsalar (`HOUSE_PLOTS`),
 *   · arsa başkasınınsa yazma reddedilir,
 *   · ad 1…`NAME_MAX` karakter (boşsa varsayılan `"<oyuncu> Ev"`).
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
import { HOUSE_PLOTS } from "../engine/constants";

/** Okuma gerektiren yardımcılar hem sorguda hem mutation'da çalışır. */
type ReadCtx = QueryCtx | MutationCtx;

/** Kapıda/panelde gösterilen son ziyaretçi sayısı. */
export const MAX_VISITORS = 8;
/** Ev adı en fazla bu kadar karakter. */
export const NAME_MAX = 24;

function normalizeName(raw: string | undefined, ownerName: string): string {
  const name = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!name) return `${ownerName} Ev`;
  return name.slice(0, NAME_MAX);
}

function assertPlottable(plotIndex: number): void {
  if (!HOUSE_PLOTS.includes(plotIndex)) {
    throw new Error("Bu arsaya ev kurulamaz.");
  }
}

/** `profiles` kaydından oyuncunun görünen adını okur. */
async function usernameOf(
  ctx: ReadCtx,
  userId: Id<"users">,
): Promise<string> {
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
  return profile?.username ?? "Oyuncu";
}

/** Oyuncunun evi (yoksa `null`). */
async function houseOfUser(ctx: ReadCtx, userId: Id<"users">) {
  return ctx.db
    .query("houses")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
}

/** Bir arsadaki ev (yoksa `null`). */
async function houseAtPlot(ctx: ReadCtx, plotIndex: number) {
  return ctx.db
    .query("houses")
    .withIndex("by_plotIndex", (q) => q.eq("plotIndex", plotIndex))
    .first();
}

function toView(house: Doc<"houses">, userId: Id<"users"> | null) {
  return {
    plotIndex: house.plotIndex,
    ownerName: house.ownerName,
    name: house.name,
    visits: house.visits,
    visitors: house.visitors,
    isMine: userId !== null && house.userId === userId,
  };
}

/**
 * Caddedeki BÜTÜN evler (arsa sırasına göre). Herkes okuyabilir — evler
 * caddede herkesin görebileceği yapılardır. `isMine` yalnızca çağıran
 * oyuncunun kendi evini işaretler (kimlik yoksa hepsi `false`).
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const rows = await ctx.db.query("houses").collect();
    return rows
      .slice()
      .sort((a, b) => a.plotIndex - b.plotIndex)
      .map((h) => toView(h, userId));
  },
});

/**
 * Ev kur / taşı / adını değiştir — tek mutation.
 *
 *   · `plotIndex` VERİLİRSE: ev o arsaya kurulur (boşsa ya da zaten benimse;
 *     başkasınınsa hata). Kapıdaki "Evini kur" düğmesi bunu kullanır.
 *   · `plotIndex` VERİLMEZSE: evim varsa yalnızca ADI güncellenir; yoksa ilk
 *     boş arsaya kurulur. Paneldeki "Evim" düğmesi bunu kullanır.
 */
export const place = mutation({
  args: {
    plotIndex: v.optional(v.number()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, { plotIndex, name }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Oturum açman gerekiyor.");
    const ownerName = await usernameOf(ctx, userId);
    const mine = await houseOfUser(ctx, userId);

    // Arsa seçilmediyse: ev yoksa ilk boş arsa, varsa mevcut arsa (ad değişimi).
    let target = mine?.plotIndex ?? null;
    if (plotIndex !== undefined) {
      assertPlottable(plotIndex);
      const occupied = await houseAtPlot(ctx, plotIndex);
      if (occupied !== null && occupied.userId !== userId) {
        throw new Error("Bu arsa başkasının evi. Başka bir arsa seç.");
      }
      target = plotIndex;
    } else if (target === null) {
      for (const plot of HOUSE_PLOTS) {
        const occupied = await houseAtPlot(ctx, plot);
        if (occupied === null) {
          target = plot;
          break;
        }
      }
      if (target === null) {
        throw new Error("Caddede boş arsa kalmadı.");
      }
    }

    const now = Date.now();
    const trimmed = normalizeName(name ?? mine?.name, ownerName);

    if (mine === null) {
      await ctx.db.insert("houses", {
        userId,
        ownerName,
        plotIndex: target,
        name: trimmed,
        visits: 0,
        visitors: [],
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(mine._id, {
        plotIndex: target,
        name: trimmed,
        updatedAt: now,
      });
    }

    const saved = await houseOfUser(ctx, userId);
    return saved ? toView(saved, userId) : null;
  },
});

/**
 * Bir oyuncunun evini ziyaret et: ziyaret sayısı artar ve ziyaretçi adı
 * listenin başına yazılır (aynı ad tekrar ederse yalnızca başa alınır).
 * Kendi evini ziyaret saymaz.
 */
export const visit = mutation({
  args: { plotIndex: v.number() },
  handler: async (ctx, { plotIndex }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Oturum açman gerekiyor.");
    const house = await houseAtPlot(ctx, plotIndex);
    if (house === null) throw new Error("Bu arsada ev yok.");
    if (house.userId === userId) return toView(house, userId);

    const guest = await usernameOf(ctx, userId);
    const now = Date.now();
    const visitors = [guest, ...house.visitors.filter((n) => n !== guest)].slice(
      0,
      MAX_VISITORS,
    );
    await ctx.db.patch(house._id, {
      visits: house.visits + 1,
      visitors,
      updatedAt: now,
    });
    const saved = await houseAtPlot(ctx, plotIndex);
    return saved ? toView(saved, userId) : null;
  },
});
