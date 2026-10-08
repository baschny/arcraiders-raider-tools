/**
 * Generates WebP icons for shipped items and bench levels (spec-site.md#icons, ticket S09).
 *
 * Inputs:  GAME_DATA_OUT/items.json (shipped item slugs), GAME_DATA_DIR/items + benches slugs,
 *          EMBARK_API_DIR textures export and asset-index-data (image column of asset_index.csv).
 * Output:  IMAGES_OUT/items/<slug>.webp and IMAGES_OUT/benches/<benchSlug>-tier<level>.webp
 *          (IMAGES_OUT defaults to public/images). Stale .webp files in those two dirs are removed.
 *
 * Run after generate:game-data and before generate:game-data again (see docs/Item-Icon.md).
 */
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { EMBARK_API_DIR, loadArcData, type CanonItem } from './gamedata/arcData';
import { openSlugStore } from './gamedata/slugs';
import { defaultImagesDir } from './gamedata/icons';
import { OUTPUT_DIR } from './gamedata/writer';

const MAX_FALLBACK_LINES = 30;
const ICON_SIZE = 256;
const WEBP_QUALITY = 90;
const TEXTURE_ROOT = path.join(EMBARK_API_DIR, 'data-game-extract', 'current', 'textures', 'PioneerGame', 'Content');
const ASSET_INDEX_DIR = path.join(EMBARK_API_DIR, 'asset-index-data');
const ASSET_INDEX_CSV = path.join(ASSET_INDEX_DIR, 'asset_index.csv');

type SourceKind = 'export' | 'asset-index';
interface IconSource {
  kind: SourceKind;
  file: string;
}

/** Splits one CSV line, honouring double-quoted fields. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/** asset id → repo-relative image path (column `image`) from asset_index.csv. */
function loadAssetIndexImages(): Map<string, string> {
  const images = new Map<string, string>();
  if (!fs.existsSync(ASSET_INDEX_CSV)) return images;
  const lines = fs.readFileSync(ASSET_INDEX_CSV, 'utf8').split(/\r?\n/);
  const header = parseCsvLine(lines[0] ?? '');
  const idCol = header.indexOf('asset_id');
  const imageCol = header.indexOf('image');
  if (idCol < 0 || imageCol < 0) throw new Error(`asset_index.csv: unexpected header in ${ASSET_INDEX_CSV}`);
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const cols = parseCsvLine(line);
    const image = cols[imageCol];
    if (image) images.set(String(Number(cols[idCol])), image);
  }
  return images;
}

