import type { WhatsNewUse } from '../../../../shared/gamedata/types';
import type { WhatsNewPageData } from '../../hooks/useWhatsNewData';
import type { PurposeSource } from './groups';

const VERSION = 'frozen-trail';

/** Uses without stash targets (stash tiers are covered by the Changes tab). */
export function withoutStash(uses: WhatsNewUse[] | undefined): WhatsNewUse[] {
  return (uses ?? []).filter((u) => !(typeof u.target === 'object' && 'stashSlots' in u.target));
}

export function newItemSources(data: WhatsNewPageData): PurposeSource[] {
  return (data.whatsNew?.versions[VERSION]?.newItems ?? []).map((i) => ({
    id: i.id,
    group: i.group,
    uses: i.uses,
    recyclesInto: i.recyclesInto,
  }));
}

/** Existing items that gained uses; currencies and stash tiers are left out. */
export function oldItemSources(data: WhatsNewPageData): PurposeSource[] {
  const { catalog } = data;
  return (data.whatsNew?.versions[VERSION]?.existingItems ?? [])
    .filter((i) => catalog.items[catalog.aliases[i.id] ?? i.id]?.category !== 'Currency')
    .map((i) => ({ id: i.id, uses: withoutStash(i.gained), lost: withoutStash(i.lost) }))
    .filter((s) => s.uses.length > 0);
}
