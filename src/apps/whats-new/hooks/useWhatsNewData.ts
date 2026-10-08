import { useEffect, useState } from 'react';
import { useLocale } from '../../../shared/context/LocaleContext';
import { loadItemCatalog, type ItemCatalog } from '../../../shared/gamedata/catalog';
import { loadDomain } from '../../../shared/gamedata/loader';
import type { GameDomain, LoadedDomain } from '../../../shared/gamedata/types';
import type { ItemRef } from '../components';

/** TODO(W4): replace with `WhatsNewStructure` from shared/gamedata/types.ts once the domain exists. */
export type WhatsNewData = unknown;

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
 * Loads the `whats-new` domain without requiring it to be typed or present. Fetched directly
 * because it is not a registered GameDomain yet (W4); any failure yields null.
 */
async function loadWhatsNew(locale: string): Promise<WhatsNewData | null> {
  try {
    // The cast keeps this compiling until W4 registers the domain in GameDomain.
    const loaded = await loadDomain('whats-new' as GameDomain, locale);
    return loaded.structure;
  } catch {
    return null;
  }
}

export function useWhatsNewData(): WhatsNewDataState {
  const { locale } = useLocale();
  const [state, setState] = useState<WhatsNewDataState>({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
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
          setState({
            data: { catalog, outpost, research, blueprints, stencils, amplification, trades, benches, skilltree, recipes, whatsNew },
            loading: false,
            error: null,
          });
        },
      )
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({ data: null, loading: false, error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  return state;
}