/** `/Game/Pioneer/Items/X/T_Icon.T_Icon` → `<TEXTURE_ROOT>/Pioneer/Items/X/T_Icon.png`. */
export function textureExportPath(icon: string | null | undefined): string | null {
  if (!icon) return null;
  let rel = icon.replace(/^\/Game\//, '');
  const lastSlash = rel.lastIndexOf('/');
  const dot = rel.lastIndexOf('.');
  if (dot > lastSlash) rel = rel.slice(0, dot); // drop the ".Object" suffix
  return path.join(TEXTURE_ROOT, `${rel}.png`);
}

/** Converts `input` to a WebP at `output` when the content differs; returns false on decode errors. */
async function writeWebp(input: string, output: string): Promise<boolean> {
  let buf: Buffer;
  try {
    buf = await sharp(input)
      .resize(ICON_SIZE, ICON_SIZE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch {
    return false;
  }
  if (!fs.existsSync(output) || !fs.readFileSync(output).equals(buf)) fs.writeFileSync(output, buf);
  return true;
}

/** Tries each source in order; the first one that converts wins. */
async function produce(sources: IconSource[], output: string): Promise<SourceKind | null> {
  for (const s of sources) {
    if (fs.existsSync(s.file) && (await writeWebp(s.file, output))) return s.kind;
  }
  return null;
}

function removeStaleWebp(dir: string, produced: Set<string>): number {
  if (!fs.existsSync(dir)) return 0;
  let removed = 0;
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.webp') && !produced.has(f)) {
      fs.unlinkSync(path.join(dir, f));
      removed++;
    }
  }
  return removed;
}

async function main(): Promise<void> {
  const itemsFile = path.join(OUTPUT_DIR, 'items.json');
  if (!fs.existsSync(itemsFile)) throw new Error(`${itemsFile} not found; run generate:game-data first`);
  const shippedSlugs = Object.keys((JSON.parse(fs.readFileSync(itemsFile, 'utf8')) as { items?: Record<string, unknown> }).items ?? {});

  const imagesDir = defaultImagesDir();
  const itemsDir = path.join(imagesDir, 'items');
  const benchesDir = path.join(imagesDir, 'benches');
  fs.mkdirSync(itemsDir, { recursive: true });
  fs.mkdirSync(benchesDir, { recursive: true });

  const arc = loadArcData();
  const slugs = openSlugStore();
  const csvImages = loadAssetIndexImages();
  const sourcesFor = (icon: string | null | undefined, assetId: string): IconSource[] => {
    const sources: IconSource[] = [];
    const exp = textureExportPath(icon);
    if (exp) sources.push({ kind: 'export', file: exp });
    const csv = csvImages.get(assetId);
    if (csv) sources.push({ kind: 'asset-index', file: path.join(ASSET_INDEX_DIR, csv) });
    return sources;
  };

  const counts: Record<string, Record<SourceKind | 'none', number>> = {
    items: { export: 0, 'asset-index': 0, none: 0 },
    benches: { export: 0, 'asset-index': 0, none: 0 },
  };
  const fallbacks: string[] = [];
  const reasons = new Map<string, number>();
  const producedItems = new Set<string>();
  const producedBenches = new Set<string>();

  // Items: shipped slugs only.
  for (const slug of shippedSlugs.sort()) {
    const assetId = slugs.lookup('items', slug);
    const rec: CanonItem | undefined = assetId ? arc.items.get(Number(assetId)) : undefined;
    const file = `${slug}.webp`;
    const kind = assetId && rec ? await produce(sourcesFor(rec.icon, String(Number(assetId))), path.join(itemsDir, file)) : null;
    if (kind) {
      counts.items[kind]++;
      producedItems.add(file);
    } else {
      counts.items.none++;
      const reason = !assetId
        ? 'no slug entry'
        : !rec
          ? 'asset id not in arc-data'
          : !rec.icon
            ? 'arc-data icon is null'
            : 'icon texture and asset-index image both missing';
      fallbacks.push(`item ${slug}: ${reason}`);
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    }
  }

  // Bench levels: Generator chains, grouped by base (baseId || id), level = position along upgrades.
  const generators = new Map<number, CanonItem>();
  for (const rec of arc.items.values()) if (rec.type === 'Generator') generators.set(Number(rec.id), rec);
  const levelOf = new Map<number, { base: number; level: number }>();
  for (const rec of generators.values()) {
    const base = Number(rec.baseId || rec.id);
    if (levelOf.has(Number(rec.id))) continue;
    const start = generators.get(base) ?? rec;
    let cur: CanonItem | undefined = start;
    let level = 1;
    const seen = new Set<number>();
    while (cur && !seen.has(Number(cur.id))) {
      seen.add(Number(cur.id));
      if (!levelOf.has(Number(cur.id))) levelOf.set(Number(cur.id), { base, level });
      const next: number | undefined = cur.upgrades?.map((u) => u.next).find((n) => generators.has(n));
      cur = next !== undefined ? generators.get(next) : undefined;
      level++;
    }
  }
  let skippedBenches = 0;
  for (const [id, { base, level }] of [...levelOf.entries()].sort((a, b) => a[0] - b[0])) {
    const rec = generators.get(id);
    if (!rec) continue;
    const benchSlug = slugs.slugOf('benches', String(base));
    if (!benchSlug) {
      skippedBenches++;
      continue;
    }
    const file = `${benchSlug}-tier${level}.webp`;
    if (producedBenches.has(file)) continue;
    const kind = await produce(sourcesFor(rec.icon, String(id)), path.join(benchesDir, file));
    if (kind) {
      counts.benches[kind]++;
      producedBenches.add(file);
    } else {
      counts.benches.none++;
      fallbacks.push(`bench ${benchSlug} tier${level} (generator ${id}): no icon source`);
    }
  }

  for (const [reason, n] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) console.log(`item fallback reason: ${reason} = ${n}`);

  const removedItems = removeStaleWebp(itemsDir, producedItems);
  const removedBenches = removeStaleWebp(benchesDir, producedBenches);

  const fmt = (c: Record<string, number>) => `export ${c.export}, asset-index ${c['asset-index']}, none ${c.none}`;
  console.log(`Images: ${imagesDir}`);
  console.log(`items:   ${producedItems.size} written (${fmt(counts.items)}); removed stale ${removedItems}`);
  console.log(`benches: ${producedBenches.size} written (${fmt(counts.benches)}); removed stale ${removedBenches}`);
  if (skippedBenches) console.log(`benches: ${skippedBenches} generator levels skipped (base has no benches slug)`);
  if (fallbacks.length) {
    console.log(`Fallbacks (${fallbacks.length}):`);
    for (const line of fallbacks.slice(0, MAX_FALLBACK_LINES)) console.log(`  ${line}`);
    if (fallbacks.length > MAX_FALLBACK_LINES) console.log(`  ... and ${fallbacks.length - MAX_FALLBACK_LINES} more`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
