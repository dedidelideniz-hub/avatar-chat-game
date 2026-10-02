import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // Player profiles: username + avatar customization for the avatar-chat game.
    // Live multiplayer presence: room -> sessionId -> data. Stored in the
    // database (not in memory) so the `list` query re-runs reactively when
    // anyone joins/moves/leaves and so it is shared across all instances.
    presence: defineTable({
      room: v.string(),
      sessionId: v.string(),
      data: v.any(), // player position/avatar payload (opaque to the server)
      updatedAt: v.number(), // epoch ms — stale rows are swept by cleanup
    })
      .index("by_room", ["room"])
      .index("by_room_session", ["room", "sessionId"]),

    // PvP duel invites: challenger -> opponent session, resolved to a fight.
    // The live fight itself is synced through the `presence` table (room
    // "battle:<id>") so both phones see each other in real time.
    battles: defineTable({
      status: v.union(
        v.literal("waiting"),
        v.literal("fighting"),
        v.literal("done"),
      ),
      challengerSession: v.string(), // session id of the inviter
      opponentSession: v.optional(v.string()), // session id of the invitee
      challenger: v.object({
        name: v.string(),
        config: v.object({
          skin: v.string(),
          hair: v.string(),
          hairColor: v.string(),
          shirt: v.string(),
          pants: v.string(),
          shoes: v.string(),
        }),
        equipped: v.array(v.string()),
        ability: v.string(),
      }),
      opponent: v.optional(
        v.object({
          name: v.string(),
          config: v.object({
            skin: v.string(),
            hair: v.string(),
            hairColor: v.string(),
            shirt: v.string(),
            pants: v.string(),
            shoes: v.string(),
          }),
          equipped: v.array(v.string()),
          ability: v.string(),
        }),
      ),
      winner: v.optional(v.string()), // "challenger" | "opponent" | reason (declined/canceled)
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_opponentSession", ["opponentSession"])
      .index("by_challengerSession", ["challengerSession"]),

    // Public street chat — every message is broadcast to everyone in the
    // same room ("world" for the main street). Kept separate from `presence`
    // because presence rows are replaced on every publish; chat is append-only.
    chat: defineTable({
      room: v.string(), // "world" (or a future per-location room)
      senderId: v.id("users"),
      senderName: v.string(),
      text: v.string(),
      color: v.optional(v.string()), // sender's bubble color hex
      createdAt: v.number(),
    })
      .index("by_room_time", ["room", "createdAt"])
      .index("by_sender", ["senderId", "createdAt"]),

    // 🏠 Oyuncu evleri: caddede TEK ev vardır, İÇİ (oda) her oyuncuya
    // özeldir (arsa/kurulum yok). Kayıt sunucuda tutulur, yani odalar ONLINEdır:
    // komşunun odasına girdiğinde adın onun defterine yazılır — böylece
    // "kim odama geldi" görünür (son `MAX_VISITORS` kişi tutulur).
    houses: defineTable({
      userId: v.id("users"), // odanın sahibi
      ownerName: v.string(), // sahibin görünen adı (levhada yazar)
      name: v.string(), // odanın adı (sahibi değiştirebilir)
      /**
       * ODA ÖRNEĞİ KİMLİĞİ (instance id) — `room_<satır _id>` biçiminde.
       *
       * NEDEN: oda artık bir "satır" değil, çağrılabilir bir ÖRNEKTİR; kimlik
       * olmadan odayı adıyla bulmak (aynı ad iki oyuncuda olabilir) veya ileride
       * oda başına durum (mobilya, davet, eşzamanlı ziyaretçiler) tutmak mümkün
       * değildir. Kimlik satır `_id`inden TÜRETİLİR: sunucu üretir, istemci
       * uyduramaz ve sunucunun ürettiği değerle çakışmaz.
       *
       * `optional`: bu alan eklenmeden önce açılmış odalar var; okuma tarafı
       * kimliği yine de türetir (`houses.ts` → `roomIdFor`), sahip ilk girişte
       * kalıcı olarak yazılır.
       */
      roomId: v.optional(v.string()),
      visits: v.number(), // odaya giriş sayısı (sahip + ziyaretçiler)
      visitors: v.array(v.string()), // son ziyaretçi adları (en yeni başta)
      /**
       * BAŞLANGIÇ TAKIMI VERİLDİ Mİ? Odaya ilk girişte hediye mobilya
       * tohumlanır (`furniture.ts` → `seedStarter`). Bayrak olmadan, oyuncu
       * bütün eşyalarını kaldırsa hediye her girişte geri gelirdi.
       */
      furnitureSeeded: v.optional(v.boolean()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_userId", ["userId"])
      .index("by_ownerName", ["ownerName"])
      .index("by_roomId", ["roomId"]),

    // 🛋️ OYUNCU MOBİLYASI — stanttan Vaelos Parası ile alınan HER EŞYA BİR
    // SATIRDIR (adet = satır sayısı). Bu tablo, "ne aldım" ile "ne dizdim"i
    // birleştirir: `fx/fz` (odanın YARIM açıklığına göre oran, -1…1) doluysa
    // eşya odada durur; boşsa oyuncunun DOLABINDA bekler (`lift` → alanlar
    // temizlenir).
    //
    // NEDEN ORANSAL KONUM: oda modeli değişirse/başka bir GLB yüklenirse eşya
    // duvarın dışında kalmasın — metre ile yazılan konum modelle birlikte
    // anlamsızlaşırdı. Oransal konum, odanın ölçülen boyutuna göre HER ZAMAN
    // içeride kalır (bkz. `roomBuild.placeFurniture`).
    furniture: defineTable({
      userId: v.id("users"),
      itemId: v.string(), // katalog kimliği (fiyat SUNUCUDA doğrulanır)
      fx: v.optional(v.number()),
      fz: v.optional(v.number()),
      /**
       * EŞYANIN DÖNÜŞÜ (radyan, 0…2π). Oyuncu eşyayı yerleştirirken
       * döndürebilir; dönüş de kalıcıdır. Eski satırlarda yoktur → 0 okunur.
       */
      rot: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_userId", ["userId"]),

    profiles: defineTable({
      userId: v.id("users"),
      username: v.string(), // display name in the world
      avatar: v.object({
        skin: v.string(), // skin tone hex
        hair: v.string(), // hair style id
        hairColor: v.string(), // hair color hex
        shirt: v.string(), // top color hex
        pants: v.string(), // pants color hex
        shoes: v.string(), // shoe color hex
      }),
      // Game economy: Vaelos Parası balance + owned product ids (bag).
      // Optional so pre-existing profiles keep working; defaults are applied
      // when reading/writing (see src/convex/profiles.ts).
      coins: v.optional(v.number()),
      items: v.optional(v.array(v.string())), // owned product ids (bag)
      equipped: v.optional(v.array(v.string())), // product ids currently worn
      lastDailyClaim: v.optional(v.number()), // epoch ms of last gift-box claim
      bubbleColor: v.optional(v.string()), // selected speech-bubble color id
      // Karakter rengi TEK SEFER seçilir (VIP üyeler serbestçe değiştirir).
      // İlk renk seçimi yazılınca true olur; sunucu tarafında da zorlanır
      // (bkz. profiles.saveProfile).
      colorChosen: v.optional(v.boolean()),
      vipUntil: v.optional(v.number()), // epoch ms the VIP membership expires
      banned: v.optional(v.boolean()), // admin ban — blocks access to the game
      abilities: v.optional(v.array(v.string())), // owned battle supers
      equippedAbility: v.optional(v.string()), // equipped super id
      battleWins: v.optional(v.number()), // completed battle victories
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_userId", ["userId"])
      .index("by_username", ["username"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
