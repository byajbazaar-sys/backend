/**
 * Shop roles → what a member may call. These rules decide what invited members can do in someone else's shop, so
 * they are tested against every route the API actually has (read from the controllers), not a hand-made list.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  ASSIGNABLE_ROLES,
  ROLE_PRESETS,
  SHOP_MODULES,
  accessRuleFor,
  apiPath,
  effectivePermissions,
  isActorScoped,
  sanitizePermissions,
} from '../../src/application/features/shops/domain/shop-permissions';

const SRC = join(__dirname, '..', '..', 'src');

function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return controllerFiles(path);
    return name.endsWith('.controller.ts') ? [path] : [];
  });
}

/** [method, "prefix/route"] for every handler, path params replaced by a uuid. */
function allRoutes(): [string, string][] {
  const routes: [string, string][] = [];
  for (const file of controllerFiles(SRC)) {
    const source = readFileSync(file, 'utf8');
    const prefix = /@Controller\(\s*'([^']*)'/.exec(source)?.[1] ?? '';
    for (const m of source.matchAll(/@(Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)')?/g)) {
      const path = `${prefix}/${m[2] ?? ''}`.replace(/\/+$/, '').replace(/^\/+/, '');
      routes.push([m[1].toUpperCase(), path.replace(/:[^/]+/g, '00000000-0000-4000-8000-000000000000')]);
    }
  }
  return routes;
}

describe('shop route classification', () => {
  const routes = allRoutes();

  it('finds the controllers', () => {
    assert.ok(routes.length > 100, `only ${routes.length} routes found — did the controller layout change?`);
  });

  it('classifies every route (a new feature must be added to MODULE_BY_PREFIX or the shared/personal lists)', () => {
    const unclassified = routes.filter(([m, p]) => !isActorScoped(p) && accessRuleFor(p, m).kind === 'denied');
    assert.deepEqual(
      unclassified,
      [],
      'These routes are refused for every invited member. Map them in shop-permissions.ts (MODULE_BY_PREFIX, ' +
        'SHARED_PREFIXES, ACTOR_SCOPED_PREFIXES …).',
    );
  });

  it('keeps the shop list, invites and personal plan out of the shop context', () => {
    for (const p of [
      'shops',
      'shops/invites/accept',
      'auth/login',
      'payments/subscription/create',
      'users/me/verification',
    ]) {
      assert.equal(isActorScoped(p), true, p);
    }
    // …but the plan status is the shop's (members see the owner's plan).
    assert.equal(isActorScoped('payments/subscription/status'), false);
    assert.deepEqual(accessRuleFor('payments/subscription/status', 'GET'), { kind: 'always' });
  });

  it('reads need view, changes need edit', () => {
    assert.deepEqual(accessRuleFor('customers', 'GET'), { kind: 'module', module: 'customers', need: 'view' });
    assert.deepEqual(accessRuleFor('customers/1', 'PATCH'), { kind: 'module', module: 'customers', need: 'edit' });
    assert.deepEqual(accessRuleFor('inventory/reports/x', 'GET'), { kind: 'module', module: 'reports', need: 'view' });
  });

  it('keeps shop configuration inside day-to-day areas behind settings', () => {
    assert.deepEqual(accessRuleFor('whatsapp/disconnect', 'POST'), {
      kind: 'module',
      module: 'settings',
      need: 'edit',
    });
    assert.deepEqual(accessRuleFor('whatsapp/templates', 'GET'), { kind: 'module', module: 'whatsapp', need: 'view' });
  });

  it('makes deleting the shop and managing API keys owner-only', () => {
    assert.equal(accessRuleFor('users/abc', 'DELETE').kind, 'ownerOnly');
    for (const [m, p] of [
      ['POST', 'settings/api/generate'],
      ['PATCH', 'settings/api/status'],
      ['DELETE', 'settings/api'],
    ]) {
      assert.equal(accessRuleFor(p, m).kind, 'ownerOnly', `${m} ${p}`);
    }
    assert.deepEqual(accessRuleFor('settings/api', 'GET'), { kind: 'module', module: 'settings', need: 'view' });
  });
});

describe('apiPath', () => {
  it('strips the global prefix and query', () => {
    assert.equal(apiPath('/api/v1/customers/1?x=1'), 'customers/1');
    assert.equal(apiPath('api/v1/shops'), 'shops');
  });

  it('strips a stage / base path in front of the prefix', () => {
    assert.equal(apiPath('/prod/api/v1/customers'), 'customers');
    assert.equal(apiPath('/a/b/api/v2/shops/x'), 'shops/x');
  });

  it('only strips the first prefix', () => {
    assert.equal(apiPath('/api/v1/customers/api/v1/shops'), 'customers/api/v1/shops');
  });
});

describe('effectivePermissions', () => {
  it('gives owners everything', () => {
    assert.deepEqual(effectivePermissions('owner', { customers: 'none' }), ROLE_PRESETS.owner);
  });

  it('applies overrides on top of the preset', () => {
    assert.equal(effectivePermissions('viewer', { customers: 'edit' }).customers, 'edit');
    assert.equal(effectivePermissions('viewer', {}).customers, 'view');
  });

  it('never lets anyone but a superuser manage the team, whatever the overrides say', () => {
    for (const role of ASSIGNABLE_ROLES) {
      const p = effectivePermissions(role, { team: 'edit' });
      assert.equal(p.team, role === 'manager' ? 'edit' : 'none', role);
    }
  });

  it('starts custom from staff', () => {
    assert.deepEqual(effectivePermissions('custom', {}), { ...ROLE_PRESETS.staff, team: 'none' });
  });

  it('returns a full map for every role', () => {
    for (const role of ASSIGNABLE_ROLES) {
      assert.deepEqual(Object.keys(effectivePermissions(role)).sort(), [...SHOP_MODULES].sort(), role);
    }
  });
});

describe('sanitizePermissions', () => {
  it('drops unknown modules and levels', () => {
    assert.deepEqual(sanitizePermissions({ customers: 'edit', hacker: 'edit', loans: 'admin', team: 'view' }), {
      customers: 'edit',
      team: 'view',
    });
    assert.deepEqual(sanitizePermissions(null), {});
    assert.deepEqual(sanitizePermissions('edit'), {});
  });
});
