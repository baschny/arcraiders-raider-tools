import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useLocale } from '../context/LocaleContext';
import { DEFAULT_LOCALE } from '../i18n/config';
import { findSeoPage } from '../seo/pages';

/**
 * Keeps public pages under the URL prefix of the current language: navigating from a page without
 * prefix (e.g. the profile after signing in) to a public page moves it to `/de/...`.
 */
export function useLocalePrefix(): void {
  const { pathname } = useLocation();
  const { locale, basename, adoptLocalePrefix } = useLocale();

  useEffect(() => {
    if (!basename && locale !== DEFAULT_LOCALE && findSeoPage(pathname)) adoptLocalePrefix();
  }, [pathname, locale, basename, adoptLocalePrefix]);
}
