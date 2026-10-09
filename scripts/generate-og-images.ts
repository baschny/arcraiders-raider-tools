/**
 * Generates the link preview images (Open Graph, 1200×630) of the public pages and the app icons.
 *
 * Inputs:  game art already in public/ (event and what's-new glyphs, item icons, map tiles,
 *          map outlines in data/map-data/sizes.json), lucide icons, the Urbanist font (@fontsource/urbanist).
 * Output:  public/images/og/<image>.jpg for every page in src/shared/seo/pages.ts,
 *          public/images/icons/{apple-touch-icon,icon-192,icon-512}.png from public/favicon.svg.
 *
 * The images are committed. Rerun after changing a page's title or tagline here, or after a game
 * patch that changes the art: `npm run generate:og-images`.
 */
import * as fs from 'fs';
import * as path from 'path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import sharp, { type OverlayOptions } from 'sharp';
import opentype from 'opentype.js';
import {
  Calculator,
  Calendar,
  ClipboardList,
  GitCompareArrows,
  History,
  ListTodo,
  Map as MapIcon,
  MapPin,
  Package,
  Ruler,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { SEO_PAGES } from '../src/shared/seo/pages';
import { type DEFAULT_WHATS_NEW_TAB, type WhatsNewTab } from '../src/apps/whats-new/routing';

const ROOT = path.resolve(import.meta.dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const OG_DIR = path.join(PUBLIC, 'images', 'og');
const ICON_DIR = path.join(PUBLIC, 'images', 'icons');
const FONT_DIR = path.join(ROOT, 'node_modules', '@fontsource', 'urbanist', 'files');
const EN = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/shared/i18n/locales/en.json'), 'utf8')) as Record<
  string,
  unknown
>;

const W = 1200;
const H = 630;
/** Right-hand art area. */
const ART = { x: 660, y: 70, w: 480, h: 490 };

const COLOR = {
  bg: '#111317',
  panel: '#1b1e24',
  line: '#2a2f38',
  text: '#f2f3f5',
  muted: '#a7adb8',
  dim: '#5d6470',
  // Brand stripes of the favicon.
  cyan: '#5FFFFF',
  green: '#05FF74',
  yellow: '#FFEA00',
  red: '#FF3B3B',
} as const;
const BRAND = [COLOR.cyan, COLOR.green, COLOR.yellow, COLOR.red];

// --- text -----------------------------------------------------------------------------------------

const fonts = {
  bold: opentype.parse(toArrayBuffer(fs.readFileSync(path.join(FONT_DIR, 'urbanist-latin-700-normal.woff')))),
  semibold: opentype.parse(toArrayBuffer(fs.readFileSync(path.join(FONT_DIR, 'urbanist-latin-600-normal.woff')))),
  medium: opentype.parse(toArrayBuffer(fs.readFileSync(path.join(FONT_DIR, 'urbanist-latin-500-normal.woff')))),
};
type FontName = keyof typeof fonts;

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

interface TextStyle {
  font: FontName;
  size: number;
  fill: string;
  letterSpacing?: number;
  opacity?: number;
}

function textWidth(value: string, style: TextStyle): number {
  return fonts[style.font].getAdvanceWidth(value, style.size, { letterSpacing: style.letterSpacing ?? 0 });
}

/** Text as outlines, so the rendering does not depend on installed fonts. `y` is the baseline. */
function text(value: string, x: number, y: number, style: TextStyle, anchor: 'start' | 'middle' | 'end' = 'start'): string {
  const width = textWidth(value, style);
  const left = anchor === 'start' ? x : anchor === 'middle' ? x - width / 2 : x - width;
  const d = fonts[style.font]
    .getPath(value, left, y, style.size, { letterSpacing: style.letterSpacing ?? 0 })
    .toPathData(2);
  return `<path d="${d}" fill="${style.fill}"${style.opacity !== undefined ? ` opacity="${style.opacity}"` : ''}/>`;
}

function wrap(value: string, style: TextStyle, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of value.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && textWidth(candidate, style) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// --- images ---------------------------------------------------------------------------------------

function dataUri(png: Buffer): string {
  return `data:image/png;base64,${png.toString('base64')}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The shape of an icon (its alpha) filled with one flat color. */
async function silhouette(file: string, color: string, size: number): Promise<string> {
  const alpha = await sharp(path.join(PUBLIC, file))
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .extractChannel('alpha')
    .toBuffer();
  const [r, g, b] = hexToRgb(color);
  const png = await sharp({ create: { width: size, height: size, channels: 3, background: { r, g, b } } })
    .joinChannel(alpha)
    .png()
    .toBuffer();
  return dataUri(png);
}

function mix(a: string, b: string, t: number): [number, number, number] {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return [0, 1, 2].map((c) => x[c] + (y[c] - x[c]) * t) as [number, number, number];
}

/**
 * An item icon in the tones of one color (dark shade, color, light tint) by its brightness,
 * keeping its shape and inner detail.
 */
async function toned(file: string, color: string, size: number): Promise<string> {
  const { data, info } = await sharp(path.join(PUBLIC, file))
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = info.width * info.height;
  const lum = new Float32Array(pixels);
  let min = 1;
  let max = 0;
  for (let i = 0; i < pixels; i++) {
    const l = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / 255;
    lum[i] = l;
    if (data[i * 4 + 3] > 128) {
      min = Math.min(min, l);
      max = Math.max(max, l);
    }
  }
  const stops = [mix(COLOR.bg, color, 0.3), hexToRgb(color), mix(color, '#ffffff', 0.75)];
  const out = Buffer.alloc(pixels * 4);
  for (let i = 0; i < pixels; i++) {
    const t = Math.min(1, Math.max(0, (lum[i] - min) / Math.max(0.01, max - min))) * 2;
    const [a, b] = t < 1 ? [stops[0], stops[1]] : [stops[1], stops[2]];
    const f = t < 1 ? t : t - 1;
    for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round(a[c] + (b[c] - a[c]) * f);
    out[i * 4 + 3] = data[i * 4 + 3];
  }
  return dataUri(await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer());
}

/** An image mapped onto a gradient from `dark` to `light` by its brightness. */
async function duotone(input: string | Buffer, dark: string, light: string, width: number, height: number): Promise<string> {
  const source = typeof input === 'string' ? path.join(PUBLIC, input) : input;
  const { data } = await sharp(source)
    .resize(width, height, { fit: 'cover' })
    .grayscale()
    .normalise()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const from = hexToRgb(dark);
  const to = hexToRgb(light);
  const out = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    const v = data[i] / 255;
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.round(from[c] + (to[c] - from[c]) * v);
  }
  return dataUri(await sharp(out, { raw: { width, height, channels: 3 } }).png().toBuffer());
}

/** The level-1 map tiles of a map texture stitched into one 1024 px image. */
async function mapImage(prefix: string): Promise<Buffer> {
  const tilesDir = path.join(PUBLIC, 'data', 'map-data', 'tiles');
  const dir = fs.readdirSync(tilesDir).find((name) => name.startsWith(`${prefix}-`));
  if (!dir) throw new Error(`no map tiles for ${prefix}`);
  const composites: OverlayOptions[] = [];
  for (const x of [0, 1]) {
    for (const y of [0, 1]) {
      const tile = path.join(tilesDir, dir, '1', `${x}-${y}.webp`);
      if (fs.existsSync(tile)) composites.push({ input: tile, left: x * 512, top: y * 512 });
    }
  }
  return sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#000000' } })
    .composite(composites)
    .png()
    .toBuffer();
}

function image(href: string, x: number, y: number, w: number, h: number, extra = ''): string {
  return `<image href="${href}" x="${x}" y="${y}" width="${w}" height="${h}" ${extra}/>`;
}

function lucide(icon: LucideIcon, x: number, y: number, size: number, color: string, strokeWidth = 2): string {
  const markup = renderToStaticMarkup(createElement(icon, { size, color, strokeWidth }));
  return markup.replace('<svg ', `<svg x="${x}" y="${y}" `);
}

// --- frame ----------------------------------------------------------------------------------------

interface Card {
  file: string;
  accent: string;
  kicker?: string;
  title: string;
  tagline: string;
  art: string;
  /** Background behind the art, under the frame's gradient. */
  backdrop?: string;
}

function frame(card: Card): string {
  const titleStyle: TextStyle = { font: 'bold', size: 64, fill: COLOR.text };
  let titleLines = wrap(card.title, titleStyle, 540);
  if (titleLines.length > 2) {
    titleStyle.size = 52;
    titleLines = wrap(card.title, titleStyle, 540);
  }
  const taglineStyle: TextStyle = { font: 'medium', size: 28, fill: COLOR.muted };
  const taglineLines = wrap(card.tagline, taglineStyle, 520);

  const titleLead = titleStyle.size * 1.08;
  const taglineLead = 38;
  const blockHeight =
    (card.kicker ? 46 : 0) + titleLines.length * titleLead + 22 + taglineLines.length * taglineLead;
  let y = Math.max(190, 330 - blockHeight / 2);

  const parts: string[] = [];
  if (card.kicker) {
    parts.push(text(card.kicker, 80, y + 20, { font: 'bold', size: 20, fill: card.accent, letterSpacing: 0.14 }));
    y += 46;
  }
  for (const line of titleLines) {
    y += titleLead;
    parts.push(text(line, 78, y - titleStyle.size * 0.22, titleStyle));
  }
  y += 22;
  for (const line of taglineLines) {
    y += taglineLead;
    parts.push(text(line, 80, y - 10, taglineStyle));
  }

  const stripes = BRAND.map((color, i) => `<rect x="${80 + i * 11}" y="68" width="7" height="34" fill="${color}"/>`).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#ffffff" stroke-opacity="0.035" stroke-width="1"/>
    </pattern>
    <radialGradient id="glow" cx="0.75" cy="0.5" r="0.6">
      <stop offset="0" stop-color="${card.accent}" stop-opacity="0.16"/>
      <stop offset="1" stop-color="${card.accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fade" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0.48" stop-color="${COLOR.bg}" stop-opacity="1"/>
      <stop offset="0.72" stop-color="${COLOR.bg}" stop-opacity="0"/>
    </linearGradient>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="${COLOR.bg}"/>
  ${card.backdrop ?? ''}
  <rect width="${W}" height="${H}" fill="url(#fade)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  ${card.art}
  ${stripes}
  ${text('RAIDER TOOLS', 138, 96, { font: 'bold', size: 26, fill: COLOR.text, letterSpacing: 0.12 })}
  ${parts.join('\n  ')}
  ${text('raider-tools.app', 80, 566, { font: 'semibold', size: 24, fill: card.accent })}
  <rect x="0" y="${H - 8}" width="${W}" height="8" fill="${card.accent}"/>
</svg>`;
}

// --- art helpers ----------------------------------------------------------------------------------

function tile(x: number, y: number, size: number, stroke: string, fill: string = COLOR.panel, radius = 18): string {
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
}

function badge(label: string, cx: number, cy: number, color: string): string {
  const style: TextStyle = { font: 'bold', size: 22, fill: COLOR.bg };
  const w = textWidth(label, style) + 20;
  return `<rect x="${cx - w / 2}" y="${cy - 16}" width="${w}" height="32" rx="16" fill="${color}"/>${text(label, cx, cy + 8, style, 'middle')}`;
}

/** A centered glyph with a glow, inside a ring. */
async function hub(file: string | LucideIcon, cx: number, cy: number, r: number, color: string): Promise<string> {
  const size = Math.round(r * 1.1);
  const glyph =
    typeof file === 'string'
      ? image(await silhouette(file, color, size), cx - size / 2, cy - size / 2, size, size)
      : lucide(file, cx - size / 2, cy - size / 2, size, color, 1.6);
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="0.25" filter="url(#soft)"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${COLOR.panel}" stroke="${color}" stroke-width="3"/>
  ${glyph}`;
}

/** Glyphs in round tiles on a circle around a hub. */
async function orbit(files: string[], cx: number, cy: number, radius: number, color: string, startDeg = -90): Promise<string> {
  const parts: string[] = [];
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${color}" stroke-opacity="0.25" stroke-width="2" stroke-dasharray="4 10"/>`);
  for (const [i, file] of files.entries()) {
    const angle = ((startDeg + (360 / files.length) * i) * Math.PI) / 180;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    parts.push(`<circle cx="${x}" cy="${y}" r="38" fill="${COLOR.panel}" stroke="${COLOR.line}" stroke-width="2"/>`);
    const tint = i % 2 ? COLOR.text : color;
    parts.push(
      file.startsWith('images/items/')
        ? image(await toned(file, tint, 60), x - 30, y - 30, 60, 60)
        : image(await silhouette(file, tint, 44), x - 22, y - 22, 44, 44),
    );
  }
  return parts.join('\n  ');
}

// --- cards ----------------------------------------------------------------------------------------

async function homeCard(): Promise<Card> {
  const tools: Array<[LucideIcon, string]> = [
    [Sparkles, COLOR.cyan],
    [Calendar, COLOR.yellow],
    [Calculator, COLOR.green],
    [ListTodo, COLOR.cyan],
    [MapIcon, COLOR.green],
    [Package, COLOR.red],
    [ClipboardList, COLOR.yellow],
    [Ruler, COLOR.cyan],
  ];
  const size = 130;
  const gap = 22;
  const x0 = ART.x + (ART.w - (3 * size + 2 * gap)) / 2;
  const y0 = ART.y + (ART.h - (3 * size + 2 * gap)) / 2;
  const parts: string[] = [];
  let i = 0;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const x = x0 + col * (size + gap);
      const y = y0 + row * (size + gap);
      if (row === 1 && col === 1) {
        parts.push(tile(x, y, size, COLOR.text, '#22262d'));
        parts.push(BRAND.map((c, s) => `<rect x="${x + 27 + s * 21}" y="${y + 25}" width="14" height="80" fill="${c}"/>`).join(''));
        continue;
      }
      const [icon, color] = tools[i++];
      parts.push(tile(x, y, size, COLOR.line));
      parts.push(lucide(icon, x + 33, y + 33, 64, color, 1.8));
    }
  }
  return {
    file: 'home.jpg',
    accent: COLOR.cyan,
    title: 'ARC Raiders Tools',
    tagline: 'Event schedule, loot and spawn maps, quest tracker, crafting and stash planner. Free, in your browser.',
    art: parts.join('\n  '),
  };
}

