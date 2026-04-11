import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { MapEventsData, EventType } from '../types/mapEvents';
import { useLocale } from '../../../shared/context/LocaleContext';
import { getLocalizedEventName, getLocalizedMapName } from '../utils/localization';

interface ScheduleProps {
  data: MapEventsData;
}
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function getStartOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function addDays(date: Date, days: number): Date {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function clampDateToRange(date: Date, minDateMs: number | null, maxDateMs: number | null): Date {
  const normalizedDate = getStartOfDay(date);
  if (minDateMs !== null && normalizedDate.getTime() < minDateMs) {
    return new Date(minDateMs);
  }
  if (maxDateMs !== null && normalizedDate.getTime() > maxDateMs) {
    return new Date(maxDateMs);
  }
  return normalizedDate;
}

export function Schedule({ data }: ScheduleProps) {
  const { locale, compareText, t } = useLocale();
  const mapIds = useMemo(() => Object.keys(data.maps), [data.maps]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(() => getStartOfDay(new Date()));
  const [hoveredEventType, setHoveredEventType] = useState<string | null>(null);
  const [pinnedEventType, setPinnedEventType] = useState<string | null>(null);
  const scheduleDateRange = useMemo(() => {
    let minTimestamp = data.metadata?.timestampRange?.start ?? null;
    let maxTimestamp = data.metadata?.timestampRange?.end ?? null;

    if (!Number.isFinite(minTimestamp ?? Number.NaN) || !Number.isFinite(maxTimestamp ?? Number.NaN)) {
      let computedMin = Number.POSITIVE_INFINITY;
      let computedMax = Number.NEGATIVE_INFINITY;

      Object.values(data.schedule).forEach((schedule) => {
        if (!schedule) {
          return;
        }

        Object.keys(schedule.major).forEach((timestamp) => {
          const parsedTimestamp = Number(timestamp);
          if (Number.isFinite(parsedTimestamp)) {
            computedMin = Math.min(computedMin, parsedTimestamp);
            computedMax = Math.max(computedMax, parsedTimestamp);
          }
        });

        Object.keys(schedule.minor).forEach((timestamp) => {
          const parsedTimestamp = Number(timestamp);
          if (Number.isFinite(parsedTimestamp)) {
            computedMin = Math.min(computedMin, parsedTimestamp);
            computedMax = Math.max(computedMax, parsedTimestamp);
          }
        });
      });

      minTimestamp = Number.isFinite(computedMin) ? computedMin : null;
      maxTimestamp = Number.isFinite(computedMax) ? computedMax + 3600 : null;
    }

    if (!Number.isFinite(minTimestamp ?? Number.NaN) || !Number.isFinite(maxTimestamp ?? Number.NaN)) {
      return { minDateMs: null, maxDateMs: null };
    }

    const minDate = getStartOfDay(new Date((minTimestamp as number) * 1000)).getTime();
    const maxEffectiveTimestamp = Math.max((maxTimestamp as number) - 1, minTimestamp as number);
    const maxDate = getStartOfDay(new Date(maxEffectiveTimestamp * 1000)).getTime();
    return { minDateMs: minDate, maxDateMs: maxDate };
  }, [data]);
  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, []);

  // Current local time information
  const now = currentTime;
  const currentLocalHour = now.getHours();
  const activeDate = clampDateToRange(
    selectedDate,
    scheduleDateRange.minDateMs,
    scheduleDateRange.maxDateMs
  );
  const isViewingToday = isSameDay(activeDate, now);

  // Format current time for display
  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  // Get timezone abbreviation
  const getTimezone = (): string => {
    const timezoneName = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const date = new Date();
    const shortTz = date.toLocaleTimeString(locale, { timeZoneName: 'short' }).split(' ').pop() || '';
    return `${timezoneName} (${shortTz})`;
  };
  const formatScheduleDate = (date: Date): string => {
    return date.toLocaleDateString(locale, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Get events for a specific map and hour (local hour)
  const getEventsForHour = (mapId: string, localHour: number): {
    major: { event: EventType; eventId: string } | null;
    minor: { event: EventType; eventId: string } | null;
  } => {
    const schedule = data.schedule[mapId];
    if (!schedule) return { major: null, minor: null };
    const localDateTime = new Date(activeDate);
    localDateTime.setHours(localHour, 0, 0, 0);
    const timestampKey = Math.floor(localDateTime.getTime() / 1000).toString();

    const majorEventId = schedule.major?.[timestampKey];
    const minorEventId = schedule.minor?.[timestampKey];

    let major = null;
    let minor = null;

    if (majorEventId) {
      const majorEvent = data.eventTypes[majorEventId];
      if (majorEvent) {
        major = { event: majorEvent, eventId: majorEventId };
      }
    }

    if (minorEventId) {
      const minorEvent = data.eventTypes[minorEventId];
      if (minorEvent) {
        minor = { event: minorEvent, eventId: minorEventId };
      }
    }

    return { major, minor };
  };

  // Convert icon URL to local path
  const getLocalIconPath = (iconUrl: string): string => {
    if (!iconUrl) return '';
    const filename = iconUrl.split('/').pop();
    return `/images/events/${filename}`;
  };

  // Get unique active event types for legend
  const getActiveEventTypes = (): Array<{ eventId: string; event: EventType }> => {
    const activeEvents = new Set<string>();
    
    mapIds.forEach(mapId => {
      const schedule = data.schedule[mapId];
      if (schedule) {
        Object.values(schedule.major || {}).forEach(eventId => activeEvents.add(eventId));
        Object.values(schedule.minor || {}).forEach(eventId => activeEvents.add(eventId));
      }
    });

    return Array.from(activeEvents)
      .map(eventId => ({ eventId, event: data.eventTypes[eventId] }))
      .filter(item => item.event)
      .sort((a, b) => {
        // Sort by category first (major then minor), then by name
        if (a.event.category !== b.event.category) {
          return a.event.category === 'major' ? -1 : 1;
        }
        return compareText(
          getLocalizedEventName(a.event, locale),
          getLocalizedEventName(b.event, locale)
        );
      });
  };

  const activeEventTypes = getActiveEventTypes();
  const eventsOnActiveDate = useMemo(() => {
    const availableEvents = new Set<string>();

    mapIds.forEach((mapId) => {
      const schedule = data.schedule[mapId];
      if (!schedule) {
        return;
      }

      HOURS.forEach((localHour) => {
        const localDateTime = new Date(activeDate);
        localDateTime.setHours(localHour, 0, 0, 0);
        const timestampKey = Math.floor(localDateTime.getTime() / 1000).toString();

        const majorEventId = schedule.major?.[timestampKey];
        const minorEventId = schedule.minor?.[timestampKey];

        if (majorEventId && data.eventTypes[majorEventId]) {
          availableEvents.add(majorEventId);
        }

        if (minorEventId && data.eventTypes[minorEventId]) {
          availableEvents.add(minorEventId);
        }
      });
    });

    return availableEvents;
  }, [activeDate, data.eventTypes, data.schedule, mapIds]);

  // Toggle event type pin/unpin
  const handleEventToggle = (eventId: string) => {
    if (pinnedEventType === eventId) {
      setPinnedEventType(null);
    } else {
      setPinnedEventType(eventId);
    }
  };

  // Determine active highlighting (pinned takes precedence over hover)
  const activeEventType = pinnedEventType || hoveredEventType;
  const canGoToPreviousDay =
    scheduleDateRange.minDateMs === null || activeDate.getTime() > scheduleDateRange.minDateMs;
  const canGoToNextDay =
    scheduleDateRange.maxDateMs === null || activeDate.getTime() < scheduleDateRange.maxDateMs;

  return (
    <div className="schedule-container">
      {/* Current time display and legend on same row */}
      <div className="header-row">
        <div className="header-left">
          <div className="current-time-display">
            <div className="time">{formatTime(now)}</div>
            <div className="timezone">{getTimezone()}</div>
          </div>
          <div className="date-switcher">
            <button
              type="button"
              className="date-switcher-button"
              disabled={!canGoToPreviousDay}
              onClick={() => setSelectedDate(addDays(activeDate, -1))}
              aria-label={t('schedule.previousDay')}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              className={`selected-date ${isViewingToday ? 'is-today' : ''}`}
              onClick={() => setSelectedDate(getStartOfDay(new Date()))}
              disabled={isViewingToday}
              title={t('schedule.goToToday')}
            >
              {formatScheduleDate(activeDate)}
            </button>
            <button
              type="button"
              className="date-switcher-button"
              disabled={!canGoToNextDay}
              onClick={() => setSelectedDate(addDays(activeDate, 1))}
              aria-label={t('schedule.nextDay')}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          {data.metadata?.generatedAt && (
            <div className="generated-at">
              {t('schedule.updated')}: {new Date(data.metadata.generatedAt).toLocaleString(locale, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              })}
            </div>
          )}
        </div>

        {/* Event Legend */}
        <div className="event-legend">
          <div className="legend-items">
            {activeEventTypes.map(({ eventId, event }) => {
              const isAvailableOnActiveDate = eventsOnActiveDate.has(eventId);
              const canInteract = isAvailableOnActiveDate || pinnedEventType === eventId;
              const localizedEventName = getLocalizedEventName(event, locale);

              return (
                <div
                  key={eventId}
                  className={`legend-item ${event.category} ${
                    activeEventType === eventId ? 'legend-highlighted' : ''
                  } ${pinnedEventType === eventId ? 'legend-pinned' : ''} ${
                    isAvailableOnActiveDate ? '' : 'legend-unavailable'
                  }`}
                  onMouseEnter={() => !pinnedEventType && canInteract && setHoveredEventType(eventId)}
                  onMouseLeave={() => setHoveredEventType(null)}
                  onClick={() => canInteract && handleEventToggle(eventId)}
                >
                  <div className="legend-icon-wrapper">
                    <img
                      src={getLocalIconPath(event.icon)}
                      alt={localizedEventName}
                      className="legend-icon"
                    />
                  </div>
                  <span className="legend-name">{localizedEventName}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Schedule grid with connected cells */}
      <div className="schedule-scroll">
        <div className="schedule-grid">
          {/* Hour labels header */}
          <div className="schedule-header">
            <div className="map-label-header">{t('schedule.mapHeader')}</div>
            <div className="hours-container">
              {HOURS.map((hour) => (
                <div key={hour} className={`hour-label ${isViewingToday && hour === currentLocalHour ? 'current-hour' : ''}`}>
                  {hour.toString().padStart(2, '0')}:00
                </div>
              ))}
            </div>
          </div>

          {/* Map rows */}
          {mapIds.map((mapId) => {
            const mapInfo = data.maps[mapId];
            const localizedMapName = getLocalizedMapName(mapId, mapInfo, locale);
            return (
              <div key={mapId} className="map-row">
                <div className="map-label" data-map={mapId}>
                  <span className="map-name-text">{localizedMapName}</span>
                </div>
                <div className="cells-container">
                  {HOURS.map((hour, index) => {
                    const events = getEventsForHour(mapId, hour);
                    const isMajorHighlighted = events.major && activeEventType === events.major.eventId;
                    const isMinorHighlighted = events.minor && activeEventType === events.minor.eventId;
                    const isCurrentHour = isViewingToday && hour === currentLocalHour;
                    const majorEventName = events.major
                      ? getLocalizedEventName(events.major.event, locale)
                      : '';
                    const minorEventName = events.minor
                      ? getLocalizedEventName(events.minor.event, locale)
                      : '';
                    
                    return (
                      <div
                        key={hour}
                        className={`hour-cell ${index < HOURS.length - 1 ? 'with-separator' : ''} ${isCurrentHour ? 'current-hour' : ''}`}
                      >
                        {/* Major event half (top) */}
                        <div
                          className={`cell-half major-half ${
                            events.major ? 'has-event' : 'no-event'
                          } ${isMajorHighlighted ? 'highlighted' : ''} ${
                            isCurrentHour ? 'current-hour' : ''
                          }`}
                          onMouseEnter={() => events.major && !pinnedEventType && setHoveredEventType(events.major.eventId)}
                          onMouseLeave={() => setHoveredEventType(null)}
                          onClick={() => events.major && handleEventToggle(events.major.eventId)}
                          title={majorEventName}
                        >
                          {events.major && (
                            <img
                              src={getLocalIconPath(events.major.event.icon)}
                              alt={majorEventName}
                              className="event-icon"
                            />
                          )}
                        </div>
                        
                        {/* Minor event half (bottom) */}
                        <div
                          className={`cell-half minor-half ${
                            events.minor ? 'has-event' : 'no-event'
                          } ${isMinorHighlighted ? 'highlighted' : ''} ${
                            isCurrentHour ? 'current-hour' : ''
                          }`}
                          onMouseEnter={() => events.minor && !pinnedEventType && setHoveredEventType(events.minor.eventId)}
                          onMouseLeave={() => setHoveredEventType(null)}
                          onClick={() => events.minor && handleEventToggle(events.minor.eventId)}
                          title={minorEventName}
                        >
                          {events.minor && (
                            <img
                              src={getLocalIconPath(events.minor.event.icon)}
                              alt={minorEventName}
                              className="event-icon"
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
