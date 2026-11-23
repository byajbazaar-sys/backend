import { Body, Controller, Delete, HttpCode, HttpStatus, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Identity, IIdentity, RolesGuard, UserAuthGuard } from '@shared-libs';

import { RegisterPushDeviceRequestModel, RemovePushDeviceRequestModel } from './models';
import { IPushDevicesRepository, PUSH_DEVICES_REPOSITORY } from './service';

/** The mobile app registers its push token after login (and removes it on logout). */
@ApiTags('notifications')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Controller('notifications/push-devices')
export class PushDevicesController {
  constructor(@Inject(PUSH_DEVICES_REPOSITORY) private readonly devices: IPushDevicesRepository) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Register this phone for push notifications (Expo push token)' })
  async register(@Identity() identity: IIdentity, @Body() body: RegisterPushDeviceRequestModel): Promise<void> {
    await this.devices.upsert(identity.userId, body.token, body.platform ?? null);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Stop push notifications on this phone' })
  async remove(@Identity() identity: IIdentity, @Body() body: RemovePushDeviceRequestModel): Promise<void> {
    await this.devices.remove(identity.userId, body.token);
  }
}
