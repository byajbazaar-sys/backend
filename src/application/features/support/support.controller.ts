import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards, Inject } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { plainToInstance } from 'class-transformer';
import { CreateSupportRequestModel, SupportRequestResponseModel } from './models';
import { ISupportService, SUPPORT_SERVICE } from './service';
import { SupportRequest } from './domain';

/**
 * Public endpoint for the in-app Contact Support form (no auth).
 * Rate-limited via ThrottlerGuard.
 */
@ApiTags('support')
@Controller('support')
@UseGuards(ThrottlerGuard)
export class SupportController {
  constructor(
    @InjectPinoLogger(SupportController.name) private readonly logger: PinoLogger,
    @Inject(SUPPORT_SERVICE) private readonly supportService: ISupportService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Submit a support / contact request' })
  @ApiResponse({ status: HttpStatus.CREATED, type: SupportRequestResponseModel })
  @HttpCode(HttpStatus.CREATED)
  async submit(@Body() body: CreateSupportRequestModel): Promise<SupportRequestResponseModel> {
    this.logger.info({ email: body.email }, 'support submit called');
    const payload = plainToInstance(SupportRequest, body, { excludeExtraneousValues: true });
    const created = await this.supportService.submitRequest(payload);
    return plainToInstance(SupportRequestResponseModel, created, { excludeExtraneousValues: true });
  }
}
