// UI wording of the maps page (keys under maps.* in src/shared/i18n/locales/en.json): labels for the stable keys of
// data/kinds.ts, container types, map layers, item tags, respawn rules, and locale-aware numbers. Game names (maps,
// conditions, areas, enemies) come from the game strings instead (data/mapStrings.ts, Explorer.names).
import { useMemo } from 'react';
import { useLocale } from '../../shared/context/LocaleContext';
import { getIntlLocale } from '../../shared/i18n/config';
import { getItemDisplayName, getLocalizedLootHelperRarity } from '../loot-helper/utils/localization';
import type { Item, ItemRarity } from '../loot-helper/types/item';
import { CATEGORY, classKind, className, containerTypeLabel, KIND, tagPartLabel, taggedKind, type SpotKind, type TimingRule } from './data/kinds';
import { fmtScore } from './data/scoring';

/**
 * Kinds whose label is the same as an existing string: container kinds named like a Looting Helper location, and the
 * second "Other". Everything else is maps.kinds.<key>.
 */
const KIND_KEYS: Record<string, string> = {
  NatureMisc: 'maps.kinds.OtherFixed',
  Electrical: 'lootHelper.locations.electrical', Industrial: 'lootHelper.locations.industrial', Mechanical: 'lootHelper.locations.mechanical',
  Tech: 'lootHelper.locations.technological', Commercial: 'lootHelper.locations.commercial', Residential: 'lootHelper.locations.residential',
  Medical: 'lootHelper.locations.medical', Security: 'lootHelper.locations.security', OldWorld: 'lootHelper.locations.oldWorld',
  Exodus: 'lootHelper.locations.exodus', ARC: 'lootHelper.locations.arc', Raider: 'lootHelper.locations.raider',
};
/** Socket tag categories and item area tags ("OldWorld", "Tech") -> label of the Looting Helper location. */
const LOCATION_KEYS: Record<string, string> = {
  ARC: 'lootHelper.locations.arc', Commercial: 'lootHelper.locations.commercial', Electrical: 'lootHelper.locations.electrical',
  Exodus: 'lootHelper.locations.exodus', Industrial: 'lootHelper.locations.industrial', Mechanical: 'lootHelper.locations.mechanical',
  Medical: 'lootHelper.locations.medical', Nature: 'lootHelper.locations.nature', OldWorld: 'lootHelper.locations.oldWorld',
  Raider: 'lootHelper.locations.raider', Residential: 'lootHelper.locations.residential', Security: 'lootHelper.locations.security',
  Tech: 'lootHelper.locations.technological', Technological: 'lootHelper.locations.technological', Unknown: 'lootHelper.locations.unknown',
};
/** Categories named like a Looting Helper location (the others: maps.categories.<key>). */
const CATEGORY_KEYS: Record<string, string> = { Nature: 'lootHelper.locations.nature' };
/**
 * Container type tag parts with the label of a kind (Raider.MedicalBag) or of another type; tag-matched kinds (plants,
 * water tank) are named by their kind.
 */
const TYPE_KINDS: Record<string, string> = { MedicalBag: 'MedicalBag' };
const TYPE_ALIASES: Record<string, string> = { Lockers_02: 'Lockers', Crate01: 'Crate' };
const RARITIES = new Set<string>(['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary']);
/** Map layers by their English name in the data (no game string). */
const LAYER_KEYS: Record<string, string> = { Surface: 'surface', Underground: 'underground', 'Upper floor': 'upperFloor', 'Lower floor': 'lowerFloor' };
/** Why a condition is not offered (embark-api build-map-features.js EXCLUDED, plus the schedule). */
const REASON_KEYS: Record<string, string> = {
  'on hiatus': 'onHiatus', 'never released': 'neverReleased', tutorial: 'tutorial', 'practice range': 'practiceRange',
  'not in the schedule': 'notInSchedule',
};

export type MapText = ReturnType<typeof makeText>;

