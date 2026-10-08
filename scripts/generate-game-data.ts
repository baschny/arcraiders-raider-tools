#!/usr/bin/env npx tsx
/**
 * Game data v2 generator: reads the canonical game data (embark-api arc-data/) and writes the site
 * schema to public/data/game/ (structure + per-locale text files).
 *
 * Spec: embark-api docs/arc-data/spec-site.md
 *
 * Usage: npx tsx scripts/generate-game-data.ts [--strict] [--only <domain,…>]
 *   --strict  fail on unclassified offers, unresolved requirements or files over budget
 *   GAME_DATA_DIR / EMBARK_API_DIR override the input locations.
 *
 * New slugs are appended to arc-data/slugs/*.json — commit them in arc-data together with the
 * regenerated site files.
 */
import type { GameDomain } from '../src/shared/gamedata/types';
import { loadArcData } from './gamedata/arcData';
import { createContext } from './gamedata/context';
import { DOMAIN_MODULES } from './gamedata/domains';
import { crossref } from './gamedata/domains/crossref';
import { openSlugStore, type SlugKind } from './gamedata/slugs';
import { OUTPUT_DIR, removeStale, writeDomain } from './gamedata/writer';

/** Slug table whose aliases a domain file carries (for resolving renamed slugs in saved state). */
const ALIAS_KINDS: Partial<Record<GameDomain, SlugKind[]>> = {
  items: ['items'],
  quests: ['quests'],
  benches: ['benches'],
  projects: ['projects'],
  maps: ['maps'],
  trades: ['offers', 'traders'],
  research: ['offers'],
  outpost: ['outpost'],
  stencils: ['stencils'],
  skilltree: ['skills'],
};

/** Report sections that fail a --strict run. */
const STRICT_SECTIONS = ['unclassifiedOffers', 'unresolvedRequirements'];

function main(): void {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');
  const onlyIdx = args.indexOf('--only');
  const only = onlyIdx >= 0 ? new Set(args[onlyIdx + 1].split(',')) : null;

  const arc = loadArcData();
  const slugs = openSlugStore(arc.dir);
  const ctx = createContext(arc, slugs);

  for (const mod of DOMAIN_MODULES) {
    ctx.results[mod.domain] = mod.build(ctx);
  }
  crossref(ctx);

  const written: string[] = [];
  const overBudget: string[] = [];
  for (const mod of DOMAIN_MODULES) {
    if (only && !only.has(mod.domain)) continue;
    const aliases: Record<string, string> = {};
    for (const kind of ALIAS_KINDS[mod.domain] ?? []) Object.assign(aliases, slugs.aliases(kind));
    const res = writeDomain(mod.domain, ctx.results[mod.domain] ?? {}, ctx.text, {
      gameVersion: arc.meta.gameVersion,
      generatedFrom: arc.commit,
      aliases,
    });
    written.push(...res.files);
    overBudget.push(...res.overBudget);
  }
  if (!only) {
    const removed = removeStale(written);
    if (removed.length) console.log(`removed stale: ${removed.join(', ')}`);
  }
  const newSlugFiles = slugs.save();

  ctx.report.print();
  console.log(`wrote ${written.length} file(s) to ${OUTPUT_DIR}`);
  if (newSlugFiles.length) console.log(`new slugs appended to arc-data: ${newSlugFiles.join(', ')} — commit them in arc-data`);
  for (const o of overBudget) console.log(`OVER BUDGET ${o}`);

  const strictFailures = STRICT_SECTIONS.filter((s) => ctx.report.count(s) > 0);
  if (strict && (strictFailures.length || overBudget.length)) {
    console.error(`--strict: failing on ${[...strictFailures, ...(overBudget.length ? ['overBudget'] : [])].join(', ')}`);
    process.exit(1);
  }
}

main();
