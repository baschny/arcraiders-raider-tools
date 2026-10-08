import { useEffect, useState } from 'react';
import { useLocale } from '../context/LocaleContext';
import { emptyClassification, loadItemCatalog, type CatalogClassification } from '../gamedata/catalog';

/**
 * The game item classification (stash groups in game order, rarities, names) of the active
 * locale. Empty until the catalog is loaded; the catalog itself is cached per locale.
 */
export function useItemClassification(): CatalogClassification {
  const { locale } = useLocale();
  const [classification, setClassification] = useState<CatalogClassification>(() => emptyClassification());
  useEffect(() => {
    let cancelled = false;
    loadItemCatalog(locale)
      .then((catalog) => {
        if (!cancelled) setClassification(catalog.classification);
      })
      .catch((err: unknown) => console.error('Failed to load item classification:', err));
    return () => {
      cancelled = true;
    };
  }, [locale]);
  return classification;
}
