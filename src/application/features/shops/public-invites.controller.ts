import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { ShopsService } from './service';

/** The invite page before signing in: which shop, who invited, for which email and role. */
@ApiTags('shops')
@UseGuards(ThrottlerGuard)
@Controller('public/invites')
export class PublicInvitesController {
  constructor(private readonly shops: ShopsService) {}

  @Get(':token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Public details of a shop invite' })
  get(@Param('token') token: string) {
    return this.shops.publicInvite(token);
  }
}
