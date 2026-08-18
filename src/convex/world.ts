import { v } from "convex/values";
import { query } from "./_generated/server";

/**
 * Server wall clock. Clients calibrate their bot simulation to this time so
 * every phone walks the bots at the exact same phase — local `Date.now()`
 * differs between devices and makes bots drift apart.
 *
 * The `t` arg is a changing nonce (e.g. floor(Date.now()/30000)) that forces
 * the query to re-run periodically so clients can re-sync against drift.
 */
export const clock = query({
  args: { t: v.number() },
  handler: async () => ({ serverTime: Date.now() }),
});
