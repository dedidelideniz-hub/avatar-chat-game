import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * PvP duel invites — one player on the street challenges another real player
 * (by their presence session id); the invitee accepts/rejects, then both
 * clients join the live battle room ("battle:<battleId>") in the `presence`
 * table, where each phone publishes its fighter state in real time.
 *
 * The fighter info (name / avatar / equipped items / ability) is captured at
 * invite time so the arena can show both fighters even if a profile changes
 * mid-fight. The winner's client calls `profiles.battleVictory` itself to
 * bank the SP reward.
 */

/** A waiting invite is dropped after this long (the invitee never answered). */
const INVITE_TTL_MS = 45_000;

const fighterInfoValidator = v.object({
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
});

/** Create a duel invite aimed at another player's session. Reuses an
 *  existing pending invite to the same opponent instead of duplicating. */
export const createBattle = mutation({
  args: {
    mySessionId: v.string(),
    opponentSessionId: v.string(),
    me: fighterInfoValidator,
  },
  handler: async (ctx, { mySessionId, opponentSessionId, me }) => {
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
      throw new Error(
        "Hesabın oyundan yasaklandı. Detay için yöneticiye başvurabilirsin.",
      );
    }
    if (!opponentSessionId || opponentSessionId === mySessionId) {
      throw new Error("Bu oyuncuya davet gönderilemiyor.");
    }

    const now = Date.now();
    // Dedupe: an invite I already sent to this opponent is still waiting.
    const mine = await ctx.db
      .query("battles")
      .withIndex("by_challengerSession", (q) => q.eq("challengerSession", mySessionId))
      .collect();
    const pending = mine.find(
      (b) =>
        b.status === "waiting" &&
        b.opponentSession === opponentSessionId &&
        now - b.createdAt < INVITE_TTL_MS,
    );
    if (pending) {
      return { battleId: pending._id, reuse: true };
    }

    const battleId = await ctx.db.insert("battles", {
      status: "waiting",
      challengerSession: mySessionId,
      opponentSession: opponentSessionId,
      challenger: me,
      createdAt: now,
      updatedAt: now,
    });
    return { battleId, reuse: false };
  },
});

/** Fresh duel invites addressed to my session (reactive — new invites appear
 *  on the street immediately). */
export const listInvites = query({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const rows = await ctx.db
      .query("battles")
      .withIndex("by_opponentSession", (q) => q.eq("opponentSession", sessionId))
      .collect();
    const now = Date.now();
    return rows
      .filter(
        (b) => b.status === "waiting" && now - b.createdAt < INVITE_TTL_MS,
      )
      .map((b) => ({
        battleId: b._id,
        challenger: b.challenger,
        createdAt: b.createdAt,
      }));
  },
});

/** Watch a duel — reactive, drives the fight lifecycle on both phones. */
export const getBattle = query({
  args: { battleId: v.id("battles") },
  handler: async (ctx, { battleId }) => {
    const battle = await ctx.db.get(battleId);
    if (!battle) return null;
    // Expired unanswered invites are treated as gone.
    if (
      battle.status === "waiting" &&
      Date.now() - battle.createdAt > INVITE_TTL_MS
    ) {
      return null;
    }
    return battle;
  },
});

/** Accept a duel invite — locks in both fighters and starts the fight. */
export const acceptBattle = mutation({
  args: {
    battleId: v.id("battles"),
    sessionId: v.string(),
    me: fighterInfoValidator,
  },
  handler: async (ctx, { battleId, sessionId, me }) => {
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
      throw new Error(
        "Hesabın oyundan yasaklandı. Detay için yöneticiye başvurabilirsin.",
      );
    }
    const battle = await ctx.db.get(battleId);
    if (!battle || battle.status !== "waiting") {
      throw new Error("Bu davet artık geçerli değil.");
    }
    if (battle.opponentSession !== sessionId) {
      throw new Error("Bu davet sana gönderilmedi.");
    }
    await ctx.db.patch(battleId, {
      opponent: me,
      status: "fighting",
      updatedAt: Date.now(),
    });
  },
});

/** Reject an incoming duel invite. */
export const declineBattle = mutation({
  args: { battleId: v.id("battles"), sessionId: v.string() },
  handler: async (ctx, { battleId, sessionId }) => {
    const battle = await ctx.db.get(battleId);
    if (!battle || battle.status !== "waiting") return;
    if (battle.opponentSession !== sessionId) return;
    await ctx.db.patch(battleId, {
      status: "done",
      winner: "declined",
      updatedAt: Date.now(),
    });
  },
});

/** Cancel a duel invite I sent (before the other player answers). */
export const cancelBattle = mutation({
  args: { battleId: v.id("battles"), sessionId: v.string() },
  handler: async (ctx, { battleId, sessionId }) => {
    const battle = await ctx.db.get(battleId);
    if (!battle || battle.status !== "waiting") return;
    if (battle.challengerSession !== sessionId) return;
    await ctx.db.patch(battleId, {
      status: "done",
      winner: "canceled",
      updatedAt: Date.now(),
    });
  },
});

/** Record the result once the fight ends (idempotent). */
export const finishBattle = mutation({
  args: {
    battleId: v.id("battles"),
    winner: v.union(
      v.literal("challenger"),
      v.literal("opponent"),
      v.literal("forfeit"),
    ),
  },
  handler: async (ctx, { battleId, winner }) => {
    const battle = await ctx.db.get(battleId);
    if (!battle || battle.status !== "fighting") return;
    await ctx.db.patch(battleId, {
      status: "done",
      winner,
      updatedAt: Date.now(),
    });
  },
});
