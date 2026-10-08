import type { GameDomain } from '../../../src/shared/gamedata/types';
import type { GenContext } from '../context';

/**
 * A domain module builds the structure of one site domain (without the file envelope) and adds
 * its texts to ctx.text. Modules run in the order of scripts/gamedata/domains/index.ts; items
 * first. The structure must match DomainStructures[domain] in src/shared/gamedata/types.ts.
 */
export interface DomainModule {
  domain: GameDomain;
  build(ctx: GenContext): Record<string, unknown>;
}
