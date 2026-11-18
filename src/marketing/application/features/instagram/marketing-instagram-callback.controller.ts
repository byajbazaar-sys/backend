import { Controller, Get, HttpStatus, Query, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Response } from 'express';

import { MarketingInstagramService } from './service';
import { MarketingConfig } from '../../../marketing.config';

@ApiTags('marketing')
@UseGuards(ThrottlerGuard)
@Controller('public/marketing/instagram')
export class MarketingInstagramCallbackController {
  constructor(
    private readonly instagram: MarketingInstagramService,
    private readonly config: MarketingConfig,
  ) {}

  @Get('callback')
  @ApiOperation({ summary: 'Instagram Business Login callback; validates and consumes one-time OAuth state' })
  async callback(
    @Query('state') state: string | undefined,
    @Query('code') code: string | undefined,
    @Query('error') error: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const outcome = await this.instagram.finishConnection(state, code, error);
    if (this.config.instagram.returnUrl) {
      const returnUrl = new URL(this.config.instagram.returnUrl);
      returnUrl.searchParams.set('instagram_connection', outcome);
      response.redirect(HttpStatus.FOUND, returnUrl.toString());
      return;
    }
    response.status(HttpStatus.OK).json({ status: outcome });
  }
}
