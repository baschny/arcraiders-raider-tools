import { getLocaleCandidates, localizeDataPath, type AppLocale } from '../i18n/config';

export interface LocalizedNamePayload {
  value: string;
  originalEn: string;
}

export function getLocalizedDataUrls(path: string, locale: AppLocale): string[] {
  const localeCandidates = getLocaleCandidates(locale);
  const localizedUrls = localeCandidates.map((candidate) => localizeDataPath(path, candidate));
  return [...new Set(localizedUrls)];
}

export async function fetchLocalizedJson<T>(path: string, locale: AppLocale): Promise<T> {
  let lastError: Error | null = null;

  for (const url of getLocalizedDataUrls(path, locale)) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load ${url}: ${response.status} ${response.statusText}`);
      }
      return response.json() as Promise<T>;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
    }
  }

  throw lastError ?? new Error(`Failed to load localized data for ${path}`);
}
