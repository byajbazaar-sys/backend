/**
 * One plan per owner: the owner's main shop, the extra shops they add and every invited member run on it. Members
 * never need a plan of their own to work in someone else's shop, and when the owner renews everyone is back in.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SubscriptionAccessChecker } from '../../src/application/features/payments/guards/subscription-access.checker';
import { isPaywallExemptPath } from '../../src/application/features/payments/utils/payments.constants';

const DAY = 86_400_000;
const past = new Date(Date.now() - 30 * DAY);
const future = new Date(Date.now() + 5 * DAY);

interface World {
  users: Record<string, { id: string; userType: string; ownerUserId?: string; trialEndsAt: Date }>;
  subs: Record<string, { id: string; userId: string; status: string; currentEnd: Date | null } | null>;
}

function world(): World {
  return {
    users: {
      owner: { id: 'owner', userType: 'user', trialEndsAt: past },
      extra: { id: 'extra', userType: 'user', ownerUserId: 'owner', trialEndsAt: future },
      member: { id: 'member', userType: 'user', trialEndsAt: past },
    },
    subs: { owner: { id: 's1', userId: 'owner', status: 'active', currentEnd: new Date(Date.now() + 10 * DAY) } },
  };
}

function checker(w: World): SubscriptionAccessChecker {
  const usersRepo = { findById: async (id: string) => w.users[id] ?? null };
  const subsRepo = {
    findLatestByUserId: async (id: string) => w.subs[id] ?? null,
    findActiveByUserId: async (id: string) => (w.subs[id]?.status === 'active' ? w.subs[id] : null),
  };
  return new SubscriptionAccessChecker(usersRepo as never, subsRepo as never);
}

const ctx = (url: string) => ({ switchToHttp: () => ({ getRequest: () => ({ originalUrl: url }) }) }) as never;

/** null = allowed; otherwise the 402 body. */
async function check(w: World, userId: string, actorUserId: string, url = '/api/v1/customers') {
  try {
    await checker(w).assertAccess({ userId, actorUserId, userType: 'user' } as never, ctx(url));
    return null;
  } catch (err) {
    const e = err as { getStatus(): number; getResponse(): { code: string; managedByOwner: boolean; message: string } };
    assert.equal(e.getStatus(), 402);
    return e.getResponse();
  }
}

describe('paywall: the owner pays for everyone', () => {
  it('lets members and extra shops use the owner’s active plan (member’s own trial long over)', async () => {
    const w = world();
    assert.equal(await check(w, 'owner', 'owner'), null);
    assert.equal(await check(w, 'extra', 'owner'), null);
    assert.equal(await check(w, 'owner', 'member'), null);
    assert.equal(await check(w, 'extra', 'member'), null);
  });

  it('uses the owner’s trial for extra shops, not the extra shop’s own', async () => {
    const w = world();
    w.subs.owner = null; // owner never paid, trial over; the extra shop's own trialEndsAt is in the future
    assert.notEqual(await check(w, 'extra', 'owner'), null);
  });

  it('runs members on the owner’s trial too', async () => {
    const w = world();
    w.subs.owner = null;
    w.users.owner.trialEndsAt = future;
    assert.equal(await check(w, 'owner', 'member'), null);
  });

  it('keeps a member’s own unused shop on its own trial', async () => {
    const res = await check(world(), 'member', 'member');
    assert.equal(res?.managedByOwner, false);
    assert.equal(res?.code, 'SUBSCRIPTION_REQUIRED');
  });

  it('tells members to ask the owner (not to pay) when the owner’s plan ends', async () => {
    const w = world();
    w.subs.owner = { id: 's1', userId: 'owner', status: 'cancelled', currentEnd: new Date(Date.now() - DAY) };
    const member = await check(w, 'owner', 'member');
    assert.equal(member?.managedByOwner, true);
    assert.match(member!.message, /owner/i);
    const inExtra = await check(w, 'extra', 'member');
    assert.equal(inExtra?.managedByOwner, true);
    const owner = await check(w, 'owner', 'owner');
    assert.equal(owner?.managedByOwner, false);
    assert.match(owner!.message, /plan has ended/i);
    // The owner working in their extra shop pays themselves.
    assert.equal((await check(w, 'extra', 'owner'))?.managedByOwner, false);
  });

  it('gives everyone access back as soon as the owner renews', async () => {
    const w = world();
    w.subs.owner = { id: 's1', userId: 'owner', status: 'cancelled', currentEnd: new Date(Date.now() - DAY) };
    assert.notEqual(await check(w, 'owner', 'member'), null);
    w.subs.owner = { id: 's2', userId: 'owner', status: 'active', currentEnd: new Date(Date.now() + 30 * DAY) };
    assert.equal(await check(w, 'owner', 'member'), null);
    assert.equal(await check(w, 'extra', 'member'), null);
  });

  it('does not cache a refusal (renewal works on the very next request)', async () => {
    const w = world();
    w.subs.owner = null;
    const c = checker(w);
    const id = { userId: 'owner', actorUserId: 'member', userType: 'user' } as never;
    await assert.rejects(c.assertAccess(id, ctx('/api/v1/customers')));
    w.subs.owner = { id: 's2', userId: 'owner', status: 'active', currentEnd: null };
    await c.assertAccess(id, ctx('/api/v1/customers'));
  });

  it('keeps a cancelled plan working until its paid period ends', async () => {
    const w = world();
    w.subs.owner = { id: 's1', userId: 'owner', status: 'cancelled', currentEnd: future };
    assert.equal(await check(w, 'owner', 'member'), null);
  });

  it('never blocks the shop list, invites or team screens (a member’s own trial may be over)', async () => {
    const w = world();
    for (const url of ['/api/v1/shops', '/api/v1/shops/invites/accept', '/api/v1/shops/x/members']) {
      assert.equal(await check(w, 'member', 'member', url), null, url);
    }
  });
});

describe('isPaywallExemptPath', () => {
  it('exempts sign-in, paying, the shop list and the account', () => {
    for (const p of [
      '/api/v1/auth/login',
      '/api/v1/payments/subscription/create',
      '/api/v1/shops',
      '/api/v1/shops/abc/invites',
      '/api/v1/users/abc',
      '/api/v1/public/invites/tok',
      '/api/v1/pos/sessions/validate',
      '/prod/api/v1/shops',
    ]) {
      assert.equal(isPaywallExemptPath(p), true, p);
    }
  });

  it('only matches at the start of the API path (a path parameter cannot skip the paywall)', () => {
    for (const p of [
      '/api/v1/customers',
      '/api/v1/customers/auth',
      '/api/v1/inventory/items/payments',
      '/api/v1/loans/users/x',
      '/api/v1/inventory/catalog/shops',
      '/api/v1/shopsx',
      '/api/v1/customers?next=/auth/',
      '/api/v1/pos/sessions',
    ]) {
      assert.equal(isPaywallExemptPath(p), false, p);
    }
  });
});