async function scheduleCard(): Promise<Card> {
  const lanes: Array<[string, Array<[number, number, string, string]>]> = [
    ['Dam', [[0, 2, 'night_raid', COLOR.cyan], [3, 5, 'harvester', COLOR.yellow]]],
    ['Spaceport', [[1, 3, 'electromagnetic_storm', COLOR.yellow], [4, 5, 'matriarch', COLOR.red]]],
    ['Buried City', [[0, 1, 'lush_blooms', COLOR.green], [2, 4, 'cold_snap', COLOR.cyan]]],
    ['Blue Gate', [[1, 2, 'hidden_bunker', COLOR.green], [3, 5, 'hurricane', COLOR.cyan]]],
    ['Stella Montis', [[0, 3, 'night_raid', COLOR.cyan], [4, 5, 'harvester', COLOR.yellow]]],
  ];
  const labelW = 130;
  const x0 = ART.x - 20 + labelW;
  const slot = (ART.w + 20 - labelW) / 5;
  const laneH = 78;
  const y0 = ART.y + 40;
  const parts: string[] = [];
  for (let s = 0; s <= 5; s++) {
    parts.push(`<line x1="${x0 + s * slot}" y1="${y0 - 20}" x2="${x0 + s * slot}" y2="${y0 + lanes.length * laneH}" stroke="${COLOR.line}" stroke-width="1.5"/>`);
  }
  for (const [row, [name, events]] of lanes.entries()) {
    const y = y0 + row * laneH;
    parts.push(text(name, x0 - 16, y + laneH / 2 + 7, { font: 'semibold', size: 20, fill: COLOR.muted }, 'end'));
    for (const [from, to, glyph, color] of events) {
      const x = x0 + from * slot + 4;
      const w = (to - from) * slot - 8;
      parts.push(`<rect x="${x}" y="${y + 10}" width="${w}" height="${laneH - 20}" rx="10" fill="${color}" fill-opacity="0.16" stroke="${color}" stroke-width="2"/>`);
      parts.push(image(await silhouette(`images/events/${glyph}.png`, color, 40), x + 10, y + laneH / 2 - 20, 40, 40));
    }
  }
  const nowX = x0 + slot * 2.4;
  parts.push(`<line x1="${nowX}" y1="${y0 - 26}" x2="${nowX}" y2="${y0 + lanes.length * laneH + 6}" stroke="${COLOR.yellow}" stroke-width="3"/>`);
  parts.push(badge('NOW', nowX, y0 - 30, COLOR.yellow));
  return {
    file: 'schedule.jpg',
    accent: COLOR.yellow,
    title: 'Event Schedule',
    tagline: 'Which map conditions are up now, and which come next, on every map.',
    art: parts.join('\n  '),
  };
}

