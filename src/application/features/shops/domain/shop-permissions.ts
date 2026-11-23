/**
 * Shop roles and permissions. A shop is a ByajBazaar business account (its own customers, loans, inventory,
 * catalog, WhatsApp …). People get into a shop as its owner or as invited members with a role; a role is a preset of
 * module access levels that the owner can then adjust per member.
 */

export const SHOP_MODULES = [
  'customers',
  'loans',
  'inventory',
  'billing',
  'catalog',
  'marketing',
  'whatsapp',
  'reports',
  'settings',
  'team',
] as const;
export type ShopModule = (typeof SHOP_MODULES)[number];

export const ACCESS_LEVELS = ['none', 'view', 'edit'] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export type ShopPermissions = Record<ShopModule, AccessLevel>;

export const SHOP_ROLES = ['owner', 'manager', 'staff', 'viewer', 'whatsapp', 'custom'] as const;
export type ShopRole = (typeof SHOP_ROLES)[number];
/** Roles that can be given to an invited member (one owner per shop). */
export const ASSIGNABLE_ROLES = ['manager', 'staff', 'viewer', 'whatsapp', 'custom'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

const all = (level: AccessLevel): ShopPermissions =>
  Object.fromEntries(SHOP_MODULES.map((m) => [m, level])) as ShopPermissions;

/** Preset access per role. `custom` starts from staff and is then edited. */
export const ROLE_PRESETS: Record<Exclude<ShopRole, 'custom'>, ShopPermissions> = {
  owner: all('edit'),
  /** "Superuser": everything, including inviting and managing members — not the owner, billing or deleting the shop. */
  manager: all('edit'),
  staff: {
    customers: 'edit',
    loans: 'edit',
    inventory: 'edit',
    billing: 'edit',
    catalog: 'view',
    marketing: 'view',
    whatsapp: 'edit',
    reports: 'view',
    settings: 'none',
    team: 'none',
  },
  viewer: { ...all('view'), team: 'none' },
  whatsapp: { ...all('none'), whatsapp: 'edit', customers: 'view' },
};

const LEVEL_RANK: Record<AccessLevel, number> = { none: 0, view: 1, edit: 2 };

export const isAccessLevel = (value: unknown): value is AccessLevel =>
  typeof value === 'string' && (ACCESS_LEVELS as readonly string[]).includes(value);

/** A member's effective access: the role preset, with per-module overrides (custom / adjusted members). */
export function effectivePermissions(role: ShopRole, overrides?: Partial<ShopPermissions> | null): ShopPermissions {
  if (role === 'owner') return ROLE_PRESETS.owner;
  const base = role === 'custom' ? ROLE_PRESETS.staff : ROLE_PRESETS[role];
  const result = { ...base };
  for (const module of SHOP_MODULES) {
    const level = overrides?.[module];
    if (isAccessLevel(level)) result[module] = level;
  }
  // Only owners / managers handle the team (it lets you grant yourself more access).
  if (role !== 'manager') result.team = 'none';
  return result;
}

/** Cleans a client-sent permission map (unknown modules / levels dropped). */
export function sanitizePermissions(input: unknown): Partial<ShopPermissions> {
  if (!input || typeof input !== 'object') return {};
  const out: Partial<ShopPermissions> = {};
  for (const module of SHOP_MODULES) {
    const level = (input as Record<string, unknown>)[module];
    if (isAccessLevel(level)) out[module] = level;
  }
  return out;
}

export const allows = (permissions: ShopPermissions, module: ShopModule, need: AccessLevel): boolean =>
  LEVEL_RANK[permissions[module]] >= LEVEL_RANK[need];

/**
 * API areas (path after /api/v1/, longest prefix first) → the module that guards them. Reads (GET / HEAD) need
 * `view`, everything else `edit`.
 */
const MODULE_BY_PREFIX: [string, ShopModule][] = [
  ['inventory/reports', 'reports'],
  ['inventory/catalog', 'catalog'],
  ['inventory', 'inventory'],
  ['label-designer', 'inventory'],
  ['customers', 'customers'],
  ['loans', 'loans'],
  ['transactions', 'loans'],
  ['deposits', 'loans'],
  ['bills', 'billing'],
  ['pos', 'billing'],
  ['orders', 'billing'],
  ['marketing', 'marketing'],
  ['try-on', 'marketing'],
  ['whatsapp', 'whatsapp'],
  ['inbox', 'whatsapp'],
  ['settings', 'settings'],
  ['users', 'settings'],
];

/* Anything not listed (events, …) is shared: every member reads; anyone who can edit something may change it. */

/**
 * Shop configuration inside a day-to-day area: changing it needs `settings` edit (a WhatsApp-only member sends
 * messages but must not disconnect the shop's WhatsApp). Reads stay with the area (templates are read to send them).
 */
const SETTINGS_WRITE_PREFIXES = [
  'whatsapp/connect',
  'whatsapp/disconnect',
  'whatsapp/settings',
  'whatsapp/onboarding-session',
  'whatsapp/mobile-return-session',
  'whatsapp/provision-templates',
  'whatsapp/register-phone',
  'whatsapp/templates',
  'inbox/settings',
];

/** POST endpoints that only read (or mark read): `view` is enough. */
const READ_ONLY_POSTS = [/^inbox\/conversations\/[^/]+\/read$/, /^customers\/face-search$/];

/**
 * Shop data used by several areas: readable by every member; changing it needs edit on one of these.
 * Metal rates drive loans and billing; `items` is the item-type list picked when making a loan (not stock).
 */
const ANY_OF_WRITES: [string, ShopModule[]][] = [
  ['metal-rates', ['loans', 'billing']],
  ['items', ['loans', 'inventory']],
];

const PERSONAL_PREFIXES = ['notifications', 'support'];

/** Known shop-neutral routes: reads are allowed for members; changes use the shared edit rule. */
const SHARED_PREFIXES = ['events'];

/**
 * Personal (the signed-in person, not the shop): login, the shop list / invites, the person's own plan, phone
 * verification, devices, and platform admin.
 */
export const ACTOR_SCOPED_PREFIXES = [
  'auth',
  'shops',
  'invites',
  'payments',
  'users/me/verification',
  'notifications/push-devices',
  'admin',
  'logs/admin',
  'marketing/admin',
  'public',
  'webhooks',
];

const matches = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/** The API path without the global prefix and query: "customers/123". */
export function apiPath(originalUrl: string): string {
  const path = (originalUrl.split('?')[0] ?? '').replace(/^\/+/, '');
  return path.replace(/^api\/v\d+\//, '');
}

/** Inside personal areas, but about the shop being worked in (its plan decides whether the app opens). */
const SHOP_SCOPED_EXCEPTIONS = ['payments/subscription/status'];

export const isActorScoped = (path: string) =>
  !SHOP_SCOPED_EXCEPTIONS.includes(path) && ACTOR_SCOPED_PREFIXES.some((p) => matches(path, p));

export type AccessRule =
  | { kind: 'module'; module: ShopModule; need: AccessLevel }
  | { kind: 'anyOf'; modules: ShopModule[]; need: AccessLevel }
  | { kind: 'shared'; need: AccessLevel }
  | { kind: 'denied' }
  | { kind: 'always' };

export const isReadMethod = (method: string) => method === 'GET' || method === 'HEAD' || method === 'OPTIONS';

/** Which permission a request needs. */
export function accessRuleFor(path: string, method: string): AccessRule {
  const read = isReadMethod(method) || READ_ONLY_POSTS.some((re) => re.test(path));
  const need: AccessLevel = read ? 'view' : 'edit';
  // The shop's own profile is read by every screen (name, logo, address on invoices): GET users/:id (the
  // controller only serves the shop's own id).
  if (matches(path, 'users') && isReadMethod(method)) return { kind: 'always' };
  // Marking notifications read / asking support: fine for every member, read-only ones included.
  if (PERSONAL_PREFIXES.some((p) => matches(path, p))) return { kind: 'always' };
  if (SHOP_SCOPED_EXCEPTIONS.includes(path)) return { kind: 'always' };
  if (!read && SETTINGS_WRITE_PREFIXES.some((p) => matches(path, p))) {
    return { kind: 'module', module: 'settings', need: 'edit' };
  }
  for (const [prefix, modules] of ANY_OF_WRITES) {
    if (matches(path, prefix)) return read ? { kind: 'shared', need: 'view' } : { kind: 'anyOf', modules, need };
  }
  for (const [prefix, module] of MODULE_BY_PREFIX) if (matches(path, prefix)) return { kind: 'module', module, need };
  if (SHARED_PREFIXES.some((prefix) => matches(path, prefix))) {
    return { kind: 'shared', need };
  }
  // Default deny unknown shop-scoped routes instead of silently allowing a new endpoint.
  return { kind: 'denied' };
}
