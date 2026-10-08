/**
 * Icon URL resolution for the site (docs/Game-Data.md).
 * Local files are produced by scripts/generate-item-icons.ts into public/images/{items,benches}.
 * Directory listings are cached per directory for the lifetime of the process.
 */
import * as fs from 'fs';
import * as path from 'path';
import { repoRoot } from './arcData';

/** Default output root for icons (IMAGES_OUT overrides; evaluated per call). */
export function defaultImagesDir(): string {
  return process.env.IMAGES_OUT ?? path.join(repoRoot, 'public', 'images');
}

const listingCache = new Map<string, Set<string>>();

function listing(dir: string): Set<string> {
  let files = listingCache.get(dir);
  if (!files) {
    files = new Set(fs.existsSync(dir) ? fs.readdirSync(dir) : []);
    listingCache.set(dir, files);
  }
  return files;
}

/**
 * Item icon URL for a slug: the local WebP when generated, else the arctracker CDN image when the
 * arctracker id is known, else an empty string.
 */
export function itemIconUrl(slug: string, opts: { imagesDir?: string; arctrackerId?: string | null } = {}): string {
  const dir = path.join(opts.imagesDir ?? defaultImagesDir(), 'items');
  if (listing(dir).has(`${slug}.webp`)) return `/images/items/${slug}.webp`;
  if (opts.arctrackerId) return `https://cdn.arctracker.io/items/v2/${opts.arctrackerId}.png`;
  return '';
}

/** Bench level icon URL, or null when no generated WebP exists for that bench and level. */
export function benchIconUrl(benchId: string, level: number, opts: { imagesDir?: string } = {}): string | null {
  const name = `${benchId}-tier${level}.webp`;
  const dir = path.join(opts.imagesDir ?? defaultImagesDir(), 'benches');
  return listing(dir).has(name) ? `/images/benches/${name}` : null;
}
