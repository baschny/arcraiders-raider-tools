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
};

// Prefix-based title keys for nested routes that share a common title.
const PAGE_TITLE_PREFIXES: Array<{ prefix: string; key: string }> = [
  { prefix: '/profile', key: 'pages.profile.title' },
  { prefix: '/auth/sign-in', key: 'pages.profileSettings' },
  { prefix: '/auth/sign-up', key: 'pages.profileSettings' },
];

function resolvePageKey(pathname: string): string | undefined {
  const normalizedPathname =
    pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

  if (PAGE_TITLE_KEYS[normalizedPathname]) {
    return PAGE_TITLE_KEYS[normalizedPathname];
  }
  const prefixMatch = PAGE_TITLE_PREFIXES.find(({ prefix }) =>
    normalizedPathname === prefix || normalizedPathname.startsWith(`${prefix}/`),
  );
  return prefixMatch?.key;
}

export function usePageTitle() {
  const location = useLocation();
  const { t } = useLocale();

  useEffect(() => {
    const appName = t('app.name');
    const pageKey = resolvePageKey(location.pathname);
    const pageTitle = pageKey ? t(pageKey) : t('pages.notFound');
    const title = pageKey === 'app.name' ? appName : `${appName}: ${pageTitle}`;
    document.title = title;
  }, [location.pathname, t]);
}
