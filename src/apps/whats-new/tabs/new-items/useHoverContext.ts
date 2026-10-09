import { useMemo } from 'react';
import { useLocale } from '../../../../shared/context/LocaleContext';
import type { WhatsNewPageData } from '../../hooks/useWhatsNewData';
import { createHoverContext, type HoverContext } from './hover';

/** Hover context (labels, research offers, unlock maps) of the page, rebuilt when data or locale change. */
export function useHoverContext(data: WhatsNewPageData): HoverContext {
  const { t, tm, formatNumber } = useLocale();
  return useMemo(() => createHoverContext(data, t, tm, formatNumber), [data, t, tm, formatNumber]);
}
