import type { ReactNode } from 'react';
import { ListTodo } from 'lucide-react';
import { useLocale } from '../../../../shared/context/LocaleContext';
import { PurposeGroup } from '../../components';
import { BLUEPRINT_BG, groupStyle } from './curated';

export interface GroupSectionProps {
  /** Group id: picks the title / sentence keys and the header style. */
  id: string;
  children: ReactNode;
}

/** A purpose group with its styled header band (glyph square, accent stripe, title, sentence). */
export function GroupSection({ id, children }: GroupSectionProps) {
  const { t } = useLocale();
  const style = groupStyle(id);
  return (
    <PurposeGroup
      id={`wn-purpose-${id}`}
      title={t(`whatsNew.new-items.purpose.${id}.title`)}
      sentence={t(`whatsNew.new-items.purpose.${id}.sentence`)}
      glyph={style.glyph}
      icon={style.lucide === 'quest' ? <ListTodo size={32} aria-hidden="true" /> : undefined}
      accent={style.accent}
      glyphBackground={style.blueprint ? BLUEPRINT_BG : undefined}
    >
      {children}
    </PurposeGroup>
  );
}
