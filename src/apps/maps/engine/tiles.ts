// Map texture as tiles (scripts/lib/map-tiles.mjs): picks the level whose resolution matches the zoom, loads the
// visible tiles of that level and, until they arrive, draws the matching part of the nearest loaded coarser tile.
// Tiles never overlap, so textures with transparency (underground layers) and a global alpha stay correct.
import type { TileSet } from '../data/types';

export const TILE = 512;
/**
 * Map toning: the maps range from dark (Blue Gate, median luminance about 42) to snow white (Pendola Pass, about 124),
 * while the in-game map shows them at about 50-60. Each map's median moves STRENGTH of the way to TARGET, so the
 * markers read the same everywhere.
 */
const TONE_TARGET = 60, TONE_STRENGTH = 0.6;

/** How to tone a texture after drawing it: a black (`dark`) or white (`light`) veil of that opacity over its pixels. */
export interface Tone { dark: number; light: number }

/** Median luminance (0-255) of the opaque, non-black pixels of RGBA data; null with too few of them (empty layers). */
export function medianLuminance(data: Uint8ClampedArray): number | null {
  const hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const l = Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
    if (l < 8) continue; // the black void around indoor maps and underground layers
    hist[l]++;
    n++;
  }
  if (n < 500) return null;
  for (let l = 0, acc = 0; l < 256; l++) if ((acc += hist[l]) >= n / 2) return l;
  return null;
}

/** The veil that moves a texture's median luminance toward the shared target: darkens bright maps, lifts dark ones. */
export function toneFor(median: number): Tone {
  const target = median + TONE_STRENGTH * (TONE_TARGET - median);
  return target < median ? { dark: 1 - target / median, light: 0 } : { dark: 0, light: (target - median) / (255 - median) };
}
/** A level may be up to this much softer than the screen before the next one loads. */
const SLACK = 1.2;
const MAX_TILES = 160;

export interface TileRange {
  /** Pyramid level to draw. */
  z: number;
  /** Tiles per side at that level. */
  n: number;
  /** Tile size in CSS px. */
  ts: number;
  /** Visible tiles, inclusive (empty when x0 > x1 or y0 > y1). */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * Level and visible tiles for a texture of `levels` levels drawn at (ox, oy), S CSS px wide, in a w×h CSS px view:
 * the coarsest level whose tiles are at most SLACK times softer than the device pixels, clamped to the pyramid.
 */
export function tileRange(levels: number, ox: number, oy: number, S: number, w: number, h: number, dpr: number): TileRange {
  const z = Math.max(0, Math.min(levels - 1, Math.ceil(Math.log2((S * dpr) / TILE / SLACK))));
  const n = 2 ** z, ts = S / n;
  const x0 = Math.max(0, Math.floor(-ox / ts)), x1 = Math.min(n - 1, Math.floor((w - ox) / ts));
  const y0 = Math.max(0, Math.floor(-oy / ts)), y1 = Math.min(n - 1, Math.floor((h - oy) / ts));
  return { z, n, ts, x0, x1, y0, y1 };
}

export class TileLayer {
  private cache = new Map<string, HTMLImageElement>();
  private tones = new Map<string, Tone | null>();
  private base: string;
  private onLoad: () => void;
  private onError: () => void;

  /** `onError`: a tile failed to load (e.g. its hashed folder was replaced by a newer build). */
  constructor(base: string, onLoad: () => void, onError: () => void = () => {}) {
    this.base = base;
    this.onLoad = onLoad;
    this.onError = onError;
  }

  private url(set: TileSet, z: number, x: number, y: number) {
    return `${this.base}/${set.tiles}/${z}/${x}-${y}.webp`;
  }

  /** The tile if loaded; with `load`, requests it when missing. */
  private get(set: TileSet, z: number, x: number, y: number, load: boolean): HTMLImageElement | null {
    const key = this.url(set, z, x, y);
    let img = this.cache.get(key);
    if (img) {
      this.cache.delete(key); // most recently used last
      this.cache.set(key, img);
    } else if (load) {
      img = new Image();
      img.decoding = 'async';
      img.onload = () => this.onLoad();
      img.onerror = () => this.onError();
      img.src = key;
      this.cache.set(key, img);
      this.evict();
    }
    return img && img.complete && img.naturalWidth ? img : null;
  }

  /** The texture's tone, measured once on its level-0 tile (null until it has loaded, or when it cannot be read). */
  tone(set: TileSet): Tone | null {
    if (this.tones.has(set.tiles)) return this.tones.get(set.tiles)!;
    const img = this.get(set, 0, 0, 0, false);
    if (!img) return null;
    let tone: Tone | null = null;
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0, 128, 128);
      const median = medianLuminance(ctx.getImageData(0, 0, 128, 128).data);
      tone = median == null ? null : toneFor(median);
    } catch {
      tone = null; // unreadable (e.g. a cross-origin tile without CORS): draw untoned
    }
    this.tones.set(set.tiles, tone);
    return tone;
  }

  private evict() {
    for (const [key, img] of this.cache) {
      if (this.cache.size <= MAX_TILES) break;
      if (/\/[01]\/\d+-\d+\.webp$/.test(key)) continue; // keep the coarse levels: fallback for everything
      img.onload = img.onerror = null; // clearing src fires error in some browsers
      img.src = '';
      this.cache.delete(key);
    }
  }

  /**
   * Draw the texture at screen offset (ox, oy), S CSS px wide, into a w×h CSS px view, toned (see `toneFor`). Draws in
   * device pixels with rounded tile edges, so neighbouring tiles meet without seams. Must be the first thing drawn on
   * the cleared canvas: the toning veils everything drawn so far.
   */
  draw(ctx: CanvasRenderingContext2D, set: TileSet, ox: number, oy: number, S: number, w: number, h: number, dpr: number) {
    const { z: target, ts, x0, x1, y0, y1 } = tileRange(set.levels, ox, oy, S, w, h, dpr);
    this.get(set, 0, 0, 0, true);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const px = (v: number) => Math.round(v * dpr);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = px(ox + x * ts), dy = px(oy + y * ts), dw = px(ox + (x + 1) * ts) - dx, dh = px(oy + (y + 1) * ts) - dy;
        const img = this.get(set, target, x, y, true);
        if (img) {
          ctx.drawImage(img, dx, dy, dw, dh);
          continue;
        }
        // Not there yet: the matching part of the nearest loaded coarser tile.
        for (let d = 1; d <= target; d++) {
          const parent = this.get(set, target - d, x >> d, y >> d, false);
          if (!parent) continue;
          const part = TILE / 2 ** d, mask = 2 ** d - 1;
          ctx.drawImage(parent, (x & mask) * part, (y & mask) * part, part, part, dx, dy, dw, dh);
          break;
        }
      }
    }
    // Tone the texture (only where it was drawn: the canvas holds nothing else yet).
    const tone = this.tone(set);
    if (tone && (tone.dark || tone.light)) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = tone.dark ? `rgba(0,0,0,${tone.dark})` : `rgba(255,255,255,${tone.light})`;
      ctx.fillRect(0, 0, px(w), px(h));
    }
    ctx.restore();
  }
}
