// Links from the quest details to the maps' Quests mode: the whole quest, and each step on its map.
import { Link } from 'react-router-dom';
import { Map as MapIcon, MapPin } from 'lucide-react';
import { useLocale } from '../../../shared/context/LocaleContext';
import type { ObjectiveView, Quest } from '../types/quest';
import { questMapUrl } from '../utils/questSummary';

/** "Show on map": the map where the quest continues (its open steps), else its first map. */
export function QuestMapButton({ quest, openMaps }: { quest: Quest; openMaps: string[] | null }) {
  const { t } = useLocale();
  const map = openMaps?.[0] ?? quest.map[0];
  if (!map) return null;
  return (
    <Link className="quest-card-btn quest-card-btn--icon" to={questMapUrl(quest.id, map)} title={t('quests.card.showOnMap')} aria-label={t('quests.card.showOnMap')}>
      <MapIcon size={18} />
    </Link>
  );
}

/**
 * A step's map chips as links to the step on the map. A step on the quest's single map (no chip, `names` false) gets a
 * pin link only; a step without a map of its own on a single-map quest links to that map.
 */
export function StepMapLinks({ quest, node, names }: { quest: Quest; node: ObjectiveView; names: boolean }) {
  const { t } = useLocale();
  const maps = node.mapIds?.length ? node.mapIds : [];
  if (!maps.length) return null;
  if (!names) {
    return (
      <Link className="quest-steps__chip quest-steps__chip--map quest-steps__chip--link" to={questMapUrl(quest.id, maps[0], node.key)} title={t('quests.card.showOnMap')} aria-label={t('quests.card.showOnMap')}>
        <MapPin size={11} />
      </Link>
    );
  }
  return (
    <>
      {maps.map((id, i) => (
        <Link key={id} className="quest-steps__chip quest-steps__chip--map quest-steps__chip--link" to={questMapUrl(quest.id, id, node.key)} title={t('quests.card.showOnMap')}>
          <MapPin size={11} /> {node.mapNames?.[i] ?? id}
        </Link>
      ))}
    </>
  );
}
