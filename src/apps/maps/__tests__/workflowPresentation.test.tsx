import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { GuidePanel, guideActionTooltip, guideDestination } from '../GuidePanel';
import type { Explorer } from '../model';
import type { MapData, PuzzleGuide } from '../data/types';
import { guidePins, guideTrails, visibleSteps, visibleGroups, stepTargets, targetCoordinates, groupColor, toggleStep, guideEntranceVisible, eligibleEntrances, selectEntrance, resolveSelection } from '../data/puzzles';
import { DEFAULT_PREFS } from '../state';
import { TINY_MAP, TINY_INDEX } from '../data/__tests__/fixtures/tinyMap';
import blue from '../../../../public/data/map-data/maps/TheBlueGate_01.json';
import tides from '../../../../public/data/map-data/maps/RivenTides_01.json';
import { makeText } from '../text';
import en from '../../../shared/i18n/locales/en.json';
vi.mock('../text', async (original) => {
  const actual = await original<typeof import('../text')>();
  const t = (key: string) => key.split('.').reduce<unknown>((value, part) => value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined, en) as string ?? key;
  return { ...actual, useMapText: () => actual.makeText(t, (key: string, args: Record<string, string | number>) => t(key).replace(/\{([^}]+)\}/g, (_, name: string) => String(args[name])), String, 'en') };
});
const gate = blue.puzzleGuides.find((g) => g.id === 'locked-gate') as unknown as PuzzleGuide;
const refuge = blue.puzzleGuides.find((g) => g.id === 'refuge') as unknown as PuzzleGuide;
const riven = tides.puzzleGuides[0] as unknown as PuzzleGuide;
const cond = { ...TINY_MAP.conditions[0], name: 'Locked Gate' };
const selection = (g: PuzzleGuide, entranceId = g.entrances[0].id) => ({ guideId: g.id, entranceId, layoutId: null });
const mapOf = (g: PuzzleGuide): MapData => ({ ...TINY_MAP, puzzleSchemaVersion: 2, puzzleGuides: [g] });
const exOf = (g: PuzzleGuide) => ({ map: mapOf(g), cond, index: TINY_INDEX, prefs: { ...DEFAULT_PREFS, puzzleDoors: true } }) as Explorer;
describe('generated semantic workflow presentation', () => {
  it('uses three linked code steps and four canonical branches without repeated action paragraphs', () => {
    const pins = guidePins(mapOf(gate), cond, true, selection(gate));
    expect(pins.filter((p) => p.action.type === 'print')).toHaveLength(8);
    expect(pins.filter((p) => p.action.type === 'insert-code')).toHaveLength(4);
    expect(pins.filter((p) => p.action.type === 'carry')).toHaveLength(0);
    expect(new Set(pins.filter((p) => p.action.type === 'print').map((p) => p.color)).size).toBe(4);
    for (const group of gate.presentation!.groups) {
      const branch = pins.filter((pin) => pin.groupId === group.id);
      expect(branch).toHaveLength(3);
      expect(new Set(branch.map((pin) => pin.color))).toEqual(new Set([groupColor(group.number)]));
      expect(new Set(branch.map((pin) => pin.stepNumber))).toEqual(new Set([1, 2]));
    }
    const html = renderToStaticMarkup(<GuidePanel ex={exOf(gate)} selection={selection(gate)} onSelection={() => {}} />);
    expect(html).toContain('Print all 4 security codes.');
    expect(html).not.toContain('Guide incomplete'); expect(html).not.toContain('still needs verification');
    expect((html.match(/Print all/g) ?? []).length).toBe(1);
    expect(html).toContain('Ancient Fort Security Code');
    expect(visibleSteps(gate, cond, null).map((s) => s.number)).toEqual([1, 2, 3]);
  });
  it('step buttons toggle their pins independently without navigation links or changing group colours', () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = document.createElement('div'), root = createRoot(container), focus = vi.fn();
    let current: import('../data/puzzles').GuideSelection = selection(gate);
    const panel = () => act(() => root.render(<GuidePanel ex={exOf(gate)} selection={current} onSelection={(next) => { current = next!; }} onFocus={focus} />));
    const pins = () => guidePins(mapOf(gate), cond, true, current);
    panel();
    expect(container.textContent).not.toContain('Show locations on map');
    expect(container.querySelectorAll('.mx-guide__step-toggle[aria-pressed="true"]')).toHaveLength(3);
    const colours = pins().filter((pin) => pin.action.type === 'print').map((pin) => pin.color);
    const clickStep = (n: number) => { act(() => container.querySelectorAll<HTMLButtonElement>('.mx-guide__step-toggle')[n - 1].click()); panel(); };
    clickStep(2);
    expect(pins()).toHaveLength(4); expect(pins().every((pin) => pin.action.type === 'insert-code')).toBe(true);
    expect(container.querySelectorAll('.mx-guide__step-toggle[aria-pressed="true"]')).toHaveLength(1);
    expect(focus).not.toHaveBeenCalled();
    clickStep(1); expect(pins()).toHaveLength(12);
    clickStep(2); expect(pins()).toHaveLength(8); expect(pins().map((pin) => pin.color)).toEqual(colours);
    clickStep(1); expect(pins()).toHaveLength(0);
    clickStep(2); expect(pins()).toHaveLength(4);
    clickStep(3); clickStep(1); // All enabled again: the next click isolates instead of hiding.
    expect(container.querySelectorAll('.mx-guide__step-toggle[aria-pressed="true"]')).toHaveLength(3);
    clickStep(1); expect(pins()).toHaveLength(8);
    expect(container.querySelectorAll('.mx-guide__step-toggle[aria-pressed="true"]')).toHaveLength(1);
    act(() => root.unmount()); vi.unstubAllGlobals();
  });
  it('step hover/focus highlights only its visible pins and clears on leave, blur or disable', () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = document.createElement('div'), root = createRoot(container), highlight = vi.fn();
    let current: import('../data/puzzles').GuideSelection = selection(gate);
    const panel = () => act(() => root.render(<GuidePanel ex={exOf(gate)} selection={current} onSelection={(next) => { current = next!; }} onHighlight={highlight} />));
    panel();
    const button = () => container.querySelectorAll<HTMLButtonElement>('.mx-guide__step-toggle')[0];
    act(() => button().dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
    const locations = guidePins(mapOf(gate), cond, true, current).filter((pin) => pin.action.type === 'print').map((pin) => pin.location.id);
    expect(highlight).toHaveBeenLastCalledWith(expect.objectContaining({ locationIds: locations, entranceIds: [] }));
    act(() => button().dispatchEvent(new MouseEvent('mouseout', { bubbles: true })));
    expect(highlight).toHaveBeenLastCalledWith(null);
    act(() => button().dispatchEvent(new FocusEvent('focusin', { bubbles: true })));
    expect(highlight).toHaveBeenLastCalledWith(expect.objectContaining({ locationIds: locations }));
    act(() => button().dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(highlight).toHaveBeenLastCalledWith(null);
    act(() => button().click()); panel(); // isolate first
    act(() => button().click()); panel(); // hide the only active step
    act(() => button().dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
    expect(highlight).toHaveBeenLastCalledWith(null);
    expect(guidePins(mapOf(gate), cond, true, current)).toHaveLength(0);
    act(() => root.unmount()); vi.unstubAllGlobals();
  });
  it('hiding outputs keeps the guide open, preserves other guides and resets on close/reopen', () => {
    let current = toggleStep(selection(gate), gate, 'print');
    current = toggleStep(current, gate, 'open');
    current = toggleStep(current, gate, 'open');
    expect(gate.entrances.every((entrance) => !guideEntranceVisible(gate, entrance.id, current))).toBe(true);
    expect(guideEntranceVisible(refuge, refuge.entrances[0].id, current)).toBe(true);
    expect(resolveSelection(mapOf(gate), cond, true, current)).toBe(current);
    expect(guidePins(mapOf(gate), cond, true, current)).toHaveLength(8);
    const entrance = eligibleEntrances(mapOf(gate), cond)[0];
    expect(selectEntrance(current, entrance)).toBeNull();
    const reopened = selectEntrance(null, entrance)!;
    expect(reopened.disabledStepIds).toBeUndefined();
    expect(guideEntranceVisible(gate, entrance.entrance.id, reopened)).toBe(true);
  });
  it('shared button pins survive either instruction selection while Riven phases toggle independently', () => {
    let current = toggleStep(selection(refuge), refuge, 'find');
    expect(current.disabledStepIds).toEqual(['open', 'press']);
    expect(guidePins(mapOf(refuge), cond, true, current)).toHaveLength(24);
    current = toggleStep(current, refuge, 'press');
    current = toggleStep(current, refuge, 'find');
    expect(guidePins(mapOf(refuge), cond, true, current)).toHaveLength(24);
    current = toggleStep(current, refuge, 'press');
    expect(guidePins(mapOf(refuge), cond, true, current)).toHaveLength(0);
    const fuelOnly = toggleStep(selection(riven), riven, 'fuel');
    expect(guidePins(mapOf(riven), cond, true, fuelOnly)).toHaveLength(22);
    const buttonsOnly = toggleStep(toggleStep(fuelOnly, riven, 'fuel'), riven, 'buttons');
    const pins = guidePins(mapOf(riven), cond, true, buttonsOnly);
    expect(pins).toHaveLength(20); expect(pins.every((pin) => pin.action.type === 'press')).toBe(true);
    expect(visibleSteps(riven, cond, null)).toHaveLength(4);
    const sameGuideOtherDoor = selectEntrance(buttonsOnly, { guide: riven, entrance: riven.entrances[1] })!;
    expect(sameGuideOtherDoor.disabledStepIds).toEqual(buttonsOnly.disabledStepIds);
    expect(resolveSelection(mapOf(riven), cond, false, sameGuideOtherDoor)).toBeNull();
  });
  it('nests Riven groups under 1a and 2a with independent door outcomes 1b and 2b', () => {
    const html = renderToStaticMarkup(<GuidePanel ex={exOf(riven)} selection={selection(riven)} onSelection={() => {}} />);
    const element = document.createElement('div'); element.innerHTML = html;
    const rows = [...element.querySelectorAll('.mx-guide__steps > li')];
    expect(rows.map((row) => row.querySelector('.mx-guide__step-number')!.textContent)).toEqual(['1a', '1b', '2a', '2b']);
    expect(rows[0].querySelectorAll('.mx-guide__group-button')).toHaveLength(4);
    expect(rows[1].querySelectorAll('.mx-guide__group-button')).toHaveLength(0);
    expect(rows[2].querySelector('.mx-guide__group-button')!.textContent).toContain('Fuel-cell locations');
    expect(element.querySelectorAll('a')).toHaveLength(0);
    expect(html).not.toContain('This prerequisite'); expect(html).not.toContain('before or after');
    const doorOnly = toggleStep(selection(riven), riven, 'button-room');
    expect(guidePins(mapOf(riven), cond, true, doorOnly)).toHaveLength(0);
    expect(riven.entrances.filter((entrance) => guideEntranceVisible(riven, entrance.id, doorOnly))).toHaveLength(2);
    expect(riven.presentation!.steps.find((step) => step.id === 'button-room')!.actionIds).toEqual([]);
    expect(guidePins(mapOf(riven), cond, true, selection(riven)).filter((pin) => pin.action.type === 'collect-fuel-cell').every((pin) => pin.stepLabel === '2a')).toBe(true);
  });
  it('uses the actual containing Gate Control Room name rather than inventing an area', () => {
    const ex = { ...exOf(gate), map: blue as unknown as MapData };
    const step = gate.presentation!.steps.find((s) => s.role === 'deliver-codes')!;
    expect(guideDestination(ex, gate, step.actionIds)).toBe('Gate Control Room');
    expect(guideDestination(exOf(gate), gate, step.actionIds)).toBeNull();
  });
  it('keeps all 24 Refuge alternatives in distinct pools without claiming per-pool selection or activation order', () => {
    const pins = guidePins(mapOf(refuge), cond, true, selection(refuge));
    expect(pins).toHaveLength(24); expect(new Set(pins.map((p) => p.color)).size).toBe(4);
    expect(pins.every((p) => p.order === null)).toBe(true); expect(guideTrails(pins)).toEqual([]);
    expect(visibleGroups(refuge, cond, null).map((g) => g.locationIds.length)).toEqual([5, 7, 7, 5]);
    const html = renderToStaticMarkup(<GuidePanel ex={exOf(refuge)} selection={selection(refuge)} onSelection={() => {}} />);
    expect(html).toContain('Find 4 active buttons'); expect(html).toContain('in any order'); expect(html).not.toContain('One from each');
  });
  it('printer tooltips identify the code and its two alternatives without selection diagnostics', () => {
    const t = (key: string) => key.split('.').reduce<unknown>((v, k) => v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined, en) as string ?? key;
    const tx = makeText(t, (key, args) => t(key).replace(/\{([^}]+)\}/g, (_, name: string) => String(args[name])), String, 'en');
    const pin = guidePins(mapOf(gate), cond, true, selection(gate)).find((p) => p.action.type === 'print')!;
    const content = guideActionTooltip(exOf(gate), gate, pin, tx);
    expect(content.title).toBe('Security code printer');
    expect(content.body).toContain(pin.action.itemName);
    expect(content.body).toContain('One of 2 possible printer locations.');
    expect(content.body.join(' ')).not.toContain('unresolved');
  });
  it('retains full Riven prerequisites and all candidates from either door stage', () => {
    for (const entrance of riven.entrances) {
      const pins = guidePins(mapOf(riven), cond, true, selection(riven, entrance.id));
      expect(pins.filter((p) => p.action.type === 'press')).toHaveLength(20);
      expect(pins.filter((p) => p.action.type === 'collect-fuel-cell')).toHaveLength(21);
      expect(new Set(pins.filter((p) => p.action.type === 'press').map((p) => p.color)).size).toBe(4);
      expect(pins.filter((p) => p.action.type === 'press').every((p) => p.order === null && p.stepNumber === 1)).toBe(true);
      const html = renderToStaticMarkup(<GuidePanel ex={exOf(riven)} selection={selection(riven, entrance.id)} onSelection={() => {}} />);
      expect(html).toContain('Find and press 4 buttons'); expect(html).not.toContain('before or after opening the room');
      expect(html).toContain('aria-current="step"');
      const fuelPins = pins.filter((pin) => ['collect-fuel-cell', 'insert-fuel-cell'].includes(pin.action.type));
      expect(fuelPins).toHaveLength(22);
      expect(new Set(fuelPins.map((pin) => pin.color)).size).toBe(1);
      const element = document.createElement('div'); element.innerHTML = html;
      expect([...element.querySelectorAll('.mx-guide__steps > li')].every((step) => !step.getAttribute('style')?.includes('--c'))).toBe(true);
    }
  });
  it('keyboard focus and clicking a group pass exact verified locations and POIs to map navigation', () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = document.createElement('div'), root = createRoot(container), focus = vi.fn(), highlight = vi.fn();
    act(() => root.render(<GuidePanel ex={exOf(gate)} selection={selection(gate)} onSelection={() => {}} onFocus={focus} onHighlight={highlight} />));
    const button = container.querySelector<HTMLButtonElement>('.mx-guide__group-legend button')!;
    act(() => button.dispatchEvent(new FocusEvent('focusin', { bubbles: true })));
    expect(highlight).toHaveBeenLastCalledWith(expect.objectContaining({ locationIds: expect.any(Array) }));
    act(() => button.click());
    const targets = focus.mock.lastCall![0];
    expect(targetCoordinates(gate, cond, selection(gate), targets)).toHaveLength(3);
    expect(targets.poiIds.length).toBeGreaterThan(0);
    act(() => button.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(highlight).toHaveBeenLastCalledWith(null);
    act(() => root.unmount()); vi.unstubAllGlobals();
  });
  it('semantic links cannot bypass action, location or stage gates and outcomes add no actions', () => {
    const g = structuredClone(gate);
    g.actions.filter((a) => a.type === 'print').forEach((a) => a.conditions = { only: ['Night Raid'] });
    const steps = visibleSteps(g, cond, null), print = steps.find((s) => s.role === 'print-codes')!;
    expect(stepTargets(g, cond, selection(g), print).locationIds).toEqual([]);
    expect(visibleGroups(g, cond, null).flatMap((g) => g.locationIds)).toHaveLength(4);
    expect(steps.find((s) => s.role === 'outcome')!.actionIds).toEqual([]);
    expect(guidePins(mapOf(g), cond, false, selection(g))).toEqual([]);
    const hidden = { ...cond, name: 'Normal' };
    expect(visibleSteps(g, hidden, null)).toEqual([]);
  });
});
