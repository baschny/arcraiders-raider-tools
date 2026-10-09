import { Info } from 'lucide-react';
import { useLocale } from '../../../../shared/context/LocaleContext';
import { HowItWorks, glyphUrl, type HowItWorksStep } from '../../components';
import { toItemRef, type WhatsNewPageData } from '../../hooks/useWhatsNewData';
import { EMPEROR_STEP_ITEMS } from './curated';

/** The five steps from the Damaged Emperor Relay to the Fallen Emperor dungeon, plus the Ruined Beacon note. */
export function FallenEmperorGuide({ data }: { data: WhatsNewPageData }) {
  const { t } = useLocale();
  const steps: HowItWorksStep[] = EMPEROR_STEP_ITEMS.map((s, i) => ({
    text: t(`whatsNew.new-items.emperor.step${i + 1}`),
    ...(s.item
      ? {
          // the blueprint step shows the conduit it unlocks, in the blueprint frame
          item: s.blueprint
            ? { ...toItemRef(data.catalog, s.item), icon: toItemRef(data.catalog, 'emperor_gateway_conduit').icon }
            : toItemRef(data.catalog, s.item),
          isBlueprint: s.blueprint,
        }
      : { image: glyphUrl('beacon') }),
  }));
  return (
    <div className="wn-emperor">
      <HowItWorks steps={steps} title={t('whatsNew.new-items.emperor.title')} layout="list" />
      <p className="wn-emperor__note">
        <Info size={20} aria-hidden="true" />
        <span>{t('whatsNew.new-items.emperor.note')}</span>
      </p>
    </div>
  );
}
