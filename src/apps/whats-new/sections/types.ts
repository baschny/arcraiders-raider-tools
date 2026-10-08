import type { WhatsNewPageData } from '../hooks/useWhatsNewData';

export type WhatsNewVariant = 'a' | 'b';

/** Props shared by every section component. */
export interface SectionProps {
  data: WhatsNewPageData;
  variant: WhatsNewVariant;
}
