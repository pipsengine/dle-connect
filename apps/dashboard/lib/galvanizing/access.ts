import { hasAnyPermission, hasUnrestrictedAccess } from '@/lib/auth/permission-match';

export type GalvanizingActor = {
  permissions: string[];
  isGlobalAdmin?: boolean;
  roles?: string[];
  name: string;
};

const allow = (actor: Pick<GalvanizingActor, 'permissions' | 'isGlobalAdmin'>, keys: string[]) =>
  hasUnrestrictedAccess(actor.permissions, actor.isGlobalAdmin) || hasAnyPermission(actor.permissions, keys);

export const canViewGalvanizing = (actor: Pick<GalvanizingActor, 'permissions' | 'isGlobalAdmin' | 'roles'>) =>
  allow(actor, [
    'operations.galvanizing.view',
    'operations.view',
    'operations.dashboard.view',
    'operations.production.view',
    'quality.view',
    'quality.*',
    'inventory.view',
    'inventory.*',
    'ncr.view',
  ]);

export const canGalvanizingIntake = (actor: GalvanizingActor) =>
  allow(actor, ['operations.galvanizing.intake', 'operations.timesheets.submit']);

export const canGalvanizingQc = (actor: GalvanizingActor) =>
  allow(actor, [
    'operations.galvanizing.qc',
    'quality.view',
    'quality.create',
    'quality.edit',
    'quality.approve',
    'quality.*',
    'ncr.view',
    'ncr.approve',
    'ncr.*',
  ]);

export const canGalvanizingRelease = (actor: GalvanizingActor) =>
  allow(actor, ['operations.galvanizing.release'])
  || (actor.roles || []).includes('GM Operations');

export const canGalvanizingProduction = (actor: GalvanizingActor) =>
  allow(actor, ['operations.galvanizing.production']);

export const canGalvanizingDispatch = (actor: GalvanizingActor) =>
  allow(actor, ['operations.galvanizing.dispatch', 'inventory.create', 'inventory.edit', 'inventory.*']);

export const canGalvanizingInventory = (actor: GalvanizingActor) =>
  allow(actor, ['operations.galvanizing.inventory', 'inventory.create', 'inventory.edit', 'inventory.*']);

export const canGalvanizingScrap = (actor: GalvanizingActor) =>
  allow(actor, ['operations.galvanizing.scrap', 'quality.approve', 'ncr.approve', 'ncr.*']);

export const galvanizingCapabilities = (actor: GalvanizingActor) => ({
  view: canViewGalvanizing(actor),
  intake: canGalvanizingIntake(actor),
  qc: canGalvanizingQc(actor),
  release: canGalvanizingRelease(actor),
  production: canGalvanizingProduction(actor),
  dispatch: canGalvanizingDispatch(actor),
  inventory: canGalvanizingInventory(actor),
  scrap: canGalvanizingScrap(actor),
});
