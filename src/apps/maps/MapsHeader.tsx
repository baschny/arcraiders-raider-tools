// The maps header: links between the map explorer ("/maps") and the size comparison ("/map-sizes").
import { Link } from 'react-router-dom';
import { useLocale } from '../../shared/context/LocaleContext';
import type { MapIndex } from './data/types';

export type MapsView = 'maps' | 'sizes';

export function MapsHeader({ active, index }: { active: MapsView; index: MapIndex }) {
  const { t, tm, formatDate } = useLocale();
  const built = new Date(index.built);
  const ok = !Number.isNaN(built.getTime());
  const date = ok ? formatDate(built, { dateStyle: 'medium' }) : index.built;
  return (
    <header className="mx-head">
      <nav className="mx-viewswitch" aria-label={t('maps.sizes.viewLabel')}>
        <Link to="/maps" aria-current={active === 'maps' ? 'page' : undefined} className={active === 'maps' ? 'on' : ''}>
          {t('shared.tools.maps')}
        </Link>
        <Link to="/map-sizes" aria-current={active === 'sizes' ? 'page' : undefined} className={active === 'sizes' ? 'on' : ''}>
          {t('maps.sizes.viewSizes')}
        </Link>
      </nav>
      {active === 'maps' && (
        <span className="mx-head__version" title={tm('maps.header.gameDataTitle', { manifest: index.manifest, date: ok ? formatDate(built, { dateStyle: 'medium', timeStyle: 'short' }) : index.built })}>
          {tm('maps.header.gameData', { version: index.gameVersion ?? index.manifest, date })}
        </span>
      )}
    </header>
  );
}
