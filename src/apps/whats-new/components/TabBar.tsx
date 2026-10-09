import { Link } from 'react-router-dom';
import { useLocale } from '../../../shared/context/LocaleContext';
import { WHATS_NEW_TABS, type WhatsNewTab } from '../tabConfig';
import { whatsNewPath } from '../routing';

export interface TabBarProps {
  /** Version slug used in the links, e.g. `frozen-trail`. */
  version: string;
  active: WhatsNewTab;
}

export function TabBar({ version, active }: TabBarProps) {
  const { t } = useLocale();
  return (
    <nav className="wn-tabbar" aria-label={t('whatsNew.navLabel')}>
      <ul className="wn-tabbar__list">
        {WHATS_NEW_TABS.map(({ id, icon: Icon }) => (
          <li key={id} className="wn-tabbar__item">
            <Link
              to={whatsNewPath(version, id)}
              className={`wn-tabbar__tab${id === active ? ' is-active' : ''}`}
              aria-current={id === active ? 'page' : undefined}
              replace
            >
              <Icon size={20} aria-hidden="true" />
              <span>{t(`whatsNew.tabs.${id}`)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
