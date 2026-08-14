import { UseGuards, Controller, Post, HttpStatus, HttpCode, Body, Inject, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags, ApiOperation, ApiOkResponse, ApiParam } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { UserAuthGuard, RolesGuard, Identity, IIdentity } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import {
  SendEmailRequestModel,
  NotificationResponseModel,
  ListNotificationsQueryModel,
  GetNotificationParamsModel,
  NotificationsPagedResponseModel,
} from './models';
import { NotificationsFilterOptions } from './options';
import { INotificationService, NOTIFICATION_SERVICE } from './service';

@ApiTags('notifications')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    @InjectPinoLogger(NotificationsController.name) private readonly logger: PinoLogger,
    @Inject(NOTIFICATION_SERVICE) private readonly notificationService: INotificationService,
  ) {}

  @Post('email')
  @ApiOperation({ summary: 'Send an email and store notification record' })
  @ApiResponse({ status: HttpStatus.CREATED, type: NotificationResponseModel })
  @HttpCode(HttpStatus.CREATED)
  async sendEmail(
    @Body() body: SendEmailRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<NotificationResponseModel> {
    this.logger.info({ body, identity }, 'sendEmail called');
    const notification = await this.notificationService.sendEmail(body, identity.userId);
    return plainToInstance(NotificationResponseModel, notification, {
      excludeExtraneousValues: true,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List sent notifications with pagination' })
  @ApiOkResponse({ type: NotificationsPagedResponseModel })
  @HttpCode(HttpStatus.OK)
  async listNotifications(
    @Query() query: ListNotificationsQueryModel,
    @Identity() identity: IIdentity,
  ): Promise<NotificationsPagedResponseModel> {
    this.logger.info({ query }, 'listNotifications called');
    const filterOptions = plainToInstance(NotificationsFilterOptions, query, {
      excludeExtraneousValues: true,
    });
    filterOptions.createdBy = identity.userId;
    return plainToInstance(
      NotificationsPagedResponseModel,
      await this.notificationService.listNotifications(filterOptions),
      { excludeExtraneousValues: true },
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get notification by ID' })
  @ApiParam({ name: 'id', description: 'Notification ID', example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327' })
  @ApiOkResponse({ type: NotificationResponseModel })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Notification not found' })
  @HttpCode(HttpStatus.OK)
  async getById(
    @Param() params: GetNotificationParamsModel,
    @Identity() identity: IIdentity,
  ): Promise<NotificationResponseModel> {
    this.logger.info({ params, identity }, 'getById called');
    const notification = await this.notificationService.getById(params.id, identity.userId);
    return plainToInstance(NotificationResponseModel, notification, {
      excludeExtraneousValues: true,
    });
  }
}
