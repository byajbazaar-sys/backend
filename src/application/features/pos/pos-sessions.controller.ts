import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Identity, IIdentity, RolesGuard, USER_STRATEGY } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { PosSessionQrResponseModel, PosSessionResponseModel } from './models';
import { POS_SESSION_SERVICE, IPosSessionService } from './service';

@ApiTags('pos-sessions')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, AuthGuard(USER_STRATEGY), RolesGuard)
@Controller('pos/sessions')
export class PosSessionsController {
  constructor(@Inject(POS_SESSION_SERVICE) private readonly sessionService: IPosSessionService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new POS session with QR code for mobile pairing' })
  @HttpCode(HttpStatus.CREATED)
  async create(@Identity() identity: IIdentity): Promise<PosSessionQrResponseModel> {
    return this.sessionService.createSession(identity.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get POS session status' })
  @ApiParam({ name: 'id' })
  async getById(
    @Param('id') id: string,
    @Identity() identity: IIdentity,
  ): Promise<PosSessionResponseModel> {
    const session = await this.sessionService.getSession(id, identity.userId);
    return plainToInstance(PosSessionResponseModel, session, { excludeExtraneousValues: true });
  }

  @Get(':id/qr')
  @ApiOperation({ summary: 'Get QR code data for POS session pairing' })
  @ApiParam({ name: 'id' })
  async getQr(
    @Param('id') id: string,
    @Identity() identity: IIdentity,
  ): Promise<PosSessionQrResponseModel> {
    return this.sessionService.getQrData(id, identity.userId);
  }

  @Post(':id/close')
  @ApiOperation({ summary: 'Close POS session' })
  @HttpCode(HttpStatus.OK)
  async close(@Param('id') id: string, @Identity() identity: IIdentity): Promise<void> {
    await this.sessionService.closeSession(id, identity.userId);
  }
}
