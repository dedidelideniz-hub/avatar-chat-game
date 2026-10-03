/**
 * ⚔️ BAHİSLİ DÜELLO & EV RİSKE ETME (yüksek riskli PvP sözleşmesi).
 *
 * AKIŞ:
 *   1) `create`  — Bir oyuncu diğerine ALTIN ve/veya EV ortaya koyarak meydan
 *      okur. Sözleşme `pending` durumda bekler; HİÇBİR ŞEY henüz el değiştirmez.
 *   2) `accept`  — Rakip kabul edince DOĞRULAMA yapılır: iki taraf da bahsi
 *      karşılayabiliyor mu (altın kasada mı, ev hâlâ onların mı)? Şartlar
 *      sağlanıyorsa altın REHİN (escrow) tutulur, ev kilitlenir
 *      (`houses.wageredIn`) ve iki taraf için bir `battles` satırı açılıp
 *      durum `active`ye geçer.
 *   3) `decline` — Rakip reddeder: istek iptal edilir, rehin çözülür.
 *   4) `finish`  — Maç biter: kazanan tüm altını alır ve (varsa) iddiaya konan
 *      evin `userId`si kazanana yazılır (MÜLKİYET DEVRİ). Global feed'e duyuru
 *      düşülür.
 *
 * SUNUCU HER ŞEYİ DOĞRULAR (istemciye güvenilmez): tutarlar tamsayı ve
 * `MIN_GOLD`…kasa aralığında; ev gerçekten bahsi koyanın; kabul anında bakiye
 * ve sahiplik yeniden kontrol edilir; `finish` idempotenttir (iki telefon da
 * çağırsa tek sefer ödenir).
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

/** Bir altın bahsinin alt sınırı — "yüksek bahis" hissi için. */
export const MIN_GOLD = 100;
/** Tek bir düelloda altın bahsinin üst sınırı (sunucu tarafı emniyet). */
export const MAX_GOLD = 1_000_000;
/** Cevapsız kalan davet bu süre sonra düşer (davet edilen hiç yanıt vermedi). */
export const INVITE_TTL_MS = 60_000;
/** Bekleyen davetlerde global feed'e yazılan duyuru sayısı. */
const FEED_ROOM = "world";
const FEED_HISTORY = 50;

const avatarValidator = v.object({
  skin: v.string(),
  hair: v.string(),
  hairColor: v.string(),
  shirt: v.string(),
  pants: v.string(),
  shoes: v.string(),
});

const fighterValidator = v.object({
  name: v.string(),
  config: avatarValidator,
  equipped: v.array(v.string()),
  ability: v.string(),
});

function normalizeGold(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  const whole = Math.floor(raw);
  if (whole <= 0) return 0;
  return Math.min(MAX_GOLD, whole);
}

/** Altını kasasından düşer (kabul anında rehin alınır). */
async function debitGold(
  ctx: MutationCtx,
  userId: Id<"users">,
  amount: number,
) {
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
  if (profile === null) throw new Error("Oyuncunun profili yok.");
  const coins = profile.coins ?? STARTING_COINS;
  if (coins < amount) {
    throw new Error(
      `Yeterli SP yok — ${amount} SP gerekiyor, ${coins} SP var.`,
    );
  }
  await ctx.db.patch(profile._id, {
    coins: coins - amount,
    updatedAt: Date.now(),
  });
}

/** Kazanana altın yazar. */
async function creditGold(
  ctx: MutationCtx,
  userId: Id<"users">,
  amount: number,
) {
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
  if (profile === null) return;
  await ctx.db.patch(profile._id, {
    coins: (profile.coins ?? STARTING_COINS) + amount,
    updatedAt: Date.now(),
  });
}

/** Global feed'e sistem mesajı düşer (sohbet kanalı — herkes görür). */
async function postFeed(
  ctx: MutationCtx,
  senderId: Id<"users">,
  text: string,
) {
  const now = Date.now();
  await ctx.db.insert("chat", {
    room: FEED_ROOM,
    senderId,
    senderName: "Sistem",
    text: text.slice(0, 200),
    color: "gold",
    createdAt: now,
  });
  // Eski satırları buda (feed sonsuz büyümesin).
  const rows = await ctx.db
    .query("chat")
    .withIndex("by_room_time", (q) => q.eq("room", FEED_ROOM))
    .order("desc")
    .take(FEED_HISTORY + 50);
  for (const row of rows.slice(FEED_HISTORY)) {
    await ctx.db.delete(row._id);
  }
}

