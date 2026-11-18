import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Delete,
  Query,
  StreamableFile,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Identity, IIdentity, RolesGuard, UserAuthGuard } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { Request } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { SalesAnalytics } from './domain';
import { EBillLogAction } from './enums';
import {
  CreateSalesBillRequestModel,
  ListSalesBillsQueryModel,
  SalesBillResponseModel,
  SalesBillsPagedResponseModel,
  UpdateSalesBillRequestModel,
  BulkDeleteSalesBillsRequestModel,
  BulkDeleteSalesBillsResponseModel,
  BillLogsPagedResponseModel,
  ListBillLogsQueryModel,
  RecordBillLogRequestModel,
} from './models';
import { SALES_BILL_SERVICE, ISalesBillService, type BillActionContext } from './service';

/** Which app did the operation, from the user agent (no extra header needed from the clients). */
function billActionContext(req: Request, identity: IIdentity): BillActionContext {
  const ua = String(req.headers['user-agent'] ?? '').toLowerCase();
  const channel = /okhttp|expo|reactnative|cfnetwork|darwin/.test(ua)
    ? 'mobile'
    : /mozilla|chrome|safari|firefox|edg\//.test(ua)
      ? 'web'
      : 'api';
  return { performedBy: identity.userId, channel };
}

@ApiTags('bills')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Controller('bills')
export class SalesBillsController {
  constructor(
    @InjectPinoLogger(SalesBillsController.name) private readonly logger: PinoLogger,
    @Inject(SALES_BILL_SERVICE) private readonly billService: ISalesBillService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a sales bill' })
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: CreateSalesBillRequestModel,
    @Identity() identity: IIdentity,
    @Req() req: Request,
  ): Promise<SalesBillResponseModel> {
    const bill = await this.billService.create(body, identity.userId, billActionContext(req, identity));
    return plainToInstance(SalesBillResponseModel, bill, { excludeExtraneousValues: true });
  }

  @Get()
  @ApiOperation({ summary: 'List sales bills with filters and pagination' })
  @ApiOkResponse({ type: SalesBillsPagedResponseModel })
  async list(
    @Query() query: ListSalesBillsQueryModel,
    @Identity() identity: IIdentity,
  ): Promise<SalesBillsPagedResponseModel> {
    const paged = await this.billService.list(identity.userId, query);
    return plainToInstance(SalesBillsPagedResponseModel, paged, { excludeExtraneousValues: true });
  }

  @Get('logs')
  @ApiOperation({ summary: 'Activity log of all bills (creates, edits, deletes, prints, shares), newest first' })
  @ApiOkResponse({ type: BillLogsPagedResponseModel })
  async activity(
    @Query() query: ListBillLogsQueryModel,
    @Identity() identity: IIdentity,
  ): Promise<BillLogsPagedResponseModel> {
    const paged = await this.billService.getActivity({ userId: identity.userId, ...query });
    return plainToInstance(BillLogsPagedResponseModel, paged, { excludeExtraneousValues: true });
  }

  @Get(':id/logs')
  @ApiOperation({ summary: 'History of one bill (works for deleted bills too)' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ type: BillLogsPagedResponseModel })
  async logs(
    @Param('id') id: string,
    @Query() query: ListBillLogsQueryModel,
    @Identity() identity: IIdentity,
  ): Promise<BillLogsPagedResponseModel> {
    const paged = await this.billService.getLogs(id, identity.userId, query.pageNumber, query.pageSize);
    return plainToInstance(BillLogsPagedResponseModel, paged, { excludeExtraneousValues: true });
  }

  @Post(':id/logs')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Record a print / PDF / WhatsApp share done in the app' })
  @ApiParam({ name: 'id', type: String })
  async recordLog(
    @Param('id') id: string,
    @Body() body: RecordBillLogRequestModel,
    @Identity() identity: IIdentity,
    @Req() req: Request,
  ): Promise<void> {
    await this.billService.recordClientEvent(
      id,
      body.action as EBillLogAction,
      identity.userId,
      billActionContext(req, identity),
    );
  }