async function craftCard(): Promise<Card> {
  const mats: Array<[string, string]> = [
    ['metal_parts', '×24'],
    ['plastic_parts', '×12'],
    ['mechanical_components', '×6'],
  ];
  const size = 120;
  const gap = 36;
  const x0 = ART.x + (ART.w - (3 * size + 2 * gap)) / 2;
  const yMats = ART.y + 40;
  const parts: string[] = [];
  for (const [i, [slug, count]] of mats.entries()) {
    const x = x0 + i * (size + gap);
    parts.push(tile(x, yMats, size, COLOR.line));
    parts.push(image(await toned(`images/items/${slug}.webp`, COLOR.muted, 92), x + 14, yMats + 14, 92, 92));
    parts.push(badge(count, x + size - 10, yMats + size - 6, COLOR.green));
    if (i < mats.length - 1) parts.push(text('+', x + size + gap / 2, yMats + size / 2 + 14, { font: 'bold', size: 40, fill: COLOR.dim }, 'middle'));
  }
  const cx = ART.x + ART.w / 2;
  parts.push(text('=', cx, yMats + size + 72, { font: 'bold', size: 56, fill: COLOR.green }, 'middle'));
  const big = 210;
  const yBig = yMats + size + 104;
  parts.push(`<circle cx="${cx}" cy="${yBig + big / 2}" r="${big / 2}" fill="${COLOR.green}" opacity="0.3" filter="url(#soft)"/>`);
  parts.push(tile(cx - big / 2, yBig, big, COLOR.green, COLOR.panel, 24).replace('stroke-width="2"', 'stroke-width="3"'));
  parts.push(image(await toned('images/items/anvil_i.webp', COLOR.green, 180), cx - 90, yBig + 15, 180, 180));
  parts.push(badge('×4', cx + big / 2 - 14, yBig + big - 10, COLOR.green));
  return {
    file: 'craft-calculator.jpg',
    accent: COLOR.green,
    title: 'Craft Calculator',
    tagline: 'How many to craft from what you have, to squeeze the most space out of your stash.',
    art: parts.join('\n  '),
  };
}

