import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { plainToInstance } from 'class-transformer';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
  JewelleryEventDetailResponseModel,
  JewelleryEventResponseModel,
  JewelleryEventsPagedResponseModel,
  ListJewelleryEventsQueryModel,
} from './models';
import { IJewelleryEventService, JEWELLERY_EVENT_SERVICE } from './service/i-jewellery-event.service';

@ApiTags('events')
@UseGuards(ThrottlerGuard)
@Controller('events')
export class EventsController {
  constructor(
    @InjectPinoLogger(EventsController.name) private readonly logger: PinoLogger,
    @Inject(JEWELLERY_EVENT_SERVICE) private readonly eventsService: IJewelleryEventService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List upcoming jewellery events (public)' })
  @ApiOkResponse({ type: JewelleryEventsPagedResponseModel })
  async list(@Query() query: ListJewelleryEventsQueryModel): Promise<JewelleryEventsPagedResponseModel> {
    const paged = await this.eventsService.listPublic(query);
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

  @Get(':slug')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get jewellery event by slug (public)' })
  @ApiParam({ name: 'slug' })
  @ApiOkResponse({ type: JewelleryEventDetailResponseModel })
  async getBySlug(@Param('slug') slug: string): Promise<JewelleryEventDetailResponseModel> {
    const { event, related } = await this.eventsService.getBySlug(slug);
    return plainToInstance(
      JewelleryEventDetailResponseModel,
      {
        ...event,
        relatedEvents: related.map((item) =>
          plainToInstance(JewelleryEventResponseModel, item, { excludeExtraneousValues: true }),
        ),
      },
      { excludeExtraneousValues: true },
    );
  }
}
