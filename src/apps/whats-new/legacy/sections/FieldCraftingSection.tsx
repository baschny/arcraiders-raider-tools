import { useState } from 'react';
import { useLocale } from '../../../../shared/context/LocaleContext';
import { ItemChip, RecipeRow, SectionHeader } from '../components';
import { buildFieldCraftingData, type SkillGroup, type SkillPill } from './field-crafting/data';
import type { SectionProps } from './types';

function Pill({ skill, newLabel }: { skill: SkillPill; newLabel: string }) {
  return (
    <li className={`wn-field-crafting__pill${skill.isNew ? ' wn-field-crafting__pill--new' : ''}`}>
      {skill.icon && <img className="wn-field-crafting__pill-img" src={skill.icon} alt="" loading="lazy" />}
      <span>{skill.name}</span>
      {skill.isNew && <span className="wn-field-crafting__new">{newLabel}</span>}
    </li>
  );
}

function Groups({ groups, newLabel }: { groups: SkillGroup[]; newLabel: string }) {
  return (
    <>
      {groups.map((g) => (
        <div className="wn-field-crafting__group" key={g.skill.id}>
          <h4 className="wn-field-crafting__group-title">
            {g.skill.icon && <img className="wn-field-crafting__pill-img" src={g.skill.icon} alt="" loading="lazy" />}
            <span>{g.skill.name}</span>
            {g.skill.isNew && <span className="wn-field-crafting__new">{newLabel}</span>}
          </h4>
          <div className="wn-field-crafting__grid">
            {g.recipes.map((r) => (
              <RecipeRow key={r.result.id} compact inputs={r.cost} outputs={[{ item: r.result }]} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

export function FieldCraftingSection({ data }: SectionProps) {
  const { t, tm } = useLocale();
  const [open, setOpen] = useState(false);
  const fc = buildFieldCraftingData(data);
  const newLabel = t('whatsNew.field-crafting.new');

  return (
    <section className="wn-section" aria-labelledby="field-crafting">
      <SectionHeader
        id="field-crafting"
        title={t('whatsNew.section.field-crafting.title')}
        subtitle={t('whatsNew.section.field-crafting.subtitle')}
      />
      <div className="wn-section__body wn-field-crafting">
        {fc.after.length > 0 && (
          <div className="wn-field-crafting__skills">
            <div className="wn-field-crafting__col">
              <h3 className="wn-field-crafting__heading">{t('whatsNew.field-crafting.before')}</h3>
              <ul className="wn-field-crafting__pills">
                {fc.before.map((s) => (
                  <Pill key={s.id} skill={s} newLabel={newLabel} />
                ))}
              </ul>
            </div>
            <span className="wn-field-crafting__arrow" aria-hidden="true">→</span>
            <div className="wn-field-crafting__col">
              <h3 className="wn-field-crafting__heading">{t('whatsNew.field-crafting.after')}</h3>
              <ul className="wn-field-crafting__pills">
                {fc.after.map((s) => (
                  <Pill key={s.id} skill={s} newLabel={newLabel} />
                ))}
              </ul>
            </div>
          </div>
        )}

        {fc.addedCount > 0 && (
          <div className="wn-field-crafting__block">
            <h3 className="wn-field-crafting__heading">
              {t('whatsNew.field-crafting.newCrafts')}
              <span className="wn-field-crafting__count">{fc.addedCount}</span>
            </h3>
            <Groups groups={fc.added} newLabel={newLabel} />
          </div>
        )}

        {fc.unchangedCount > 0 && (
          <div className="wn-field-crafting__block">
            <button
              type="button"
              className="wn-field-crafting__toggle"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
            >
              <span className="wn-field-crafting__heading">
                {tm('whatsNew.field-crafting.unchanged', { n: fc.unchangedCount })}
              </span>
              {!open && (
                <span className="wn-field-crafting__icons">
                  {fc.unchangedResults.map((r) => (
                    <ItemChip key={r.id} item={r} size="sm" />
                  ))}
                </span>
              )}
              <span aria-hidden="true">{open ? '▾' : '▸'}</span>
            </button>
            {open && <Groups groups={fc.unchanged} newLabel={newLabel} />}
          </div>
        )}
      </div>
    </section>
  );
}
