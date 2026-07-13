import { describe, expect, it } from 'vitest';
import { canManageItAssets, canViewItAssets } from '@/lib/access/it-asset-access';

describe('it-asset-access', () => {
  it('allows IT support officers to view assets', () => {
    expect(canViewItAssets(['it.view'])).toBe(true);
    expect(canViewItAssets(['view_it_assets'])).toBe(true);
    expect(canViewItAssets(['page.it-support.asset-management.view'])).toBe(true);
  });

  it('blocks users without IT asset permissions', () => {
    expect(canViewItAssets(['employees.view'])).toBe(false);
  });

  it('allows manage actions for it.create/edit', () => {
    expect(canManageItAssets(['it.create'])).toBe(true);
    expect(canManageItAssets(['it.assets.edit'])).toBe(true);
  });
});
