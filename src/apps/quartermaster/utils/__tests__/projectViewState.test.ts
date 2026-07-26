import { describe, expect, it } from 'vitest';
import {
  normalizeCollapsedProjectIds,
  setProjectCollapsed,
  setVisibleProjectsCollapsed,
} from '../projectViewState';

describe('projectViewState', () => {
  it('normalizes malformed values to unique project IDs', () => {
    expect(normalizeCollapsedProjectIds(null)).toEqual([]);
    expect(normalizeCollapsedProjectIds({ project: true })).toEqual([]);
    expect(normalizeCollapsedProjectIds([
      'alpha',
      'alpha',
      '',
      42,
      'bravo',
    ])).toEqual(['alpha', 'bravo']);
  });

  it('adds and removes individual collapsed projects', () => {
    expect(setProjectCollapsed(['alpha'], 'bravo', true)).toEqual(['alpha', 'bravo']);
    expect(setProjectCollapsed(['alpha', 'bravo'], 'alpha', false)).toEqual(['bravo']);
  });

  it('updates visible projects while preserving non-visible IDs', () => {
    expect(setVisibleProjectsCollapsed(
      ['not-visible', 'alpha'],
      ['alpha', 'bravo'],
      true,
    )).toEqual(['not-visible', 'alpha', 'bravo']);

    expect(setVisibleProjectsCollapsed(
      ['not-visible', 'alpha', 'bravo'],
      ['alpha', 'bravo'],
      false,
    )).toEqual(['not-visible']);
  });
});
