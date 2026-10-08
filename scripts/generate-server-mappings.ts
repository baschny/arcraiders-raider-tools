#!/usr/bin/env npx tsx
/**
 * Server mapping generator: writes infra/lambda/data/game-mappings.json, the only place where
 * Embark asset ids and site slugs meet outside arc-data (spec-site.md#server-side-mapping-tables).
 * The Embark Lambdas (inventory, quests, projects) bundle this file.
 *
 * Inputs: arc-data (embark-api/arc-data, canonical), its frozen slug tables (read-only, nothing is
 * created or saved here) and the generated site data in public/data/game/*.json. Run
 * `npm run generate:game-data` first.
 *
 * Usage: npx tsx scripts/generate-server-mappings.ts
 *   GAME_DATA_DIR / EMBARK_API_DIR override the input locations.
 */
import * as fs from 'fs';
import * as path from 'path';
import { EMBARK_API_DIR, loadArcData, repoRoot, type CanonItem, type CanonRecord } from './gamedata/arcData';
import { createContext } from './gamedata/context';
import { openSlugStore, type SlugKind, type SlugStore } from './gamedata/slugs';

const SITE_DIR = path.join(repoRoot, 'public', 'data', 'game');
const OUTPUT = path.join(repoRoot, 'infra', 'lambda', 'data', 'game-mappings.json');
const SCHEMA_VERSION = 2;

/**
 * Inventory tree ids that arc-data constants.json does not carry yet (it has currencies, owners and
 * the stash containers). They are InventoryStructure / OnlineItem assets; the generator checks
 * that every one still exists in arc-data.
 */
const INVENTORY_STRUCTURE_IDS = {
  inventoryRoot: 1173010504,
  currentAugment: 129937576,
  regularItemSlot: 1440007245,
  weaponSlot: -620731692,
  quickUseSlot: -1277506061,
  safePocketSlot: -3680536,
  meleeSlot: -666604429,
  workshopRoot: -1264657974,
  workshopBenchSlot: 407,
  mainStashRoot: -2121050171,
  extraStashRoot: -205714511,
  loadoutFrameSlot: -1379879497,
};

// --- site data ------------------------------------------------------------------------------------

function readSite<T>(file: string): T {
  const p = path.join(SITE_DIR, file);
  if (!fs.existsSync(p)) throw new Error(`Site data missing: ${path.relative(repoRoot, p)} (run npm run generate:game-data)`);
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
}

interface SiteItems {
  items: Record<string, unknown>;
  arctrackerAliases?: Record<string, string>;
}
interface SiteBlueprints {
  blueprints: Record<string, { blueprintItemId: string; unlocksItemId?: string }>;
}
interface SiteQuests {
  quests: Record<string, { objective: SiteObjective }>;
}
interface SiteObjective {
  key: string;
  children?: SiteObjective[];
}
interface SiteProjects {
  projects: Record<
    string,
    {
      nameEn: string;
      phases: { key: string; steps: { key: string; goals: { key: string; goalType: string; amount: number; itemIds?: string[] }[] }[] }[];
    }
  >;
}

