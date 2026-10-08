/**
 * Read access to the canonical game data (embark-api arc-data/, layer 1).
 * Spec: embark-api docs/arc-data/spec-canonical.md
 *
 * Canonical records are typed loosely here (Canon*): the binding definition is the arc-data
 * JSON Schema. Only fields the site generators use are declared.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '..', '..');

export const EMBARK_API_DIR = path.resolve(process.env.EMBARK_API_DIR ?? path.join(repoRoot, '..', 'embark-api'));
export const GAME_DATA_DIR = path.resolve(process.env.GAME_DATA_DIR ?? path.join(EMBARK_API_DIR, 'arc-data'));

export const LOCALES = ['en', 'de', 'es', 'fr', 'it', 'ja', 'ko-KR', 'pl', 'pt-BR', 'ru', 'tr', 'zh-CN', 'zh-TW'] as const;
export type Locale = (typeof LOCALES)[number];

export type Localization = { key: string | null } & Record<Locale, string>;

export interface CanonAmount {
  id: number;
  amount: number;
}

export interface CanonRewardPackage {
  items: { id: number; amount: number; durability?: number; hidden?: boolean }[];
  random: { maxAmount: number; pools: { amount: number; items: { id: number; amount: number; weight: number }[] }[] } | null;
}

export type CanonCost =
  | { type: 'itemAmounts'; items: CanonAmount[] }
  | { type: 'itemScrapValue'; itemIds: number[]; itemTags: string[]; value: number }
  | { type: string; [k: string]: unknown };

export interface CanonUpgrade {
  next: number;
  cost: CanonCost;
  requires: CanonAmount[];
  requiresProjects: unknown[];
}

export interface CanonRecord {
  id: number | string;
  kind: string;
  type: string | null;
  internalName?: string | null;
  assetPath?: string | null;
  tag?: string | null;
  name?: Localization | null;
  description?: Localization | null;
  icon?: string | null;
  addedIn?: string | null;
  sources: string[];
  raw?: Record<string, unknown>;
  [field: string]: unknown;
}

export interface CanonItem extends CanonRecord {
  id: number;
  baseId: number;
  quality: number;
  maxStack: number;
  stackable: boolean;
  unique: boolean;
  tags: string[];
  groupIds: number[];
  value: number;
  recycle: CanonRewardPackage;
  scrap: CanonRewardPackage;
  repair: { cost: CanonAmount[]; durability: number };
  slots: { discriminator: string; [k: string]: unknown };
  upgrades: CanonUpgrade[];
}

export interface CanonOffer extends CanonRecord {
  id: number;
  owner: number;
  title: string;
  cost: CanonCost;
  requires: CanonAmount[];
  rewards: CanonRewardPackage;
  limit: { max: number; refreshSeconds: number };
  durationSeconds: number;
  start: string | null;
  end: string | null;
  visible: boolean;
  order: number;
}

export interface CanonConstants {
  currencies: Record<string, number>;
  owners: Record<string, number>;
  stash: Record<string, number | number[]>;
  gameSettings: Record<string, string>;
}

export interface ArcData {
  dir: string;
  commit: string | null;
  meta: { gameVersion: string | null; gameManifest: string | null; apiDumpCommit: string | null };
  constants: CanonConstants;
  /** All items by asset id, across items/<type>.json. */
  items: Map<number, CanonItem>;
  /** All offers by offer id, across offers/<type>.json. */
  offers: Map<number, CanonOffer>;
  /** Other record files by file name without .json (quests, projects, maps, skill-trees, …). */
  file<T extends CanonRecord = CanonRecord>(name: string): Map<string, T>;
  /** Plain JSON file (e.g. overlay/event-types.json); null when missing. */
  json<T>(relPath: string): T | null;
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function readDirRecords<T>(dir: string): Map<number, T> {
  const out = new Map<number, T>();
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith('.json')) continue;
    for (const [id, rec] of Object.entries(readJson<Record<string, T>>(path.join(dir, f)))) out.set(Number(id), rec);
  }
  return out;
}

export function loadArcData(dir: string = GAME_DATA_DIR): ArcData {
  if (!fs.existsSync(path.join(dir, 'meta.json'))) {
    throw new Error(`arc-data not found at ${dir} (set GAME_DATA_DIR)`);
  }
  let commit: string | null = null;
  try {
    commit = execFileSync('git', ['-C', dir, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    commit = null;
  }
  const cache = new Map<string, Map<string, CanonRecord>>();
  return {
    dir,
    commit,
    meta: readJson(path.join(dir, 'meta.json')),
    constants: readJson(path.join(dir, 'constants.json')),
    items: readDirRecords<CanonItem>(path.join(dir, 'items')),
    offers: readDirRecords<CanonOffer>(path.join(dir, 'offers')),
    file<T extends CanonRecord = CanonRecord>(name: string): Map<string, T> {
      if (!cache.has(name)) {
        const file = path.join(dir, `${name}.json`);
        const data = fs.existsSync(file) ? readJson<Record<string, CanonRecord>>(file) : {};
        cache.set(name, new Map(Object.entries(data)));
      }
      return cache.get(name) as Map<string, T>;
    },
    json<T>(relPath: string): T | null {
      const file = path.join(dir, relPath);
      return fs.existsSync(file) ? readJson<T>(file) : null;
    },
  };
}
