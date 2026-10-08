import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { benchIconUrl, itemIconUrl } from '../icons';

function tempImages(files: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'icons-'));
  for (const rel of files) {
    fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), '');
  }
  return dir;
}

describe('itemIconUrl', () => {
  it('returns the local WebP when it exists', () => {
    const imagesDir = tempImages(['items/anvil_splitter.webp']);
    expect(itemIconUrl('anvil_splitter', { imagesDir })).toBe('/images/items/anvil_splitter.webp');
  });

  it('returns an empty string when no local file exists (no arctracker CDN fallback)', () => {
    const imagesDir = tempImages([]);
    expect(itemIconUrl('anvil_splitter', { imagesDir })).toBe('');
    expect(itemIconUrl('unknown_item', { imagesDir })).toBe('');
  });

  it('does not match a file with a different extension', () => {
    const imagesDir = tempImages(['items/anvil_splitter.png']);
    expect(itemIconUrl('anvil_splitter', { imagesDir })).toBe('');
  });
});

describe('benchIconUrl', () => {
  it('returns the local WebP for an existing bench level', () => {
    const imagesDir = tempImages(['benches/workbench-tier2.webp']);
    expect(benchIconUrl('workbench', 2, { imagesDir })).toBe('/images/benches/workbench-tier2.webp');
  });

  it('returns null for a missing level or bench', () => {
    const imagesDir = tempImages(['benches/workbench-tier1.webp']);
    expect(benchIconUrl('workbench', 3, { imagesDir })).toBeNull();
    expect(benchIconUrl('refiner', 1, { imagesDir })).toBeNull();
  });
});
