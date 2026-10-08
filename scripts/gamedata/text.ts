/**
 * Collects localized text per domain and writes it as one text file per locale
 * (`<domain>.text.<locale>.json`). Missing translations fall back to English at generation time,
 * so the client needs no per-string fallback.
 */
import { LOCALES, type Locale, type Localization } from './arcData';

type Text = Localization | { en: string } | string | null | undefined;

/** domain → slug → field path (dot separated) → per-locale strings */
export class TextCollector {
  private data = new Map<string, Map<string, Map<string, Partial<Record<Locale, string>>>>>();

  /**
   * Adds a text. `field` may be dotted for nested entries, e.g. 'objectives.0.1'.
   * Plain strings are treated as English-only text.
   */
  add(domain: string, slug: string, field: string, text: Text): void {
    if (text == null) return;
    const values: Partial<Record<Locale, string>> = typeof text === 'string' ? { en: text } : (text as Partial<Record<Locale, string>>);
    if (!values.en && !LOCALES.some((l) => values[l])) return;
    let d = this.data.get(domain);
    if (!d) this.data.set(domain, (d = new Map()));
    let s = d.get(slug);
    if (!s) d.set(slug, (s = new Map()));
    s.set(field, values);
  }

  /** English text of a field, if collected. */
  en(domain: string, slug: string, field = 'name'): string | undefined {
    return this.data.get(domain)?.get(slug)?.get(field)?.en || undefined;
  }

  has(domain: string): boolean {
    return this.data.has(domain);
  }

  /** Builds the text file content for a locale: slug → nested fields. Keys are sorted. */
  build(domain: string, locale: Locale): Record<string, Record<string, unknown>> {
    const out: Record<string, Record<string, unknown>> = {};
    const d = this.data.get(domain);
    if (!d) return out;
    for (const slug of [...d.keys()].sort()) {
      const entry: Record<string, unknown> = {};
      const fields = d.get(slug)!;
      for (const field of [...fields.keys()].sort()) {
        const v = fields.get(field)!;
        const value = v[locale] || v.en || LOCALES.map((l) => v[l]).find(Boolean) || '';
        if (!value) continue;
        setPath(entry, field.split('.'), value);
      }
      out[slug] = entry;
    }
    return out;
  }
}

function setPath(obj: Record<string, unknown>, parts: string[], value: string): void {
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (typeof cur[p] !== 'object' || cur[p] === null) cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

/** English string of a canonical Localization (or ''). */
export function enOf(text: Localization | null | undefined): string {
  return text?.en ?? '';
}
