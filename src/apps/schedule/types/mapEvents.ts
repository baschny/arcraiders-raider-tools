export interface EventType {
  displayName: string;
  icon: string;
  translationKey: string;
  category: 'major' | 'minor' | 'none';
  disabled?: boolean;
}

export interface MapInfo {
  displayName: string;
}

export interface EventSchedule {
  major: Record<string, string>;
  minor: Record<string, string>;
}

export interface MapEventsData {
  eventTypes: Record<string, EventType>;
  maps: Record<string, MapInfo>;
  schedule: Record<string, EventSchedule>;
}
