import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ListTodo } from 'lucide-react';
import { useLocale } from '../../../../shared/context/LocaleContext';
import { PurposeGroup } from '../../components';
import { BLUEPRINT_BG, groupStyle } from './curated';

export interface GroupSectionProps {
  /** Group id: picks the title / sentence keys and the header style. */
  id: string;
  children: ReactNode;
  /** Tab with more details on this topic, linked under the group. */
  moreTab?: 'research' | 'amplified' | 'outpost' | 'crafting';
}

/** A purpose group with its styled header band (glyph square, accent stripe, title, sentence). */
export function GroupSection({ id, children, moreTab }: GroupSectionProps) {
  const { t } = useLocale();
  const { version = 'frozen-trail' } = useParams();
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
      {moreTab && (
        <p className="wn-group-more">
          <Link to={`/whats-new/${version}/${moreTab}`}>{t(`whatsNew.new-items.more.${moreTab}`)}</Link>
        </p>
      )}
    </PurposeGroup>
  );
}
