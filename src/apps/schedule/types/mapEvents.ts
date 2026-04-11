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
  localizations?: Record<string, string>;
}

export interface EventSchedule {
  major: Record<string, string>;
  minor: Record<string, string>;
}
export interface ScheduleMetadata {
  generatedAt: string;
  sourceFiles?: Record<string, string>;
  timestampRange?: {
    start: number | null;
    end: number | null;
  };
  mergedPastEvents?: {
    windowSeconds: number;
    now: number;
    count: number;
  };
  ignoredConditionIds?: string[];
  ignoredMapNames?: string[];
  ignoredEntriesCount?: number;
}

export interface MapEventsData {
  eventTypes: Record<string, EventType>;
  maps: Record<string, MapInfo>;
  schedule: Record<string, EventSchedule>;
  metadata?: ScheduleMetadata;
}

export interface ScheduleLocalizationsData {
  maps?: Record<string, { localizations?: Record<string, string> }>;
  eventTypes?: Record<string, { localizations?: Record<string, string> }>;
}

export interface MapLocalizationsData {
  maps?: Record<string, { localizations?: Record<string, string> }>;
}

export interface MapEventLocalizationsData {
  eventTypes?: Record<string, { localizations?: Record<string, string> }>;
}
