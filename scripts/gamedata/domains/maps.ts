import * as fs from 'fs';
import * as path from 'path';
import type { GameMap, MapEventType, MapsStructure } from '../../../src/shared/gamedata/types';
import type { CanonRecord, Localization } from '../arcData';
import { repoRoot } from '../arcData';
import type { GenContext } from '../context';
import type { DomainModule } from './types';

interface CanonMap extends CanonRecord {
  mapName: string;
  scenarios: { gameMode: string; active: boolean; visible: boolean; disabled: boolean }[];
}

/** overlay/event-types.json entry (standalone data file, not applied to records). */
export interface OverlayEventType {
  name: Partial<Record<string, string>> & { en: string };
  icon?: string;
  category?: string;
  translationKey?: string;
  conditionIds?: number[];
}

export const EVENT_TYPES_OVERLAY = 'overlay/event-types.json';
/** Fallback for arc-data checkouts that predate the standalone overlay file. */
const LEGACY_EVENT_TYPES = path.join(repoRoot, 'public', 'data', 'schedule', 'event-types.json');

/** Current format of public/data/schedule/event-types.json (read by the schedule app/Lambda). */
export function legacyEventTypes(overlay: Record<string, OverlayEventType>, source: string): Record<string, unknown> {
  const eventTypes: Record<string, unknown> = {};
  for (const [id, e] of Object.entries(overlay)) {
    eventTypes[id] = {
      displayName: e.name.en,
      icon: e.icon,
      translationKey: e.translationKey,
      category: e.category,
      localizations: e.name,
    };
  }
  return {
    _readme: {
      description: 'Event type definitions used by schedule generators',
      format: 'Keys are event type ids and values contain display name, icon, category and localizations.',
    },
    metadata: { source },
    eventTypes,
  };
}

function loadEventTypes(ctx: GenContext): { types: Record<string, OverlayEventType>; source: string } {
  const overlay = ctx.arc.json<Record<string, OverlayEventType>>(EVENT_TYPES_OVERLAY);
  if (overlay) return { types: overlay, source: `arc-data/${EVENT_TYPES_OVERLAY}` };
  ctx.report.add('eventTypesFallback', `${EVENT_TYPES_OVERLAY} missing, read ${LEGACY_EVENT_TYPES}`);
  const legacy = JSON.parse(fs.readFileSync(LEGACY_EVENT_TYPES, 'utf8')).eventTypes as Record<
    string,
    { displayName: string; icon?: string; category?: string; translationKey?: string; localizations: OverlayEventType['name'] }
  >;
  const types: Record<string, OverlayEventType> = {};
  for (const [id, e] of Object.entries(legacy)) {
    types[id] = { name: e.localizations, icon: e.icon, category: e.category, translationKey: e.translationKey };
  }
  return { types, source: 'public/data/schedule/event-types.json' };
}

/** Maps that ship: referenced by quests, or with an active, visible, enabled Salvage scenario. */
export function shippedMaps(ctx: GenContext): { maps: CanonMap[]; skipped: string[] } {
  const referenced = new Set<number>();
  for (const q of ctx.arc.file('quests').values()) {
    for (const id of (q.mapIds as number[] | undefined) ?? []) referenced.add(id);
    for (const id of (q.requiresMaps as number[] | undefined) ?? []) referenced.add(id);
  }
  const maps: CanonMap[] = [];
  const skipped: string[] = [];
  for (const m of [...ctx.arc.file<CanonMap>('maps').values()].sort((a, b) => Number(a.id) - Number(b.id))) {
    const live = m.scenarios?.some((s) => s.gameMode === 'Salvage' && s.active && s.visible && !s.disabled);
    if (referenced.has(Number(m.id)) || live) maps.push(m);
    else skipped.push(`${m.id} ${m.mapName} (no live scenario, not referenced by quests)`);
  }
  // Slug-table entries without a canonical record are superseded duplicates (e.g. the old Dam).
  const known = new Set(ctx.arc.file('maps').keys());
  for (const [key, entry] of Object.entries(ctx.slugs.table('maps'))) {
    if (!known.has(key)) skipped.push(`${key} ${entry.slug} (slug without canonical map, superseded)`);
  }
  return { maps, skipped };
}

export function buildMaps(ctx: GenContext): { structure: MapsStructure; legacy: Record<string, unknown> } {
  const maps: Record<string, GameMap> = {};
  const picked = shippedMaps(ctx);
  for (const s of picked.skipped) ctx.report.add('skippedMaps', s);
  for (const m of picked.maps) {
    const slug = ctx.slugs.slugOf('maps', String(m.id));
    if (!slug) {
      ctx.report.add('mapsWithoutSlug', `${m.id} ${m.mapName}`);
      continue;
    }
    // Overlay fill names are not always merged into maps.json yet; the frozen slug table keeps the label.
    const nameEn = m.name?.en || ctx.slugs.get('maps', String(m.id))?.name;
    if (!nameEn) {
      ctx.report.add('mapsWithoutName', `${m.id} ${m.mapName}`);
      continue;
    }
    maps[slug] = { id: slug, nameEn };
    ctx.text.add('maps', slug, 'name', m.name?.en ? m.name : nameEn);
  }

  const { types, source } = loadEventTypes(ctx);
  const eventTypes: Record<string, MapEventType> = {};
  for (const [id, e] of Object.entries(types)) {
    if (maps[id]) throw new Error(`event type id collides with map slug: ${id}`);
    eventTypes[id] = { id, nameEn: e.name.en, ...(e.icon ? { icon: e.icon } : {}), ...(e.category === 'major' ? { major: true } : {}) };
    ctx.text.add('maps', id, 'name', e.name as Localization);
  }
  return { structure: { maps, eventTypes }, legacy: legacyEventTypes(types, source) };
}

/** Writes the schedule's event-types.json (committed file, or event-types.legacy.json beside the output dir when GAME_DATA_OUT is set). */
export function writeLegacyEventTypes(legacy: Record<string, unknown>): string {
  const out = process.env.GAME_DATA_OUT
    ? // sibling of the output dir: generate-game-data's removeStale() deletes unknown files inside it
      path.join(path.dirname(path.resolve(process.env.GAME_DATA_OUT)), 'event-types.legacy.json')
    : path.join(repoRoot, 'public', 'data', 'schedule', 'event-types.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(legacy, null, 2)}\n`);
  return out;
}

const module: DomainModule = {
  domain: 'maps',
  build(ctx) {
    const { structure, legacy } = buildMaps(ctx);
    writeLegacyEventTypes(legacy);
    return { ...structure };
  },
};

export default module;
