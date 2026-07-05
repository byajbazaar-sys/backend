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
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Identity, IIdentity, RolesGuard, UserAuthGuard } from '@shared-libs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { plainToInstance } from 'class-transformer';
import {
  CreateMetalRateRequestModel,
  CurrentMetalRatesResponseModel,
  ListMetalRatesQueryModel,
  MetalRateChartPointModel,
  MetalRateChartQueryModel,
  MetalRateEntryResponseModel,
  MetalRatesPagedResponseModel,
  BulkDeleteMetalRatesRequestModel,
  BulkDeleteMetalRatesResponseModel,
} from './models';
import { IMetalRateService, METAL_RATE_SERVICE } from './service';

@ApiTags('metal-rates')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Controller('metal-rates')
export class MetalRatesController {
  constructor(
    @InjectPinoLogger(MetalRatesController.name) private readonly logger: PinoLogger,
    @Inject(METAL_RATE_SERVICE) private readonly rateService: IMetalRateService,
  ) {}

  @Get('current')
  @ApiOperation({ summary: 'Get latest metal rates per purity' })
  @ApiOkResponse({ type: CurrentMetalRatesResponseModel })
  async getCurrent(@Identity() identity: IIdentity): Promise<CurrentMetalRatesResponseModel> {
    return this.rateService.getCurrent(identity.userId);
  }

  @Get('chart')
  @ApiOperation({ summary: 'Get metal rate history for charts' })
  @ApiOkResponse({ type: [MetalRateChartPointModel] })
  async getChart(
    @Query() query: MetalRateChartQueryModel,
    @Identity() identity: IIdentity,
  ): Promise<MetalRateChartPointModel[]> {
    return this.rateService.getChart(identity.userId, query.startDate, query.endDate);
  }

  @Get()
  @ApiOperation({ summary: 'List metal rate history (paginated)' })
  @ApiOkResponse({ type: MetalRatesPagedResponseModel })
  async listHistory(
    @Query() query: ListMetalRatesQueryModel,
    @Identity() identity: IIdentity,
  ): Promise<MetalRatesPagedResponseModel> {
    const paged = await this.rateService.listHistory(identity.userId, query);
    return plainToInstance(
      MetalRatesPagedResponseModel,
      {
        ...paged,
        items: paged.items.map((item) =>
          plainToInstance(MetalRateEntryResponseModel, item, { excludeExtraneousValues: true }),
        ),
      },
      { excludeExtraneousValues: true },
    );
  }

  @Post()
  @ApiOperation({ summary: 'Record a new metal rate (append-only)' })
  @HttpCode(HttpStatus.CREATED)
  @ApiOkResponse({ type: MetalRateEntryResponseModel })
  async create(
    @Body() body: CreateMetalRateRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<MetalRateEntryResponseModel> {
    const created = await this.rateService.create(body, identity.userId);
    return plainToInstance(MetalRateEntryResponseModel, created, { excludeExtraneousValues: true });
  }

  @Post('bulk-delete')
  @ApiOperation({ summary: 'Delete multiple metal rate history entries' })
  @HttpCode(HttpStatus.OK)
  async bulkDelete(
    @Body() body: BulkDeleteMetalRatesRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<BulkDeleteMetalRatesResponseModel> {
    const result = await this.rateService.bulkDelete(body.ids, identity.userId);
    return plainToInstance(BulkDeleteMetalRatesResponseModel, result, {
      excludeExtraneousValues: true,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a metal rate history entry' })
  @ApiParam({ name: 'id' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @Identity() identity: IIdentity): Promise<void> {
    await this.rateService.deleteEntry(id, identity.userId);
  }
}