async function questsCard(): Promise<Card> {
  // Columns of a small quest tree; state: done, active, locked; reward: blueprint.
  type Node = { col: number; row: number; state: 'done' | 'active' | 'locked'; reward?: boolean };
  const nodes: Node[] = [
    { col: 0, row: 1.5, state: 'done' },
    { col: 1, row: 0.5, state: 'done' },
    { col: 1, row: 2.5, state: 'done', reward: true },
    { col: 2, row: 0, state: 'done' },
    { col: 2, row: 1.3, state: 'active' },
    { col: 2, row: 2.6, state: 'active', reward: true },
    { col: 3, row: 0.4, state: 'locked', reward: true },
    { col: 3, row: 1.8, state: 'locked' },
    { col: 3, row: 3, state: 'locked' },
  ];
  const links: Array<[number, number]> = [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [3, 6], [4, 7], [5, 8], [4, 6]];
  const px = (n: Node) => ART.x + 50 + n.col * 128;
  const py = (n: Node) => ART.y + 70 + n.row * 118;
  const parts: string[] = [];
  for (const [a, b] of links) {
    const from = nodes[a];
    const to = nodes[b];
    const color = to.state === 'locked' ? COLOR.line : COLOR.cyan;
    const mx = (px(from) + px(to)) / 2;
    parts.push(`<path d="M ${px(from)} ${py(from)} C ${mx} ${py(from)}, ${mx} ${py(to)}, ${px(to)} ${py(to)}" fill="none" stroke="${color}" stroke-width="3" stroke-opacity="${to.state === 'locked' ? 1 : 0.6}"/>`);
  }
  const blueprint = await silhouette('images/whats-new/icons/blueprint.webp', COLOR.yellow, 30);
  for (const n of nodes) {
    const x = px(n);
    const y = py(n);
    if (n.state === 'done') {
      parts.push(`<circle cx="${x}" cy="${y}" r="28" fill="${COLOR.cyan}"/>`);
      parts.push(`<path d="M ${x - 11} ${y + 1} L ${x - 3} ${y + 9} L ${x + 12} ${y - 8}" fill="none" stroke="${COLOR.bg}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`);
    } else if (n.state === 'active') {
      parts.push(`<circle cx="${x}" cy="${y}" r="34" fill="${COLOR.cyan}" opacity="0.35" filter="url(#soft)"/>`);
      parts.push(`<circle cx="${x}" cy="${y}" r="28" fill="${COLOR.panel}" stroke="${COLOR.cyan}" stroke-width="4"/>`);
      parts.push(`<circle cx="${x}" cy="${y}" r="9" fill="${COLOR.cyan}"/>`);
    } else {
      parts.push(`<circle cx="${x}" cy="${y}" r="28" fill="${COLOR.panel}" stroke="${COLOR.dim}" stroke-width="3"/>`);
    }
    if (n.reward) {
      parts.push(`<circle cx="${x + 26}" cy="${y - 24}" r="20" fill="${COLOR.bg}" stroke="${COLOR.yellow}" stroke-width="2"/>`);
      parts.push(image(blueprint, x + 11, y - 39, 30, 30));
    }
  }
  return {
    file: 'quests.jpg',
    accent: COLOR.cyan,
    title: 'Quest Tracker',
    tagline: 'Every trader quest in one interactive tree, with the maps and blueprint rewards.',
    art: parts.join('\n  '),
  };
}