async function requireProfile(ctx: MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Oturum açman gerekiyor.");
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
  if (profile === null) throw new Error("Önce karakterini oluştur.");
  if (profile.banned) {
    throw new Error(
      "Hesabın oyundan yasaklandı. Detay için yöneticiye başvurabilirsin.",
    );
  }
  return { userId, profile };
}

/** Bir oyuncunun evi (varsa). Hem sorgu hem mutation bağlamında çalışır. */
async function houseOf(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  return ctx.db
    .query("houses")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
}

/**
 * Meydan oku — altın ve/veya ev ortaya koyarak bir bahis sözleşmesi aç.
 *
 * `wageredHouseId` verilirse: ev GERÇEKTEN benim olmalı ve başka bir bahiste
 * kilitli olmamalı. Karşı taraf da en az bir eve sahip olmalı (yoksa ev
 * bahsi anlamsız — kazanacak evi yok).
 */
export const create = mutation({
  args: {
    /** Rakibin görünen adı — kullanıcı adları BENZERSİZDİR, sunucu çözer. */
    opponentName: v.string(),
    goldAmount: v.number(),
    wageredHouseId: v.optional(v.id("houses")),
    mySessionId: v.string(),
    me: fighterValidator,
  },
  handler: async (
    ctx,
    { opponentName, goldAmount, wageredHouseId, mySessionId, me },
  ) => {
    const { userId, profile } = await requireProfile(ctx);
    const target = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", opponentName.trim()))
      .first();
    if (target === null) throw new Error("Bu oyuncu bulunamadı.");
    const opponentUserId = target.userId;
    if (opponentUserId === userId) {
      throw new Error("Kendine meydan okuyamazsın.");
    }

    const gold = normalizeGold(goldAmount);
    if (gold > 0 && gold < MIN_GOLD) {
      throw new Error(`En az ${MIN_GOLD} SP bahis koyabilirsin.`);
    }
    const myCoins = profile.coins ?? STARTING_COINS;
    if (gold > myCoins) {
      throw new Error(
        `Kasanda ${myCoins} SP var — ${gold} SP bahis koyamazsın.`,
      );
    }

    // EV BAHİSİ doğrulaması
    let wageredHouse: Doc<"houses"> | null = null;
    if (wageredHouseId !== undefined) {
      const house = await ctx.db.get(wageredHouseId);
      if (house === null || house.userId !== userId) {
        throw new Error("İddiaya koymak istediğin ev senin değil.");
      }
      if (house.wageredIn) {
        throw new Error("Bu ev zaten süren bir bahiste rehin.");
      }
      const targetHouse = await houseOf(ctx, target.userId);
      if (targetHouse === null) {
        throw new Error(
          "Rakibin henüz bir evi yok — ev bahsi için iki taraf da ev sahibi olmalı.",
        );
      }
      wageredHouse = house;
    }

    if (gold === 0 && wageredHouse === null) {
      throw new Error("En az bir bahis (SP veya ev) seçmelisin.");
    }

    const now = Date.now();
    // Aynı rakibe bekleyen davetim varsa yeniden kullan.
    const mine = await ctx.db
      .query("wagerMatches")
      .withIndex("by_challengerId", (q) => q.eq("challengerId", userId))
      .collect();
    const pending = mine.find(
      (m) =>
        m.status === "pending" &&
        m.targetId === opponentUserId &&
        now - m.createdAt < INVITE_TTL_MS,
    );
    if (pending) {
      return { wagerId: pending._id, reuse: true };
    }

    const targetName = target.username;
    const wagerId = await ctx.db.insert("wagerMatches", {
      challengerId: userId,
      targetId: opponentUserId,
      challengerName: me.name,
      targetName,
      challengerSession: mySessionId,
      challenger: me,
      goldAmount: gold,
      wageredHouseId: wageredHouse?._id,
      wageredHouseName: wageredHouse?.name,
      status: "pending",
      goldEscrowed: false,
      createdAt: now,
      updatedAt: now,
    });
    return { wagerId, reuse: false };
  },
});

/**
 * Meydan okuma formu için bilgi: benim iddiaya koyabileceğim ev + rakibin
 * evi var mı (ev bahsi ancak iki taraf da ev sahibiyse anlamlı).
 */
export const challengeInfo = query({
  args: { opponentName: v.string() },
  handler: async (ctx, { opponentName }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const myHouse = await houseOf(ctx, userId);
    const opp = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", opponentName.trim()))
      .first();
    const oppHouse = opp ? await houseOf(ctx, opp.userId) : null;
    return {
      myHouse:
        myHouse === null
          ? null
          : {
              id: myHouse._id,
              name: myHouse.name,
              locked: Boolean(myHouse.wageredIn),
            },
      opponentHasHouse: oppHouse !== null,
    };
  },
});

