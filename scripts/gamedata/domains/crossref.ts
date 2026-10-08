import type { GenContext } from '../context';

/**
 * Cross-domain pass after all domains are built: fills the precomputed reverse lookups on items
 * (craftedBy, researchedBy, usedIn, soldBy, recycledFrom, rewardedBy) from ctx.results.
 * STUB — implemented in ticket S03.
 */
export function crossref(ctx: GenContext): void {
  void ctx;
}
