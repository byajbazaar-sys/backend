import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { EUserType, Roles, RolesGuard, UserAuthGuard } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import {
  CreateJewelleryEventRequestModel,
  JewelleryEventResponseModel,
  JewelleryEventsPagedResponseModel,
  ListJewelleryEventsQueryModel,
  UpdateJewelleryEventRequestModel,
} from './models';
import { IJewelleryEventService, JEWELLERY_EVENT_SERVICE } from './service/i-jewellery-event.service';

@ApiTags('events')
@Controller('events')
export class AdminEventsController {
  constructor(
    @InjectPinoLogger(AdminEventsController.name) private readonly logger: PinoLogger,
    @Inject(JEWELLERY_EVENT_SERVICE) private readonly eventsService: IJewelleryEventService,
  ) {}

  @Get('admin/list')
  @ApiBearerAuth('user')
  @UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
  @Roles(EUserType.Admin)
  @ApiOperation({ summary: 'Admin list jewellery events' })
  @ApiOkResponse({ type: JewelleryEventsPagedResponseModel })
  async listAdmin(@Query() query: ListJewelleryEventsQueryModel): Promise<JewelleryEventsPagedResponseModel> {
    const paged = await this.eventsService.listAdmin(query);
    return plainToInstance(
      JewelleryEventsPagedResponseModel,
      {
        ...paged,
        items: paged.items.map((item) =>
          plainToInstance(JewelleryEventResponseModel, item, { excludeExtraneousValues: true }),
        ),
      },
      { excludeExtraneousValues: true },
    );
  }

  @Post('admin')
  @ApiBearerAuth('user')
  @UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
  @Roles(EUserType.Admin)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Admin create jewellery event' })
  @ApiOkResponse({ type: JewelleryEventResponseModel })
  async create(@Body() body: CreateJewelleryEventRequestModel): Promise<JewelleryEventResponseModel> {
    const created = await this.eventsService.create(body);
    return plainToInstance(JewelleryEventResponseModel, created, { excludeExtraneousValues: true });
  }

  @Put('admin/:id')
  @ApiBearerAuth('user')
  @UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
  @Roles(EUserType.Admin)
  @ApiOperation({ summary: 'Admin update jewellery event' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ type: JewelleryEventResponseModel })
  async update(
    @Param('id') id: string,
    @Body() body: UpdateJewelleryEventRequestModel,
  ): Promise<JewelleryEventResponseModel> {
    const updated = await this.eventsService.update(id, body);
    return plainToInstance(JewelleryEventResponseModel, updated, { excludeExtraneousValues: true });
  }

  @Delete('admin/:id')
  @ApiBearerAuth('user')
  @UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
  @Roles(EUserType.Admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Admin delete jewellery event' })
  @ApiParam({ name: 'id' })
  async delete(@Param('id') id: string): Promise<void> {
    await this.eventsService.delete(id);
  }
}
