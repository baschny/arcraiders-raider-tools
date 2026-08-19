import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale } from '../../../shared/context/LocaleContext';
import { getLocalizedEventName, getLocalizedMapName } from '../utils/localization';
import { TintedIcon } from './TintedIcon';
import { RegionBadge } from './RegionBadge';
import type { EventType, MapEventsData } from '../types/mapEvents';

const PAST_HOURS = 1;
const FUTURE_HOURS = 24;
const REGION_ORDER = ['europe', 'north-america', 'south-america', 'asia', 'oceania'];
const CATEGORY_COLORS: Record<'major' | 'minor', string> = {
  major: '#d9b44a',
  minor: '#8f7c3f',
};
const REGIONS_STORAGE_KEY = 'schedule.selectedRegions';

interface Occurrence {
  region: string;
  mapId: string;
  category: 'major' | 'minor';
  eventId: string;
}

interface ScheduleProps {
  data: MapEventsData;
}

// Toggle movement: all-ON (empty or full) -> single -> multi -> all-ON.
function toggleIn(selected: string[], id: string, allIds: string[]): string[] {
  const allOn = selected.length === 0 || (allIds.length > 0 && selected.length === allIds.length);
  if (allOn) return [id];
  const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
  return next.length === allIds.length ? [] : next;
}

function occurrencesForDate(data: MapEventsData, date: Date): Occurrence[] {
  const tsKey = Math.floor(date.getTime() / 1000).toString();
  const out: Occurrence[] = [];

  for (const region of REGION_ORDER) {
    const byMap = data.schedule[region];
    if (!byMap) continue;
    for (const mapId of Object.keys(byMap)) {
      const s = byMap[mapId];
      const majorEventId = s.major?.[tsKey];
      const minorEventId = s.minor?.[tsKey];
      if (majorEventId) out.push({ region, mapId, category: 'major', eventId: majorEventId });
      if (minorEventId) out.push({ region, mapId, category: 'minor', eventId: minorEventId });
    }
  }

  return out;
}