/** Bekleyen davetim (challenger tarafı — rakibin cevabını bekliyorum). */
export const getWager = query({
  args: { wagerId: v.id("wagerMatches") },
  handler: async (ctx, { wagerId }) => {
    const wager = await ctx.db.get(wagerId);
    if (!wager) return null;
    if (
      wager.status === "pending" &&
      Date.now() - wager.createdAt > INVITE_TTL_MS
    ) {
      return null;
    }
    return wager;
  },
});

/** Bana gelen bekleyen bahis davetleri (reaktif — pop-up anında düşer). */
export const listInvites = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const rows = await ctx.db
      .query("wagerMatches")
      .withIndex("by_targetId", (q) => q.eq("targetId", userId))
      .collect();
    const now = Date.now();
    return rows
      .filter(
        (m) => m.status === "pending" && now - m.createdAt < INVITE_TTL_MS,
      )
      .map((m) => ({
        wagerId: m._id,
        challengerName: m.challengerName,
        challenger: m.challenger,
        goldAmount: m.goldAmount,
        wageredHouseName: m.wageredHouseName,
        createdAt: m.createdAt,
      }));
  },
});

/**
 * Rakip kabul etti — DOĞRULAMA + REHİN.
 *
 * Şartlar: iki taraf da altını karşılayabiliyor olmalı, iddiaya konan ev hâlâ
 * bahsi koyanın elinde olmalı. Sağlanıyorsa iki tarafın altını rehine alınır,
 * ev kilitlenir, `battles` satırı açılır ve durum `active` olur.
 */
