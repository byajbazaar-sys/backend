import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { MarketingQueueMessageModel } from './models';
import { IMarketingQueue, MARKETING_QUEUE } from '../../shared';
import { MarketingQueueConsumer } from '../queue';

/** QStash deliveries (marketing job queue). Authorised by the Upstash-Signature header. */
@ApiTags('marketing')
@Controller('marketing/queue')
export class MarketingQueueController {
  constructor(
    private readonly consumer: MarketingQueueConsumer,
    @Inject(MARKETING_QUEUE) private readonly queue: IMarketingQueue,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async deliver(
    @Req() req: Request & { rawBody?: Buffer },
    @Body() body: MarketingQueueMessageModel,
  ): Promise<{ ok: true }> {
    const raw = req.rawBody?.toString('utf8') ?? JSON.stringify(body ?? {});
    if (!(await this.queue.verify(req.header('upstash-signature'), raw))) {
      throw new UnauthorizedException('Invalid queue signature');
    }
    await this.consumer.deliver(body);
    return { ok: true };
  }
}