  @Get('search')
  @ApiOperation({ summary: 'Search sales bills' })
  @ApiOkResponse({ type: SalesBillsPagedResponseModel })
  async search(
    @Query() query: ListSalesBillsQueryModel,
    @Identity() identity: IIdentity,
  ): Promise<SalesBillsPagedResponseModel> {
    return this.list(query, identity);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Sales analytics for dashboard charts' })
  async stats(
    @Identity() identity: IIdentity,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('documentType') documentType?: string,
  ): Promise<SalesAnalytics> {
    return this.billService.getAnalytics(identity.userId, dateFrom, dateTo, documentType);
  }

  @Get('export/gst')
  @ApiOperation({ summary: 'Export filtered sales bills as GST CSV (one row per line item)' })
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-cache, no-store, must-revalidate')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length')
  async exportGstCsv(
    @Query() query: ListSalesBillsQueryModel,
    @Identity() identity: IIdentity,
  ): Promise<StreamableFile> {
    this.logger.info({ query }, 'exportGstCsv called');
    const { buffer, filename } = await this.billService.exportGstCsv(identity.userId, query);
    return new StreamableFile(buffer, {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${filename}"`,
      length: buffer.length,
    });
  }

  @Post('bulk-delete')
  @ApiOperation({ summary: 'Delete multiple sales bills' })
  @HttpCode(HttpStatus.OK)
  async bulkDelete(
    @Body() body: BulkDeleteSalesBillsRequestModel,
    @Identity() identity: IIdentity,
    @Req() req: Request,
  ): Promise<BulkDeleteSalesBillsResponseModel> {
    const result = await this.billService.bulkDelete(body.ids, identity.userId, billActionContext(req, identity));
    return plainToInstance(BulkDeleteSalesBillsResponseModel, result, {
      excludeExtraneousValues: true,
    });
  }

  @Get('customer/:customerId')
  @ApiOperation({ summary: 'List bills for a customer' })
  @ApiParam({ name: 'customerId', type: String })
  @ApiOkResponse({ type: SalesBillsPagedResponseModel })
  async listByCustomer(
    @Param('customerId') customerId: string,
    @Query() query: ListSalesBillsQueryModel,
    @Identity() identity: IIdentity,
  ): Promise<SalesBillsPagedResponseModel> {
    const paged = await this.billService.listByCustomer(customerId, identity.userId, query);
    return plainToInstance(SalesBillsPagedResponseModel, paged, { excludeExtraneousValues: true });
  }

  @Post(':id/convert-to-normal')
  @ApiOperation({ summary: 'Convert an informal bill to a normal GST bill' })
  @ApiParam({ name: 'id', type: String })
  async convertToNormal(
    @Param('id') id: string,
    @Identity() identity: IIdentity,
    @Req() req: Request,
  ): Promise<SalesBillResponseModel> {
    const bill = await this.billService.convertToNormalBill(id, identity.userId, billActionContext(req, identity));
    return plainToInstance(SalesBillResponseModel, bill, { excludeExtraneousValues: true });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a sales bill' })
  @ApiParam({ name: 'id', type: String })
  async update(
    @Param('id') id: string,
    @Body() body: UpdateSalesBillRequestModel,
    @Identity() identity: IIdentity,
    @Req() req: Request,
  ): Promise<SalesBillResponseModel> {
    const bill = await this.billService.update(id, body, identity.userId, billActionContext(req, identity));
    return plainToInstance(SalesBillResponseModel, bill, { excludeExtraneousValues: true });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a sales bill' })
  @ApiParam({ name: 'id', type: String })
  async delete(@Param('id') id: string, @Identity() identity: IIdentity, @Req() req: Request): Promise<void> {
    await this.billService.delete(id, identity.userId, billActionContext(req, identity));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get bill by id' })
  @ApiParam({ name: 'id', type: String })
  async getById(@Param('id') id: string, @Identity() identity: IIdentity): Promise<SalesBillResponseModel> {
    const bill = await this.billService.getById(id, identity.userId);
    return plainToInstance(SalesBillResponseModel, bill, { excludeExtraneousValues: true });
  }
}
