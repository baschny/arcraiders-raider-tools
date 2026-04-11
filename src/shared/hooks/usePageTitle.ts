import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useLocale } from '../context/LocaleContext';

const PAGE_TITLE_KEYS: Record<string, string> = {
  '/': 'app.name',
  '/schedule': 'shared.tools.schedule',
  '/craft-calculator': 'shared.tools.craftCalculator',
  '/quests': 'shared.tools.quests',
  '/loot-helper': 'shared.tools.lootHelper',
  '/quartermaster': 'shared.tools.quartermaster',
  '/settings/profile': 'pages.profileSettings',
};

export function usePageTitle() {
  const location = useLocation();
  const { t } = useLocale();

  useEffect(() => {
    const appName = t('app.name');
    const pageKey = PAGE_TITLE_KEYS[location.pathname];
    const pageTitle = pageKey ? t(pageKey) : t('pages.notFound');
    const title = pageKey === 'app.name' ? appName : `${appName}: ${pageTitle}`;
    document.title = title;
  }, [location.pathname, t]);
}
