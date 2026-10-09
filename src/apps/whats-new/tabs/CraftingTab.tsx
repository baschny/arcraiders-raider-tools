import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useLocale } from '../../../shared/context/LocaleContext';
import { toItemRef, type WhatsNewPageData } from '../hooks/useWhatsNewData';
import { GlyphIcon, ItemGrid, ItemTile, NeedsCard, Panel, TabIntro } from '../components';
import { buildFieldCraftingData, type SkillGroup, type SkillPill } from './crafting/fieldCrafting';
import { buildGatewayCard } from './crafting/gateway';
import { PARTS_ID, STENCIL_IMAGES, stencilGroups, weaponRef, type StencilEntry } from './crafting/stencils';
import { StencilTile } from './crafting/StencilTile';

export interface CraftingTabProps {
  data: WhatsNewPageData;
}

function SkillList({ title, skills, newLabel }: { title: string; skills: SkillPill[]; newLabel: string }) {
  return (
    <div className="wn-crafting__skillcol">
      <h4 className="wn-crafting__heading">{title}</h4>
      <ul className="wn-crafting__skills">
        {skills.map((s) => (
          <li key={s.id} className="wn-crafting__skill">
            {s.glyph && <GlyphIcon name={s.glyph} size={28} className="wn-crafting__skill-icon" />}
            <span>{s.name}</span>
            {s.isNew && <span className="wn-crafting__new">{newLabel}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SkillGroups({ groups }: { groups: SkillGroup[] }) {
  const { t } = useLocale();
  return (
    <>
      {groups.map((g) => (
        <div className="wn-crafting__group" key={g.skill.id}>
          <h4 className="wn-crafting__heading">
            {g.skill.glyph && <GlyphIcon name={g.skill.glyph} size={24} className="wn-crafting__skill-icon" />}
            {g.skill.name}
            {g.skill.isNew && <span className="wn-crafting__new">{t('whatsNew.crafting.new')}</span>}
          </h4>
          <div className="wn-crafting__cards">
            {g.recipes.map((r) => (
              <NeedsCard key={r.result.id} result={{ item: r.result }} needs={r.cost} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function FieldCraftingPanel({ data }: CraftingTabProps) {
  const { t, tm } = useLocale();
  const [open, setOpen] = useState(false);
  const fc = buildFieldCraftingData(data);
  const newLabel = t('whatsNew.crafting.new');
  return (
    <Panel title={t('whatsNew.crafting.field.title')} description={t('whatsNew.crafting.field.sentence')} className="wn-crafting__panel">
      {fc.after.length > 0 && (
        <div className="wn-crafting__skillcols">
          <SkillList title={t('whatsNew.common.before')} skills={fc.before} newLabel={newLabel} />
          <SkillList title={t('whatsNew.common.now')} skills={fc.after} newLabel={newLabel} />
        </div>
      )}
      {fc.addedCount > 0 && (
        <div className="wn-crafting__block">
          <h4 className="wn-crafting__subtitle">{t('whatsNew.crafting.field.newCrafts')}</h4>
          <SkillGroups groups={fc.added} />
        </div>
      )}
      {fc.unchangedCount > 0 && (
        <div className="wn-crafting__block">
          <button type="button" className="wn-crafting__toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? <ChevronDown size={20} aria-hidden="true" /> : <ChevronRight size={20} aria-hidden="true" />}
            <span>{tm('whatsNew.crafting.field.unchanged', { n: fc.unchangedCount })}</span>
          </button>
          {open && <SkillGroups groups={fc.unchanged} />}
        </div>
      )}
    </Panel>
  );
}

function StencilsPanel({ data }: CraftingTabProps) {
  const { t, tm } = useLocale();
  const [openId, setOpenId] = useState<string | null>(null);
  const { catalog } = data;
  const groups = stencilGroups(data.stencils.structure);
  const parts = toItemRef(catalog, PARTS_ID);
  return (
    <Panel title={t('whatsNew.crafting.stencils.title')} description={t('whatsNew.crafting.stencils.sentence')} className="wn-crafting__panel">
      <div className="wn-crafting__parts">
        <ItemTile item={parts} size={112} />
        <p className="wn-crafting__parts-hint">{t('whatsNew.crafting.stencils.partsHint')}</p>
      </div>
      {groups.map(([cost, list]) => (
        <div className="wn-crafting__group" key={cost}>
          <h4 className="wn-crafting__heading">{tm('whatsNew.crafting.stencils.cost', { count: cost })}</h4>
          <ItemGrid<StencilEntry>
            items={list}
            getKey={(s) => s.id}
            selectedKey={list.some((s) => s.id === openId) ? openId : null}
            onSelectedKeyChange={setOpenId}
            getDetailLabel={(s) => toItemRef(catalog, s.id).name}
            renderTile={(s, { selected, toggle }) => (
              <StencilTile item={toItemRef(catalog, s.id)} image={STENCIL_IMAGES[s.id]} selected={selected} onClick={toggle} />
            )}
            renderDetail={(s) => (
              <div className="wn-crafting__works">
                <h4 className="wn-crafting__heading">{t('whatsNew.crafting.stencils.worksWith')}</h4>
                <div className="wn-crafting__weapons">
                  {s.weapons.map((w) => (
                    <ItemTile key={w} item={weaponRef(catalog, w)} size={64} />
                  ))}
                </div>
              </div>
            )}
          />
        </div>
      ))}
    </Panel>
  );
}

function GatewayPanel({ data }: CraftingTabProps) {
  const { t } = useLocale();
  const card = buildGatewayCard(data);
  return (
    <Panel title={t('whatsNew.crafting.gateway.title')} description={t('whatsNew.crafting.gateway.sentence')} className="wn-crafting__panel">
      {card && <NeedsCard {...card} />}
    </Panel>
  );
}

export function CraftingTab({ data }: CraftingTabProps) {
  const { t } = useLocale();
  return (
    <div className="wn-tab wn-tab-crafting">
      <TabIntro title={t('whatsNew.intro.crafting.title')} sentence={t('whatsNew.intro.crafting.sentence')} />
      <FieldCraftingPanel data={data} />
      <StencilsPanel data={data} />
      <GatewayPanel data={data} />
    </div>
  );
}