export function Schedule({ data }: ScheduleProps) {
  const { locale, compareText, t } = useLocale();

  const mapIds = useMemo(() => Object.keys(data.maps), [data.maps]);

  const [selectedRegions, setSelectedRegions] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(REGIONS_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [hoveredCondition, setHoveredCondition] = useState<string | null>(null);
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);
  const [hideUnselected, setHideUnselected] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const nowRowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const activeConditions = hoveredCondition !== null ? [hoveredCondition] : selectedConditions;
  const anyFilterActive = selectedRegions.length > 0 || activeConditions.length > 0;
  const fixedFilterActive = selectedRegions.length > 0 || selectedConditions.length > 0;

  const persistRegions = (next: string[]) => {
    setSelectedRegions(next);
    localStorage.setItem(REGIONS_STORAGE_KEY, JSON.stringify(next));
  };

  const nowHourKey = useMemo(() => {
    const d = new Date(now);
    d.setMinutes(0, 0, 0);
    return d.getTime();
  }, [now]);

  const hourDates = useMemo(() => {
    const base = new Date(nowHourKey);
    return Array.from({ length: PAST_HOURS + FUTURE_HOURS }, (_, i) => {
      const d = new Date(base);
      d.setHours(base.getHours() - PAST_HOURS + i);
      return d;
    });
  }, [nowHourKey]);

  const occurrencesByHour = useMemo(
    () => hourDates.map((d) => occurrencesForDate(data, d)),
    [data, hourDates]
  );

  const displayedEventIds = useMemo(() => {
    const ids = new Set<string>();
    occurrencesByHour.forEach((occ) => occ.forEach((o) => ids.add(o.eventId)));
    return ids;
  }, [occurrencesByHour]);

  const eventTypes = useMemo(
    () =>
      Object.entries(data.eventTypes)
        .filter(
          ([eventId, event]) =>
            (event.category === 'major' || event.category === 'minor') &&
            displayedEventIds.has(eventId)
        )
        .map(([eventId, event]) => ({ eventId, event }))
        .sort((a, b) => {
          if (a.event.category !== b.event.category) return a.event.category === 'major' ? -1 : 1;
          return compareText(
            getLocalizedEventName(a.event, locale),
            getLocalizedEventName(b.event, locale)
          );
        }),
    [data.eventTypes, displayedEventIds, compareText, locale]
  );

  const eventOrder = useMemo(
    () => new Map(eventTypes.map(({ eventId }, i) => [eventId, i])),
    [eventTypes]
  );
  const regionOrder = useMemo(() => new Map(REGION_ORDER.map((r, i) => [r, i])), []);
  const allConditionIds = useMemo(() => eventTypes.map(({ eventId }) => eventId), [eventTypes]);
  const majorEvents = useMemo(
    () => eventTypes.filter(({ event }) => event.category === 'major'),
    [eventTypes]
  );
  const minorEvents = useMemo(
    () => eventTypes.filter(({ event }) => event.category === 'minor'),
    [eventTypes]
  );

  const availableInRegions = useMemo(() => {
    if (selectedRegions.length === 0) return null;
    const set = new Set<string>();
    occurrencesByHour.forEach((occ) =>
      occ.forEach((o) => {
        if (selectedRegions.includes(o.region)) set.add(o.eventId);
      })
    );
    return set;
  }, [occurrencesByHour, selectedRegions]);

  useEffect(() => {
    nowRowRef.current?.scrollIntoView({ block: 'center', behavior: 'auto' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isRegionColored = (regionId: string): boolean =>
    selectedRegions.includes(regionId) || hoveredRegion === regionId;

  const entriesForCell = (mapId: string, hourIndex: number): Occurrence[] =>
    occurrencesByHour[hourIndex]
      .filter((o) => o.mapId === mapId)
      .sort((a, b) => {
        if (a.category !== b.category) return a.category === 'major' ? -1 : 1;
        const oa = eventOrder.get(a.eventId) ?? 0;
        const ob = eventOrder.get(b.eventId) ?? 0;
        if (oa !== ob) return oa - ob;
        return (regionOrder.get(a.region) ?? 0) - (regionOrder.get(b.region) ?? 0);
      });

  const hourLabel = (d: Date): string => `${d.getHours().toString().padStart(2, '0')}:00`;

  const getShortName = (eventId: string, event: EventType): string => {
    const key = `schedule.conditionShortNames.${eventId}`;
    const translated = t(key);
    return translated === key ? getLocalizedEventName(event, locale) : translated;
  };

  const renderConditionItems = (items: typeof majorEvents) =>
    items.map(({ eventId, event }) => {
      const isActive = activeConditions.includes(eventId);
      const available = availableInRegions === null || availableInRegions.has(eventId);
      const faded = (!isActive && activeConditions.length > 0) || !available;
      return (
        <button
          key={eventId}
          type="button"
          className={`filter-item condition ${isActive ? 'selected' : ''} ${faded ? 'faded' : ''}`}
          onMouseEnter={() =>
            selectedConditions.length === 0 && available && setHoveredCondition(eventId)
          }
          onMouseLeave={() => setHoveredCondition(null)}
          onClick={() =>
            available && setSelectedConditions(toggleIn(selectedConditions, eventId, allConditionIds))
          }
        >
          <TintedIcon
            iconUrl={event.icon}
            color={CATEGORY_COLORS[event.category as 'major' | 'minor']}
            size={16}
          />
          <span className="filter-label">{getLocalizedEventName(event, locale)}</span>
        </button>
      );
    });

  return (
    <div className="schedule-container">
      <div className="schedule-top">
        <div className="schedule-time">
          <div className="current-time">
            {now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false })}
          </div>
          <div className="current-timezone">{Intl.DateTimeFormat().resolvedOptions().timeZone}</div>
        </div>

        <div className="schedule-filters">
          <div className="filter-bar">
            <div className="filter-row">
              {REGION_ORDER.map((regionId) => {
                const region = data.regions[regionId];
                if (!region) return null;
                const isActive = selectedRegions.includes(regionId);
                const colored = isRegionColored(regionId);
                return (
                  <button
                    key={regionId}
                    type="button"
                    className={`filter-item region ${isActive ? 'selected' : ''}`}
                    onClick={() => persistRegions(toggleIn(selectedRegions, regionId, REGION_ORDER))}
                    onMouseEnter={() => setHoveredRegion(regionId)}
                    onMouseLeave={() => setHoveredRegion(null)}
                    title={region.displayName}
                  >
                    <span
                      className="filter-dot"
                      style={{ backgroundColor: colored ? region.color : '#8a8a8a' }}
                    />
                    <span
                      className="filter-label"
                      style={colored ? { color: region.color } : undefined}
                    >
                      {region.displayName}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="filter-row">{renderConditionItems(majorEvents)}</div>

            <div className="filter-row">{renderConditionItems(minorEvents)}</div>

            <div className="filter-row">
              <button
                type="button"
                className={`filter-item hide-unselected ${hideUnselected ? 'selected' : ''}`}
                onClick={() => setHideUnselected((prev) => !prev)}
              >
                <span className="filter-label">{t('schedule.hideUnselected')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="schedule-scroll">
        <div className="schedule-grid">
          <div className="schedule-header-row">
            <div className="hour-corner" />
            {mapIds.map((mapId) => (
              <div key={mapId} className="map-col-header" data-map={mapId}>
                <span className="map-name">{getLocalizedMapName(mapId, data.maps[mapId], locale)}</span>
              </div>
            ))}
          </div>

          {hourDates.map((d, i) => {
            const isNowRow = d.getTime() === nowHourKey;
            const isFirstOfDay = d.getHours() === 0;
            const ref = isNowRow ? nowRowRef : null;
            return (
              <div
                key={d.getTime()}
                ref={ref}
                className={`hour-row ${isNowRow ? 'now-row' : ''}`}
              >
                <div className={`hour-label ${isNowRow ? 'now-row' : ''}`}>
                  {isFirstOfDay && (
                    <span className="hour-day">
                      {d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}
                    </span>
                  )}
                  <span>{hourLabel(d)}</span>
                </div>

                {mapIds.map((mapId) => {
                  const entries = entriesForCell(mapId, i);
                  return (
                    <div key={mapId} className={`map-cell ${isNowRow ? 'now-row' : ''}`}>
                      {entries.map((entry) => {
                        const event = data.eventTypes[entry.eventId];
                        const region = data.regions[entry.region];
                        const conditionMatch =
                          activeConditions.length === 0 || activeConditions.includes(entry.eventId);
                        const regionMatch =
                          selectedRegions.length === 0 || selectedRegions.includes(entry.region);
                        const fixedConditionMatch =
                          selectedConditions.length === 0 ||
                          selectedConditions.includes(entry.eventId);
                        const isMatch = regionMatch && conditionMatch;
                        const fixedIsMatch = regionMatch && fixedConditionMatch;
                        if (hideUnselected && fixedFilterActive && !fixedIsMatch) return null;
                        const highlightSuppressed = hideUnselected && fixedFilterActive;
                        const highlighted = anyFilterActive && isMatch && !highlightSuppressed;
                        const dimmed = anyFilterActive && !isMatch;
                        return (
                          <div
                            key={`${entry.region}-${entry.eventId}`}
                            className={`slot ${highlighted ? 'highlighted' : ''} ${dimmed ? 'dimmed' : ''}`}
                            onMouseEnter={() =>
                              selectedConditions.length === 0 &&
                              regionMatch &&
                              setHoveredCondition(entry.eventId)
                            }
                            onMouseLeave={() => setHoveredCondition(null)}
                            onClick={() =>
                              regionMatch &&
                              setSelectedConditions(
                                toggleIn(selectedConditions, entry.eventId, allConditionIds)
                              )
                            }
                            title={
                              event
                                ? `${getLocalizedEventName(event, locale)} · ${region?.displayName ?? entry.region}`
                                : entry.eventId
                            }
                          >
                            <span className="slot-main">
                              {event && (
                                <TintedIcon
                                  iconUrl={event.icon}
                                  color={CATEGORY_COLORS[entry.category]}
                                  size={20}
                                />
                              )}
                              {event && (
                                <span className="slot-name">{getShortName(entry.eventId, event)}</span>
                              )}
                            </span>
                            {region && (
                              <RegionBadge
                                region={region}
                                discrete={!isRegionColored(entry.region)}
                                glow={hoveredRegion === entry.region}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
