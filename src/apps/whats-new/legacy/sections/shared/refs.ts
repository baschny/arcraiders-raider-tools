import type { WhatsNewRef, WhatsNewUse } from '../../../../../shared/gamedata/types';
import { nameOf } from '../../../../../shared/gamedata/loader';
import type { ItemRef } from '../../components';
import { toItemRef, type WhatsNewPageData } from '../../../hooks/useWhatsNewData';

/** What a use's `target` / `via` shows as. */
export type ResolvedRef =
  | { kind: 'item'; key: string; item: ItemRef }
  | { kind: 'bench'; key: string; label: string; image?: string }
  | { kind: 'trader'; key: string; label: string; image: string }
  | { kind: 'stash'; key: string; slots: number }
  | { kind: 'generic'; key: string; label: string };

export function refKey(ref: WhatsNewRef): string {
  return typeof ref === 'string' ? ref : JSON.stringify(ref);
}

/**
 * Resolves a use `target` / `via` to something drawable: item (catalog), bench level (tier image),
 * trader (portrait), stash tier, or a generic label (quest, project, skill, unknown).
 */
export function resolveRef(data: WhatsNewPageData, ref: WhatsNewRef): ResolvedRef {
  const key = refKey(ref);
  if (typeof ref === 'object') {
    if ('stashSlots' in ref) return { kind: 'stash', key, slots: ref.stashSlots };
    const bench = data.benches?.structure.benches[ref.bench];
    const level = bench?.levels.find((l) => l.level === ref.level);
    const name = data.benches ? nameOf(data.benches, ref.bench, bench?.nameEn ?? undefined) : ref.bench;
    return { kind: 'bench', key, label: `${name} ${ref.level}`, image: level?.icon ?? undefined };
  }
  const { catalog } = data;
  if (catalog.items[catalog.aliases[ref] ?? ref]) return { kind: 'item', key, item: toItemRef(catalog, ref) };
  const trader = data.trades?.structure.traders?.[ref];
  if (trader) {
    return { kind: 'trader', key, label: nameOf(data.trades, ref, trader.nameEn), image: `/images/trader/${ref}.png` };
  }
  return { kind: 'generic', key, label: ref };
}

/** Target of a use; quest and project ids are not in loaded domains, so they stay generic. */
export function resolveTarget(data: WhatsNewPageData, use: WhatsNewUse): ResolvedRef {
  if (use.system === 'quest' || use.system === 'project') {
    return { kind: 'generic', key: refKey(use.target), label: String(use.target) };
  }
  return resolveRef(data, use.target);
}

/** `via` worth showing next to a use: bench level or trader. Outpost uses without `via` are Posh. */
export function resolveVia(data: WhatsNewPageData, use: WhatsNewUse): ResolvedRef | null {
  if (!use.via) {
    return use.system === 'outpostRoom' || use.system === 'outpostFurniture'
      ? { kind: 'generic', key: 'posh', label: 'Posh' }
      : null;
  }
  const via = resolveRef(data, use.via);
  return via.kind === 'bench' || via.kind === 'trader' || via.kind === 'stash' ? via : null;
}

