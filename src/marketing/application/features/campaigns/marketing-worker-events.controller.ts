import { Body, Controller, ForbiddenException, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';

import { MarketingWorkerEventModel } from './models';
import { MarketingRenderService } from '../kaggle';

/** HTTPS fallback for worker notebooks when the WebSocket is unavailable. Authorised by the per-job token. */
@ApiTags('marketing')
@UseGuards(ThrottlerGuard)
@Controller('public/marketing')
export class MarketingWorkerEventsController {
  constructor(private readonly render: MarketingRenderService) {}

  @Post('worker-events')
  @HttpCode(HttpStatus.NO_CONTENT)
  async workerEvent(@Body() body: MarketingWorkerEventModel): Promise<void> {
    if (!(await this.render.handleWorkerEvent(body))) throw new ForbiddenException('Invalid worker token');
  }
}
