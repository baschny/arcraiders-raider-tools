import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useLocale } from '../../../shared/context/LocaleContext';
import { UPDATES_PATH } from '../routing';

export interface Crumb {
  label: string;
  /** Absent on the current page (the last crumb). */
  to?: string;
}

/**
 * Breadcrumb of the update pages: "Game updates › 2.0 Frozen Trail › Items in depth". The first
 * crumb (the list of updates) is always there; `crumbs` follow it.
 */
export function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  const { t } = useLocale();
  const all: Crumb[] = [{ label: t('shared.tools.updates'), to: UPDATES_PATH }, ...crumbs];
  return (
    <nav className="up-breadcrumb" aria-label={t('updates.breadcrumb')}>
      <ol>
        {all.map((c, i) => (
          <li key={`${c.label}-${i}`}>
            {i > 0 && <ChevronRight size={14} className="up-breadcrumb__sep" aria-hidden="true" />}
            {c.to ? <Link to={c.to}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