/** Looks up a dotted path in the nested text structure written by TextCollector. */
function textAt(text: Record<string, unknown> | undefined, segments: string[]): string | null {
  let cur: unknown = text;
  for (const s of segments) {
    if (!cur || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[s];
  }
  return typeof cur === 'string' ? cur : null;
}

// --- helpers --------------------------------------------------------------------------------------

/** Read-only view of the slug tables: lookups only, never creates or saves a slug. */
function readOnlySlugs(store: SlugStore): SlugStore {
  return new Proxy(store, {
    get(target, prop) {
      if (prop === 'getOrCreate') return () => null;
      if (prop === 'save') return () => [];
      const v = (target as unknown as Record<string | symbol, unknown>)[prop];
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
  });
}

function sortKeys<T>(map: Map<string, T> | Record<string, T>): Record<string, T> {
  const entries = map instanceof Map ? [...map] : Object.entries(map);
  const numeric = (k: string) => /^-?\d+$/.test(k);
  entries.sort(([a], [b]) => (numeric(a) && numeric(b) ? Number(a) - Number(b) : a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(entries);
}

function set<T>(target: Map<string, T>, key: string | number, value: T, label: string, conflict: (a: T, b: T) => boolean = (a, b) => a !== b): void {
  const k = String(key);
  const existing = target.get(k);
  if (existing !== undefined && conflict(existing, value)) throw new Error(`Conflicting ${label} mapping for ${k}`);
  target.set(k, value);
}

function itemName(item: CanonRecord | undefined): string | null {
  return item?.name?.en || item?.internalName || null;
}

// --- main -----------------------------------------------------------------------------------------

function main(): void {
  const arc = loadArcData();
  const slugs = readOnlySlugs(openSlugStore(arc.dir));
  const ctx = createContext(arc, slugs);
  const warnings: string[] = [];

  const siteItems = readSite<SiteItems>('items.json');
  const siteBlueprints = readSite<SiteBlueprints>('blueprints.json');
  const siteQuests = readSite<SiteQuests>('quests.json');
  const siteProjects = readSite<SiteProjects>('projects.json');
  const projectsText = readSite<Record<string, Record<string, unknown>>>('projects.text.en.json');

  // items: asset id -> slug, for every shipped item (currencies included).
  const items = new Map<string, string>();
  for (const [id] of arc.items) {
    const slug = slugs.slugOf('items', id);
    if (slug && slug in siteItems.items) set(items, id, slug, 'item');
  }
  const unmatched = Object.keys(siteItems.items).filter((slug) => ![...items.values()].includes(slug));
  if (unmatched.length) warnings.push(`items in site data without asset id: ${unmatched.join(', ')}`);

  // blueprintUnlocks: unlock (OnlineItem) -> { blueprintItemId, itemId }. Blueprint learning offers
  // consume the blueprint item and reward the unlock; the unlocked item comes from the site data.
  const blueprintUnlocks = new Map<string, { blueprintItemId: string; itemId: string }>();
  const siteByBlueprint = new Map(Object.values(siteBlueprints.blueprints).map((b) => [b.blueprintItemId, b]));
  for (const offer of [...arc.offers.values()].sort((a, b) => a.id - b.id)) {
    if (offer.type !== 'Chamber' || offer.owner !== arc.constants.owners.blueprintLearning) continue;
    const cost = offer.cost.type === 'itemAmounts' ? (offer.cost as { items: { id: number }[] }).items : [];
    const bpSlug = cost.map((c) => items.get(String(c.id))).find((s): s is string => !!s);
    const site = bpSlug ? siteByBlueprint.get(bpSlug) : undefined;
    if (!bpSlug || !site?.unlocksItemId) {
      warnings.push(`blueprint offer ${offer.id} without resolvable blueprint/unlocked item`);
      continue;
    }
    for (const r of offer.rewards.items) {
      set(blueprintUnlocks, r.id, { blueprintItemId: bpSlug, itemId: site.unlocksItemId }, 'blueprint unlock', (a, b) => a.blueprintItemId !== b.blueprintItemId || a.itemId !== b.itemId);
    }
  }

  // benches: generator asset id -> { benchId, level } via the Generator chains.
  const benches = new Map<string, { benchId: string; level: number }>();
  for (const item of arc.items.values()) {
    if (item.type !== 'Generator') continue;
    const ref = ctx.benchLevel(item.id);
    if (ref?.benchId) set(benches, item.id, { benchId: ref.benchId, level: ref.level }, 'bench', (a, b) => a.benchId !== b.benchId || a.level !== b.level);
    else warnings.push(`generator ${item.id} (${item.internalName}) without bench slug`);
  }

  // structures: InventoryStructure asset id -> name. Firearm mod slot markers (DA_ModSlot_*, type
  // Modification, "Empty slot for a muzzle mod.") are placeholders in the inventory tree, not real
  // items, so they count as structures too (the decoder never reports a structure as an item).
  const structures = new Map<string, string>();
  for (const item of arc.items.values() as IterableIterator<CanonItem>) {
    if (item.type !== 'InventoryStructure' && !item.internalName?.startsWith('DA_ModSlot_')) continue;
    const name = itemName(item);
    if (name) structures.set(String(item.id), name);
  }

  // augmentLoadouts: unchanged semantics, input is still arcraiders-api-mapping.
  const augmentFile = path.join(EMBARK_API_DIR, 'arcraiders-api-mapping', 'augment-loadout-mapping.json');
  if (!fs.existsSync(augmentFile)) throw new Error(`Required mapping file missing: ${augmentFile}`);
  const augmentLoadouts = new Map<string, unknown>();
  const augmentSource = JSON.parse(fs.readFileSync(augmentFile, 'utf8')) as {
    augments?: Record<string, { loadoutContainerAssetId: number; backpackSlots?: number; quickItemSlots?: number; safePocketSlots?: number; augmentedSlots?: number; name?: string }>;
  };
  for (const [assetId, a] of Object.entries(augmentSource.augments ?? {})) {
    augmentLoadouts.set(assetId, {
      loadoutFrameAssetId: Number(a.loadoutContainerAssetId),
      backpackSlots: Number(a.backpackSlots ?? 0),
      quickUseSlots: Number(a.quickItemSlots ?? 0),
      safePocketSlots: Number(a.safePocketSlots ?? 0),
      auxiliarySlots: Number(a.augmentedSlots ?? 0),
      ...(a.name ? { name: a.name } : {}),
    });
  }

  // quests: quest asset id -> { questId, objectives: { node asset id: key }, required: { atomic node id: amount } }.
  // Keys follow the site quests generator: root '0', children '<parent>.<index>'.
  interface QuestNode {
    id: number;
    children?: QuestNode[] | null;
    action?: { amount?: number } | null;
  }
  const quests = new Map<string, { questId: string; objectives: Record<string, string>; required: Record<string, number> }>();
  for (const [key, q] of arc.file('quests')) {
    const slug = slugs.slugOf('quests', key);
    const site = slug ? siteQuests.quests[slug] : undefined;
    if (!slug || !site) continue;
    const objectives: Record<string, string> = {};
    const required: Record<string, number> = {};
    const siteKeys = new Set<string>();
    const collect = (n: SiteObjective): void => {
      siteKeys.add(n.key);
      n.children?.forEach(collect);
    };
    collect(site.objective);
    const walk = (n: QuestNode, nodeKey: string): void => {
      if (!siteKeys.has(nodeKey)) throw new Error(`Objective key ${nodeKey} of ${slug} missing in site quests.json`);
      objectives[String(n.id)] = nodeKey;
      if (n.children?.length) n.children.forEach((c, i) => walk(c, `${nodeKey}.${i}`));
      else required[String(n.id)] = Number(n.action?.amount ?? 1);
    };
    walk((q as unknown as { objective: QuestNode }).objective, '0');
    if (Object.keys(objectives).length !== siteKeys.size) warnings.push(`quest ${slug}: objective count differs from site data`);
    set(quests, key, { questId: slug, objectives, required }, 'quest', () => true);
  }

  // projects: project / phase / step / goal asset ids -> { projectId, key } (+ display data the
  // Lambda needs to keep its output shape: name of project and step, item and amount of a goal).
  type ProjectEntry = { projectId: string; key?: string; name?: string; itemId?: string; required?: number };
  const projects = new Map<string, ProjectEntry>();
  interface CanonProjectRec {
    kind: string;
    phases?: { id: number; steps?: { id: number; goals?: { id: number }[] }[] }[];
  }
  for (const [key, rec] of arc.file<CanonRecord>('projects')) {
    const p = rec as unknown as CanonProjectRec;
    if (p.kind !== 'project') continue;
    const slug = slugs.slugOf('projects', key);
    const site = slug ? siteProjects.projects[slug] : undefined;
    if (!slug || !site) {
      warnings.push(`project ${key} without site data`);
      continue;
    }
    const text = projectsText[slug];
    set(projects, key, { projectId: slug, name: site.nameEn }, 'project', () => true);
    (p.phases ?? []).forEach((phase, i) => {
      if (phase.id != null) set(projects, phase.id, { projectId: slug, key: String(i) }, 'project phase', () => true);
      (phase.steps ?? []).forEach((step, j) => {
        const stepKey = `${i}.${j}`;
        const siteStep = site.phases[i]?.steps[j];
        if (!siteStep) throw new Error(`Step ${stepKey} of ${slug} missing in site projects.json`);
        if (step.id != null) {
          const name = textAt(text, ['steps', String(i), String(j), 'name']) ?? `Step ${j + 1}`;
          set(projects, step.id, { projectId: slug, key: stepKey, name }, 'project step', () => true);
        }
        (step.goals ?? []).forEach((goal, k) => {
          const siteGoal = siteStep.goals[k];
          if (!siteGoal) throw new Error(`Goal ${stepKey}.${k} of ${slug} missing in site projects.json`);
          const entry: ProjectEntry = { projectId: slug, key: `${stepKey}.${k}`, required: siteGoal.amount };
          const itemId = siteGoal.goalType === 'items' ? siteGoal.itemIds?.[0] : undefined;
          if (itemId) entry.itemId = itemId;
          set(projects, goal.id, entry, 'project goal', () => true);
        });
      });
    });
  }

  // arctracker: arctrackerId -> slug, where the two differ. Per kind, since quest ids ("ss10a") and
  // item ids live in separate namespaces on arctracker.
  const arctracker: Record<string, Record<string, string>> = {};
  for (const kind of ['items', 'quests', 'projects', 'benches'] as SlugKind[]) {
    const out = new Map<string, string>();
    for (const entry of Object.values(slugs.table(kind))) {
      if (entry.arctrackerId && entry.arctrackerId !== entry.slug) out.set(entry.arctrackerId, entry.slug);
    }
    arctracker[kind] = sortKeys(out);
  }
  const siteAliasMismatch = Object.entries(siteItems.arctrackerAliases ?? {}).filter(([a, s]) => arctracker.items[a] !== s);
  if (siteAliasMismatch.length) warnings.push(`arctracker item aliases differ from items.json: ${JSON.stringify(siteAliasMismatch)}`);

  // constants: arc-data constants.json plus the inventory tree ids it does not carry yet.
  for (const [name, id] of Object.entries(INVENTORY_STRUCTURE_IDS)) {
    if (!arc.items.has(id)) throw new Error(`Inventory constant ${name} (${id}) no longer exists in arc-data`);
  }
  const { currencies, owners, stash } = arc.constants;
  const constants = { currencies, owners, stash, inventory: INVENTORY_STRUCTURE_IDS };
  for (const [name, id] of Object.entries(currencies)) {
    if (!items.has(String(id))) warnings.push(`currency ${name} (${id}) is not a shipped item`);
  }

  for (const [name, size] of Object.entries({ items: items.size, blueprintUnlocks: blueprintUnlocks.size, benches: benches.size, structures: structures.size, augmentLoadouts: augmentLoadouts.size, quests: quests.size, projects: projects.size })) {
    if (size === 0) throw new Error(`Generated ${name} is empty`);
  }

  const output = {
    schemaVersion: SCHEMA_VERSION,
    gameVersion: arc.meta.gameVersion,
    generatedFrom: arc.commit,
    items: sortKeys(items),
    blueprintUnlocks: sortKeys(blueprintUnlocks),
    benches: sortKeys(benches),
    structures: sortKeys(structures),
    augmentLoadouts: sortKeys(augmentLoadouts),
    quests: sortKeys(quests),
    projects: sortKeys(projects),
    arctracker,
    constants,
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(output, null, 2)}\n`);

  console.log('Generated server mappings');
  for (const k of ['items', 'blueprintUnlocks', 'benches', 'structures', 'augmentLoadouts', 'quests', 'projects'] as const) {
    console.log(`  ${k}: ${Object.keys(output[k]).length}`);
  }
  console.log(`  output: ${path.relative(repoRoot, OUTPUT)}`);
  for (const w of [...new Set(warnings)]) console.warn(`  warning: ${w}`);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
