#!/usr/bin/env npx tsx
/**
 * Update changelog generator: reads the releases of the canonical game data (embark-api
 * arc-data/releases/, see embark-api docs/Changelog-Design.md) and writes the site data to
 * public/data/updates/ (index.json + one file per release) and the release ids for the SEO pages
 * (src/apps/updates/releases.generated.ts).
 *
 * Public files carry slugs (items, quests, maps) and numeric offer/trader ids only: records
 * without a public id are shown by their localized name, records with neither (loot tables,
 * spawners, internal unlock items) are dropped.
 *
 * Usage: npx tsx scripts/generate-updates.ts   (GAME_DATA_DIR / EMBARK_API_DIR override the input)
 */
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { EMBARK_API_DIR, GAME_DATA_DIR, repoRoot } from './gamedata/arcData';
import {
  UPDATE_SECTIONS,
  UPDATES_SCHEMA_VERSION,
  type LocalizedText,
  type UpdateChange,
  type UpdateEntry,
  type UpdateRef,
  type UpdateRelease,
  type UpdatesIndex,
  type UpdateSummary,
  type UpdateValue,
} from '../src/apps/updates/types';
import { guideSectionsOf } from '../src/apps/updates/routing';

const OUT_DIR = path.join(repoRoot, 'public', 'data', 'updates');
const IDS_FILE = path.join(repoRoot, 'src', 'apps', 'updates', 'releases.generated.ts');
const RELEASES_DIR = path.join(GAME_DATA_DIR, 'releases');
// Skill icons: game textures of the current extract (same source as the item icons), as WebP.
const TEXTURE_ROOT = path.join(EMBARK_API_DIR, 'data-game-extract', 'current', 'textures', 'PioneerGame', 'Content');
const SKILL_ICON_DIR = path.join(repoRoot, 'public', 'images', 'skills');
const SKILL_ICON_URL = '/images/skills';
// Trader portraits (game textures, converted like the skill icons).
const TRADER_ICON_DIR = path.join(repoRoot, 'public', 'images', 'trader');
const TRADER_ICON_URL = '/images/trader';
// Images the site already has: ARC enemy icons of the maps app, bench images.
const PUBLIC_DIR = path.join(repoRoot, 'public');
const enemyIconOf = (nameEn: string) => `/data/map-data/icons/e-${nameEn.toLowerCase().replace(/^arc /, '').split(' ')[0]}.png`;
const benchImageOf = (slug: string) => `/images/benches/${slug}-tier1.webp`;

// ---- arc-data release files (embark-api lib/releases/index.js)

interface ArcRecord {
  kind: string;
  type: string | null;
  slug?: string;
  name: LocalizedText | null;
  label: string;
  rarity?: number;
  description?: LocalizedText;
  /** Game texture path (`/Game/.../T_UI_CharProg_X.T_UI_CharProg_X`). */
  icon?: string;
}

interface ArcChange {
  path: string;
  before: unknown;
  after: unknown;
  label?: LocalizedText & { key?: string };
}

interface ArcEntry {
  ref: string;
  op: UpdateEntry['op'];
  changes?: ArcChange[];
  snapshot?: Record<string, unknown>;
}

/** Release texts in arc-data are localized objects; an English string is accepted as well. */
type ArcText = LocalizedText | string;
const textOf = (v: ArcText): LocalizedText => (typeof v === 'string' ? { en: v } : localized(v));

interface ArcPresentation {
  hide?: string[];
  note?: ArcText;
  link?: { app: 'quests'; version: string };
}

interface ArcRelease extends Omit<UpdateRelease, 'schemaVersion' | 'majorTitle' | 'sections' | 'refs' | 'counts' | 'guideSections' | 'notes' | 'summary' | 'highlights' | 'findings'> {
  summary: ArcText;
  highlights: { text: ArcText; refs: string[] }[];
  findings?: { text: ArcText; refs: string[] }[];
  presentation?: Record<string, ArcPresentation>;
  sections: Record<string, ArcEntry[]>;
  records: Record<string, ArcRecord>;
}

const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8')) as T;
const isObject = (v: unknown): v is Record<string, unknown> => v != null && typeof v === 'object' && !Array.isArray(v);
const isLocalized = (v: unknown): v is LocalizedText => isObject(v) && typeof v.en === 'string';
const isItemList = (v: unknown): v is { id: number; amount: number }[] =>
  Array.isArray(v) && v.every((e) => isObject(e) && 'id' in e && 'amount' in e);

/** Localized text without the key and without empty translations (the site falls back to English). */
function localized(v: LocalizedText & { key?: string }): LocalizedText {
  return Object.fromEntries(Object.entries(v).filter(([k, s]) => k !== 'key' && s));
}