async function lootCard(): Promise<Card> {
  const columns: string[][] = [
    ['metal_parts', 'plastic_parts', 'fabric', 'chemicals'],
    ['mechanical_components', 'advanced_mechanical_components'],
    ['kettle_i'],
  ];
  const colX = [ART.x + 50, ART.x + 230, ART.x + 400];
  const centerY = ART.y + ART.h / 2;
  const sizes = [76, 96, 130];
  const positions = columns.map((col, c) =>
    col.map((_, i) => ({ x: colX[c], y: centerY + (i - (col.length - 1) / 2) * (c === 0 ? 112 : 170) })),
  );
  const parts: string[] = [];
  const edges: Array<[number, number, number, number]> = [
    [0, 0, 1, 0], [0, 1, 1, 0], [0, 2, 1, 1], [0, 3, 1, 1], [0, 1, 1, 1],
    [1, 0, 2, 0], [1, 1, 2, 0],
  ];
  for (const [c1, i1, c2, i2] of edges) {
    const a = positions[c1][i1];
    const b = positions[c2][i2];
    const mx = (a.x + b.x) / 2;
    parts.push(`<path d="M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}" fill="none" stroke="${COLOR.red}" stroke-opacity="0.55" stroke-width="3"/>`);
  }
  for (const [c, col] of columns.entries()) {
    for (const [i, slug] of col.entries()) {
      const { x, y } = positions[c][i];
      const s = sizes[c];
      const last = c === columns.length - 1;
      if (last) parts.push(`<circle cx="${x}" cy="${y}" r="${s / 2 + 10}" fill="${COLOR.red}" opacity="0.3" filter="url(#soft)"/>`);
      parts.push(`<rect x="${x - s / 2}" y="${y - s / 2}" width="${s}" height="${s}" rx="16" fill="${COLOR.panel}" stroke="${last ? COLOR.red : COLOR.line}" stroke-width="${last ? 3 : 2}"/>`);
      const inner = Math.round(s * 0.74);
      parts.push(image(await toned(`images/items/${slug}.webp`, last ? COLOR.red : COLOR.muted, inner), x - inner / 2, y - inner / 2, inner, inner));
    }
  }
  return {
    file: 'loot-helper.jpg',
    accent: COLOR.red,
    title: 'Looting Helper',
    tagline: 'Follow the crafting chains to know which materials are worth looting.',
    art: parts.join('\n  '),
  };
}

