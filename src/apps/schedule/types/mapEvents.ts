export interface EventType {
  displayName: string;
  icon: string;
  translationKey: string;
  category: 'major' | 'minor' | 'none';
  localizations?: Record<string, string>;
  disabled?: boolean;
}

export interface MapInfo {
  displayName: string;
}

export interface EventSchedule {
  major: Record<string, string>;
  minor: Record<string, string>;
}
export interface ScheduleMetadata {
  generatedAt: string;
  sourceFiles: {
    scenarios: string;
    mapEvents: string;
    maps: string;
    localizations: string;
  };
  timestampRange: {
    start: number | null;
    end: number | null;
  };
  ignoredConditionIds: string[];
}

export interface MapEventsData {
  eventTypes: Record<string, EventType>;
  maps: Record<string, MapInfo>;
  schedule: Record<string, EventSchedule>;
  metadata?: ScheduleMetadata;
}
