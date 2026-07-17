import { Body, Controller, HttpCode, HttpStatus, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { IsString, IsUUID } from 'class-validator';
import { WEBSOCKET_HANDLER_SERVICE, IWebSocketHandlerService } from './service';

class PosSessionLeaveBody {
  @IsUUID()
  sessionId: string;

  @IsString()
  token: string;
}

/**
 * Public endpoint for mobile scanner to leave a POS session (tab close / done scanning).
 */
@ApiTags('pos-sessions')
@Controller('pos/sessions')
@UseGuards(ThrottlerGuard)
export class PosSessionLeaveController {
  constructor(
    @Inject(WEBSOCKET_HANDLER_SERVICE) private readonly wsHandler: IWebSocketHandlerService,
  ) {}

  @Post('leave')
  @ApiOperation({ summary: 'Mobile scanner leaves POS session (notifies desktop)' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async leave(@Body() body: PosSessionLeaveBody): Promise<void> {
    await this.wsHandler.handleLeaveSessionByToken(body.sessionId, body.token);
  }
}