/** Translates one arc-data release into site data. */
function convertRelease(release: ArcRelease, majorTitle: string): UpdateRelease {
  const refs: Record<string, UpdateRef> = {};
  const siteRefOf = new Map<string, string | null>();
  let anon = 0;

  // arc-data ref (`<kind>:<id>`) -> public ref, or null when the record has no public identity.
  const siteRef = (arcRef: string): string | null => {
    if (siteRefOf.has(arcRef)) return siteRefOf.get(arcRef)!;
    const rec = release.records[arcRef];
    const id = arcRef.slice(arcRef.indexOf(':') + 1);
    let key: string | null = null;
    if (rec) {
      if (rec.kind === 'item' && rec.type === 'NPC') key = `trader:${id}`;
      else if (rec.kind === 'offer') key = `offer:${id}`;
      else if (rec.slug && (rec.kind === 'item' || rec.kind === 'quest')) key = `${rec.kind}:${rec.slug}`;
      else if (rec.slug && (rec.kind === 'map' || rec.kind === 'lootMap')) key = `map:${rec.slug}`;
      else if (rec.name) key = `r${++anon}`;
    }
    if (key && rec && !refs[key]) {
      refs[key] = {
        kind: rec.kind === 'lootMap' ? 'map' : rec.kind === 'item' && rec.type === 'NPC' ? 'trader' : rec.kind,
        ...(rec.slug ? { slug: rec.slug } : {}),
        ...(rec.name ? { name: localized(rec.name) } : {}),
        ...(rec.rarity != null ? { rarity: rec.rarity } : {}),
        ...(rec.description ? { description: localized(rec.description) } : {}),
        // Game texture paths (skills, trader portraits) become site images in refImages().
        ...((rec.kind === 'skillNode' || (rec.kind === 'item' && rec.type === 'NPC')) && rec.icon ? { icon: rec.icon } : {}),
        ...(rec.kind === 'enemy' && rec.name?.en && fs.existsSync(path.join(PUBLIC_DIR, enemyIconOf(rec.name.en))) ? { icon: enemyIconOf(rec.name.en) } : {}),
        ...(rec.kind === 'item' && rec.type === 'Generator' && rec.slug && fs.existsSync(path.join(PUBLIC_DIR, benchImageOf(rec.slug))) ? { icon: benchImageOf(rec.slug) } : {}),
      };
    }
    siteRefOf.set(arcRef, key);
    return key;
  };
  // A bare numeric id inside a value: try the kinds the arc-data release resolved it to.
  const idRef = (n: number): string | null => {
    for (const kind of ['item', 'quest', 'map', 'skillNode', 'project']) {
      if (release.records[`${kind}:${n}`]) return siteRef(`${kind}:${n}`);
    }
    return null;
  };
  const itemList = (list: { id: number; amount: number }[]): UpdateValue => ({
    items: list.flatMap((e) => {
      const ref = idRef(e.id);
      return ref ? [{ ref, amount: e.amount }] : [];
    }),
  });

  const value = (v: unknown, path: string): UpdateValue => {
    if (v == null) return null;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
    if (isLocalized(v)) return { text: localized(v) };
    if (Array.isArray(v) && /Ids$/.test(path)) return { refs: v.flatMap((n) => (typeof n === 'number' ? [idRef(n)].filter((r): r is string => !!r) : [])) };
    if (isItemList(v)) return itemList(v);
    if (isObject(v) && isLocalized(v.text)) return { text: localized(v.text), ...(typeof v.amount === 'number' ? { amount: v.amount } : {}) };
    if (isObject(v) && Array.isArray(v.items) && isItemList(v.items)) return itemList(v.items);
    return { changed: true };
  };

  const change = (c: ArcChange): UpdateChange | null => {
    const keys = [...c.path.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1]);
    let field = c.path.replace(/\[[^\]]*\]/g, '');
    let key: string | undefined;
    if (field.startsWith('budgets.')) {
      key = field.slice('budgets.'.length);
      field = 'budgets';
    } else if (field.startsWith('scenarios')) {
      // Scenario names are internal (`FrozenTrail_OptIn_PvE`); the mode is their last part.
      const mode = keys[0]?.split('_').slice(1).filter((p) => p !== 'OptIn').join(' ') || 'Standard';
      key = keys[0]?.includes('_OptIn') ? `${mode} (opt-in)` : mode;
      if (field !== 'scenarios') return null;
      return { field, key, before: c.before == null ? null : true, after: c.after == null ? null : true };
    } else if (keys.length && !c.label) {
      key = keys.join(' ');
    }
    const out: UpdateChange = { field, ...(key ? { key } : {}), ...(c.label ? { label: localized(c.label) } : {}), before: value(c.before, c.path), after: value(c.after, c.path) };
    return out;
  };

  const snapshot = (entry: ArcEntry, out: UpdateEntry) => {
    const s = entry.snapshot;
    if (!s) return;
    const trader = typeof s.owner === 'number' ? idRef(s.owner) ?? undefined : undefined;
    if (entry.ref.startsWith('offer:')) {
      const cost = s.cost as Record<string, unknown> | undefined;
      const accepts = cost && Array.isArray(cost.itemIds) ? cost.itemIds.flatMap((n) => (typeof n === 'number' ? [idRef(n)].filter((r): r is string => !!r) : [])) : [];
      out.offer = {
        ...(trader?.startsWith('trader:') ? { trader } : {}),
        cost: cost && isItemList(cost.items) ? itemList(cost.items) : cost && typeof cost.value === 'number' ? cost.value : null,
        ...(accepts.length ? { accepts } : {}),
        rewards: isObject(s.rewards) && isItemList(s.rewards.items) ? itemList(s.rewards.items) : null,
        start: (s.start as string | null) ?? null,
        end: (s.end as string | null) ?? null,
        ...(isObject(s.limit) && typeof s.limit.max === 'number' && s.limit.max > 0 ? { limit: s.limit.max } : {}),
      };
    } else if (entry.ref.startsWith('quest:')) {
      const rewards = isObject(s.rewards) && isObject(s.rewards.complete) && isItemList(s.rewards.complete.items) ? itemList(s.rewards.complete.items) : null;
      out.quest = {
        ...(trader ? { trader } : {}),
        maps: Array.isArray(s.mapIds) ? s.mapIds.flatMap((n) => (typeof n === 'number' ? [idRef(n)].filter((r): r is string => !!r) : [])) : [],
        rewards,
      };
    }
  };

  const sections: UpdateRelease['sections'] = {};
  const counts: UpdateRelease['counts'] = {};
  const guide = guideSectionsOf(release.id);
  const guideSections: NonNullable<UpdateRelease['guideSections']> = {};
  for (const section of UPDATE_SECTIONS) {
    if (section === 'highlights') continue;
    const entries: UpdateEntry[] = [];
    // Editorial hiding (`<kind>:<op>`), e.g. the reward changes of every quest in a major update.
    const hide = new Set(release.presentation?.[section]?.hide ?? []);
    for (const e of release.sections[section] ?? []) {
      if (hide.has(`${e.ref.slice(0, e.ref.indexOf(':'))}:${e.op}`)) continue;
      const ref = siteRef(e.ref);
      if (!ref) continue;
      const out: UpdateEntry = { ref, op: e.op };
      if (e.changes) {
        out.changes = e.changes.map(change).filter((c): c is UpdateChange => !!c);
        if (!out.changes.length) continue;
      }
      snapshot(e, out);
      entries.push(out);
    }
    // A skill that keeps its name in a rebuilt tree gets a new node id: it is neither new nor gone.
    const skillName = (e: UpdateEntry) => (refs[e.ref]?.kind === 'skillNode' ? refs[e.ref]?.name?.en : undefined);
    const addedSkills = new Set(entries.filter((e) => e.op === 'added').map(skillName).filter(Boolean));
    const removedSkills = new Set(entries.filter((e) => e.op === 'removed').map(skillName).filter(Boolean));
    for (let i = entries.length - 1; i >= 0; i--) {
      const name = skillName(entries[i]);
      if (name && entries[i].op !== 'changed' && addedSkills.has(name) && removedSkills.has(name)) entries.splice(i, 1);
    }
    if (!entries.length) continue;
    counts[section] = entries.length;
    // Covered by the What's New guide: only the count and the guide link are published.
    if (guide[section]) guideSections[section] = { path: guide[section]!, count: entries.length };
    else sections[section] = entries;
  }
  const notes = (list: { text: ArcText; refs: string[] }[]) => list.map((h) => ({ text: textOf(h.text), refs: h.refs.map(siteRef).filter((r): r is string => !!r) }));
  const highlights = notes(release.highlights);
  const findings = notes(release.findings ?? []);
  if (highlights.length) counts.highlights = highlights.length;
  if (findings.length) counts.findings = findings.length;

  const used = new Set(JSON.stringify([sections, highlights, findings]).match(/"(?:item|quest|map|offer|trader):[^"]+"|"r\d+"/g)?.map((s) => s.slice(1, -1)));
  return {
    schemaVersion: UPDATES_SCHEMA_VERSION,
    id: release.id,
    slug: release.slug ?? release.id,
    version: release.version,
    title: release.title,
    kind: release.kind,
    major: release.major,
    majorTitle,
    date: release.date,
    links: release.links ?? [],
    summary: textOf(release.summary),
    counts: Object.fromEntries([...UPDATE_SECTIONS, 'findings' as const].filter((s) => counts[s]).map((s) => [s, counts[s]])),
    highlights,
    findings,
    ...(Object.keys(guideSections).length ? { guideSections } : {}),
    ...(release.presentation
      ? { notes: Object.fromEntries(Object.entries(release.presentation).map(([s, p]) => [s, { ...(p.note ? { note: textOf(p.note) } : {}), ...(p.link ? { link: p.link } : {}) }])) }
      : {}),
    sections,
    // Only the refs the published parts use (sections covered by the guide are not published).
    refs: Object.fromEntries(Object.entries(refs).filter(([k]) => used.has(k)).sort(([a], [b]) => (a < b ? -1 : 1))),
  };
}

