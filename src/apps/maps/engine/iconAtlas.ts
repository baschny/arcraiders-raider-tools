// Game UI icons are white on transparent; markers draw them tinted. Tinted bitmaps are cached per icon, color and size.
import { iconUrl } from '../data/useMapData';

const images = new Map<string, HTMLImageElement>();
const tinted = new Map<string, HTMLCanvasElement>();
const listeners = new Set<() => void>();

export function onIconsLoaded(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

function image(key: string): HTMLImageElement | null {
  let img = images.get(key);
  if (!img) {
    img = new Image();
    img.onload = () => listeners.forEach((fn) => fn());
    img.src = iconUrl(key);
    images.set(key, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

/** An image by URL (e.g. a recoloured puzzle sigil); cached like the game icons and tinted the same way. */
function imageByUrl(url: string): HTMLImageElement | null {
  let img = images.get(url);
  if (!img) {
    img = new Image();
    img.onload = () => listeners.forEach((fn) => fn());
    img.src = url;
    images.set(url, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

/** Tints any loaded bitmap by drawing it with source-in over a colour fill, cached per source, colour and size. */
function tint(id: string, img: HTMLImageElement, color: string, px: number): HTMLCanvasElement {
  const size = Math.max(8, Math.ceil(px));
  const key = `${id}|${color}|${size}`;
  const cached = tinted.get(key);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, size, size);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  tinted.set(key, c);
  return c;
}

export function tintedIcon(key: string, color: string, px: number): HTMLCanvasElement | null {
  const img = image(key);
  return img ? tint(key, img, color, px) : null;
}

/** A white-on-transparent image by URL (a recoloured sigil), tinted to `color`. */
export function tintedImage(url: string, color: string, px: number): HTMLCanvasElement | null {
  const img = imageByUrl(url);
  return img ? tint(url, img, color, px) : null;
}
