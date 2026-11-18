import { Body, Controller, ForbiddenException, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';

import { MarketingWorkerEventModel, WorkerSessionPollRequestModel, WorkerSessionPollResponseModel } from './models';
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

  /** Warm Kaggle worker sessions pull their next job here (every ~10 s while idle). */
  @Post('worker/next')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  @ApiOkResponse({ type: WorkerSessionPollResponseModel })
  async nextJob(@Body() body: WorkerSessionPollRequestModel): Promise<WorkerSessionPollResponseModel> {
    const answer = await this.render.nextForSession(body);
    if (!answer) throw new ForbiddenException('Invalid worker session');
    return answer;
  }
}
