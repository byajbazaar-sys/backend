import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { Identity, IIdentity, RolesGuard, UserAuthGuard } from '@shared-libs';

import {
  AcceptShopInviteRequestModel,
  CreateShopInviteRequestModel,
  CreateShopRequestModel,
  UpdateShopMemberRequestModel,
} from './models';
import { ShopsService } from './service';

const actor = (identity: IIdentity) => identity.actorUserId ?? identity.userId;

/** Shops a person can work in, their members and invitations. Always acts as the signed-in person. */
@ApiTags('shops')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Controller('shops')
export class ShopsController {
  constructor(private readonly shops: ShopsService) {}

  @Get()
  @ApiOperation({ summary: 'Shops the signed-in person can work in (own, added, invited)' })
  list(@Identity() identity: IIdentity) {
    return this.shops.listShops(actor(identity));
  }

  @Post()
  @ApiOperation({ summary: 'Add another shop (its own data; covered by the owner’s plan)' })
  create(@Identity() identity: IIdentity, @Body() body: CreateShopRequestModel) {
    return this.shops.createShop(actor(identity), body);
  }

  @Post('invites/accept')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Accept an invite (the signed-in email must be the invited one)' })
  accept(@Identity() identity: IIdentity, @Body() body: AcceptShopInviteRequestModel) {
    return this.shops.acceptInvite(actor(identity), body.token);
  }

  @Get(':shopId/members')
  members(@Identity() identity: IIdentity, @Param('shopId', new ParseUUIDPipe()) shopId: string) {
    return this.shops.listMembers(actor(identity), shopId);
  }

  @Patch(':shopId/members/:memberId')
  updateMember(
    @Identity() identity: IIdentity,
    @Param('shopId', new ParseUUIDPipe()) shopId: string,
    @Param('memberId', new ParseUUIDPipe()) memberId: string,
    @Body() body: UpdateShopMemberRequestModel,
  ) {
    return this.shops.updateMember(actor(identity), shopId, memberId, body);
  }

  @Delete(':shopId/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Identity() identity: IIdentity,
    @Param('shopId', new ParseUUIDPipe()) shopId: string,
    @Param('memberId', new ParseUUIDPipe()) memberId: string,
  ): Promise<void> {
    await this.shops.removeMember(actor(identity), shopId, memberId);
  }

  @Get(':shopId/invites')
  invites(@Identity() identity: IIdentity, @Param('shopId', new ParseUUIDPipe()) shopId: string) {
    return this.shops.listInvites(actor(identity), shopId);
  }

  @Post(':shopId/invites')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Invite someone by email; returns the invite link too (to share on WhatsApp)' })
  invite(
    @Identity() identity: IIdentity,
    @Param('shopId', new ParseUUIDPipe()) shopId: string,
    @Body() body: CreateShopInviteRequestModel,
  ) {
    return this.shops.createInvite(actor(identity), shopId, body);
  }

  @Post(':shopId/invites/:inviteId/resend')
  @HttpCode(HttpStatus.OK)
  resend(
    @Identity() identity: IIdentity,
    @Param('shopId', new ParseUUIDPipe()) shopId: string,
    @Param('inviteId', new ParseUUIDPipe()) inviteId: string,
  ) {
    return this.shops.resendInvite(actor(identity), shopId, inviteId);
  }

  @Delete(':shopId/invites/:inviteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @Identity() identity: IIdentity,
    @Param('shopId', new ParseUUIDPipe()) shopId: string,
    @Param('inviteId', new ParseUUIDPipe()) inviteId: string,
  ): Promise<void> {
    await this.shops.revokeInvite(actor(identity), shopId, inviteId);
  }
}
