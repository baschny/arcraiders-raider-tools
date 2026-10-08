/**
 * Slug resolver: wraps the frozen slug tables in arc-data/slugs (embark-api lib/canonical/slugs.js,
 * docs/arc-data.md). New slugs created here are appended to arc-data and must be committed
 * there together with the generated site files.
 */
import * as path from 'path';
import { createRequire } from 'module';
import { EMBARK_API_DIR, GAME_DATA_DIR } from './arcData';

export type SlugKind =
  | 'items'
  | 'quests'
  | 'benches'
  | 'projects'
  | 'maps'
  | 'traders'
  | 'skills'
  | 'outpost'
  | 'stencils'
  | 'offers';

export interface SlugEntry {
  slug: string;
  name?: string;
  aliases?: string[];
  arctrackerId?: string;
}

export interface SlugStore {
  get(kind: SlugKind, key: string | number): SlugEntry | null;
  slugOf(kind: SlugKind, key: string | number): string | null;
  lookup(kind: SlugKind, slugOrAlias: string): string | null;
  getOrCreate(
    kind: SlugKind,
    key: string | number,
    opts: { name?: string | null; internalName?: string | null; base?: string; numericSep?: string },
  ): string | null;
  aliases(kind: SlugKind): Record<string, string>;
  table(kind: SlugKind): Record<string, SlugEntry>;
  save(): string[];
}

export function openSlugStore(arcDataDir: string = GAME_DATA_DIR): SlugStore {
  const require = createRequire(import.meta.url);
  const lib = require(path.join(EMBARK_API_DIR, 'lib', 'canonical', 'slugs.js')) as {
    openSlugs(dir: string): SlugStore;
  };
  return lib.openSlugs(arcDataDir);
}

/** arctracker-style slugify (same rules as arc-data). */
export function slugify(name: string): string {
  const require = createRequire(import.meta.url);
  const lib = require(path.join(EMBARK_API_DIR, 'lib', 'canonical', 'slugs.js')) as { slugify(n: string): string };
  return lib.slugify(name);
}
