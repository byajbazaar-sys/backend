import { Injectable } from '@nestjs/common';

import { ShopAccessService } from '../../../application';
import { IAiVoiceAccess } from '../../voice/ports/voice.ports';

/** The person's current role and module access in a shop — ByajBazaar's own shop access rules. */
@Injectable()
export class ByajBazaarVoiceAccessAdapter implements IAiVoiceAccess {
  constructor(private readonly shops: ShopAccessService) {}

  async accessFor(actorUserId: string, shopId: string) {
    const access = await this.shops.accessFor(actorUserId, shopId);
    return access
      ? { role: access.role, permissions: { ...access.permissions } as Record<string, string>, isOwner: access.isOwner }
      : null;
  }
}