function write(file: string, content: string): void {
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (current !== content) fs.writeFileSync(file, content);
}

/** Texture file name (without .png) -> path, under the extract's texture root. */
function textureIndex(): Map<string, string> {
  const index = new Map<string, string>();
  if (!fs.existsSync(TEXTURE_ROOT)) return index;
  const walk = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.name.endsWith('.png')) index.set(ent.name.slice(0, -4), full);
    }
  };
  walk(TEXTURE_ROOT);
  return index;
}

/**
 * Replaces the game texture path of skill and trader refs with a site image (`/images/skills/…`,
 * `/images/trader/…`), converting the texture when the image is missing; a texture the extract
 * lacks drops the icon. Refs that already point at a site image (enemies, benches) stay.
 */
async function refImages(site: UpdateRelease[]): Promise<void> {
  const textures = textureIndex();
  for (const release of site) {
    for (const ref of Object.values(release.refs)) {
      if (!ref.icon || !ref.icon.startsWith('/Game/')) continue;
      const [dir, url] = ref.kind === 'trader' ? [TRADER_ICON_DIR, TRADER_ICON_URL] : [SKILL_ICON_DIR, SKILL_ICON_URL];
      fs.mkdirSync(dir, { recursive: true });
      const name = ref.icon.split('.').pop()!;
      const file = `${name.toLowerCase()}.webp`;
      const out = path.join(dir, file);
      const source = textures.get(name);
      if (!fs.existsSync(out) && source) await sharp(source).webp({ quality: 90 }).toFile(out);
      if (fs.existsSync(out)) ref.icon = `${url}/${file}`;
      else delete ref.icon;
    }
  }
}

