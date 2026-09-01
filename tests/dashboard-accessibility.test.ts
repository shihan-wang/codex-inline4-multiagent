import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENGINE_PARTS } from '../src/data/parts';
import { resolveGlobalDashboardShortcut } from '../src/ui/dashboard';

const dashboardSource = readFileSync(new URL('../src/ui/dashboard.ts', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const styleSource = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

describe('dashboard accessibility contracts', () => {
  it('offers a native keyboard selector backed by at least eight semantic parts', () => {
    expect(ENGINE_PARTS.size).toBeGreaterThanOrEqual(8);
    expect(dashboardSource).toContain("this.partSelect = element('select')");
    expect(dashboardSource).toContain('onSelectPart(partId: string | null): void');
  });

  it('keeps toggle-button state and named landmarks in the UI contract', () => {
    expect(dashboardSource).toContain("node.setAttribute('aria-pressed', String(isActive))");
    expect(dashboardSource).toContain("this.playButton.setAttribute('aria-pressed', String(value))");
    expect(dashboardSource).toContain("left.setAttribute('aria-labelledby', POWERTRAIN_TITLE_ID)");
    expect(dashboardSource).toContain("right.setAttribute('aria-labelledby', TELEMETRY_TITLE_ID)");
    expect(dashboardSource).toContain('right.tabIndex = 0');
  });

  it('names a valid viewport region and preserves strong focus indicators', () => {
    expect(mainSource).toContain("viewport.setAttribute('role', 'region')");
    expect(mainSource).toContain("viewport.setAttribute('aria-label', '柴油机三维视图')");
    expect(styleSource).toMatch(/:focus-visible\s*\{[^}]*outline:\s*3px solid/s);
    expect(styleSource).toContain(".toggle-row input:focus-visible + span + .toggle-visual");
  });

  it('resolves camera and reset shortcuts independently of the focused control', () => {
    const event = (code: string, modifiers = {}) => ({
      code,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      ...modifiers,
    });

    expect(['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6']
      .map((code) => resolveGlobalDashboardShortcut(event(code)))).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(resolveGlobalDashboardShortcut(event('Numpad4'))).toBe('4');
    expect(resolveGlobalDashboardShortcut(event('KeyR'))).toBe('reset');
    expect(resolveGlobalDashboardShortcut(event('KeyR', { ctrlKey: true }))).toBeNull();
    expect(resolveGlobalDashboardShortcut(event('KeyR', { metaKey: true }))).toBeNull();
    expect(resolveGlobalDashboardShortcut(event('Digit1', { altKey: true }))).toBeNull();

    const shortcutResolution = dashboardSource.indexOf('const shortcut = resolveGlobalDashboardShortcut(event)');
    const focusedControlGuard = dashboardSource.indexOf('event.target instanceof HTMLInputElement');
    expect(shortcutResolution).toBeGreaterThan(-1);
    expect(shortcutResolution).toBeLessThan(focusedControlGuard);
  });
});
