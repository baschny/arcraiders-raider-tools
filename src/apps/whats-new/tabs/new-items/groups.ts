import type { Amount, WhatsNewUse } from '../../../../shared/gamedata/types';

/** Purpose groups of the New items / Old items tabs, in display order. */
export const PURPOSE_ORDER = [
  'outpost',
  'researchStation',
  'researchPoints',
  'gunsmith4',
  'amplified',
  'researchBlueprints',
  'furniture',
  'crafting',
  'stencils',
  'quests',
  'trades',
  'noUse',
] as const;

export type PurposeId = (typeof PURPOSE_ORDER)[number];

/** Benches domain ids the grouping needs to tell apart. */
export const RESEARCH_BENCH = 'research_station';
export const GUNSMITH_BENCH = 'weapon_bench';

/** An item (new, or existing with gained uses) to be sorted into purpose groups. */
export interface PurposeSource {
  id: string;
  /** Item group of new items; `study` items belong to Research Points. */
  group?: string;
  uses?: WhatsNewUse[];
  /** Old items: uses the item lost. */
  lost?: WhatsNewUse[];
  recyclesInto?: Amount[];
}

export interface PurposeContext {
  /** True for the slug of an Amplified weapon (target of repair / amplify uses). */
  isAmplified: (slug: string) => boolean;
}

export interface PurposeEntry {
  source: PurposeSource;
  /** The source's uses that belong to this group (empty for Research Points and No use yet). */
  uses: WhatsNewUse[];
}

export interface PurposeGroupData {
  id: PurposeId;
  entries: PurposeEntry[];
}

function benchOf(ref: unknown): string | null {
  return typeof ref === 'object' && ref !== null && 'bench' in ref ? String((ref as { bench: string }).bench) : null;
}

/** The purpose group a single use belongs to; null when it has none (e.g. stash tiers, other benches). */
export function purposeOfUse(use: WhatsNewUse, ctx: PurposeContext): PurposeId | null {
  switch (use.system) {
    case 'outpostRoom':
      return 'outpost';
    case 'researchStation':
      return 'researchStation';
    case 'benchUpgrade': {
      const bench = benchOf(use.target);
      if (bench === RESEARCH_BENCH) return 'researchStation';
      if (bench === GUNSMITH_BENCH) return 'gunsmith4';
      return null;
    }
    case 'amplify':
    case 'amplifyPerk':
      return 'amplified';
    case 'repair':
      // Repairing an Amplified weapon belongs with Amplified; other repairs are plain crafting.
      return typeof use.target === 'string' && ctx.isAmplified(use.target) ? 'amplified' : 'crafting';
    case 'research':
      return 'researchBlueprints';
    case 'outpostFurniture':
      return 'furniture';
    case 'craft':
    case 'fieldCraft':
      return 'crafting';
    case 'stencil':
      return 'stencils';
    case 'quest':
    case 'project':
      return 'quests';
    case 'trade':
      return 'trades';
    default:
      return null;
  }
}

export interface BuildOptions {
  /** Add the "No use yet" group for sources without any purpose (new items only). */
  includeNoUse?: boolean;
  /** Order of the items inside a group (default: input order). */
  compare?: (a: PurposeSource, b: PurposeSource) => number;
}

/**
 * Sorts items into purpose groups: an item appears in every group it has a use in, empty groups are
 * omitted, and groups follow `PURPOSE_ORDER`.
 */
export function buildPurposeGroups(
  sources: readonly PurposeSource[],
  ctx: PurposeContext,
  options: BuildOptions = {},
): PurposeGroupData[] {
  const groups = new Map<PurposeId, PurposeEntry[]>();
  const add = (id: PurposeId, entry: PurposeEntry) => {
    const list = groups.get(id);
    if (list) list.push(entry);
    else groups.set(id, [entry]);
  };

  for (const source of sources) {
    const byPurpose = new Map<PurposeId, WhatsNewUse[]>();
    for (const use of source.uses ?? []) {
      const id = purposeOfUse(use, ctx);
      if (!id) continue;
      const list = byPurpose.get(id);
      if (list) list.push(use);
      else byPurpose.set(id, [use]);
    }
    if (source.group === 'study' && !byPurpose.has('researchPoints')) byPurpose.set('researchPoints', []);
    if (byPurpose.size === 0) {
      if (options.includeNoUse) add('noUse', { source, uses: [] });
      continue;
    }
    for (const [id, uses] of byPurpose) add(id, { source, uses });
  }

  const { compare } = options;
  return PURPOSE_ORDER.filter((id) => groups.has(id)).map((id) => {
    const entries = groups.get(id)!;
    return { id, entries: compare ? [...entries].sort((a, b) => compare(a.source, b.source)) : entries };
  });
}

/** Selection key of a tile; one detail panel is open across all groups. */
export const selectionKey = (group: PurposeId, itemId: string): string => `${group}:${itemId}`;
