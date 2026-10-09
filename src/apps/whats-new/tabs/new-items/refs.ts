import type { WhatsNewRef, WhatsNewUse } from '../../../../shared/gamedata/types';
import { nameOf } from '../../../../shared/gamedata/loader';
import type { ItemRef } from '../../components';
import { toItemRef, toUnlockedRef, type WhatsNewPageData } from '../../hooks/useWhatsNewData';

const refKey = (ref: WhatsNewRef): string => (typeof ref === 'string' ? ref : JSON.stringify(ref));

/** What a use target is drawn as: a tile (item, bench level, trader) or a generic labelled box. */
export type TargetView =
  | { kind: 'tile'; key: string; item: ItemRef; isBlueprint?: boolean }
  | { kind: 'generic'; key: string; label: string; icon: 'quest' | 'project' | 'other' };

export interface WhereView {
  key: string;
  label: string;
  image?: string;
}

export interface RefLabels {
  /** "Research Station level 2" */
  level: (bench: string, level: number) => string;
  /** "304 slots" */
  slots: (slots: number) => string;
}

/** `blueprintItemId` to the item it unlocks. */
export function unlockMap(data: WhatsNewPageData): Map<string, string | undefined> {
  const blueprints = data.blueprints?.structure.blueprints ?? {};
  return new Map(Object.values(blueprints).map((b) => [b.blueprintItemId, b.unlocksItemId]));
}

export function benchLevelImage(data: WhatsNewPageData, bench: string, level: number): string | undefined {
  return data.benches?.structure.benches[bench]?.levels.find((l) => l.level === level)?.icon ?? undefined;
}

function benchName(data: WhatsNewPageData, bench: string): string {
  const b = data.benches?.structure.benches[bench];
  return data.benches ? nameOf(data.benches, bench, b?.nameEn ?? undefined) : bench;
}

function prettify(id: string): string {
  const s = id.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function isItem(data: WhatsNewPageData, slug: string): boolean {
  return !!data.catalog.items[data.catalog.aliases[slug] ?? slug];
}

function traderOf(data: WhatsNewPageData, slug: string) {
  return data.trades?.structure.traders?.[slug];
}

/** Resolves the target of a use. Research targets show the unlocked item with the blueprint frame. */
export function resolveTargetView(
  data: WhatsNewPageData,
  use: WhatsNewUse,
  target: WhatsNewRef,
  unlocks: Map<string, string | undefined>,
  labels: RefLabels,
): TargetView {
  const key = refKey(target);
  if (typeof target === 'object') {
    if ('stashSlots' in target) return { kind: 'generic', key, label: labels.slots(target.stashSlots), icon: 'other' };
    const label = labels.level(benchName(data, target.bench), target.level);
    return { kind: 'tile', key, item: { id: key, name: label, icon: benchLevelImage(data, target.bench, target.level) } };
  }
  if (use.system === 'quest' || use.system === 'project') {
    const quest = use.system === 'quest';
    const domain = quest ? data.quests : data.projects;
    const entry = quest ? data.quests?.structure.quests[target] : data.projects?.structure.projects[target];
    const label = domain ? nameOf(domain, target, entry?.nameEn ?? prettify(target)) : prettify(target);
    return { kind: 'generic', key, label, icon: use.system };
  }
  if (use.system === 'research' && unlocks.has(target)) {
    return { kind: 'tile', key, item: toUnlockedRef(data.catalog, target, unlocks.get(target)), isBlueprint: true };
  }
  if (isItem(data, target)) return { kind: 'tile', key, item: toItemRef(data.catalog, target) };
  const trader = traderOf(data, target);
  if (trader) {
    return { kind: 'tile', key, item: { id: key, name: data.trades ? nameOf(data.trades, target, trader.nameEn) : target, icon: `/images/trader/${target}.png` } };
  }
  return { kind: 'generic', key, label: prettify(target), icon: 'other' };
}

/** Where a use happens: bench level, trader, or Posh for outpost uses without `via`. */
export function resolveWhere(data: WhatsNewPageData, use: WhatsNewUse, labels: RefLabels, poshLabel: string): WhereView | null {
  const via = use.via;
  if (!via) {
    return use.system === 'outpostRoom' || use.system === 'outpostFurniture' ? { key: 'posh', label: poshLabel } : null;
  }
  if (typeof via === 'object') {
    if ('stashSlots' in via) return null;
    return {
      key: refKey(via),
      label: labels.level(benchName(data, via.bench), via.level),
      image: benchLevelImage(data, via.bench, via.level),
    };
  }
  const trader = traderOf(data, via);
  if (trader) {
    return { key: via, label: data.trades ? nameOf(data.trades, via, trader.nameEn) : via, image: `/images/trader/${via}.png` };
  }
  return null;
}