async function quartermasterCard(): Promise<Card> {
  const slugs = [
    'ferro_i', 'bandage', 'battery', 'arc_alloy', 'metal_parts',
    'kettle_i', 'arc_circuitry', '', 'fabric', 'chemicals',
    'raider_hatch_key', 'plastic_parts', 'leaper_pulse_unit', 'mechanical_components', '',
    'advanced_arc_powercell', '', 'rattler_amplified', 'heavy_gun_parts', 'light_gun_parts',
  ];
  const highlighted = new Map([[2, '×8'], [6, '×3'], [12, '×1'], [17, '']]);
  const cols = 5;
  const size = 84;
  const gap = 10;
  const x0 = ART.x + (ART.w - (cols * size + (cols - 1) * gap)) / 2;
  const y0 = ART.y + 30;
  const parts: string[] = [];
  for (const [i, slug] of slugs.entries()) {
    const x = x0 + (i % cols) * (size + gap);
    const y = y0 + Math.floor(i / cols) * (size + gap);
    const mark = highlighted.get(i);
    const on = mark !== undefined;
    parts.push(`<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="10" fill="${on ? '#2a2817' : COLOR.panel}" stroke="${on ? COLOR.yellow : COLOR.line}" stroke-width="2"/>`);
    if (slug) parts.push(image(await toned(`images/items/${slug}.webp`, on ? COLOR.yellow : COLOR.dim, 68), x + 8, y + 8, 68, 68));
    if (mark) parts.push(text(mark, x + size - 8, y + size - 9, { font: 'bold', size: 18, fill: COLOR.yellow }, 'end'));
  }
  // Loadout strip below the stash.
  const ly = y0 + 4 * (size + gap) + 26;
  parts.push(text('LOADOUT', x0, ly + 4, { font: 'bold', size: 16, fill: COLOR.dim, letterSpacing: 0.14 }));
  for (let i = 0; i < 4; i++) {
    const x = x0 + 120 + i * 82;
    parts.push(`<rect x="${x}" y="${ly - 26}" width="70" height="44" rx="8" fill="${COLOR.panel}" stroke="${i < 3 ? COLOR.yellow : COLOR.line}" stroke-width="2"/>`);
    if (i < 3) parts.push(`<path d="M ${x + 24} ${ly - 4} L ${x + 32} ${ly + 4} L ${x + 47} ${ly - 12}" fill="none" stroke="${COLOR.yellow}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  return {
    file: 'quartermaster.jpg',
    accent: COLOR.yellow,
    title: 'Quartermaster',
    tagline: 'Plan your stash, loadouts and hideout upgrades in one place.',
    art: parts.join('\n  '),
  };
}

async function mapsCard(): Promise<Card> {
  const size = 470;
  const x = ART.x + (ART.w - size) / 2;
  const y = ART.y + (ART.h - size) / 2;
  const map = await duotone(await mapImage('T_InGameMap_Dam_02'), '#0b1a12', '#4fd08a', size, size);
  const parts: string[] = [
    `<clipPath id="mapclip"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="26"/></clipPath>`,
    image(map, x, y, size, size, `clip-path="url(#mapclip)" opacity="0.9"`),
    `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="26" fill="none" stroke="${COLOR.green}" stroke-width="3"/>`,
  ];
  const pins: Array<[number, number]> = [[0.3, 0.32], [0.62, 0.24], [0.48, 0.58], [0.74, 0.66]];
  for (const [px, py] of pins) {
    const cx = x + px * size;
    const cy = y + py * size;
    parts.push(`<circle cx="${cx}" cy="${cy + 22}" r="10" fill="${COLOR.green}" opacity="0.5" filter="url(#soft)"/>`);
    parts.push(lucide(MapPin, cx - 22, cy - 22, 44, COLOR.green, 2.4).replace('fill="none"', `fill="${COLOR.bg}"`));
  }
  const spawns: Array<[number, number]> = [[0.2, 0.7], [0.82, 0.42], [0.4, 0.82]];
  for (const [sx, sy] of spawns) {
    const cx = x + sx * size;
    const cy = y + sy * size;
    parts.push(`<circle cx="${cx}" cy="${cy}" r="22" fill="${COLOR.red}" fill-opacity="0.25" stroke="${COLOR.red}" stroke-width="2.5"/>`);
    parts.push(`<circle cx="${cx}" cy="${cy}" r="6" fill="${COLOR.red}"/>`);
  }
  return {
    file: 'maps.jpg',
    accent: COLOR.green,
    title: 'Maps',
    tagline: 'Where to loot any item and where ARC enemies spawn, for every map condition.',
    art: parts.join('\n  '),
  };
}

async function mapSizesCard(): Promise<Card> {
  type Ring = Array<[number, number]>;
  const sizes = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'data/map-data/sizes.json'), 'utf8')) as {
    maps: Array<{ name: string; rings: Ring[] }>;
  };
  const area = (ring: Ring) =>
    Math.abs(ring.reduce((sum, [x1, y1], i) => {
      const [x2, y2] = ring[(i + 1) % ring.length];
      return sum + x1 * y2 - x2 * y1;
    }, 0)) / 2;
  const maps = [...sizes.maps]
    .sort((a, b) => area(b.rings[0]) - area(a.rings[0]))
    .map((map) => {
      const points = map.rings.flat();
      const xs = points.map(([x]) => x);
      const ys = points.map(([, y]) => y);
      return { ...map, minX: Math.min(...xs), minY: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    });

  // All maps side by side at one scale, wrapped into rows: the largest scale that fits the art area.
  const gap = 22;
  const labelH = 34;
  const layout = (scale: number) => {
    const rows: Array<typeof maps> = [[]];
    let rowW = 0;
    for (const map of maps) {
      const w = map.w * scale;
      if (rows[rows.length - 1].length && rowW + gap + w > ART.w) {
        rows.push([]);
        rowW = 0;
      }
      rowW += (rowW ? gap : 0) + w;
      rows[rows.length - 1].push(map);
    }
    const height = rows.reduce((sum, row) => sum + Math.max(...row.map((m) => m.h * scale)) + labelH, 0) + gap * (rows.length - 1);
    return { rows, height };
  };
  let scale = 0.3;
  while (layout(scale).height > ART.h - 20) scale *= 0.97;
  const { rows, height } = layout(scale);

  const palette = [COLOR.cyan, COLOR.green, COLOR.yellow, COLOR.red, '#b388ff', '#ff9f43', '#e0e0e0'];
  const parts: string[] = [];
  let y = ART.y + (ART.h - height) / 2;
  let colorIndex = 0;
  for (const row of rows) {
    const rowH = Math.max(...row.map((m) => m.h * scale));
    const rowW = row.reduce((sum, m) => sum + m.w * scale, 0) + gap * (row.length - 1);
    let x = ART.x + (ART.w - rowW) / 2;
    for (const map of row) {
      const color = palette[colorIndex++ % palette.length];
      const top = y + rowH - map.h * scale;
      for (const ring of map.rings) {
        const d = ring
          .map(([px, py], j) => `${j ? 'L' : 'M'} ${(x + (px - map.minX) * scale).toFixed(1)} ${(top + (py - map.minY) * scale).toFixed(1)}`)
          .join(' ');
        parts.push(`<path d="${d} Z" fill="${color}" fill-opacity="0.12" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>`);
      }
      const label = map.name.replace(/^The /, '');
      parts.push(text(label, x + (map.w * scale) / 2, y + rowH + 26, { font: 'semibold', size: 17, fill: COLOR.muted }, 'middle'));
      x += map.w * scale + gap;
    }
    y += rowH + labelH + gap;
  }
  // Scale bar: 500 m.
  const bar = 500 * scale;
  const barY = ART.y + ART.h + 12;
  parts.push(`<path d="M ${ART.x + ART.w - bar} ${barY - 6} V ${barY} H ${ART.x + ART.w} V ${barY - 6}" fill="none" stroke="${COLOR.dim}" stroke-width="2"/>`);
  parts.push(text('500 m', ART.x + ART.w - bar - 10, barY + 2, { font: 'semibold', size: 16, fill: COLOR.dim }, 'end'));
  return {
    file: 'map-sizes.jpg',
    accent: COLOR.cyan,
    title: 'How big is each map?',
    tagline: 'Every raid map measured in meters and drawn at the same scale.',
    art: parts.join('\n  '),
  };
}

type WhatsNewArt = { hub: string | LucideIcon; orbit: string[] };

/** Art of the tab pages; the default tab is the version's own page (see frozenTrailCard). */
const WHATS_NEW_ART: Record<Exclude<WhatsNewTab, typeof DEFAULT_WHATS_NEW_TAB>, WhatsNewArt> = {
  'old-items': {
    hub: History,
    orbit: ['../../items/arc_alloy', '../../items/battery', '../../items/metal_parts', '../../items/fabric', '../../items/chemicals', '../../items/arc_circuitry'],
  },
  outpost: { hub: 'outpost', orbit: ['workbench', 'decoration', 'trade', 'research-station', 'gunsmith', 'beacon'] },
  research: { hub: 'research-station', orbit: ['research-points', 'blueprint', 'research', 'stencil', 'gadget'] },
  amplified: {
    hub: 'amplified',
    orbit: ['amp-incendiary-rounds', 'amp-drum-mag', 'amp-scoped', 'amp-full-auto', 'amp-anti-shield', 'amp-x-rounds', 'amp-tracker-rounds'],
  },
  crafting: { hub: 'crafting', orbit: ['skill-in-round-crafting', 'stencil', 'key', 'skill-nomadic-crafting', 'workbench', 'skill-traveling-tinkerer'] },
  changes: { hub: GitCompareArrows, orbit: ['workbench', 'trade', 'crafting', 'blueprint', 'gunsmith'] },
};

function whatsNewGlyph(name: string): string {
  if (name.startsWith('../../items/')) return `images/items/${name.slice('../../items/'.length)}.webp`;
  if (name.startsWith('../../events/')) return `images/events/${name.slice('../../events/'.length)}.png`;
  return `images/whats-new/icons/${name}.webp`;
}

async function whatsNewArt(art: WhatsNewArt): Promise<string> {
  const cx = ART.x + ART.w / 2;
  const cy = ART.y + ART.h / 2;
  const parts = [
    await orbit(art.orbit.map(whatsNewGlyph), cx, cy, 190, COLOR.cyan),
    await hub(typeof art.hub === 'string' ? whatsNewGlyph(art.hub) : art.hub, cx, cy, 82, COLOR.cyan),
  ];
  return parts.join('\n  ');
}

/** The Frozen Trail page: the entry point to the update, showing its new items. */
async function frozenTrailCard(backdrop: string): Promise<Card> {
  return {
    file: 'whats-new-frozen-trail.jpg',
    accent: COLOR.cyan,
    kicker: 'ARC RAIDERS 2.0 UPDATE',
    title: 'Frozen Trail: what\u2019s new',
    tagline: 'Every new item, the Outpost, Research, Amplified weapons and what changed.',
    art: await whatsNewArt({
      hub: '../../events/cold_snap',
      orbit: ['gadget', 'outpost', 'research-station', 'amplified', 'crafting', 'beacon', 'stencil'],
    }),
    backdrop,
  };
}

async function whatsNewCard(tab: keyof typeof WHATS_NEW_ART, backdrop: string): Promise<Card> {
  const intro = (EN.whatsNew as { intro: Record<string, { title: string; sentence: string }> }).intro[tab];
  return {
    file: `whats-new-${tab}.jpg`,
    accent: COLOR.cyan,
    kicker: 'ARC RAIDERS 2.0 \u00b7 FROZEN TRAIL',
    title: intro.title,
    tagline: intro.sentence,
    art: await whatsNewArt(WHATS_NEW_ART[tab]),
    backdrop,
  };
}

// --- output ---------------------------------------------------------------------------------------

async function writeCard(card: Card): Promise<void> {
  const svg = frame(card);
  await sharp(Buffer.from(svg)).jpeg({ quality: 86, mozjpeg: true, chromaSubsampling: '4:4:4' }).toFile(path.join(OG_DIR, card.file));
  console.log(`  ${card.file}`);
}

async function writeIcons(): Promise<void> {
  const svg = fs.readFileSync(path.join(PUBLIC, 'favicon.svg'));
  fs.mkdirSync(ICON_DIR, { recursive: true });
  for (const [file, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]] as const) {
    await sharp(svg, { density: Math.ceil((72 * size) / 32) }).resize(size, size).png().toFile(path.join(ICON_DIR, file));
    console.log(`  icons/${file}`);
  }
}

async function main(): Promise<void> {
  fs.mkdirSync(OG_DIR, { recursive: true });
  const frozenTrail = await duotone(await mapImage('T_InGameMap_FrozenTrail_01'), COLOR.bg, '#2b4d63', 640, 640);
  const backdrop = image(frozenTrail, 560, -5, 640, 640, 'opacity="0.85"');
  const cards = [
    await homeCard(),
    await scheduleCard(),
    await craftCard(),
    await questsCard(),
    await lootCard(),
    await quartermasterCard(),
    await mapsCard(),
    await mapSizesCard(),
    await frozenTrailCard(backdrop),
    ...(await Promise.all(
      (Object.keys(WHATS_NEW_ART) as Array<keyof typeof WHATS_NEW_ART>).map((tab) => whatsNewCard(tab, backdrop)),
    )),
  ];
  console.log('OG images:');
  for (const card of cards) await writeCard(card);

  const expected = new Set(SEO_PAGES.map((page) => page.image));
  const written = new Set(cards.map((card) => card.file));
  const missing = [...expected].filter((file) => !written.has(file));
  if (missing.length) throw new Error(`No image generated for: ${missing.join(', ')}`);

  console.log('App icons:');
  await writeIcons();
}

await main();
