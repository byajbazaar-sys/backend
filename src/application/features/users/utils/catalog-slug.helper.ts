import { ConflictException } from '@nestjs/common';
import {
  buildCatalogSlug,
  CATALOG_SLUG_TAKEN_MESSAGE,
  isValidCatalogSlug,
} from '@shared-libs';

import { IUsersRepository } from '../service/i-users.repository';

/** Resolve catalog slug from business name; rejects duplicates without auto-suffixing. */
export async function resolveCatalogSlugForBusinessName(
  usersRepo: IUsersRepository,
  businessName?: string | null,
  excludeUserId?: string,
): Promise<string | null> {
  const slug = buildCatalogSlug(businessName);
  if (!slug || !isValidCatalogSlug(slug)) return null;

  const taken = await usersRepo.existsCatalogSlug(slug, excludeUserId);
  if (taken) {
    throw new ConflictException(CATALOG_SLUG_TAKEN_MESSAGE);
  }
  return slug;
}

export function isCatalogSlugUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code;
  const constraint = String((err as { constraint?: string }).constraint ?? '').toLowerCase();
  return code === '23505' && constraint.includes('catalog_slug');
}
