import { describe, expect, it } from 'vitest';
import { dashboardKeyboardShortcuts, navGroups } from './navigation';

describe('Local AI navigation', () => {
  it('exposes the page in infrastructure navigation and keyboard shortcuts', () => {
    const infrastructure = navGroups.find((group) => group.label === 'Infrastructure');

    expect(infrastructure?.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Local AI', href: '/local-ai' })])
    );
    expect(dashboardKeyboardShortcuts).toEqual(
      expect.arrayContaining([expect.objectContaining({ href: '/local-ai' })])
    );
  });
});