async function main(): Promise<void> {
  if (!fs.existsSync(path.join(RELEASES_DIR, 'index.json'))) {
    console.log(`no releases in ${RELEASES_DIR}; nothing to do`);
    return;
  }
  const arcIndex = readJson<{ releases: { id: string }[] }>(path.join(RELEASES_DIR, 'index.json'));
  const arcReleases = arcIndex.releases.map((r) => readJson<ArcRelease>(path.join(RELEASES_DIR, `${r.id}.json`)));
  const titleOf = new Map(arcReleases.map((r) => [r.id, r.title]));
  const site = arcReleases.map((r) => convertRelease(r, titleOf.get(r.major) ?? r.title));
  await refImages(site);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const written = new Set<string>(['index.json']);
  for (const r of site) {
    write(path.join(OUT_DIR, `${r.id}.json`), `${JSON.stringify(r)}\n`);
    written.add(`${r.id}.json`);
  }
  const index: UpdatesIndex = {
    schemaVersion: UPDATES_SCHEMA_VERSION,
    releases: site.map((r, i): UpdateSummary => ({
      id: r.id,
      slug: r.slug,
      version: r.version,
      title: r.title,
      kind: r.kind,
      major: r.major,
      date: r.date,
      summary: r.summary,
      counts: r.counts,
      prev: site[i - 1]?.id ?? null,
      next: site[i + 1]?.id ?? null,
    })),
  };
  write(path.join(OUT_DIR, 'index.json'), `${JSON.stringify(index)}\n`);
  for (const f of fs.readdirSync(OUT_DIR)) if (!written.has(f)) fs.unlinkSync(path.join(OUT_DIR, f));

  write(
    IDS_FILE,
    `// Generated by scripts/generate-updates.ts: URL slugs of the published releases (for the SEO pages).\nexport const UPDATE_SLUGS: readonly string[] = ${JSON.stringify(site.map((r) => r.slug))};\n`,
  );
  console.log(`wrote ${site.length} release(s) to ${path.relative(repoRoot, OUT_DIR)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
