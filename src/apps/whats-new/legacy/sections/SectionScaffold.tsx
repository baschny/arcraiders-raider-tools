import { useLocale } from '../../../../shared/context/LocaleContext';
import { SectionHeader } from '../components';
import type { SectionProps } from './types';

/** Placeholder body shared by the scaffold sections; replaced by the section tickets. */
export function SectionScaffold({ anchor }: { anchor: string } & Partial<SectionProps>) {
  const { t } = useLocale();
  return (
    <section className="wn-section" aria-labelledby={anchor}>
      <SectionHeader
        id={anchor}
        title={t(`whatsNew.section.${anchor}.title`)}
        subtitle={t(`whatsNew.section.${anchor}.subtitle`)}
      />
      <div className="wn-section__body wn-section__body--placeholder">{t('whatsNew.placeholder')}</div>
    </section>
  );
}
