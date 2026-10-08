/**
 * Writes domain files under public/data/game/: `<domain>.json` (structure with envelope) and
 * `<domain>.text.<locale>.json`. Output is compact JSON with sorted record keys (deterministic).
 * Enforces gzip size budgets (spec-site.md#files).
 */
import * as fs from 'fs';
import * as path from 'path';
import { gzipSync } from 'zlib';
import { GAME_DATA_SCHEMA_VERSION, type GameDomain } from '../../src/shared/gamedata/types';
import { LOCALES, repoRoot } from './arcData';
import type { TextCollector } from './text';

export const OUTPUT_DIR = path.join(repoRoot, 'public', 'data', 'game');

/** gzip budgets in KB: [structure, text per locale]. */
export const BUDGETS_KB: Record<GameDomain, [number, number]> = {
  items: [300, 150],
  recipes: [100, 0],
  research: [100, 50],
  blueprints: [50, 0],
  trades: [100, 20],
  benches: [50, 20],
  outpost: [150, 50],
  stencils: [50, 20],
  projects: [100, 50],
  quests: [200, 100],
  skilltree: [50, 30],
  amplification: [100, 0],
  maps: [20, 10],
};

/** Recursively sorts object keys of maps keyed by slug (records keep their field order). */
function sortRecordMaps(value: unknown, depth: number): unknown {
  if (depth === 0 || !value || typeof value !== 'object' || Array.isArray(value)) return value;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(value as object).sort()) out[k] = (value as Record<string, unknown>)[k];
  return out;
}

/** Drops undefined, empty arrays and empty objects (spec: optional fields are omitted when empty). */
export function prune<T>(value: T): T {
  if (Array.isArray(value)) return value.map(prune) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as object)) {
      const p = prune(v);
      if (p === undefined) continue;
      if (Array.isArray(p) && p.length === 0) continue;
      if (p && typeof p === 'object' && !Array.isArray(p) && Object.keys(p).length === 0) continue;
      out[k] = p;
    }
    return out as T;
  }
  return value;
}

export interface WriteResult {
  files: string[];
  overBudget: string[];
  sizes: Record<string, number>;
}

export function serialize(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

export function writeDomain(
  domain: GameDomain,
  structure: Record<string, unknown>,
  text: TextCollector | null,
  envelope: { gameVersion: string | null; generatedFrom: string | null; aliases?: Record<string, string> },
  outDir: string = OUTPUT_DIR,
): WriteResult {
  fs.mkdirSync(outDir, { recursive: true });
  const result: WriteResult = { files: [], overBudget: [], sizes: {} };
  const [structBudget, textBudget] = BUDGETS_KB[domain];

  const body: Record<string, unknown> = {
    schemaVersion: GAME_DATA_SCHEMA_VERSION,
    gameVersion: envelope.gameVersion,
    generatedFrom: envelope.generatedFrom,
  };
  if (envelope.aliases && Object.keys(envelope.aliases).length) body.aliases = sortRecordMaps(envelope.aliases, 1);
  for (const [k, v] of Object.entries(prune(structure))) body[k] = sortRecordMaps(v, 1);

  const emit = (rel: string, content: string, budgetKb: number) => {
    const file = path.join(outDir, rel);
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (current !== content) fs.writeFileSync(file, content);
    const gz = gzipSync(content).length;
    result.sizes[rel] = gz;
    result.files.push(rel);
    if (budgetKb > 0 && gz > budgetKb * 1024) result.overBudget.push(`${rel}: ${(gz / 1024).toFixed(1)} KB gz > ${budgetKb} KB`);
  };

  emit(`${domain}.json`, serialize(body), structBudget);
  if (text && text.has(domain)) {
    for (const locale of LOCALES) emit(`${domain}.text.${locale}.json`, serialize(text.build(domain, locale)), textBudget);
  }
  return result;
}

/** Removes files in outDir that the current run did not write. */
export function removeStale(written: string[], outDir: string = OUTPUT_DIR): string[] {
  if (!fs.existsSync(outDir)) return [];
  const keep = new Set(written);
  const removed: string[] = [];
  for (const f of fs.readdirSync(outDir)) {
    if (f.endsWith('.json') && !keep.has(f)) {
      fs.unlinkSync(path.join(outDir, f));
      removed.push(f);
    }
  }
  return removed;
}
