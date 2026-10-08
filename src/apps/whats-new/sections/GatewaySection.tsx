import { useLocale } from '../../../shared/context/LocaleContext';
import { ItemChip, RecipeRow, SectionHeader } from '../components';
import { toItemRef } from '../hooks/useWhatsNewData';
import type { SectionProps } from './types';

const RECIPE_ID = 'recipes:emperor_gateway_conduit';

export function GatewaySection({ data }: SectionProps) {
  const { t } = useLocale();
  const { catalog } = data;
  const recipe = data.recipes.structure.recipes[RECIPE_ID];
  const bench = recipe?.benchId ? data.benches.structure.benches[recipe.benchId] : undefined;
  const level = bench?.levels.find((l) => l.level === (recipe?.benchLevel ?? 1)) ?? bench?.levels[0];
  const blueprintId = recipe?.requires?.find((r) => r.kind === 'unlock')?.id;

  return (
    <section className="wn-section wn-gateway" aria-labelledby="gateway">
      <SectionHeader
        id="gateway"
        title={t('whatsNew.section.gateway.title')}
        subtitle={t('whatsNew.section.gateway.subtitle')}
      />
      <div className="wn-section__body">
        {recipe && (
          <div className="wn-gateway__row">
            <RecipeRow
              inputs={('items' in recipe.cost ? recipe.cost.items : []).map((c) => ({ item: toItemRef(catalog, c.itemId), quantity: c.quantity }))}
              outputs={(recipe.rewards ?? []).map((r) => ({ item: toItemRef(catalog, r.itemId), quantity: r.quantity }))}
              label={bench ? data.benches.text[bench.id]?.name ?? bench.nameEn : undefined}
              labelImage={level?.icon ?? undefined}
            />
            {blueprintId && (
              <div className="wn-gateway__blueprint">
                <span className="wn-gateway__blueprint-label">{t('whatsNew.gateway.requires')}</span>
                <ItemChip item={toItemRef(catalog, blueprintId)} size="sm" showName />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
