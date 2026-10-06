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

export function tintedIcon(key: string, color: string, px: number): HTMLCanvasElement | null {
  const size = Math.max(8, Math.ceil(px));
  const id = `${key}|${color}|${size}`;
  const cached = tinted.get(id);
  if (cached) return cached;
  const img = image(key);
  if (!img) return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, size, size);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  tinted.set(id, c);
  return c;
}
