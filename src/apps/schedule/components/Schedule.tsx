import { useState, useEffect } from 'react';
import type { MapEventsData, EventType } from '../types/mapEvents';

interface ScheduleProps {
  data: MapEventsData;
}

export function Schedule({ data }: ScheduleProps) {
  const mapIds = Object.keys(data.maps);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [hoveredEventType, setHoveredEventType] = useState<string | null>(null);
  const [pinnedEventType, setPinnedEventType] = useState<string | null>(null);

  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, []);

  // Get current local hour and calculate starting hour (previous hour)
  const now = currentTime;
  const currentLocalHour = now.getHours();
  const startHour = (currentLocalHour - 1 + 24) % 24;

  // Generate array of 24 hours starting from previous hour
  const hours = Array.from({ length: 24 }, (_, i) => (startHour + i) % 24);

  // Format current time for display
  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  // Get timezone abbreviation
  const getTimezone = (): string => {
    const timezoneName = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const date = new Date();
    const shortTz = date.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop() || '';
    return `${timezoneName} (${shortTz})`;
  };

  // Convert local hour to UTC hour for data lookup
  const localToUtcHour = (localHour: number): number => {
    const tempDate = new Date();
    tempDate.setHours(localHour, 0, 0, 0);
    return tempDate.getUTCHours();
  };

  // Get events for a specific map and hour (local hour)
  const getEventsForHour = (mapId: string, localHour: number): {
    major: { event: EventType; eventId: string } | null;
    minor: { event: EventType; eventId: string } | null;
  } => {
    const schedule = data.schedule[mapId];
    if (!schedule) return { major: null, minor: null };

    // Convert local hour to UTC for data lookup
    const utcHour = localToUtcHour(localHour);
    const hourStr = utcHour.toString();
    
    // Check both major and minor events
    const majorEventId = schedule.major?.[hourStr];
    const minorEventId = schedule.minor?.[hourStr];

    let major = null;
    let minor = null;

    if (majorEventId) {
      const majorEvent = data.eventTypes[majorEventId];
      if (majorEvent && !majorEvent.disabled) {
        major = { event: majorEvent, eventId: majorEventId };
      }
    }

    if (minorEventId) {
      const minorEvent = data.eventTypes[minorEventId];
      if (minorEvent && !minorEvent.disabled) {
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
      .filter(item => item.event && !item.event.disabled)
      .sort((a, b) => {
        // Sort by category first (major then minor), then by name
        if (a.event.category !== b.event.category) {
          return a.event.category === 'major' ? -1 : 1;
        }
        return a.event.displayName.localeCompare(b.event.displayName);
      });
  };

  const activeEventTypes = getActiveEventTypes();

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

  return (
    <div className="schedule-container">
      {/* Current time display and legend on same row */}
      <div className="header-row">
        <div className="current-time-display">
          <div className="time">{formatTime(now)}</div>
          <div className="timezone">{getTimezone()}</div>
        </div>

        {/* Event Legend */}
        <div className="event-legend">
          <div className="legend-items">
            {activeEventTypes.map(({ eventId, event }) => (
              <div
                key={eventId}
                className={`legend-item ${event.category} ${
                  activeEventType === eventId ? 'legend-highlighted' : ''
                } ${pinnedEventType === eventId ? 'legend-pinned' : ''}`}
                onMouseEnter={() => !pinnedEventType && setHoveredEventType(eventId)}
                onMouseLeave={() => setHoveredEventType(null)}
                onClick={() => handleEventToggle(eventId)}
              >
                <div className="legend-icon-wrapper">
                  <img
                    src={getLocalIconPath(event.icon)}
                    alt={event.displayName}
                    className="legend-icon"
                  />
                </div>
                <span className="legend-name">{event.displayName}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Schedule grid with connected cells */}
      <div className="schedule-scroll">
        <div className="schedule-grid">
          {/* Hour labels header */}
          <div className="schedule-header">
            <div className="map-label-header">Map</div>
            <div className="hours-container">
              {hours.map((hour) => (
                <div key={hour} className="hour-label">
                  {hour.toString().padStart(2, '0')}:00
                </div>
              ))}
            </div>
          </div>

          {/* Map rows */}
          {mapIds.map((mapId) => {
            const mapInfo = data.maps[mapId];
            return (
              <div key={mapId} className="map-row">
                <div className="map-label" data-map={mapId}>
                  <span className="map-name-text">{mapInfo.displayName}</span>
                </div>
                <div className="cells-container">
                  {hours.map((hour, index) => {
                    const events = getEventsForHour(mapId, hour);
                    const isMajorHighlighted = events.major && activeEventType === events.major.eventId;
                    const isMinorHighlighted = events.minor && activeEventType === events.minor.eventId;
                    const isCurrentHour = hour === currentLocalHour;
                    
                    return (
                      <div
                        key={hour}
                        className={`hour-cell ${index < hours.length - 1 ? 'with-separator' : ''}`}
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
                          title={events.major ? events.major.event.displayName : ''}
                        >
                          {events.major && (
                            <img
                              src={getLocalIconPath(events.major.event.icon)}
                              alt={events.major.event.displayName}
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
                          title={events.minor ? events.minor.event.displayName : ''}
                        >
                          {events.minor && (
                            <img
                              src={getLocalIconPath(events.minor.event.icon)}
                              alt={events.minor.event.displayName}
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
