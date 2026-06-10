import { Controller, Get, HttpCode, HttpStatus, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { plainToInstance } from 'class-transformer';
import { PosSessionValidateResponseModel } from './models';
import { POS_SESSION_SERVICE, IPosSessionService } from './service';

/**
 * Public POS session validation for mobile scanner pairing (no user login required).
 */
@ApiTags('pos-sessions')
/** Dedicated path so this route is not captured by PosSessionsController GET :id */
@Controller('pos/sessions/validate')
@UseGuards(ThrottlerGuard)
export class PosSessionPublicController {
  constructor(@Inject(POS_SESSION_SERVICE) private readonly sessionService: IPosSessionService) {}

  @Get()
  @ApiOperation({ summary: 'Validate POS session token for mobile scanner access' })
  @ApiQuery({ name: 'sessionId', required: true })
  @ApiQuery({ name: 'token', required: true })
  @HttpCode(HttpStatus.OK)
  async validate(
    @Query('sessionId') sessionId: string,
    @Query('token') token: string,
  ): Promise<PosSessionValidateResponseModel> {
    const result = await this.sessionService.validateSessionForScanner(sessionId, token);
    return plainToInstance(PosSessionValidateResponseModel, result, { excludeExtraneousValues: true });
  }
}
