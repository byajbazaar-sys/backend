/**
 * Who is talking to the assistant, resolved on the server from the authenticated request (UserAuthGuard +
 * X-Shop-Id). The model never supplies any of this: tools read the shop and the person from here only.
 */
export interface AiActor {
  /** The shop being worked in (users.id) — all business data is keyed by it. */
  shopId: string;
  /** The signed-in person. Equals shopId in their own shop. */
  actorUserId: string;
  /** owner, manager, staff, viewer, whatsapp, custom. */
  shopRole: string;
  /** Access per module in this shop ('none' | 'view' | 'edit'); null when unknown (treated as no access). */
  permissions: Record<string, string> | null;
  /** web | mobile | api — for the activity log. */
  channel?: string;
}

export type AiAccessLevel = 'view' | 'edit';

const RANK: Record<string, number> = { none: 0, view: 1, edit: 2 };

/**
 * Same rule as the API's per-request shop check (reads need view, changes need edit), applied per tool: the chat
 * endpoint is open to every member, so each tool checks the module it touches. Unknown permissions deny.
 */
export function actorCan(actor: AiActor, module: string, level: AiAccessLevel): boolean {
  if (actor.shopRole === 'owner' && !actor.permissions) return true;
  const have = actor.permissions?.[module];
  return (RANK[have ?? 'none'] ?? 0) >= RANK[level];
}
