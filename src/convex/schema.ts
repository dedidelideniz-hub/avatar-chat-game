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
      // Game economy: Sanalika Parası balance + owned product ids (bag).
      // Optional so pre-existing profiles keep working; defaults are applied
      // when reading/writing (see src/convex/profiles.ts).
      coins: v.optional(v.number()),
      items: v.optional(v.array(v.string())), // owned product ids (bag)
      equipped: v.optional(v.array(v.string())), // product ids currently worn
      lastDailyClaim: v.optional(v.number()), // epoch ms of last gift-box claim
      bubbleColor: v.optional(v.string()), // selected speech-bubble color id
      vipUntil: v.optional(v.number()), // epoch ms the VIP membership expires
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
