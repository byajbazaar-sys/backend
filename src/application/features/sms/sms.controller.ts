import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';

@ApiTags('SMS')
@Controller('sms')
@UseGuards(ThrottlerGuard)
export class SmsController {
  @Post('webhook/sms-received')
  @ApiOperation({
    summary: 'Webhook to receive SMS without auto-reply',
    description: 'Process incoming SMS and handle business logic without sending automatic reply',
  })
  async handleIncomingSMSNoReply(@Body() webhookPayload: any) {
    console.log(webhookPayload);
    return 'SMS received successfully';
  }
}
