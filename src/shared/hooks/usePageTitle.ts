import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useLocale } from '../context/LocaleContext';
import { findSeoPage, formatPageTitle } from '../seo/pages';

// Titles of the pages that are not public (see src/shared/seo/pages.ts), by path prefix.
const PRIVATE_PAGE_TITLES: Array<{ prefix: string; key: string }> = [
  { prefix: '/profile', key: 'pages.profile.title' },
  { prefix: '/auth/sign-in', key: 'pages.profileSettings' },
  { prefix: '/auth/sign-up', key: 'pages.profileSettings' },
];

function privatePageKey(pathname: string): string | undefined {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return PRIVATE_PAGE_TITLES.find(({ prefix }) => path === prefix || path.startsWith(`${prefix}/`))?.key;
}

/** Keeps search engines off a page that is not public, e.g. the profile or a not found page. */
function setNoIndex(noIndex: boolean): void {
  let meta = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (!noIndex) {
    meta?.remove();
    return;
  }
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'robots';
    document.head.appendChild(meta);
  }
  meta.content = 'noindex';
}

/** Sets the document title of the current route, and keeps non-public routes out of search engines. */
export function usePageTitle() {
  const location = useLocation();
  const { t } = useLocale();

  useEffect(() => {
    const page = findSeoPage(location.pathname);
    const pageKey = page ? page.titleKey : (privatePageKey(location.pathname) ?? 'pages.notFound');
    document.title = formatPageTitle(t('app.name'), pageKey ? t(pageKey) : undefined);
    setNoIndex(!page);
  }, [location.pathname, t]);
}
