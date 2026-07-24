import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Identity, IIdentity, RolesGuard, UserAuthGuard } from '@shared-libs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { plainToInstance } from 'class-transformer';
import { ExportFormat } from '../../shared';
import {
  AddDepositAmountRequestModel,
  AdjustDepositRequestModel,
  CreateDepositRequestModel,
  DepositResponseModel,
  DepositsPagedResponseModel,
  DepositStatsResponseModel,
  DepositTransactionResponseModel,
  GetDepositParamsModel,
  ListDepositsQueryModel,
  RefundDepositRequestModel,
} from './models';
import { DEPOSIT_SERVICE, IDepositService } from './service';
import { DepositsFilterOptions, DepositsDownloadFilterOptions } from './options';

@ApiTags('deposits')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Controller('deposits')
export class DepositsController {
  constructor(
    @Inject(DEPOSIT_SERVICE) private readonly depositService: IDepositService,
    @InjectPinoLogger(DepositsController.name) private readonly logger: PinoLogger,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a deposit account' })
  @ApiResponse({ status: HttpStatus.CREATED, type: DepositResponseModel })
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: CreateDepositRequestModel, @Identity() identity: IIdentity): Promise<DepositResponseModel> {
    const account = await this.depositService.create(body.customerId, identity.userId, {
      name: body.name,
      notes: body.notes,
    });
    return plainToInstance(DepositResponseModel, account, { excludeExtraneousValues: true });
  }

  @Get()
  @ApiOkResponse({ type: DepositsPagedResponseModel })
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query() query: ListDepositsQueryModel,
    @Identity() identity: IIdentity,
  ): Promise<DepositsPagedResponseModel> {
    const options = plainToInstance(DepositsFilterOptions, { ...query, createdBy: identity.userId });
    const result = await this.depositService.findAll(options);
    return {
      items: plainToInstance(DepositResponseModel, result.items, { excludeExtraneousValues: true }),
      meta: {
        page: result.page,
        limit: result.perPage,
        totalItems: result.totalCount,
        totalPages: result.totalPages,
      },
    };
  }

  @Get('stats')
  @ApiOkResponse({ type: DepositStatsResponseModel })
  @HttpCode(HttpStatus.OK)
  async getStats(@Identity() identity: IIdentity): Promise<DepositStatsResponseModel> {
    const stats = await this.depositService.getStats(identity.userId);
    return plainToInstance(DepositStatsResponseModel, stats, { excludeExtraneousValues: true });
  }

  @Get('recent-transactions')
  @ApiOkResponse({ type: [DepositTransactionResponseModel] })
  @HttpCode(HttpStatus.OK)
  async getRecentTransactions(@Identity() identity: IIdentity): Promise<DepositTransactionResponseModel[]> {
    const items = await this.depositService.getRecentTransactions(identity.userId);
    return plainToInstance(DepositTransactionResponseModel, items, { excludeExtraneousValues: true });
  }

  @Get('download')
  @ApiOperation({ summary: 'Download deposit reports' })
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @HttpCode(HttpStatus.OK)
  async download(
    @Query('format') format: ExportFormat = ExportFormat.CSV,
    @Query('reportType') reportType: DepositsDownloadFilterOptions['reportType'],
    @Query('search') search: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Identity() identity: IIdentity,
  ): Promise<StreamableFile> {
    const options: DepositsDownloadFilterOptions = {
      createdBy: identity.userId,
      reportType,
      search,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    };
    const buffer = await this.depositService.download(options, format === ExportFormat.PDF ? 'pdf' : 'csv');
    const ext = format === ExportFormat.PDF ? 'pdf' : 'csv';
    const mime = format === ExportFormat.PDF ? 'application/pdf' : 'text/csv';
    return new StreamableFile(buffer, {
      type: mime,
      disposition: `attachment; filename="deposits-report.${ext}"`,
    });
  }

  @Get(':id')
  @ApiOkResponse({ type: DepositResponseModel })
  @HttpCode(HttpStatus.OK)
  async findOne(@Param() params: GetDepositParamsModel, @Identity() identity: IIdentity): Promise<DepositResponseModel> {
    const account = await this.depositService.findOne(params.id, identity.userId);
    return plainToInstance(DepositResponseModel, account, { excludeExtraneousValues: true });
  }

  @Get(':id/ledger')
  @ApiOkResponse({ type: [DepositTransactionResponseModel] })
  @HttpCode(HttpStatus.OK)
  async getLedger(
    @Param() params: GetDepositParamsModel,
    @Identity() identity: IIdentity,
  ): Promise<DepositTransactionResponseModel[]> {
    const ledger = await this.depositService.getLedger(params.id, identity.userId);
    return plainToInstance(DepositTransactionResponseModel, ledger, { excludeExtraneousValues: true });
  }

  @Post(':id/add')
  @ApiOkResponse({ type: DepositResponseModel })
  @HttpCode(HttpStatus.OK)
  async addDeposit(
    @Param() params: GetDepositParamsModel,
    @Body() body: AddDepositAmountRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<DepositResponseModel> {
    const account = await this.depositService.addDeposit(params.id, identity.userId, body);
    return plainToInstance(DepositResponseModel, account, { excludeExtraneousValues: true });
  }

  @Post(':id/adjust')
  @ApiOkResponse({ type: DepositResponseModel })
  @HttpCode(HttpStatus.OK)
  async adjust(
    @Param() params: GetDepositParamsModel,
    @Body() body: AdjustDepositRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<DepositResponseModel> {
    const account = await this.depositService.adjust(params.id, identity.userId, body);
    return plainToInstance(DepositResponseModel, account, { excludeExtraneousValues: true });
  }

  @Post(':id/refund')
  @ApiOkResponse({ type: DepositResponseModel })
  @HttpCode(HttpStatus.OK)
  async refund(
    @Param() params: GetDepositParamsModel,
    @Body() body: RefundDepositRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<DepositResponseModel> {
    const account = await this.depositService.refund(params.id, identity.userId, body);
    return plainToInstance(DepositResponseModel, account, { excludeExtraneousValues: true });
  }
}
