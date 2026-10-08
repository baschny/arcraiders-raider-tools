import { useEffect, useState } from 'react';
import { useLocale } from '../../../shared/context/LocaleContext';
import { loadItemCatalog, type ItemCatalog } from '../../../shared/gamedata/catalog';
import { loadDomain } from '../../../shared/gamedata/loader';
import type { LoadedDomain, WhatsNewStructure } from '../../../shared/gamedata/types';
import type { ItemRef } from '../components';

/** The generated `whats-new` domain (versions keyed by slug, e.g. `frozen-trail`). */
export type WhatsNewData = WhatsNewStructure;

export interface WhatsNewDomains {
  outpost: LoadedDomain<'outpost'>;
  research: LoadedDomain<'research'>;
  blueprints: LoadedDomain<'blueprints'>;
  stencils: LoadedDomain<'stencils'>;
  amplification: LoadedDomain<'amplification'>;
  trades: LoadedDomain<'trades'>;
  benches: LoadedDomain<'benches'>;
  skilltree: LoadedDomain<'skilltree'>;
  recipes: LoadedDomain<'recipes'>;
}

export interface WhatsNewPageData extends WhatsNewDomains {
  catalog: ItemCatalog;
  /** The generated `whats-new` domain; null while it does not exist (404 or invalid). */
  whatsNew: WhatsNewData | null;
}

export interface WhatsNewDataState {
  data: WhatsNewPageData | null;
  loading: boolean;
  error: string | null;
}

/** Item slug to a display reference (name and icon from the catalog, slug as fallback). */
export function toItemRef(catalog: ItemCatalog, slug: string): ItemRef {
  const item = catalog.items[catalog.aliases[slug] ?? slug];
  if (!item) return { id: slug, name: slug };
  return { id: item.id, name: item.name, icon: item.icon, rarity: item.rarity };
}

/**
 * Display reference of what a blueprint unlocks (name and icon of that item), falling back to the
 * blueprint item itself. Render it with the blueprint frame (`isBlueprint`).
 */
export function toUnlockedRef(catalog: ItemCatalog, blueprintSlug: string, unlocksItemId?: string): ItemRef {
  const target = unlocksItemId;
  return toItemRef(catalog, target && catalog.items[catalog.aliases[target] ?? target] ? target : blueprintSlug);
}

/**
 * Loads the `whats-new` domain; a missing or invalid file yields null so the page can fall back.
 */
async function loadWhatsNew(locale: string): Promise<WhatsNewData | null> {
  try {
    const loaded = await loadDomain('whats-new', locale);
    return loaded.structure;
  } catch {
    return null;
  }
}

interface Settled {
  /** Locale the result belongs to; a different current locale means a request is pending. */
  locale: string;
  data: WhatsNewPageData | null;
  error: string | null;
}

export function useWhatsNewData(): WhatsNewDataState {
  const { locale } = useLocale();
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadItemCatalog(locale),
      loadDomain('outpost', locale),
      loadDomain('research', locale),
      loadDomain('blueprints', locale),
      loadDomain('stencils', locale),
      loadDomain('amplification', locale),
      loadDomain('trades', locale),
      loadDomain('benches', locale),
      loadDomain('skilltree', locale),
      loadDomain('recipes', locale),
      loadWhatsNew(locale),
    ])
      .then(
        ([catalog, outpost, research, blueprints, stencils, amplification, trades, benches, skilltree, recipes, whatsNew]) => {
          if (cancelled) return;
          setSettled({
            locale,
            data: { catalog, outpost, research, blueprints, stencils, amplification, trades, benches, skilltree, recipes, whatsNew },
            error: null,
          });
        },
      )
      .catch((err: unknown) => {
        if (cancelled) return;
        setSettled({ locale, data: null, error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  // Loading is derived: the stored result belongs to another locale (or nothing arrived yet).
  if (!settled || settled.locale !== locale) return { data: null, loading: true, error: null };
  return { data: settled.data, loading: false, error: settled.error };
}