/** The wording helpers for a translator; exported for tests (components use useMapText). */
export function makeText(t: (key: string) => string, tm: (key: string, r: Record<string, string | number>) => string,
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string, locale: string) {
  /** Translation of `key`, or `fallback` when en.json has no such key. */
  const tOr = (key: string, fallback: string) => {
    const v = t(key);
    return v === key ? fallback : v;
  };
  const rules = new Intl.PluralRules(locale);
  /** `<key>One` for a singular count, else `<key>`; `{count}` is the formatted count. */
  const plural = (key: string, count: number, r: Record<string, string | number> = {}) =>
    tm(rules.select(count) === 'one' ? `${key}One` : key, { ...r, count: formatNumber(count) });
  const location = (name: string) => (LOCATION_KEYS[name] ? t(LOCATION_KEYS[name]) : name);
  const kind = (k: SpotKind) => t(KIND_KEYS[k.key] ?? `maps.kinds.${k.key}`);
  const category = (key: string) => (CATEGORY.has(key) ? t(CATEGORY_KEYS[key] ?? `maps.categories.${key}`) : key);
  /** Container type ("Industrial.Wrh") -> label of its second part, raw tag part as fallback. */
  const containerType = (type: string) => {
    const part = type.split('.')[1] ?? type;
    const k = taggedKind(type) ?? KIND.get(TYPE_KINDS[part] ?? '');
    if (k) return kind(k);
    return tOr(`maps.containerTypes.${TYPE_ALIASES[part] ?? part}`, containerTypeLabel(type));
  };
  const secs = (v: number) => (v < 0 ? t('maps.units.never')
    : v >= 60 ? tm('maps.units.minutes', { n: formatNumber(v / 60, { maximumFractionDigits: 1 }) })
      : tm('maps.units.seconds', { n: formatNumber(v) }));

  return {
    t, tm, plural,
    /** Intl locale of the site language (for sorting). */
    intlLocale: locale,
    num: (n: number) => formatNumber(n),
    /** Expected count: one decimal below 10. */
    exp: (x: number) => formatNumber(x, x < 10 ? { minimumFractionDigits: 1, maximumFractionDigits: 1 } : { maximumFractionDigits: 0 }),
    pct: (share: number, digits = 0) => formatNumber(share, { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }),
    score: (n: number) => fmtScore(n, formatNumber),
    /** Height in dm -> "+1.2" m (signed, one decimal). */
    meters: (dm: number) => formatNumber(dm / 10, { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero' }),
    list: (parts: string[]) => parts.join(', '),
    category,
    kind,
    kindByKey: (key: string) => {
      const k = KIND.get(key);
      return k ? kind(k) : key;
    },
    containerType,
    /** Full socket tag: category › container type › raw parts ("Industrial › Lockers › Door"). */
    containerTag: (tag: string) => {
      const [cat, type, ...rest] = tag.split('.');
      const catKind = KIND.get(cat);
      const parts = [catKind?.cat === 'Containers' ? kind(catKind) : location(cat)];
      if (type) parts.push(containerType(`${cat}.${type}`));
      return [...parts, ...rest.map(tagPartLabel)].join(' › ');
    },
    /** A container by tag, as in "harvested from …" (plants: their kind). */
    containerName: containerType,
    /** A spawned class: its kind, else the readable raw class. */
    className: (raw: string) => {
      const k = classKind(raw);
      return k ? kind(k) : className(raw);
    },
    layer: (name: string) => (LAYER_KEYS[name] ? t(`maps.layers.${LAYER_KEYS[name]}`) : name),
    zone: (z: string) => tOr(`maps.zones.${z}`, z),
    /** Area theme or item area tag ("OldWorld"). */
    location,
    /** Item tag chip: "Tier.Mid" -> Mid, "Rarity.01Common" -> Common. */
    itemTag: (tag: string) => {
      const [group, value = ''] = tag.split('.');
      if (group === 'Tier') return tOr(`maps.item.tiers.${value.toLowerCase()}`, value);
      const rarity = value.replace(/^\d+/, '');
      return group === 'Rarity' && RARITIES.has(rarity) ? getLocalizedLootHelperRarity(t, rarity as ItemRarity) : value;
    },
    conditionReason: (why: string) => (REASON_KEYS[why] ? t(`maps.conditionReasons.${REASON_KEYS[why]}`) : why),
    timing: (r: TimingRule) => {
      switch (r.t) {
        case 'noRespawn': return t('maps.timing.noRespawn');
        case 'respawn': return tm('maps.timing.respawn', { time: secs(r.secs) });
        case 'randomDelay': return tm('maps.timing.randomDelay', { min: formatNumber(r.min), max: formatNumber(r.max) });
        case 'noDynamic': return t('maps.timing.noDynamic');
        case 'airDrop': return tm('maps.timing.airDrop', { time: secs(r.secs) });
        case 'sneak': return tm(r.indoors ? 'maps.timing.sneakIndoors' : 'maps.timing.sneak', { time: secs(r.secs) });
        case 'activates': return tm('maps.timing.activates', { distance: formatNumber(r.meters) });
      }
    },
    itemName: (it: Item) => getItemDisplayName(it),
    /** Item card label from the game ("Quick Use", "Research Item"). */
    itemType: (it: Item) => it.categoryName ?? '',
  };
}

/** UI wording for the active locale. */
export function useMapText(): MapText {
  const { t, tm, formatNumber, locale } = useLocale();
  return useMemo(() => makeText(t, tm, formatNumber, getIntlLocale(locale)), [t, tm, formatNumber, locale]);
}
