/**
 * Read-only slug lookup over the arc-data records (A40). The arc-data build
 * (embark-api lib/canonical/record-slugs.js) writes `slug`, `slugAliases` and `arctrackerId` into
 * the records of items, quests, projects, maps and benches; nothing here creates or writes a slug.
 * Traders, skills and offers have no slugs: the site uses their numeric ids.
 *
 * Record per kind:
 *   items    item records (any type except Generator)
 *   benches  the chain base Generator item (key = chain base asset id)
 *   quests   quests.json; projects  projects.json (kind 'project'); maps  maps.json
 */
import type { ArcData } from './arcData';

export type SlugKind = 'items' | 'quests' | 'benches' | 'projects' | 'maps';

export interface SlugEntry {
  slug: string;
  aliases?: string[];
  arctrackerId?: string;
}

export interface SlugStore {
  get(kind: SlugKind, key: string | number): SlugEntry | null;
  slugOf(kind: SlugKind, key: string | number): string | null;
  /** Record key for a slug or alias; null when unknown. */
  lookup(kind: SlugKind, slugOrAlias: string): string | null;
  /** alias → current slug. */
  aliases(kind: SlugKind): Record<string, string>;
  /** record key → entry. */
  table(kind: SlugKind): Record<string, SlugEntry>;
}

/** Synthetic project for the community event (no arc-data record); constant public slug. */
export const COMMUNITY_EVENT_SLUG = 'community_event';

interface SlugFields {
  slug?: unknown;
  slugAliases?: unknown;
  arctrackerId?: unknown;
}

function entryOf(rec: SlugFields): SlugEntry | null {
  if (typeof rec.slug !== 'string' || !rec.slug) return null;
  const entry: SlugEntry = { slug: rec.slug };
  if (Array.isArray(rec.slugAliases) && rec.slugAliases.length) entry.aliases = rec.slugAliases as string[];
  if (typeof rec.arctrackerId === 'string' && rec.arctrackerId) entry.arctrackerId = rec.arctrackerId;
  return entry;
}

export function openSlugStore(arc: ArcData): SlugStore {
  const tables: Record<SlugKind, Record<string, SlugEntry>> = { items: {}, quests: {}, benches: {}, projects: {}, maps: {} };

  for (const item of arc.items.values()) {
    const entry = entryOf(item as SlugFields);
    if (!entry) continue;
    if (item.type === 'Generator') tables.benches[String(item.baseId || item.id)] = entry;
    else tables.items[String(item.id)] = entry;
  }
  for (const [key, rec] of arc.file('quests')) {
    const entry = entryOf(rec as SlugFields);
    if (entry) tables.quests[key] = entry;
  }
  for (const [key, rec] of arc.file('projects')) {
    if (rec.kind !== 'project') continue;
    const entry = entryOf(rec as SlugFields);
    if (entry) tables.projects[key] = entry;
  }
  for (const [key, rec] of arc.file('maps')) {
    const entry = entryOf(rec as SlugFields);
    if (entry) tables.maps[key] = entry;
  }

  const lookups = new Map<SlugKind, Map<string, string>>();
  const lookupTable = (kind: SlugKind): Map<string, string> => {
    let m = lookups.get(kind);
    if (!m) {
      m = new Map();
      for (const [key, e] of Object.entries(tables[kind])) m.set(e.slug, key);
      for (const [key, e] of Object.entries(tables[kind])) for (const a of e.aliases ?? []) if (!m.has(a)) m.set(a, key);
      lookups.set(kind, m);
    }
    return m;
  };

  return {
    lookup: (kind, slugOrAlias) => lookupTable(kind).get(slugOrAlias) ?? null,
    get: (kind, key) => tables[kind][String(key)] ?? null,
    slugOf: (kind, key) => tables[kind][String(key)]?.slug ?? null,
    aliases(kind) {
      const out: Record<string, string> = {};
      for (const e of Object.values(tables[kind])) for (const a of e.aliases ?? []) out[a] = e.slug;
      return out;
    },
    table: (kind) => tables[kind],
  };
}