export const accept = mutation({
  args: { wagerId: v.id("wagerMatches"), me: fighterValidator },
  handler: async (ctx, { wagerId, me }) => {
    const { userId } = await requireProfile(ctx);
    const wager = await ctx.db.get(wagerId);
    if (!wager || wager.status !== "pending") {
      throw new Error("Bu davet artık geçerli değil.");
    }
    if (wager.targetId !== userId) {
      throw new Error("Bu davet sana gönderilmedi.");
    }
    if (Date.now() - wager.createdAt > INVITE_TTL_MS) {
      throw new Error("Davetin süresi doldu.");
    }

    // 1) ALTIN DOĞRULAMASI: iki taraf da kasasında bahsi karşılayabiliyor mu?
    const gold = wager.goldAmount;
    if (gold > 0) {
      const challengerProfile = await ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", wager.challengerId))
        .first();
      const myProfile = await ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .first();
      const challengerCoins = challengerProfile?.coins ?? STARTING_COINS;
      const myCoins = myProfile?.coins ?? STARTING_COINS;
      if (challengerCoins < gold) {
        throw new Error("Rakibin kasası bu bahsi artık karşılamıyor.");
      }
      if (myCoins < gold) {
        throw new Error(
          `Yeterli SP yok — bu bahis ${gold} SP gerektiriyor, ${myCoins} SP var.`,
        );
      }
    }

    // 2) EV DOĞRULAMASI: ev hâlâ bahsi koyanın elinde ve kilitsiz mi?
    if (wager.wageredHouseId !== undefined) {
      const house = await ctx.db.get(wager.wageredHouseId);
      if (house === null || house.userId !== wager.challengerId) {
        throw new Error("İddiaya konan ev artık rakibin elinde değil.");
      }
      if (house.wageredIn) {
        throw new Error("İddiaya konan ev başka bir bahiste rehin.");
      }
      await ctx.db.patch(house._id, {
        wageredIn: wagerId as string,
        updatedAt: Date.now(),
      });
    }

    // 3) REHİN: iki tarafın da altınını şimdi kilitle.
    if (gold > 0) {
      await debitGold(ctx, wager.challengerId, gold);
      await debitGold(ctx, userId, gold);
    }

    // 4) DÖVÜŞ KÖPRÜSÜ: mevcut canlı PvP altyapısı için bir `battles` satırı.
    const now = Date.now();
    const battleId = await ctx.db.insert("battles", {
      status: "fighting",
      challengerSession: wager.challengerSession,
      opponentSession: undefined,
      challenger: wager.challenger,
      opponent: me,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(wagerId, {
      status: "active",
      battleId,
      goldEscrowed: gold > 0,
      updatedAt: now,
    });
    return { battleId };
  },
});

/** Rakip reddetti — istek iptal, rehin çözülür (henüz hiçbir şey kilitli değil). */
export const decline = mutation({
  args: { wagerId: v.id("wagerMatches") },
  handler: async (ctx, { wagerId }) => {
    const { userId } = await requireProfile(ctx);
    const wager = await ctx.db.get(wagerId);
    if (!wager || wager.status !== "pending") return;
    if (wager.targetId !== userId) return;
    await ctx.db.patch(wagerId, { status: "completed", updatedAt: Date.now() });
  },
});

/** Davetimi iptal et (rakip henüz cevap vermedi) — rehin çözülür. */
export const cancel = mutation({
  args: { wagerId: v.id("wagerMatches") },
  handler: async (ctx, { wagerId }) => {
    const { userId } = await requireProfile(ctx);
    const wager = await ctx.db.get(wagerId);
    if (!wager || wager.status !== "pending") return;
    if (wager.challengerId !== userId) return;
    await ctx.db.patch(wagerId, { status: "completed", updatedAt: Date.now() });
  },
});

/**
 * MAÇ BİTTİ — ödemeyi yap.
 *
 * `winnerId` verilirse kazanan odur; kazanan tüm altını alır ve iddiaya konan
 * evin `userId`si kazanana yazılır (MÜLKİYET DEVRİ). `winnerId` yoksa (berabere
 * / iptal) altın rehinden çözülüp İKİ tarafa geri verilir, ev kilidi açılır.
 *
 * İdempotent: yalnızca `active` durumdan `completed`e geçer; ikinci çağrı
 * hiçbir şey yapmaz.
 */
export const finish = mutation({
  args: {
    wagerId: v.id("wagerMatches"),
    /**
     * Kazanan TARAF (istemci kendi userId'sini değil ROLÜNÜ bildirir — sunucu
     * rolü gerçek userId'ye çevirir, böylece kimse kendi kimliğini uydurup
     * kazanamaz). `undefined` = berabere/iptal → iki taraf da kendi bahsini
     * geri alır.
     */
    winnerRole: v.optional(
      v.union(v.literal("challenger"), v.literal("target")),
    ),
  },
  handler: async (ctx, { wagerId, winnerRole }) => {
    const wager = await ctx.db.get(wagerId);
    if (!wager || wager.status !== "active") return null;

    const gold = wager.goldAmount;
    const winnerId =
      winnerRole === "challenger"
        ? wager.challengerId
        : winnerRole === "target"
          ? wager.targetId
          : undefined;
    const isChallengerWinner = winnerId === wager.challengerId;
    const isTargetWinner = winnerId === wager.targetId;
    const decisive = winnerRole !== undefined && (isChallengerWinner || isTargetWinner);

    // 1) ALTIN: kazanan hepsini alır; berabere ise herkese kendi bahsi geri.
    if (gold > 0 && wager.goldEscrowed) {
      if (decisive && winnerId) {
        await creditGold(ctx, winnerId, gold * 2);
      } else {
        await creditGold(ctx, wager.challengerId, gold);
        await creditGold(ctx, wager.targetId, gold);
      }
    }

    // 2) EV: mülkiyet devri (yalnızca kesin sonuçta).
    if (wager.wageredHouseId !== undefined) {
      const house = await ctx.db.get(wager.wageredHouseId);
      if (house !== null) {
        if (decisive && winnerId && house.userId !== winnerId) {
          const newOwnerName = await ctx.db
            .query("profiles")
            .withIndex("by_userId", (q) => q.eq("userId", winnerId))
            .first();
          await ctx.db.patch(house._id, {
            userId: winnerId,
            ownerName: newOwnerName?.username ?? house.ownerName,
            wageredIn: undefined,
            updatedAt: Date.now(),
          });
        } else {
          await ctx.db.patch(house._id, {
            wageredIn: undefined,
            updatedAt: Date.now(),
          });
        }
      }
    }

    await ctx.db.patch(wagerId, {
      status: "completed",
      winnerId: decisive ? winnerId : undefined,
      goldEscrowed: false,
      updatedAt: Date.now(),
    });

    // 3) GLOBAL DUYURU.
    if (decisive && winnerId) {
      const winnerName =
        winnerId === wager.challengerId
          ? wager.challengerName
          : wager.targetName;
      const loserName =
        winnerId === wager.challengerId
          ? wager.targetName
          : wager.challengerName;
      if (wager.wageredHouseId !== undefined) {
        await postFeed(
          ctx,
          wager.challengerId,
          `🏠 ${winnerName}, ${loserName} oyuncusunu arena düellosunda yenerek evini kazandı!`,
        );
      } else {
        await postFeed(
          ctx,
          wager.challengerId,
          `💰 ${winnerName}, ${loserName} oyuncusunu bahisli düelloda yenerek ${gold * 2} SP kazandı!`,
        );
      }
    }
    return { ok: true };
  },
});
